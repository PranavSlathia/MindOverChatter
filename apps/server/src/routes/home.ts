// ── Home Routes ─────────────────────────────────────────────────
// GET /summary          — Dashboard snapshot for home page
// GET /health/services  — Ping each Python microservice

import { Hono } from "hono";
import { eq, and, desc, isNull, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { sessions, moodLogs, memories, sessionSummaries } from "../db/schema/index";
import { getOrCreateUser } from "../db/helpers.js";

// ── Types ─────────────────────────────────────────────────────────

type MoodTrendDirection = "improving" | "stable" | "declining";

interface ServiceHealth {
  available: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Compute mood trend direction from recent mood logs.
 * Compares average valence of last 3 logs vs the 3 before that.
 * If fewer than 2 total logs exist, returns "stable".
 */
function computeMoodTrend(
  recentMoods: Array<{ valence: number; createdAt: Date }>,
): MoodTrendDirection {
  if (recentMoods.length < 2) return "stable";

  // Split into two halves: newer half vs older half
  const midpoint = Math.floor(recentMoods.length / 2);
  const newerHalf = recentMoods.slice(0, midpoint);
  const olderHalf = recentMoods.slice(midpoint);

  const avgNewer =
    newerHalf.reduce((sum, m) => sum + m.valence, 0) / newerHalf.length;
  const avgOlder =
    olderHalf.reduce((sum, m) => sum + m.valence, 0) / olderHalf.length;

  const delta = avgNewer - avgOlder;

  // Threshold: 0.1 on a -1..+1 scale
  if (delta > 0.1) return "improving";
  if (delta < -0.1) return "declining";
  return "stable";
}

/**
 * Compute suggested action string based on session state.
 */
function computeSuggestedAction(
  lastSession: { status: string; startedAt: Date } | null,
): string {
  if (!lastSession) {
    return "Start your first session to begin your journey";
  }

  if (lastSession.status === "active") {
    return "You have an active session — continue where you left off";
  }

  const hoursSince =
    (Date.now() - lastSession.startedAt.getTime()) / (1000 * 60 * 60);

  if (hoursSince < 24) {
    return "Check your Journey page to see new insights";
  }
  if (hoursSince < 72) {
    return "It's been a little while — ready for a check-in?";
  }
  return "It's been a few days — a quick session can help you stay connected";
}

/**
 * Ping a service health endpoint with a 2-second timeout.
 */
async function pingService(baseUrl: string): Promise<ServiceHealth> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
    });
    return { available: res.ok };
  } catch {
    return { available: false };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Route Definitions ─────────────────────────────────────────────

const app = new Hono()

  // ── GET /summary — Home Dashboard Snapshot ───────────────────
  .get("/summary", async (c) => {
    const user = await getOrCreateUser();

    // Run all queries in parallel for minimal latency
    const [lastSessionRow, latestMoodRow, sessionCountRow, memoryCountRow, recentMoods] =
      await Promise.all([
        // 1. Last session (with left-joined summary)
        db
          .select({
            id: sessions.id,
            startedAt: sessions.startedAt,
            endedAt: sessions.endedAt,
            status: sessions.status,
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
          .limit(1),

        // 2. Latest mood log
        db
          .select({
            valence: moodLogs.valence,
            arousal: moodLogs.arousal,
            createdAt: moodLogs.createdAt,
          })
          .from(moodLogs)
          .where(eq(moodLogs.userId, user.id))
          .orderBy(desc(moodLogs.createdAt))
          .limit(1),

        // 3. Session count
        db
          .select({ value: count() })
          .from(sessions)
          .where(eq(sessions.userId, user.id)),

        // 4. Non-superseded memory count
        db
          .select({ value: count() })
          .from(memories)
          .where(
            and(eq(memories.userId, user.id), isNull(memories.supersededBy)),
          ),

        // 5. Recent mood logs for trend (last 6)
        db
          .select({
            valence: moodLogs.valence,
            createdAt: moodLogs.createdAt,
          })
          .from(moodLogs)
          .where(eq(moodLogs.userId, user.id))
          .orderBy(desc(moodLogs.createdAt))
          .limit(6),
      ]);

    // Build last session response
    const last = lastSessionRow[0] ?? null;
    const lastSession = last
      ? {
          id: last.id,
          startedAt: last.startedAt.toISOString(),
          endedAt: last.endedAt?.toISOString() ?? null,
          status: last.status,
          summaryExcerpt: last.summaryContent
            ? last.summaryContent.slice(0, 120)
            : null,
        }
      : null;

    // Build latest mood response
    const mood = latestMoodRow[0] ?? null;
    const latestMood = mood
      ? {
          valence: mood.valence,
          arousal: mood.arousal,
          createdAt: mood.createdAt.toISOString(),
        }
      : null;

    // Journey signal
    const moodTrendDirection = computeMoodTrend(recentMoods);
    const sessionCount = sessionCountRow[0]?.value ?? 0;
    const memoryCount = memoryCountRow[0]?.value ?? 0;

    // Suggested action
    const suggestedAction = computeSuggestedAction(
      last ? { status: last.status, startedAt: last.startedAt } : null,
    );

    return c.json({
      lastSession,
      latestMood,
      journeySignal: {
        moodTrendDirection,
        sessionCount,
        memoryCount,
      },
      suggestedAction,
    });
  })

  // ── GET /health/services — Python Microservice Availability ──
  .get("/health/services", async (c) => {
    const [whisper, emotion, tts, memory, voice] = await Promise.all([
      pingService(env.WHISPER_SERVICE_URL),
      pingService(env.EMOTION_SERVICE_URL),
      pingService(env.TTS_SERVICE_URL),
      pingService(env.MEMORY_SERVICE_URL),
      pingService(env.VOICE_SERVICE_URL),
    ]);

    return c.json({ whisper, emotion, tts, memory, voice });
  });

// ── Export ─────────────────────────────────────────────────────────

export type HomeRoutes = typeof app;
export default app;
