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
import { eq, and, desc, asc } from "drizzle-orm";
import { SendMessageSchema, EndSessionSchema, SessionHistoryQuerySchema } from "@moc/shared";
import { ERROR_CODES } from "@moc/shared";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { sessions, messages, sessionSummaries, assessments, emotionReadings } from "../db/schema/index";
import { getOrCreateUser } from "../db/helpers.js";
import { detectCrisis } from "../crisis/index.js";
import { sessionEmitter } from "../sse/emitter.js";
import type { SSEEventData } from "../sse/emitter.js";
import {
  createSdkSession,
  sendMessage as sdkSendMessage,
  endSdkSession,
  loadSkillFiles,
  selectRelevantSkills,
  injectSessionContext,
  isSessionActive,
  spawnClaudeStreaming,
} from "../sdk/session-manager.js";
import type { ConversationMessage } from "../sdk/session-manager.js";
import {
  getAllMemories,
  searchMemories,
  addMemoriesAsync,
  summarizeSessionAsync,
} from "../services/memory-client.js";
import { generateAndPersistFormulation, getLatestFormulation } from "../services/formulation-service.js";
import { classifyTextEmotion } from "../services/text-emotion-classifier.js";

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
      .where(eq(sessions.userId, user.id))
      .orderBy(desc(sessions.startedAt), desc(sessions.id))
      .limit(limit)
      .offset(offset);

    return c.json({
      sessions: rows.map((r) => ({
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

    // Fetch the latest formulation to drive skill selection and memory ranking
    const formulation = await getLatestFormulation(user.id);

    // ── Memory retrieval: formulation-ranked or full fallback ────
    let mappedMemories: Array<{ content: string; memoryType: string; confidence: number }>;

    if (formulation && formulation.snapshot.formulation?.presentingTheme) {
      // Ranked search based on presenting theme (top 20)
      const rankedMemories = await searchMemories(
        user.id,
        formulation.snapshot.formulation.presentingTheme,
        20,
      );
      // Always separately fetch safety_critical memories
      const safetyMemories = await searchMemories(
        user.id,
        "safety critical",
        10,
        ["safety_critical"],
      );
      // Merge, dedup by id
      const seen = new Set<string>();
      const combined = [...rankedMemories, ...safetyMemories].filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      mappedMemories = combined.map((m) => ({
        content: m.content,
        memoryType: m.memoryType,
        confidence: m.confidence,
      }));
    } else {
      // No formulation (new user) — fall back to all memories
      const allMemories = await getAllMemories(user.id);
      mappedMemories = allMemories.map((m) => ({
        content: m.content,
        memoryType: m.memoryType,
        confidence: m.confidence,
      }));
    }

    // ── Selective skill loading based on formulation ─────────────
    const allSkills = loadSkillFiles();
    const selectedSkills = selectRelevantSkills(allSkills, formulation?.snapshot ?? null);

    // Create an SDK session with memory context and selectively loaded skills
    const sdkSessionId = await createSdkSession(
      mappedMemories.length > 0 ? mappedMemories : undefined,
      selectedSkills,
    );

    // Inject user profile context so the AI knows the user's name, traits, patterns, and goals
    const profileParts: string[] = [];
    if (user.displayName) profileParts.push(`Name: ${user.displayName}`);
    if (user.coreTraits && Array.isArray(user.coreTraits) && (user.coreTraits as string[]).length > 0) {
      profileParts.push(`Core traits (self-described): ${(user.coreTraits as string[]).join(", ")}`);
    }
    if (user.patterns && Array.isArray(user.patterns) && (user.patterns as string[]).length > 0) {
      profileParts.push(`Behavioral patterns (self-described): ${(user.patterns as string[]).join(", ")}`);
    }
    if (user.goals && Array.isArray(user.goals) && (user.goals as string[]).length > 0) {
      profileParts.push(`Goals: ${(user.goals as string[]).join(", ")}`);
    }
    if (profileParts.length > 0) {
      injectSessionContext(
        sdkSessionId,
        `=== User Profile ===\n${profileParts.join("\n")}\n=== End User Profile ===\n\nUse this profile to personalize your responses. Address the user by name. Be aware of their self-described traits, patterns, and goals — but treat them as the user's own perspective, not clinical facts.`,
      );
    }

    // ── Inject formulation context (3C) ─────────────────────────
    if (formulation) {
      const f = formulation.snapshot;
      const parts: string[] = [];
      if (f.formulation?.presentingTheme) {
        parts.push(`Presenting theme: ${f.formulation.presentingTheme}`);
      }
      const activeStates = f.activeStates?.slice(0, 5) ?? [];
      if (activeStates.length > 0) {
        parts.push(`Active patterns: ${activeStates.map((s: any) => `${s.label} (${s.domain})`).join(', ')}`);
      }
      const actions = formulation.actionRecommendations?.slice(0, 3) ?? [];
      if (actions.length > 0) {
        parts.push(`Recommended conversation areas: ${actions.map((a: any) => a.conversationHint).join('; ')}`);
      }
      if (parts.length > 0) {
        injectSessionContext(
          sdkSessionId,
          `=== Formulation Context ===\n${parts.join('\n')}\n=== End Formulation Context ===\n\nUse this context to inform your approach. Reference the presenting theme naturally. Prioritize conversation areas marked as recommended.`,
        );
      }
    }

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

    // Notify SSE subscribers that the AI is processing
    sessionEmitter.emit(sessionId, {
      event: "ai.thinking",
      data: { status: "thinking" },
    });

    // Kick off streaming in the background — do not await
    streamAiResponse(sessionId, sdkSessionId, text, userMsg!.id, session.userId).catch((err) => {
      console.error(`AI streaming error for session ${sessionId}:`, err);
      sessionEmitter.emit(sessionId, {
        event: "ai.error",
        data: { error: "Failed to get AI response" },
      });
    });

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

    // End the SDK session and capture conversation history for summary
    let conversationHistory: ConversationMessage[] = [];
    if (session.sdkSessionId) {
      try {
        conversationHistory = await endSdkSession(session.sdkSessionId);
      } catch (err) {
        console.error(`Failed to end SDK session ${session.sdkSessionId}:`, err);
      }
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

    // Notify SSE subscribers that the session ended (immediate — UI shows "ended" right away)
    sessionEmitter.emit(sessionId, {
      event: "session.ended",
      data: {},
    });

    // Sanitize session-end reason to prevent injection through persistent memory
    const ALLOWED_REASONS = ["user_ended", "timeout", "inactivity", "beforeunload"] as const;
    const rawReason = c.req.valid("json").reason ?? "user_ended";
    const safeReason = ALLOWED_REASONS.includes(rawReason as typeof ALLOWED_REASONS[number])
      ? rawReason
      : "user_ended";

    // Fire-and-forget: generate AI summary, persist to DB, notify Mem0, emit SSE with summary
    if (conversationHistory.length > 0) {
      generateAndPersistSummary(
        session.userId,
        sessionId,
        conversationHistory,
      ).catch((err) => {
        console.error(`Summary generation error for session ${sessionId}:`, err);
        // Fallback: send a basic summary to Mem0 so it at least knows the session ended
        summarizeSessionAsync(
          session.userId,
          sessionId,
          `Session ended at ${endedAt.toISOString()}. Reason: ${safeReason}`,
        );
      });
    } else {
      // No conversation history — just notify Mem0 with a basic message
      summarizeSessionAsync(
        session.userId,
        sessionId,
        `Session ended at ${endedAt.toISOString()}. Reason: ${safeReason}. No conversation took place.`,
      );
    }

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

    // Fetch the latest formulation to drive skill selection and memory ranking
    const formulation = await getLatestFormulation(user.id);

    // ── Memory retrieval: formulation-ranked or full fallback (same pattern as POST /) ────
    let mappedMemories: Array<{ content: string; memoryType: string; confidence: number }>;

    if (formulation && formulation.snapshot.formulation?.presentingTheme) {
      const rankedMemories = await searchMemories(
        user.id,
        formulation.snapshot.formulation.presentingTheme,
        20,
      );
      const safetyMemories = await searchMemories(
        user.id,
        "safety critical",
        10,
        ["safety_critical"],
      );
      const seen = new Set<string>();
      const combined = [...rankedMemories, ...safetyMemories].filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      mappedMemories = combined.map((m) => ({
        content: m.content,
        memoryType: m.memoryType,
        confidence: m.confidence,
      }));
    } else {
      const allMemories = await getAllMemories(user.id);
      mappedMemories = allMemories.map((m) => ({
        content: m.content,
        memoryType: m.memoryType,
        confidence: m.confidence,
      }));
    }

    // ── Selective skill loading based on formulation ─────────────
    const allSkills = loadSkillFiles();
    const selectedSkills = selectRelevantSkills(allSkills, formulation?.snapshot ?? null);

    // Create a fresh SDK session with memory context and selectively loaded skills
    const sdkSessionId = await createSdkSession(
      mappedMemories.length > 0 ? mappedMemories : undefined,
      selectedSkills,
    );

    // Inject user profile context (same pattern as POST /)
    const profileParts: string[] = [];
    if (user.displayName) profileParts.push(`Name: ${user.displayName}`);
    if (user.coreTraits && Array.isArray(user.coreTraits) && (user.coreTraits as string[]).length > 0) {
      profileParts.push(`Core traits (self-described): ${(user.coreTraits as string[]).join(", ")}`);
    }
    if (user.patterns && Array.isArray(user.patterns) && (user.patterns as string[]).length > 0) {
      profileParts.push(`Behavioral patterns (self-described): ${(user.patterns as string[]).join(", ")}`);
    }
    if (user.goals && Array.isArray(user.goals) && (user.goals as string[]).length > 0) {
      profileParts.push(`Goals: ${(user.goals as string[]).join(", ")}`);
    }
    if (profileParts.length > 0) {
      injectSessionContext(
        sdkSessionId,
        `=== User Profile ===\n${profileParts.join("\n")}\n=== End User Profile ===\n\nUse this profile to personalize your responses. Address the user by name. Be aware of their self-described traits, patterns, and goals — but treat them as the user's own perspective, not clinical facts.`,
      );
    }

    // ── Inject formulation context (3C) ─────────────────────────
    if (formulation) {
      const f = formulation.snapshot;
      const parts: string[] = [];
      if (f.formulation?.presentingTheme) {
        parts.push(`Presenting theme: ${f.formulation.presentingTheme}`);
      }
      const activeStates = f.activeStates?.slice(0, 5) ?? [];
      if (activeStates.length > 0) {
        parts.push(`Active patterns: ${activeStates.map((s: any) => `${s.label} (${s.domain})`).join(', ')}`);
      }
      const actions = formulation.actionRecommendations?.slice(0, 3) ?? [];
      if (actions.length > 0) {
        parts.push(`Recommended conversation areas: ${actions.map((a: any) => a.conversationHint).join('; ')}`);
      }
      if (parts.length > 0) {
        injectSessionContext(
          sdkSessionId,
          `=== Formulation Context ===\n${parts.join('\n')}\n=== End Formulation Context ===\n\nUse this context to inform your approach. Reference the presenting theme naturally. Prioritize conversation areas marked as recommended.`,
        );
      }
    }

    // Load existing conversation history from the database
    const historyRows = await db
      .select({
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt), asc(messages.id));

    // Inject the conversation history as a context block so Claude has continuity
    if (historyRows.length > 0) {
      const historyLines = historyRows.map(
        (m) => `[${m.role.toUpperCase()}]: ${m.content}`,
      );
      injectSessionContext(
        sdkSessionId,
        `=== Previous Conversation History (Resumed Session) ===\nThis session is being resumed. Below is the conversation that took place before the session was interrupted. Continue naturally from where you left off.\n\n${historyLines.join("\n\n")}\n=== End Previous Conversation History ===`,
      );
    }

    // Update the session's sdkSessionId in the database
    await db
      .update(sessions)
      .set({ sdkSessionId, lastActivityAt: new Date() })
      .where(eq(sessions.id, sessionId));

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

// ── Session Summary Generation ──────────────────────────────────

/**
 * Summarization prompt for generating session summaries.
 * CRITICAL: Uses "wellness companion" framing, NEVER "therapist" or clinical language.
 */
const SUMMARY_PROMPT = `You are a summarization assistant for MindOverChatter, an AI wellness companion (NOT a therapist).

Given a conversation between a user and their wellness companion, generate a structured summary in JSON format.

Your response must be ONLY valid JSON with this exact structure:
{
  "content": "A 2-4 sentence narrative summary of what was discussed and any insights gained. Use warm, non-clinical language. Focus on the user's experience and progress.",
  "themes": ["theme1", "theme2"],
  "cognitive_patterns": ["pattern1", "pattern2"],
  "action_items": ["item1", "item2"]
}

Rules:
- "content": 2-4 sentences. Warm, empathetic tone. Describe what the user explored, not clinical observations.
- "themes": 1-5 short topic labels (e.g., "work stress", "family relationships", "sleep concerns", "self-compassion").
- "cognitive_patterns": 0-4 thinking patterns observed (e.g., "all-or-nothing thinking", "catastrophizing", "mind reading", "should statements"). Only include patterns clearly present in the conversation. Use everyday language, not DSM terminology.
- "action_items": 0-3 concrete next steps or intentions the user expressed or agreed to explore. If none, use an empty array.

NEVER:
- Diagnose conditions
- Use clinical/DSM terminology
- Refer to the user as a "patient" or "client"
- Include information not present in the conversation
- Generate more than the requested fields`;

/**
 * Generate an AI-powered session summary, persist it to the database,
 * send it to Mem0, and emit it via SSE.
 *
 * This function is designed to be called fire-and-forget with .catch().
 * It will throw on failure so the caller can apply fallback logic.
 */
async function generateAndPersistSummary(
  userId: string,
  sessionId: string,
  history: ConversationMessage[],
): Promise<void> {
  // Format conversation history for the summarization prompt
  const conversationText = history
    .map((msg) => `[${msg.role.toUpperCase()}]: ${msg.content}`)
    .join("\n\n");

  const fullPrompt = `${SUMMARY_PROMPT}\n\nConversation:\n${conversationText}`;

  // Spawn Claude to generate the summary (collect full output, no SSE streaming)
  console.log(`[summary] Generating summary for session ${sessionId} (${history.length} messages)`);
  const rawResponse = await spawnClaudeStreaming(fullPrompt, () => {
    // No-op callback — we just want the accumulated text, not streaming chunks
  });

  if (!rawResponse.trim()) {
    throw new Error("Summary generation returned empty response");
  }

  // Parse the JSON response — Claude may wrap it in markdown code fences
  let jsonStr = rawResponse.trim();

  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeFenceMatch) {
    jsonStr = codeFenceMatch[1]!.trim();
  }

  let parsed: {
    content?: string;
    themes?: string[];
    cognitive_patterns?: string[];
    action_items?: string[];
  };

  try {
    parsed = JSON.parse(jsonStr) as typeof parsed;
  } catch {
    console.error(`[summary] Failed to parse summary JSON for session ${sessionId}:`, jsonStr);
    throw new Error("Summary generation returned invalid JSON");
  }

  // Validate required fields
  const content = parsed.content;
  if (!content || typeof content !== "string") {
    throw new Error("Summary missing 'content' field");
  }

  const themes = Array.isArray(parsed.themes)
    ? parsed.themes.filter((t): t is string => typeof t === "string")
    : [];
  const cognitivePatterns = Array.isArray(parsed.cognitive_patterns)
    ? parsed.cognitive_patterns.filter((p): p is string => typeof p === "string")
    : [];
  const actionItems = Array.isArray(parsed.action_items)
    ? parsed.action_items.filter((a): a is string => typeof a === "string")
    : [];

  // Fetch session timestamps for periodStart/periodEnd
  const [sess] = await db
    .select({ startedAt: sessions.startedAt, endedAt: sessions.endedAt })
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  // Persist to session_summaries table
  await db.insert(sessionSummaries).values({
    userId,
    sessionId,
    level: "session",
    content,
    themes: themes.length > 0 ? themes : null,
    cognitivePatterns: cognitivePatterns.length > 0 ? cognitivePatterns : null,
    actionItems: actionItems.length > 0 ? actionItems : null,
    periodStart: sess?.startedAt,
    periodEnd: sess?.endedAt ?? new Date(),
  });

  console.log(`[summary] Persisted session summary for session ${sessionId}`);

  // Send the real summary to Mem0 (replaces the old timestamp-only string)
  summarizeSessionAsync(userId, sessionId, content);

  // Fire-and-forget: regenerate canonical formulation snapshot
  generateAndPersistFormulation(userId, "session_end").catch((err) => {
    console.error(`[summary] Formulation generation error for session ${sessionId}:`, err);
  });
}

// ── Export ────────────────────────────────────────────────────────

export type SessionRoutes = typeof app;
export default app;
