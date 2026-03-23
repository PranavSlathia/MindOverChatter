// ── Session Routes ──────────────────────────────────────────────
// GET    /              — List all sessions (paginated)
// POST   /              — Create a new session
// GET    /:id/messages  — Get all messages for a session
// POST   /:id/messages  — Send a user message (crisis check + AI response)
// GET    /:id/events    — SSE stream for real-time AI chunks
// POST   /:id/end       — End a session
// DELETE /:id           — Delete a session
// POST   /:id/resume    — Resume a completed or disconnected session

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, asc, sql, or } from "drizzle-orm";
import { SendMessageSchema, EndSessionSchema, SessionHistoryQuerySchema } from "@moc/shared";
import { ERROR_CODES } from "@moc/shared";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { sessions, messages, sessionSummaries, assessments, emotionReadings, memoryBlocks } from "../db/schema/index";
import { getOrCreateUser } from "../db/helpers.js";
import { detectCrisis } from "../crisis/index.js";
import { sessionEmitter } from "../sse/emitter.js";
import type { SSEEventData } from "../sse/emitter.js";
import {
  sendMessage as sdkSendMessage,
  endSdkSession,
  loadSkillFiles,
  injectSessionContext,
  injectSkillDynamically,
  isSessionActive,
  getSessionMode,
  setSessionMode,
  getSessionAuthority,
  getSessionMessages,
} from "../sdk/session-manager.js";
import type { ConversationMessage } from "../sdk/session-manager.js";
import { runSessionSupervisor } from "../services/session-supervisor.js";
import { runResponseValidator } from "../services/response-validator.js";
import {
  getAllMemories,
  searchMemories,
  addMemoriesAsync,
  summarizeSessionAsync,
} from "../services/memory-client.js";
import { getLatestFormulation } from "../services/formulation-service.js";
import { classifyTextEmotion } from "../services/text-emotion-classifier.js";
import { runOnStart, runOnEnd, clearEndedSession } from "../sdk/session-lifecycle.js";
import { detectModeShift } from "../services/mode-detector.js";
import { formatModeShiftBlock } from "../sdk/mode-blocks.js";
import {
  ensureSdkSessionForStoredSession,
  initializeSdkSessionForUser,
} from "../session/bootstrap.js";

// ── Assessment Re-trigger Guard ──────────────────────────────────
// Tracks which assessment types have been emitted per session to prevent
// re-triggering when the eligibility check fires on subsequent messages.
const emittedAssessments = new Map<string, Set<string>>();

// ── Route Definitions ────────────────────────────────────────────

const app = new Hono()

  // ── GET / — List Sessions ──────────────────────────────────
  .get("/", zValidator("query", SessionHistoryQuerySchema), async (c) => {
    const { limit, offset } = c.req.valid("query");
    const user = await getOrCreateUser();

    // Fetch sessions for the user, ordered by most recent first
    const rows = await db
      .select({
        id: sessions.id,
        status: sessions.status,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        // Left-join the session-level summary (if one exists)
        summaryContent: sessionSummaries.content,
      })
      .from(sessions)
      .leftJoin(
        sessionSummaries,
        and(
          eq(sessions.id, sessionSummaries.sessionId),
          eq(sessionSummaries.level, "session"),
        ),
      )
      .where(
        and(
          eq(sessions.userId, user.id),
          or(
            // Always show active/crisis sessions regardless of message count
            eq(sessions.status, "active"),
            eq(sessions.status, "crisis_escalated"),
            // Only show completed sessions that have at least 2 messages
            sql`(SELECT COUNT(*) FROM messages WHERE messages.session_id = ${sessions.id}) >= 2`,
          ),
        ),
      )
      .orderBy(desc(sessions.startedAt), desc(sessions.id), desc(sessionSummaries.createdAt))
      .limit(limit * 10) // over-fetch to account for duplicates before dedup
      .offset(0);

    // Deduplicate: one row per session, keeping the most recent summary
    // (a session can have multiple summaries if it was resumed after being completed)
    const seen = new Set<string>();
    const deduped = rows.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }).slice(offset, offset + limit);

    return c.json({
      sessions: deduped.map((r) => ({
        id: r.id,
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt?.toISOString() ?? null,
        summary: r.summaryContent ?? null,
      })),
      limit,
      offset,
    });
  })

  // ── POST / — Create Session ──────────────────────────────────
  .post("/", async (c) => {
    const user = await getOrCreateUser();
    const sdkSessionId = await initializeSdkSessionForUser(user);

    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        sdkSessionId,
        status: "active",
      })
      .returning();

    return c.json(
      {
        sessionId: session!.id,
        status: session!.status,
        startedAt: session!.startedAt.toISOString(),
      },
      201,
    );
  })

  // ── GET /:id/messages — List Session Messages ────────────────
  .get("/:id/messages", async (c) => {
    const sessionId = c.req.param("id");
    const user = await getOrCreateUser();

    // Validate session exists AND belongs to the current user
    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
      .limit(1);

    if (!session) {
      return c.json(
        { error: ERROR_CODES.SESSION_NOT_FOUND, message: "Session not found" },
        404,
      );
    }

    // Over-fetch by 1 to detect truncation without a separate count query
    const MESSAGE_LIMIT = 500;

    const rows = await db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(MESSAGE_LIMIT + 1);

    const truncated = rows.length > MESSAGE_LIMIT;
    const returnedRows = truncated ? rows.slice(0, MESSAGE_LIMIT) : rows;

    return c.json({
      messages: returnedRows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      limit: MESSAGE_LIMIT,
      truncated,
    });
  })

  // ── POST /:id/messages — Send Message ────────────────────────
  .post("/:id/messages", zValidator("json", SendMessageSchema), async (c) => {
    const sessionId = c.req.param("id");
    const { text } = c.req.valid("json");

    // Validate session exists and is active
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return c.json(
        { error: ERROR_CODES.SESSION_NOT_FOUND, message: "Session not found" },
        404,
      );
    }

    if (session.status !== "active" && session.status !== "crisis_escalated") {
      return c.json(
        { error: ERROR_CODES.SESSION_ENDED, message: "Session is not active" },
        409,
      );
    }

    // ── Crisis Detection (NON-NEGOTIABLE: runs BEFORE any Claude call) ──
    const crisisResult = await detectCrisis(text);

    if (crisisResult.isCrisis) {
      // Persist user message
      const [userMsg] = await db
        .insert(messages)
        .values({ sessionId, role: "user", content: text })
        .returning();

      // Persist hard-coded crisis response as assistant message
      const crisisText = crisisResult.response!.message;
      const [assistantMsg] = await db
        .insert(messages)
        .values({ sessionId, role: "assistant", content: crisisText })
        .returning();

      // Escalate session status
      await db
        .update(sessions)
        .set({
          status: "crisis_escalated",
          lastActivityAt: new Date(),
        })
        .where(eq(sessions.id, sessionId));

      // Notify SSE subscribers about crisis
      sessionEmitter.emit(sessionId, {
        event: "session.crisis",
        data: {
          message: crisisText,
          helplines: crisisResult.response!.helplines,
        },
      });

      return c.json({
        userMessageId: userMsg!.id,
        assistantMessageId: assistantMsg!.id,
        crisis: true,
        response: crisisText,
      });
    }

    // ── Normal message flow ─────────────────────────────────────
    // Persist user message
    const [userMsg] = await db
      .insert(messages)
      .values({ sessionId, role: "user", content: text })
      .returning();

    // Update session activity
    await db
      .update(sessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(sessions.id, sessionId));

    // Stream AI response asynchronously (chunks go to SSE subscribers)
    // This is fire-and-forget from the HTTP response perspective.
    // The client gets the userMessageId immediately, then listens on SSE for AI chunks.
    const sdkSessionId = session.sdkSessionId;

    if (!sdkSessionId) {
      sessionEmitter.emit(sessionId, {
        event: "ai.error",
        data: { error: "No SDK session associated with this session" },
      });
      return c.json({ userMessageId: userMsg!.id, crisis: false });
    }

    // ── Mode shift detection ──────────────────────────────────────
    // Check if the message warrants a session mode shift (pure, fast, no LLM)
    const currentMode = getSessionMode(sdkSessionId);
    const authority = getSessionAuthority(sdkSessionId);
    const targetMode = detectModeShift(text, currentMode, authority);
    if (targetMode !== null) {
      console.log(`[mode-shift] ${currentMode ?? "none"} → ${targetMode}`);
      injectSessionContext(sdkSessionId, formatModeShiftBlock(targetMode));
      setSessionMode(sdkSessionId, targetMode);
    }

    // Notify SSE subscribers that the AI is processing (immediate — before supervisor)
    sessionEmitter.emit(sessionId, {
      event: "ai.thinking",
      data: { status: "thinking" },
    });

    // ── Background pipeline: Supervisor → inject → Claude response ─
    // The supervisor MUST complete before streamAiResponse() so that
    // skill injections and context hints are in the prompt.
    // HTTP response returns immediately; client listens on SSE.
    void (async () => {
      // ── Session Supervisor (LLM-enhanced mode/skill selection) ──
      // Haiku call that classifies intent, refines mode, and activates dynamic skills.
      // Falls back silently to regex result on failure or low confidence.
      try {
        const sdkMessages = getSessionMessages(sdkSessionId);
        const allSkills = loadSkillFiles();
        const formulation = await getLatestFormulation(session.userId);

        const originBlock = await db.query.memoryBlocks.findFirst({
          where: (mb, { and, eq }) =>
            and(eq(mb.userId, session.userId), eq(mb.label, "user/origin_story")),
          columns: { content: true },
        });
        const hasOriginStory = (originBlock?.content ?? "").trim().length > 0;

        const supervisorOutput = await runSessionSupervisor({
          lastFiveTurns: sdkMessages.slice(-10),
          currentMode: getSessionMode(sdkSessionId),
          formulation: formulation?.snapshot?.formulation ?? null,
          availableSkills: [...allSkills.keys()],
          sessionTurnCount: Math.floor(sdkMessages.length / 2),
          hasOriginStory,
        });

        if (supervisorOutput && supervisorOutput.confidence >= 0.6) {
          // Override mode only if regex didn't already set one this turn
          if (supervisorOutput.recommendedMode && !targetMode) {
            console.log(`[session-supervisor] mode → ${supervisorOutput.recommendedMode}`);
            injectSessionContext(sdkSessionId, formatModeShiftBlock(supervisorOutput.recommendedMode));
            setSessionMode(sdkSessionId, supervisorOutput.recommendedMode);
          }
          // Dynamic skill injection — supervisor has analysed the turn and picked skills
          for (const skillName of supervisorOutput.activateSkills) {
            injectSkillDynamically(sdkSessionId, skillName, allSkills);
          }
          // Context focus hint — single-sentence steer for this turn
          if (supervisorOutput.contextFocus) {
            injectSessionContext(
              sdkSessionId,
              `=== Current Focus ===\n${supervisorOutput.contextFocus}\n=== End Current Focus ===`,
            );
          }
        }
      } catch (err) {
        console.warn("[session-supervisor] error — falling back to regex only:", err);
      }

      // ── Claude response (supervisor context is now injected) ────
      streamAiResponse(sessionId, sdkSessionId, text, userMsg!.id, session.userId).catch((err) => {
        console.error(`AI streaming error for session ${sessionId}:`, err);
        sessionEmitter.emit(sessionId, {
          event: "ai.error",
          data: { error: "Failed to get AI response" },
        });
      });
    })();

    return c.json({ userMessageId: userMsg!.id, crisis: false });
  })

  // ── GET /:id/events — SSE Stream ────────────────────────────
  .get("/:id/events", async (c) => {
    const sessionId = c.req.param("id");

    // Validate session exists
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return c.json(
        { error: ERROR_CODES.SESSION_NOT_FOUND, message: "Session not found" },
        404,
      );
    }

    return streamSSE(c, async (stream) => {
      // Create a promise that resolves when the client disconnects
      let cleanup: (() => void) | null = null;

      const disconnected = new Promise<void>((resolve) => {
        stream.onAbort(() => {
          resolve();
        });
      });

      // Subscribe to session events and forward them to the SSE stream
      const unsubscribe = sessionEmitter.subscribe(
        sessionId,
        async (event: SSEEventData) => {
          try {
            await stream.writeSSE({
              event: event.event,
              data: JSON.stringify(event.data),
            });
          } catch {
            // Client likely disconnected — cleanup will happen via onAbort
          }
        },
      );
      cleanup = unsubscribe;

      // Keep the stream open until the client disconnects
      await disconnected;

      // Cleanup listener
      if (cleanup) cleanup();
    });
  })

  // ── POST /:id/end — End Session ─────────────────────────────
  .post("/:id/end", zValidator("json", EndSessionSchema), async (c) => {
    const sessionId = c.req.param("id");

    // Validate session exists and is active
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return c.json(
        { error: ERROR_CODES.SESSION_NOT_FOUND, message: "Session not found" },
        404,
      );
    }

    if (session.status !== "active" && session.status !== "crisis_escalated") {
      return c.json(
        { error: ERROR_CODES.SESSION_ENDED, message: "Session is not active" },
        409,
      );
    }

    const endedAt = new Date();

    if (session.sdkSessionId) {
      try {
        await endSdkSession(session.sdkSessionId);
      } catch (err) {
        console.error(`Failed to end SDK session ${session.sdkSessionId}:`, err);
      }
    }

    const dbHistoryRows = await db
      .select({
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
        id: messages.id,
      })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    const conversationHistory: ConversationMessage[] = dbHistoryRows.map((row) => ({
      role: row.role,
      content: row.content,
    }));
    const dbMessageCount = conversationHistory.length;

    if (dbMessageCount < 2) {
      // No real conversation happened — delete the session and return cleanly
      emittedAssessments.delete(sessionId);
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      sessionEmitter.emit(sessionId, { event: "session.ended", data: {} });
      return c.json({
        sessionId: session.id,
        status: "completed" as const,
        endedAt: endedAt.toISOString(),
      });
    }

    // Update session in DB
    await db
      .update(sessions)
      .set({
        status: "completed",
        endedAt,
        lastActivityAt: endedAt,
      })
      .where(eq(sessions.id, sessionId));

    // Clean up assessment re-trigger guard for this session
    emittedAssessments.delete(sessionId);

    // Sanitize session-end reason to prevent injection through persistent memory
    const ALLOWED_REASONS = ["user_ended", "timeout", "inactivity", "beforeunload"] as const;
    const rawReason = c.req.valid("json").reason ?? "user_ended";
    const safeReason = ALLOWED_REASONS.includes(rawReason as typeof ALLOWED_REASONS[number])
      ? rawReason
      : "user_ended";

    // Signal SSE subscribers that the summary is in progress.
    // The client shows "Wrapping up your session..." during this window.
    // session.ended is emitted AFTER runOnEnd so the UI doesn't collapse
    // while the critical summary hook is still awaiting Claude.
    sessionEmitter.emit(sessionId, {
      event: "session.ending",
      data: {},
    });

    // Await critical end hooks (summary), then background hooks fire-and-forget
    try {
      await runOnEnd({
        userId: session.userId,
        sessionId,
        conversationHistory,
        safeReason,
      });
    } catch (err) {
      console.error(`Session end hooks error for session ${sessionId}:`, err);
      // Fallback: send a basic summary to Mem0 so it at least knows the session ended
      summarizeSessionAsync(
        session.userId,
        sessionId,
        `Session ended at ${endedAt.toISOString()}. Reason: ${safeReason}`,
      );
    }

    // Summary is done (or failed). Signal the client the session is fully closed.
    // Emitting AFTER runOnEnd ensures the client only shows "Session ended"
    // once the summary work is complete, not while it's still in progress.
    sessionEmitter.emit(sessionId, {
      event: "session.ended",
      data: {},
    });

    return c.json({
      sessionId: session.id,
      status: "completed" as const,
      endedAt: endedAt.toISOString(),
    });
  })

  // ── DELETE /:id — Delete Session ──────────────────────────────
  .delete("/:id", async (c) => {
    const sessionId = c.req.param("id");
    const user = await getOrCreateUser();

    // Validate session exists AND belongs to the current user
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
      .limit(1);

    if (!session) {
      return c.json(
        { error: ERROR_CODES.SESSION_NOT_FOUND, message: "Session not found" },
        404,
      );
    }

    // Clean up the SDK session if active
    if (session.sdkSessionId) {
      endSdkSession(session.sdkSessionId).catch((err) => {
        console.error(`Failed to end SDK session ${session.sdkSessionId} during delete:`, err);
      });
    }

    // Delete the session from the database.
    // FK cascade behavior:
    //   messages         -> onDelete: cascade   (auto-deleted)
    //   emotion_readings -> onDelete: cascade   (auto-deleted)
    //   assessments      -> onDelete: set null   (sessionId nulled, record preserved)
    //   session_summaries -> onDelete: set null  (sessionId nulled, record preserved)
    //   mood_logs        -> onDelete: set null   (sessionId nulled, record preserved)
    await db.delete(sessions).where(eq(sessions.id, sessionId));

    return c.json({ deleted: true });
  })

  // ── POST /:id/resume — Resume Session ─────────────────────────
  .post("/:id/resume", async (c) => {
    const sessionId = c.req.param("id");
    const user = await getOrCreateUser();

    // Validate session exists AND belongs to the current user
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
      .limit(1);

    if (!session) {
      return c.json(
        { error: ERROR_CODES.SESSION_NOT_FOUND, message: "Session not found" },
        404,
      );
    }

    // If session is active and already has a live SDK session, just return success
    if (
      session.status === "active" &&
      session.sdkSessionId &&
      isSessionActive(session.sdkSessionId)
    ) {
      return c.json({
        sessionId: session.id,
        status: session.status,
        startedAt: session.startedAt.toISOString(),
        resumed: false,
      });
    }

    // If session is completed, reactivate it
    if (session.status === "completed") {
      await db
        .update(sessions)
        .set({ status: "active", endedAt: null, lastActivityAt: new Date() })
        .where(eq(sessions.id, sessionId));
    }

    // Clear the deduplication guard so this resumed session generates
    // a fresh summary when it ends (the previous cycle already ran its hooks).
    clearEndedSession(sessionId);
    const sdkSessionId = await ensureSdkSessionForStoredSession({
      sessionId,
      sdkSessionId: session.sdkSessionId,
      user,
      isReturningUser: true,
    });

    return c.json({
      sessionId: session.id,
      status: "active" as const,
      startedAt: session.startedAt.toISOString(),
      resumed: true,
    });
  });

// ── Background AI Streaming ──────────────────────────────────────

/** Regex to detect and strip [ASSESSMENT_READY:type] markers from AI output. */
const ASSESSMENT_MARKER_RE = /\[ASSESSMENT_READY:(phq9|gad7|dass21|isi|rosenberg_se|who5|pc_ptsd5|copenhagen_burnout)\]/g;

/** Regex to detect and strip [CBT_READY] marker from AI output. */
const CBT_MARKER_RE = /\[CBT_READY\]/g;

/**
 * Calls the SDK session manager to get an AI response, streaming
 * chunks to SSE subscribers as they arrive, then persists the
 * complete response as an assistant message.
 *
 * If the AI includes an [ASSESSMENT_READY:type] marker, it is stripped
 * before persistence/SSE and an assessment.start event is emitted.
 */
async function streamAiResponse(
  sessionId: string,
  sdkSessionId: string,
  userMessage: string,
  userMessageId: string,
  userId: string,
): Promise<void> {
  const fullText = await sdkSendMessage(sdkSessionId, userMessage, (chunk) => {
    sessionEmitter.emit(sessionId, {
      event: "ai.chunk",
      data: { content: chunk },
    });
  });

  // Guard against empty AI response
  if (!fullText.trim()) {
    sessionEmitter.emit(sessionId, {
      event: "ai.error",
      data: { error: "AI returned an empty response. Please try again." },
    });
    return;
  }

  // Strip [ASSESSMENT_READY:type] markers before persistence/SSE
  const assessmentMarkers: string[] = [];
  let cleanText = fullText.replace(ASSESSMENT_MARKER_RE, (match, type: string) => {
    assessmentMarkers.push(type);
    return "";
  }).trim();

  // Strip [CBT_READY] marker before persistence/SSE
  let cbtReady = false;
  cleanText = cleanText.replace(CBT_MARKER_RE, () => {
    cbtReady = true;
    return "";
  }).trim();

  // Persist the cleaned AI response (no markers)
  const [assistantMsg] = await db
    .insert(messages)
    .values({ sessionId, role: "assistant", content: cleanText })
    .returning();

  // Signal completion
  sessionEmitter.emit(sessionId, {
    event: "ai.response_complete",
    data: { messageId: assistantMsg!.id },
  });

  // Emit assessment.start for each detected marker (guarded against re-trigger)
  for (const assessmentType of assessmentMarkers) {
    const emittedForSession = emittedAssessments.get(sessionId) ?? new Set<string>();
    if (!emittedForSession.has(assessmentType)) {
      emittedForSession.add(assessmentType);
      emittedAssessments.set(sessionId, emittedForSession);
      sessionEmitter.emit(sessionId, {
        event: "assessment.start",
        data: { assessmentType },
      });
    }
  }

  // Emit cbt.start if [CBT_READY] was detected (guarded against re-trigger)
  if (cbtReady) {
    const emittedForSession = emittedAssessments.get(sessionId) ?? new Set<string>();
    if (!emittedForSession.has("cbt_thought_record")) {
      emittedForSession.add("cbt_thought_record");
      emittedAssessments.set(sessionId, emittedForSession);
      sessionEmitter.emit(sessionId, {
        event: "assessment.start",
        data: { assessmentType: "cbt_thought_record" },
      });
    }
  }

  // Fire-and-forget: extract memories from the conversation turn
  addMemoriesAsync(userId, sessionId, userMessageId, [
    { role: "user", content: userMessage },
    { role: "assistant", content: cleanText },
  ]);

  // Fire-and-forget: response validator (therapeutic safety audit)
  // Catches issues that input-only crisis detection misses.
  // Never blocks or delays the client response.
  runResponseValidator({
    response: cleanText,
    lastThreeTurns: [
      { role: "user", content: userMessage },
      { role: "assistant", content: cleanText },
    ],
    sessionMode: getSessionMode(sdkSessionId) ?? "follow_support",
    sessionId,
  }).catch((err) => {
    console.error("[response-validator] unhandled error:", err);
  });

  // Fire-and-forget: text emotion classification (text signal weight = 0.8 per architecture)
  const textEmotionResult = classifyTextEmotion(userMessage);
  if (textEmotionResult) {
    db.insert(emotionReadings).values({
      sessionId,
      messageId: userMessageId,
      channel: "text",
      emotionLabel: textEmotionResult.emotion,
      confidence: textEmotionResult.confidence,
      signalWeight: 0.8,
      rawScores: { source: "text_classifier", keywords_matched: true },
    }).catch((err: unknown) => {
      console.warn("[text-emotion] failed to persist:", err instanceof Error ? err.message : err);
    });
  }

  // Always check assessment eligibility — deterministic detector is the primary trigger.
  // The [ASSESSMENT_READY:...] markers from Claude are a bonus secondary path.
  // The completedTypes guard inside checkAssessmentEligibility prevents duplicate suggestions.
  checkAssessmentEligibility(sessionId, userId).catch((err) => {
    console.error("Assessment eligibility check failed:", err);
  });
}

// ── Assessment Signal Detection ──────────────────────────────────

export interface AssessmentSignals {
  phq9Score: number;
  gad7Score: number;
  evidenceMessages: number;
}

/**
 * Deterministic signal detector for assessment candidacy.
 * Scans recent messages for clinical indicators.
 */
export function detectAssessmentSignals(
  recentMessages: Array<{ role: string; content: string }>,
): AssessmentSignals {
  const userMessages = recentMessages.filter((m) => m.role === "user");

  const phq9Indicators = [
    /(?:sad|sadness|low mood|feeling down|feeling blue|depressed|empty|hollow|numb)/i,
    /(?:no interest|lost interest|don't enjoy|anhedonia|nothing excites|don't care)/i,
    /(?:can't sleep|insomnia|sleep too much|sleeping all day|trouble sleeping|not sleeping)/i,
    /(?:no energy|tired|fatigue|exhausted|drained|no motivation)/i,
    /(?:appetite|not eating|eating too much|lost appetite|no hunger)/i,
    /(?:worthless|guilt|guilty|blame myself|failure|useless|burden)/i,
    /(?:can't concentrate|focus|foggy|brain fog|memory|forgetful|distracted)/i,
    /(?:slow|sluggish|restless|agitated|fidgety|can't sit still)/i,
    /(?:withdraw|isolated|pulling away|avoiding|stopped going out|don't meet)/i,
    /(?:months?|weeks?|long time|for a while|been going on)/i,
  ];

  const gad7Indicators = [
    /(?:worry|worrying|worried|anxious|anxiety|nervous|tense)/i,
    /(?:can't stop thinking|overthink|racing thoughts|mind won't stop)/i,
    /(?:can't relax|restless|on edge|keyed up|wound up)/i,
    /(?:irritable|annoyed easily|snappy|angry|frustrated)/i,
    /(?:afraid|scared|fear|dread|panic|something awful)/i,
    /(?:heart racing|sweating|trembling|shaking|dizzy|nauseous)/i,
    /(?:can't control|out of control|helpless|overwhelmed)/i,
  ];

  let phq9Score = 0;
  let gad7Score = 0;
  let phq9MsgCount = 0;
  let gad7MsgCount = 0;

  for (const msg of userMessages) {
    let msgHasPhq9 = false;
    let msgHasGad7 = false;

    for (const pattern of phq9Indicators) {
      if (pattern.test(msg.content)) {
        phq9Score++;
        msgHasPhq9 = true;
      }
    }
    for (const pattern of gad7Indicators) {
      if (pattern.test(msg.content)) {
        gad7Score++;
        msgHasGad7 = true;
      }
    }

    if (msgHasPhq9) phq9MsgCount++;
    if (msgHasGad7) gad7MsgCount++;
  }

  return { phq9Score, gad7Score, evidenceMessages: Math.max(phq9MsgCount, gad7MsgCount) };
}

// ── Assessment Eligibility (Groq fallback prompt) ────────────────

const ASSESSMENT_ELIGIBILITY_PROMPT = `You are a clinical screening assistant for a mental wellness app.
Analyze the conversation and determine if a standardized assessment should be suggested.

Available assessments:
- phq9: Depression screening (PHQ-9). Suggest when user shows depressive symptoms like sadness, loss of interest, sleep/appetite changes, fatigue, guilt, concentration issues, or withdrawal.
- gad7: Anxiety screening (GAD-7). Suggest when user shows anxiety symptoms like excessive worry, racing thoughts, restlessness, irritability, fear, or physical anxiety symptoms.

Rules:
- Only suggest ONE assessment at a time
- Do NOT suggest if insufficient evidence (< 2 indicators). Duration mentions strengthen the case.
- Prefer phq9 over gad7 if both are equally indicated

Respond with JSON: { "suggest": boolean, "type": "phq9" | "gad7" | null, "reason": string }`;

/**
 * Two-tier assessment candidacy detection:
 *   1. Deterministic signal detection — fast keyword matching on all user messages.
 *   2. Groq LLM fallback — for subtler cases requiring GROQ_API_KEY.
 */
async function checkAssessmentEligibility(
  sessionId: string,
  userId: string,
): Promise<void> {
  const userMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.role, "user")));

  if (userMessages.length < 4) return;
  if (userMessages.length % 3 !== 1) return; // Check every 3rd message (4th, 7th, 10th...)

  const [session] = await db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (!session || session.status === "crisis_escalated" || session.status === "completed") return;

  const existingAssessments = await db
    .select({ assessmentType: assessments.type })
    .from(assessments)
    .where(eq(assessments.sessionId, sessionId));

  const completedTypes: Set<string> = new Set(existingAssessments.map((a) => a.assessmentType));

  // Get ALL messages for signal detection
  const allMessages = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  // Step 1: Deterministic signal detection
  const signals = detectAssessmentSignals(allMessages);

  // Merge completedTypes with already-emitted types (prevents re-trigger for in-progress assessments)
  const emittedForSession = emittedAssessments.get(sessionId) ?? new Set<string>();

  if (signals.evidenceMessages >= 2) {
    if (signals.phq9Score >= 3 && !completedTypes.has("phq9") && !emittedForSession.has("phq9")) {
      emittedForSession.add("phq9");
      emittedAssessments.set(sessionId, emittedForSession);
      sessionEmitter.emit(sessionId, {
        event: "assessment.start",
        data: { assessmentType: "phq9" },
      });
      return;
    }
    if (signals.gad7Score >= 3 && !completedTypes.has("gad7") && !emittedForSession.has("gad7")) {
      emittedForSession.add("gad7");
      emittedAssessments.set(sessionId, emittedForSession);
      sessionEmitter.emit(sessionId, {
        event: "assessment.start",
        data: { assessmentType: "gad7" },
      });
      return;
    }
  }

  // Step 2: Groq fallback for subtler cases
  if (!env.GROQ_API_KEY) return;
  if (userMessages.length < 6) return;

  const recentMessages = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.createdAt))
    .limit(8);

  const formatted = recentMessages
    .reverse()
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n\n");

  const groqAbort = new AbortController();
  const groqTimeout = setTimeout(() => groqAbort.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: ASSESSMENT_ELIGIBILITY_PROMPT },
          { role: "user", content: formatted },
        ],
        response_format: { type: "json_object" },
        max_tokens: 150,
        temperature: 0,
      }),
      signal: groqAbort.signal,
    });
  } catch {
    return; // Timeout or network error — degrade gracefully
  } finally {
    clearTimeout(groqTimeout);
  }

  if (!response.ok) return;

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";

  let result: { suggest?: boolean; type?: string; reason?: string };
  try {
    result = JSON.parse(raw) as typeof result;
  } catch {
    return;
  }

  const validTypes = new Set(["phq9", "gad7", "dass21", "isi", "rosenberg_se", "who5", "pc_ptsd5", "copenhagen_burnout"]);
  if (result.suggest && result.type && validTypes.has(result.type) && !completedTypes.has(result.type) && !emittedForSession.has(result.type)) {
    emittedForSession.add(result.type);
    emittedAssessments.set(sessionId, emittedForSession);
    sessionEmitter.emit(sessionId, {
      event: "assessment.start",
      data: { assessmentType: result.type as "phq9" | "gad7" },
    });
  }
}

// ── Export ────────────────────────────────────────────────────────

export type SessionRoutes = typeof app;
export default app;
