// ── Session Routes ──────────────────────────────────────────────
// POST /              — Create a new session
// POST /:id/messages  — Send a user message (crisis check + AI response)
// GET  /:id/events    — SSE stream for real-time AI chunks
// POST /:id/end       — End a session

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { SendMessageSchema, EndSessionSchema } from "@moc/shared";
import { ERROR_CODES } from "@moc/shared";
import { db } from "../db/index.js";
import { sessions, messages, userProfiles } from "../db/schema/index";
import { detectCrisis } from "../crisis/index.js";
import { sessionEmitter } from "../sse/emitter.js";
import type { SSEEventData } from "../sse/emitter.js";
import {
  createSdkSession,
  sendMessage as sdkSendMessage,
  endSdkSession,
} from "../sdk/session-manager.js";
import {
  searchMemories,
  addMemoriesAsync,
  summarizeSessionAsync,
} from "../services/memory-client.js";

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Get or create the single user profile.
 * Single-user app — no auth, always one user.
 */
/** Cached user ID to avoid repeated DB lookups after first call. */
let cachedUserId: string | null = null;

async function getOrCreateUser() {
  if (cachedUserId) {
    const [existing] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, cachedUserId))
      .limit(1);
    if (existing) return existing;
    cachedUserId = null;
  }

  const existing = await db.select().from(userProfiles).limit(1);
  if (existing[0]) {
    cachedUserId = existing[0].id;
    return existing[0];
  }

  const [created] = await db
    .insert(userProfiles)
    .values({ displayName: "User" })
    .returning();
  cachedUserId = created!.id;
  return created!;
}

// ── Route Definitions ────────────────────────────────────────────

const app = new Hono()

  // ── POST / — Create Session ──────────────────────────────────
  .post("/", async (c) => {
    const user = await getOrCreateUser();

    // Retrieve memories for session context (BLOCKING — returns [] on failure)
    // Two parallel searches: general context + explicit safety_critical
    const [generalMemories, safetyMemories] = await Promise.all([
      searchMemories(user.id, "user context and therapeutic goals"),
      searchMemories(user.id, "safety concerns, crisis history, medications", 5, ["safety_critical"]),
    ]);

    // Merge and deduplicate (safety_critical may overlap with general results)
    const seenIds = new Set<string>();
    const allMemories: typeof generalMemories = [];
    // Safety-critical first (highest priority)
    for (const m of safetyMemories) {
      if (!seenIds.has(m.id)) { seenIds.add(m.id); allMemories.push(m); }
    }
    for (const m of generalMemories) {
      if (!seenIds.has(m.id)) { seenIds.add(m.id); allMemories.push(m); }
    }

    const mappedMemories = allMemories.map((m) => ({
      content: m.content,
      memoryType: m.memoryType,
      confidence: m.confidence,
    }));

    // Create an SDK session with memory context
    const sdkSessionId = await createSdkSession(
      mappedMemories.length > 0 ? mappedMemories : undefined,
    );

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

    if (session.status !== "active") {
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
      // Send a connection confirmation event
      await stream.writeSSE({
        event: "session.started",
        data: JSON.stringify({ sessionId, status: session.status }),
      });

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

    if (session.status !== "active") {
      return c.json(
        { error: ERROR_CODES.SESSION_ENDED, message: "Session is not active" },
        409,
      );
    }

    const endedAt = new Date();

    // End the SDK session (fire-and-forget — don't block the response)
    if (session.sdkSessionId) {
      endSdkSession(session.sdkSessionId).catch((err) => {
        console.error(`Failed to end SDK session ${session.sdkSessionId}:`, err);
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

    // Fire-and-forget: notify memory service about session end
    // Reason is restricted to known values to prevent injection through persistent memory
    const ALLOWED_REASONS = ["user_ended", "timeout", "inactivity", "beforeunload"] as const;
    const rawReason = c.req.valid("json").reason ?? "user_ended";
    const safeReason = ALLOWED_REASONS.includes(rawReason as typeof ALLOWED_REASONS[number])
      ? rawReason
      : "user_ended";
    summarizeSessionAsync(
      session.userId,
      sessionId,
      `Session ended at ${endedAt.toISOString()}. Reason: ${safeReason}`,
    );

    // Notify SSE subscribers that the session ended
    sessionEmitter.emit(sessionId, {
      event: "session.ended",
      data: {},
    });

    return c.json({
      sessionId: session.id,
      status: "completed" as const,
      endedAt: endedAt.toISOString(),
    });
  });

// ── Background AI Streaming ──────────────────────────────────────

/**
 * Calls the SDK session manager to get an AI response, streaming
 * chunks to SSE subscribers as they arrive, then persists the
 * complete response as an assistant message.
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

  // Persist the complete AI response
  const [assistantMsg] = await db
    .insert(messages)
    .values({ sessionId, role: "assistant", content: fullText })
    .returning();

  // Signal completion
  sessionEmitter.emit(sessionId, {
    event: "ai.response_complete",
    data: { messageId: assistantMsg!.id },
  });

  // Fire-and-forget: extract memories from the conversation turn
  addMemoriesAsync(userId, sessionId, userMessageId, [
    { role: "user", content: userMessage },
    { role: "assistant", content: fullText },
  ]);
}

// ── Export ────────────────────────────────────────────────────────

export type SessionRoutes = typeof app;
export default app;
