// ── Voice Routes ────────────────────────────────────────────────
// POST /transcribe              — Proxy audio to whisper service for STT
// POST /tts                     — Proxy text to TTS service, return audio
// POST /voice/start             — Start voice session (Daily.co + Pipecat)
// POST /voice/stop              — Stop voice session
// POST /voice/transcript        — Persist voice transcript to DB
// POST /voice/check-turn        — Live crisis gate for voice turns
// POST /voice/session-complete  — Persist enriched transcript + voice metrics
// POST /voice/refresh-memories  — Mem0 memory refresh for voice reflection pauses

import { zValidator } from "@hono/zod-validator";
import { SynthesizeRequestSchema } from "@moc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { sessions, messages, sessionSummaries } from "../db/schema/index";
import { getOrCreateUser } from "../db/helpers.js";
import { detectCrisis, getCrisisResponse } from "../crisis/index.js";
import { sessionEmitter } from "../sse/emitter.js";
import {
  appendMessagesToSession,
  renderVoicePromptForSession,
} from "../sdk/session-manager.js";
import {
  ensureSdkSessionForStoredSession,
  initializeSdkSessionForUser,
} from "../session/bootstrap.js";
import { searchMemories } from "../services/memory-client.js";
import { generateOpeningMessage } from "../services/opening-message.js";
import type { OpeningMessageContext } from "../services/opening-message.js";
import { getLatestTherapyPlan } from "../services/therapy-plan-service.js";
import { getBlocksForUser } from "../services/memory-block-service.js";
import { getLatestFormulation } from "../services/formulation-service.js";
import { sql } from "drizzle-orm";


const VoiceStartSchema = z.object({
  sessionId: z.string().uuid().optional(),
});

const VoiceStopSchema = z.object({
  voiceSessionId: z.string().min(1),
});

const VoiceCheckTurnSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().trim().min(1).max(10000),
});

const VoiceTranscriptSchema = z.object({
  sessionId: z.string().uuid(),
  turns: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      createdAt: z.string(),
    }),
  ),
});

const VoiceSessionCompleteSchema = z.object({
  sessionId: z.string().uuid(),
  transcript: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      createdAt: z.string(),
      turnIndex: z.number(),
      durationSecs: z.number(),
      pauseBeforeSecs: z.number(),
      wordCount: z.number(),
      wasInterrupted: z.boolean(),
    }),
  ),
  emotions: z.array(
    z.object({
      turnIndex: z.number(),
      timestamp: z.string(),
      emotionLabel: z.string(),
      confidence: z.number(),
      pitchMean: z.number(),
      pitchStd: z.number(),
      energyMean: z.number(),
      energyStd: z.number(),
      speakingRate: z.number(),
      mfccSummary: z.array(z.number()).nullable(),
    }),
  ),
  sessionSummary: z.object({
    totalUserSpeechSecs: z.number(),
    totalSilenceSecs: z.number(),
    speechToSilenceRatio: z.number(),
    interruptionCount: z.number(),
    avgUserTurnLengthWords: z.number(),
    engagementTrajectory: z.array(z.number()),
    emotionArc: z.array(z.tuple([z.number(), z.string(), z.number()])),
  }),
});

const RefreshMemoriesSchema = z.object({
  sessionId: z.string().uuid(),
  recentTopics: z.array(z.string()).min(1).max(20),
});

const app = new Hono()

  // ── POST /transcribe — Speech-to-Text ───────────────────────
  .post("/transcribe", async (c) => {
    // Forward the multipart body directly to the whisper service.
    // The whisper service expects a multipart file upload with key "file".
    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || !(file instanceof File)) {
      return c.json(
        { error: "MISSING_FILE", message: "Audio file is required (multipart key: 'file')" },
        400,
      );
    }

    // Build a new FormData to forward to the whisper service
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${env.WHISPER_SERVICE_URL}/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return c.json(
          {
            error: "WHISPER_ERROR",
            message: `Whisper service returned ${String(response.status)}`,
            detail: errorText,
          },
          response.status as 400 | 422 | 500,
        );
      }

      const result = await response.json();
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json(
        { error: "WHISPER_UNAVAILABLE", message: `Whisper service unavailable: ${message}` },
        503,
      );
    }
  })

  // ── POST /tts — Text-to-Speech ──────────────────────────────
  .post("/tts", zValidator("json", SynthesizeRequestSchema), async (c) => {
    const body = c.req.valid("json");

    try {
      const response = await fetch(`${env.TTS_SERVICE_URL}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return c.json(
          {
            error: "TTS_ERROR",
            message: `TTS service returned ${String(response.status)}`,
            detail: errorText,
          },
          response.status as 400 | 500,
        );
      }

      // Stream the WAV audio back to the client
      const audioBuffer = await response.arrayBuffer();
      return new Response(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": String(audioBuffer.byteLength),
          "Content-Disposition": "inline; filename=speech.wav",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json(
        { error: "TTS_UNAVAILABLE", message: `TTS service unavailable: ${message}` },
        503,
      );
    }
  })

  // ── POST /voice/start — Start voice chat session ──────────────
  .post(
    "/voice/start",
    zValidator("json", VoiceStartSchema),
    async (c) => {
      const user = await getOrCreateUser();
      const { sessionId: requestedSessionId } = c.req.valid("json");

      let mocSessionId: string;
      let sdkSessionId: string;

      if (requestedSessionId) {
        const [existingSession] = await db
          .select({
            id: sessions.id,
            status: sessions.status,
            sdkSessionId: sessions.sdkSessionId,
          })
          .from(sessions)
          .where(and(eq(sessions.id, requestedSessionId), eq(sessions.userId, user.id)))
          .limit(1);

        if (!existingSession) {
          return c.json({ error: "SESSION_NOT_FOUND", message: "Session not found" }, 404);
        }

        if (existingSession.status !== "active") {
          return c.json(
            { error: "SESSION_NOT_ACTIVE", message: "Voice can only attach to an active session" },
            409,
          );
        }

        mocSessionId = existingSession.id;
        sdkSessionId = await ensureSdkSessionForStoredSession({
          sessionId: existingSession.id,
          sdkSessionId: existingSession.sdkSessionId,
          user,
          isReturningUser: true,
        });
        await db
          .update(sessions)
          .set({ lastActivityAt: new Date() })
          .where(eq(sessions.id, existingSession.id));
      } else {
        sdkSessionId = await initializeSdkSessionForUser(user);
        const [createdSession] = await db
          .insert(sessions)
          .values({
            userId: user.id,
            sdkSessionId,
            status: "active",
          })
          .returning({ id: sessions.id });
        mocSessionId = createdSession!.id;
      }

      let systemPrompt: string;
      try {
        systemPrompt = renderVoicePromptForSession(sdkSessionId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Voice prompt unavailable";
        return c.json({ error: "VOICE_PROMPT_UNAVAILABLE", message }, 500);
      }

      // Generate opening greeting for voice (same context as text chat)
      let openingGreeting: string;
      try {
        // Check if this is a first-ever session
        const [sessionCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(sessions)
          .where(and(eq(sessions.userId, user.id), eq(sessions.status, "completed")));
        const isFirstSession = (sessionCount?.count ?? 0) === 0;

        // Get last completed session for returning users
        let lastSessionSummary: string | null = null;
        let lastSessionEndedAt: Date | null = null;
        if (!isFirstSession) {
          const [lastSession] = await db
            .select({
              id: sessions.id,
              endedAt: sessions.endedAt,
            })
            .from(sessions)
            .where(and(eq(sessions.userId, user.id), eq(sessions.status, "completed")))
            .orderBy(sql`${sessions.endedAt} DESC NULLS LAST`)
            .limit(1);
          if (lastSession) {
            lastSessionEndedAt = lastSession.endedAt;
            const [summaryRow] = await db
              .select({ content: sessionSummaries.content })
              .from(sessionSummaries)
              .where(
                and(
                  eq(sessionSummaries.sessionId, lastSession.id),
                  eq(sessionSummaries.level, "session"),
                ),
              )
              .orderBy(sql`${sessionSummaries.createdAt} DESC`)
              .limit(1);
            lastSessionSummary = summaryRow?.content ?? null;
          }
        }

        const therapyPlanRow = await getLatestTherapyPlan(user.id);
        const formulation = await getLatestFormulation(user.id);
        const memoryBlocks = await getBlocksForUser(db, user.id);
        const memoryBlockMap = new Map<string, string>();
        for (const block of memoryBlocks) {
          if (block.content.trim()) {
            memoryBlockMap.set(block.label, block.content);
          }
        }

        // Parse therapy plan safely (same pattern as sessions.ts)
        let therapyPlan: OpeningMessageContext["therapyPlan"] = null;
        if (therapyPlanRow?.plan && typeof therapyPlanRow.plan === "object") {
          therapyPlan = therapyPlanRow.plan as OpeningMessageContext["therapyPlan"];
        }

        const ctx: OpeningMessageContext = {
          userId: user.id,
          isFirstSession,
          lastSessionEndedAt,
          lastSessionSummary,
          therapyPlan,
          formulation: formulation
            ? {
                presentingTheme: formulation.snapshot?.formulation?.presentingTheme as string | undefined,
                activeStates: formulation.snapshot?.activeStates as
                  | Array<{ label?: string; domain?: string }>
                  | undefined,
              }
            : null,
          userName: user.displayName,
          memoryBlocks: memoryBlockMap,
        };

        openingGreeting = await generateOpeningMessage(ctx);
      } catch (err) {
        console.warn("[voice/start] Opening greeting generation failed, using fallback:", err);
        openingGreeting = user.displayName
          ? `Hey ${user.displayName}, good to have you here. What's on your mind?`
          : "Hey, good to have you here. What's on your mind?";
      }

      try {
        const response = await fetch(`${env.VOICE_SERVICE_URL}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_prompt: systemPrompt,
            moc_session_id: mocSessionId,
            opening_greeting: openingGreeting,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return c.json(
            { error: "VOICE_START_FAILED", message: errorText },
            response.status as 502 | 503,
          );
        }

        const result = await response.json();
        return c.json({
          url: result.room_url,
          token: result.token,
          sessionId: mocSessionId,
          voiceSessionId: result.session_id,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return c.json(
          { error: "VOICE_UNAVAILABLE", message: `Voice service unavailable: ${message}` },
          503,
        );
      }
    },
  )

  // ── POST /voice/stop — Stop voice chat session ───────────────
  .post(
    "/voice/stop",
    zValidator("json", VoiceStopSchema),
    async (c) => {
      try {
        const response = await fetch(`${env.VOICE_SERVICE_URL}/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: c.req.valid("json").voiceSessionId }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return c.json(
            { error: "VOICE_STOP_FAILED", message: errorText },
            response.status as 404 | 500,
          );
        }

        const result = await response.json();
        return c.json({
          status: result.status ?? "stopping",
          voiceSessionId: result.session_id ?? c.req.valid("json").voiceSessionId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return c.json(
          { error: "VOICE_UNAVAILABLE", message: `Voice service unavailable: ${message}` },
          503,
        );
      }
    },
  )

  // ── POST /voice/check-turn — Live crisis gate for voice turns ─
  .post(
    "/voice/check-turn",
    zValidator("json", VoiceCheckTurnSchema),
    async (c) => {
      const { sessionId, text } = c.req.valid("json");
      const user = await getOrCreateUser();

      const [session] = await db
        .select({
          id: sessions.id,
          status: sessions.status,
        })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
        .limit(1);

      if (!session) {
        return c.json({ error: "SESSION_NOT_FOUND", message: "Session not found" }, 404);
      }

      if (session.status === "completed") {
        return c.json(
          { allow: false, crisis: false, error: "SESSION_ENDED" },
          409,
        );
      }

      if (session.status === "crisis_escalated") {
        return c.json({
          allow: false,
          crisis: true,
          response: getCrisisResponse("elevated", text),
        });
      }

      const crisisResult = await detectCrisis(text);
      if (crisisResult.isCrisis) {
        await db
          .update(sessions)
          .set({
            status: "crisis_escalated",
            lastActivityAt: new Date(),
          })
          .where(eq(sessions.id, sessionId));

        sessionEmitter.emit(sessionId, {
          event: "session.crisis",
          data: {
            message: crisisResult.response!.message,
            helplines: crisisResult.response!.helplines,
          },
        });

        return c.json({
          allow: false,
          crisis: true,
          response: crisisResult.response,
        });
      }

      await db
        .update(sessions)
        .set({ lastActivityAt: new Date() })
        .where(eq(sessions.id, sessionId));

      return c.json({ allow: true, crisis: false });
    },
  )

  // ── POST /voice/transcript — Persist voice transcript ─────────
  .post(
    "/voice/transcript",
    zValidator("json", VoiceTranscriptSchema),
    async (c) => {
      const { sessionId, turns } = c.req.valid("json");
      const user = await getOrCreateUser();

      const [session] = await db
        .select({
          id: sessions.id,
          sdkSessionId: sessions.sdkSessionId,
        })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
        .limit(1);

      if (!session) {
        return c.json({ error: "SESSION_NOT_FOUND", message: "Session not found" }, 404);
      }

      if (turns.length === 0) {
        return c.json({ status: "ok", count: 0 });
      }

      const sortedTurns = [...turns].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      await db.insert(messages).values(
        sortedTurns.map((turn) => ({
          sessionId,
          role: turn.role as "user" | "assistant",
          content: turn.content,
          source: "voice" as const,
          createdAt: new Date(turn.createdAt),
        })),
      );

      if (session.sdkSessionId) {
        appendMessagesToSession(
          session.sdkSessionId,
          sortedTurns.map((turn) => ({
            role: turn.role,
            content: turn.content,
          })),
        );
      }

      const lastCreatedAt = sortedTurns.at(-1)?.createdAt;
      await db
        .update(sessions)
        .set({
          lastActivityAt: lastCreatedAt ? new Date(lastCreatedAt) : new Date(),
        })
        .where(eq(sessions.id, sessionId));

      sessionEmitter.emit(sessionId, {
        event: "voice.transcript_persisted",
        data: { count: sortedTurns.length },
      });

      return c.json({ status: "ok", count: sortedTurns.length });
    },
  )

  // ── POST /voice/session-complete — Enriched transcript + voice metrics ──
  .post(
    "/voice/session-complete",
    zValidator("json", VoiceSessionCompleteSchema),
    async (c) => {
      const { sessionId, transcript, emotions, sessionSummary } =
        c.req.valid("json");
      const user = await getOrCreateUser();

      // Verify session exists and belongs to user
      const [session] = await db
        .select({
          id: sessions.id,
          sdkSessionId: sessions.sdkSessionId,
          status: sessions.status,
        })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
        .limit(1);

      if (!session) {
        return c.json(
          { error: "SESSION_NOT_FOUND", message: "Session not found" },
          404,
        );
      }

      // 1. Persist enriched transcript to messages table
      if (transcript.length > 0) {
        const sortedTranscript = [...transcript].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        await db.insert(messages).values(
          sortedTranscript.map((turn) => ({
            sessionId,
            role: turn.role as "user" | "assistant",
            content: turn.content,
            source: "voice" as const,
            createdAt: new Date(turn.createdAt),
          })),
        );

        // Append to SDK in-memory session for onEnd hooks
        if (session.sdkSessionId) {
          appendMessagesToSession(
            session.sdkSessionId,
            sortedTranscript.map((turn) => ({
              role: turn.role,
              content: turn.content,
            })),
          );
        }
      }

      // 2. Store full voice metrics bundle on sessions row (JSONB)
      await db
        .update(sessions)
        .set({
          voiceMetrics: { transcript, emotions, sessionSummary },
          lastActivityAt: new Date(),
        })
        .where(eq(sessions.id, sessionId));

      // Emit both events: session_complete for analytics consumers,
      // transcript_persisted so the chat UI reloads messages.
      sessionEmitter.emit(sessionId, {
        event: "voice.session_complete",
        data: {
          transcriptCount: transcript.length,
          emotionCount: emotions.length,
          interruptionCount: sessionSummary.interruptionCount,
        },
      });

      // The frontend listens for this event to reload messages into the chat UI.
      // Without it, enriched transcripts land in the DB but never appear on screen.
      sessionEmitter.emit(sessionId, {
        event: "voice.transcript_persisted",
        data: { count: transcript.length },
      });

      return c.json({
        status: "ok",
        transcriptCount: transcript.length,
        emotionCount: emotions.length,
      });
    },
  )

  // ── POST /voice/refresh-memories — Mem0 refresh for reflection pauses ──
  .post(
    "/voice/refresh-memories",
    zValidator("json", RefreshMemoriesSchema),
    async (c) => {
      const { sessionId, recentTopics } = c.req.valid("json");
      const user = await getOrCreateUser();

      // Verify session exists and belongs to user
      const [session] = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
        .limit(1);

      if (!session) {
        return c.json(
          { error: "SESSION_NOT_FOUND", message: "Session not found" },
          404,
        );
      }

      // Search Mem0 with recent topics joined as query
      const query = recentTopics.join("; ");
      const results = await searchMemories(user.id, query, 10);

      if (results.length === 0) {
        return c.json({ memoriesBlock: "" });
      }

      // Format memories as a text block for context injection
      const memoriesBlock = results
        .map(
          (m) =>
            `[${m.memoryType}] ${m.content} (confidence: ${String(m.confidence.toFixed(2))})`,
        )
        .join("\n");

      return c.json({ memoriesBlock });
    },
  );

// ── Export ────────────────────────────────────────────────────────

export type VoiceRoutes = typeof app;
export default app;
