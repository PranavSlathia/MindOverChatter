// ── Journey Routes ────────────────────────────────────────────────
// GET /timeline   — Unified timeline of sessions, memories, assessments, moods
// GET /insights   — AI-generated insights (cached)
// GET /assessments — Assessment history

import { zValidator } from "@hono/zod-validator";
import { AssessmentHistoryQuerySchema, JourneyTimelineQuerySchema } from "@moc/shared";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { Hono } from "hono";
import { getOrCreateUser } from "../db/helpers.js";
import { db } from "../db/index.js";
import { assessments, memories, moodLogs, sessionSummaries, sessions } from "../db/schema/index";
import { spawnClaudeStreaming } from "../sdk/session-manager.js";

// ── Insights Cache ───────────────────────────────────────────────
// In-memory cache with 1-hour TTL. Invalidated on new session end.
let insightsCache: { data: unknown; cachedAt: Date } | null = null;
const INSIGHTS_TTL_MS = 60 * 60 * 1000; // 1 hour

export function invalidateInsightsCache() {
  insightsCache = null;
}

// ── Route Definitions ────────────────────────────────────────────

const app = new Hono()

  // ── GET /timeline — Unified Timeline ────────────────────────
  .get("/timeline", zValidator("query", JourneyTimelineQuerySchema), async (c) => {
    const { limit, offset, from, to } = c.req.valid("query");
    const user = await getOrCreateUser();

    // Build date conditions
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    // Fetch all four data types in parallel
    const [sessionRows, memoryRows, assessmentRows, moodRows] = await Promise.all([
      // Sessions with summaries
      db
        .select({
          id: sessions.id,
          startedAt: sessions.startedAt,
          endedAt: sessions.endedAt,
          summaryContent: sessionSummaries.content,
          themes: sessionSummaries.themes,
        })
        .from(sessions)
        .leftJoin(
          sessionSummaries,
          and(eq(sessions.id, sessionSummaries.sessionId), eq(sessionSummaries.level, "session")),
        )
        .where(
          and(
            eq(sessions.userId, user.id),
            eq(sessions.status, "completed"),
            fromDate ? gte(sessions.startedAt, fromDate) : undefined,
            toDate ? lte(sessions.startedAt, toDate) : undefined,
          ),
        )
        .orderBy(desc(sessions.startedAt))
        .limit(limit),

      // Memories (non-superseded, high confidence)
      db
        .select({
          id: memories.id,
          content: memories.content,
          memoryType: memories.memoryType,
          confidence: memories.confidence,
          createdAt: memories.createdAt,
        })
        .from(memories)
        .where(
          and(
            eq(memories.userId, user.id),
            fromDate ? gte(memories.createdAt, fromDate) : undefined,
            toDate ? lte(memories.createdAt, toDate) : undefined,
          ),
        )
        .orderBy(desc(memories.createdAt))
        .limit(limit),

      // Assessments
      db
        .select({
          id: assessments.id,
          type: assessments.type,
          totalScore: assessments.totalScore,
          severity: assessments.severity,
          createdAt: assessments.createdAt,
        })
        .from(assessments)
        .where(
          and(
            eq(assessments.userId, user.id),
            fromDate ? gte(assessments.createdAt, fromDate) : undefined,
            toDate ? lte(assessments.createdAt, toDate) : undefined,
          ),
        )
        .orderBy(desc(assessments.createdAt))
        .limit(limit),

      // Mood logs
      db
        .select({
          id: moodLogs.id,
          valence: moodLogs.valence,
          arousal: moodLogs.arousal,
          createdAt: moodLogs.createdAt,
        })
        .from(moodLogs)
        .where(
          and(
            eq(moodLogs.userId, user.id),
            fromDate ? gte(moodLogs.createdAt, fromDate) : undefined,
            toDate ? lte(moodLogs.createdAt, toDate) : undefined,
          ),
        )
        .orderBy(desc(moodLogs.createdAt))
        .limit(limit),
    ]);

    // Merge into a unified timeline sorted by date (descending)
    type TimelineItem =
      | {
          type: "session";
          data: {
            id: string;
            startedAt: string;
            endedAt: string | null;
            summary: string | null;
            themes: string[] | null;
          };
          sortDate: Date;
        }
      | {
          type: "memory";
          data: {
            id: string;
            content: string;
            memoryType: string;
            confidence: number;
            createdAt: string;
          };
          sortDate: Date;
        }
      | {
          type: "assessment";
          data: {
            id: string;
            type: string;
            totalScore: number;
            severity: string;
            createdAt: string;
          };
          sortDate: Date;
        }
      | {
          type: "mood";
          data: { id: string; valence: number; arousal: number; createdAt: string };
          sortDate: Date;
        };

    const items: TimelineItem[] = [];

    for (const r of sessionRows) {
      items.push({
        type: "session",
        data: {
          id: r.id,
          startedAt: r.startedAt.toISOString(),
          endedAt: r.endedAt?.toISOString() ?? null,
          summary: r.summaryContent ?? null,
          themes: r.themes ?? null,
        },
        sortDate: r.startedAt,
      });
    }

    for (const r of memoryRows) {
      items.push({
        type: "memory",
        data: {
          id: r.id,
          content: r.content,
          memoryType: r.memoryType,
          confidence: r.confidence,
          createdAt: r.createdAt.toISOString(),
        },
        sortDate: r.createdAt,
      });
    }

    for (const r of assessmentRows) {
      items.push({
        type: "assessment",
        data: {
          id: r.id,
          type: r.type,
          totalScore: r.totalScore,
          severity: r.severity,
          createdAt: r.createdAt.toISOString(),
        },
        sortDate: r.createdAt,
      });
    }

    for (const r of moodRows) {
      items.push({
        type: "mood",
        data: {
          id: r.id,
          valence: r.valence,
          arousal: r.arousal,
          createdAt: r.createdAt.toISOString(),
        },
        sortDate: r.createdAt,
      });
    }

    // Sort by date descending, then apply offset/limit
    items.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
    const paged = items.slice(offset, offset + limit);

    // Strip sortDate from response
    const response = paged.map(({ sortDate: _, ...rest }) => rest);

    return c.json({ items: response, limit, offset });
  })

  // ── GET /insights — AI-Generated Insights ──────────────────
  .get("/insights", async (c) => {
    const user = await getOrCreateUser();

    // Check cache validity
    if (insightsCache && Date.now() - insightsCache.cachedAt.getTime() < INSIGHTS_TTL_MS) {
      return c.json(insightsCache.data);
    }

    // Fetch data for insight generation
    const [summaryRows, memoryRows, assessmentRows, moodRows] = await Promise.all([
      // Recent session summaries
      db
        .select({
          content: sessionSummaries.content,
          themes: sessionSummaries.themes,
          cognitivePatterns: sessionSummaries.cognitivePatterns,
          actionItems: sessionSummaries.actionItems,
          createdAt: sessionSummaries.createdAt,
        })
        .from(sessionSummaries)
        .where(and(eq(sessionSummaries.userId, user.id), eq(sessionSummaries.level, "session")))
        .orderBy(desc(sessionSummaries.createdAt))
        .limit(10),

      // High-confidence memories by type
      db
        .select({
          id: memories.id,
          content: memories.content,
          memoryType: memories.memoryType,
          confidence: memories.confidence,
        })
        .from(memories)
        .where(
          and(
            eq(memories.userId, user.id),
            inArray(memories.memoryType, [
              "recurring_trigger",
              "unresolved_thread",
              "win",
              "goal",
              "coping_strategy",
            ]),
          ),
        )
        .orderBy(desc(memories.confidence))
        .limit(30),

      // Assessment trends
      db
        .select({
          type: assessments.type,
          totalScore: assessments.totalScore,
          severity: assessments.severity,
          createdAt: assessments.createdAt,
        })
        .from(assessments)
        .where(eq(assessments.userId, user.id))
        .orderBy(desc(assessments.createdAt))
        .limit(10),

      // Recent mood entries for trend
      db
        .select({
          valence: moodLogs.valence,
          arousal: moodLogs.arousal,
          createdAt: moodLogs.createdAt,
        })
        .from(moodLogs)
        .where(eq(moodLogs.userId, user.id))
        .orderBy(desc(moodLogs.createdAt))
        .limit(30),
    ]);

    // Organize memories by type
    const triggers = memoryRows.filter((m) => m.memoryType === "recurring_trigger");
    const threads = memoryRows.filter((m) => m.memoryType === "unresolved_thread");
    const wins = memoryRows.filter((m) => m.memoryType === "win");

    // Compute mood trend
    const moodTrend = computeMoodTrend(moodRows);

    // If there's not enough data, return a minimal response
    if (summaryRows.length === 0 && memoryRows.length === 0) {
      const emptyInsights = {
        clinicalUnderstanding:
          "Not enough sessions yet to identify patterns. Keep checking in and your journey insights will grow over time.",
        userReflection:
          "You're just getting started. Each conversation adds to a richer picture of your journey.",
        actionItems: ["Start a new session to begin building your journey narrative"],
        patterns: {
          recurring_triggers: [],
          unresolved_threads: [],
          wins: [],
        },
        moodTrend,
        cachedAt: new Date().toISOString(),
      };
      insightsCache = { data: emptyInsights, cachedAt: new Date() };
      return c.json(emptyInsights);
    }

    // Build prompt for Claude
    const summaryContext = summaryRows
      .map((s) => {
        const parts = [`Summary: ${s.content}`];
        if (s.themes?.length) parts.push(`Themes: ${s.themes.join(", ")}`);
        if (s.cognitivePatterns?.length) parts.push(`Patterns: ${s.cognitivePatterns.join(", ")}`);
        if (s.actionItems?.length) parts.push(`Action items: ${s.actionItems.join(", ")}`);
        return parts.join("\n");
      })
      .join("\n---\n");

    const memoryContext = memoryRows
      .map((m) => `[${m.memoryType}] ${m.content} (confidence: ${m.confidence})`)
      .join("\n");

    const assessmentContext = assessmentRows
      .map(
        (a) =>
          `${a.type.toUpperCase()} — Score: ${a.totalScore}, Severity: ${a.severity} (${a.createdAt.toISOString()})`,
      )
      .join("\n");

    const prompt = `You are generating a journey insights summary for a wellness companion app user.

Based on the following data, generate a JSON response with these exact fields:

1. "clinicalUnderstanding" — A 2-4 sentence warm, reflective narrative about what patterns you've noticed across sessions. Focus on themes, emotional dynamics, and growth areas. Use empathetic language, not clinical terms. Write as if reflecting together with the user.

2. "userReflection" — A 2-3 sentence supportive message that validates the user's experience. Acknowledge their effort in showing up. Reference specific themes if present.

3. "actionItems" — An array of 2-4 practical, grounded suggestions. Each should connect to an actual pattern or theme. Format: "Since [pattern], try [suggestion]". Keep them concrete and achievable.

=== Session Summaries ===
${summaryContext || "No session summaries yet."}

=== Memories ===
${memoryContext || "No memories extracted yet."}

=== Assessment Results ===
${assessmentContext || "No assessments completed yet."}

=== Mood Trend ===
Direction: ${moodTrend.direction}, Period: ${moodTrend.period}

IMPORTANT:
- Respond with ONLY valid JSON, no markdown fences
- Use warm, non-clinical language throughout
- Never diagnose or use DSM terminology
- Never refer to the user as a "patient"
- Focus on strengths and growth, not deficits`;

    let clinicalUnderstanding = "Unable to generate insights at this time.";
    let userReflection = "Your journey is unfolding. Each session adds another chapter.";
    let actionItems: string[] = [];

    try {
      const rawResponse = await spawnClaudeStreaming(prompt, () => {});
      if (rawResponse.trim()) {
        let jsonStr = rawResponse.trim();
        const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeFenceMatch?.[1]) jsonStr = codeFenceMatch[1].trim();

        const parsed = JSON.parse(jsonStr) as {
          clinicalUnderstanding?: string;
          userReflection?: string;
          actionItems?: string[];
        };

        if (parsed.clinicalUnderstanding) clinicalUnderstanding = parsed.clinicalUnderstanding;
        if (parsed.userReflection) userReflection = parsed.userReflection;
        if (Array.isArray(parsed.actionItems)) {
          actionItems = parsed.actionItems.filter((a): a is string => typeof a === "string");
        }
      }
    } catch (err) {
      console.error("[journey] Failed to generate insights:", err);
    }

    const insights = {
      clinicalUnderstanding,
      userReflection,
      actionItems,
      patterns: {
        recurring_triggers: triggers.slice(0, 5).map((m) => ({ id: m.id, content: m.content })),
        unresolved_threads: threads.slice(0, 5).map((m) => ({ id: m.id, content: m.content })),
        wins: wins.slice(0, 5).map((m) => ({ id: m.id, content: m.content })),
      },
      moodTrend,
      cachedAt: new Date().toISOString(),
    };

    insightsCache = { data: insights, cachedAt: new Date() };
    return c.json(insights);
  })

  // ── GET /assessments — Assessment History ───────────────────
  .get("/assessments", zValidator("query", AssessmentHistoryQuerySchema), async (c) => {
    const { limit, offset } = c.req.valid("query");
    const user = await getOrCreateUser();

    const rows = await db
      .select({
        id: assessments.id,
        type: assessments.type,
        totalScore: assessments.totalScore,
        severity: assessments.severity,
        createdAt: assessments.createdAt,
      })
      .from(assessments)
      .where(eq(assessments.userId, user.id))
      .orderBy(desc(assessments.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      assessments: rows.map((r) => ({
        id: r.id,
        type: r.type,
        totalScore: r.totalScore,
        severity: r.severity,
        createdAt: r.createdAt.toISOString(),
      })),
      limit,
      offset,
    });
  });

// ── Helpers ──────────────────────────────────────────────────────

function computeMoodTrend(moodRows: Array<{ valence: number; arousal: number; createdAt: Date }>): {
  direction: "improving" | "stable" | "declining";
  period: string;
} {
  if (moodRows.length < 2) {
    return { direction: "stable", period: "not enough data" };
  }

  // Split into first half and second half (recent vs older)
  const sorted = [...moodRows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const mid = Math.floor(sorted.length / 2);
  const olderHalf = sorted.slice(0, mid);
  const recentHalf = sorted.slice(mid);

  const avgOlder = olderHalf.reduce((sum, m) => sum + m.valence, 0) / olderHalf.length;
  const avgRecent = recentHalf.reduce((sum, m) => sum + m.valence, 0) / recentHalf.length;

  const diff = avgRecent - avgOlder;
  const earliest = sorted[0]?.createdAt ?? new Date();
  const latest = sorted[sorted.length - 1]?.createdAt ?? new Date();
  const days = Math.max(
    1,
    Math.round((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const period = days <= 7 ? "past week" : days <= 30 ? "past month" : `past ${days} days`;

  if (diff > 0.1) return { direction: "improving", period };
  if (diff < -0.1) return { direction: "declining", period };
  return { direction: "stable", period };
}

// ── Export ────────────────────────────────────────────────────────

export type JourneyRoutes = typeof app;
export default app;
