// ── Journey Routes ────────────────────────────────────────────────
// GET /timeline   — Unified timeline of sessions, memories, assessments, moods
// GET /insights   — AI-generated formulation (cached)
// GET /assessments — Assessment history

import { zValidator } from "@hono/zod-validator";
import { AssessmentHistoryQuerySchema, JourneyTimelineQuerySchema } from "@moc/shared";
import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray } from "drizzle-orm";
import { Hono } from "hono";
import { getOrCreateUser } from "../db/helpers.js";
import { db } from "../db/index.js";
import { assessments, memories, messages, moodLogs, sessionSummaries, sessions } from "../db/schema/index";
import { spawnClaudeStreaming } from "../sdk/session-manager.js";
import { getRecentFormulation, generateAndPersistFormulation } from "../services/formulation-service.js";

const USER_VISIBLE_TIMELINE_MEMORY_TYPES = [
  "profile_fact",
  "relationship",
  "goal",
  "coping_strategy",
  "life_event",
  "win",
] as const;

/**
 * @deprecated — kept only for backward compatibility with existing callers (sessions.ts, assessments.ts).
 * The formulation is now DB-backed; this is a no-op.
 */
export function invalidateInsightsCache() {
  // No-op — formulation freshness is determined by DB timestamp
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

    // Over-fetch from each source so the merged result has enough rows
    // for correct offset + limit slicing across all types.
    const fetchLimit = limit + offset;

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
        .limit(fetchLimit),

      // Memories (non-superseded, high confidence only)
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
            isNull(memories.supersededBy),
            gte(memories.confidence, 0.5),
            inArray(memories.memoryType, [...USER_VISIBLE_TIMELINE_MEMORY_TYPES]),
            fromDate ? gte(memories.createdAt, fromDate) : undefined,
            toDate ? lte(memories.createdAt, toDate) : undefined,
          ),
        )
        .orderBy(desc(memories.createdAt))
        .limit(10), // Hard cap: memories are already shown in MemoryClusters; don't crowd out moods

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
        .limit(fetchLimit),

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
        .limit(fetchLimit),
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

  // ── GET /insights — AI-Generated Formulation ──────────────────
  // Now backed by the canonical `user_formulations` table.
  // 1. Check for a recent snapshot (< 1 hour) → return directly
  // 2. If stale/missing → generate, persist, and return
  .get("/insights", async (c) => {
    const user = await getOrCreateUser();

    // Check for a recent formulation in the DB
    const recent = await getRecentFormulation(user.id);
    if (recent) {
      return c.json({
        ...recent.snapshot,
        actionRecommendations: recent.actionRecommendations,
        cachedAt: recent.createdAt.toISOString(),
      });
    }

    // No fresh formulation — generate one
    try {
      const result = await generateAndPersistFormulation(user.id, "manual");
      return c.json({
        ...result.snapshot,
        actionRecommendations: result.actionRecommendations,
        cachedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[journey] Formulation generation failed:", err);
      return c.json({
        formulation: {
          presentingTheme: "",
          roots: [],
          recentActivators: [],
          perpetuatingCycles: [],
          protectiveStrengths: [],
        },
        userReflection: {
          summary: "We're still gathering threads from your conversations.",
          encouragement: "Every session helps us understand you better.",
        },
        activeStates: [],
        domainSignals: {},
        questionsWorthExploring: [],
        themeOfToday: "We're still gathering threads from your conversations.",
        dataConfidence: "sparse",
        moodTrend: { direction: "stable", period: "not enough data" },
        actionRecommendations: [],
        cachedAt: new Date().toISOString(),
      });
    }
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
  })

  // ── POST /backfill-summaries — Generate missing session summaries ──
  .post("/backfill-summaries", async (c) => {
    const user = await getOrCreateUser();

    // Find completed sessions that have NO session_summaries row
    const existingSummarySessionIds = db
      .select({ sessionId: sessionSummaries.sessionId })
      .from(sessionSummaries)
      .where(
        and(
          eq(sessionSummaries.userId, user.id),
          eq(sessionSummaries.level, "session"),
        ),
      );

    const missingSessions = await db
      .select({ id: sessions.id, startedAt: sessions.startedAt, endedAt: sessions.endedAt })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, user.id),
          eq(sessions.status, "completed"),
          notInArray(sessions.id, existingSummarySessionIds),
        ),
      )
      .orderBy(asc(sessions.startedAt));

    if (missingSessions.length === 0) {
      return c.json({ backfilled: 0, message: "All sessions already have summaries." });
    }

    let backfilled = 0;
    const errors: string[] = [];

    for (const session of missingSessions) {
      // Load conversation messages for this session
      const msgRows = await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.sessionId, session.id))
        .orderBy(asc(messages.createdAt));

      if (msgRows.length === 0) {
        errors.push(`${session.id}: no messages found`);
        continue;
      }

      // Format and generate summary using the same prompt as session-end
      const conversationText = msgRows
        .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join("\n\n");

      const summaryPrompt = `You are a summarization assistant for MindOverChatter, an AI wellness companion (NOT a therapist).

Given a conversation between a user and their wellness companion, generate a structured summary in JSON format.

Your response must be ONLY valid JSON with this exact structure:
{
  "content": "A 2-4 sentence narrative summary of what was discussed and any insights gained. Use warm, non-clinical language. Focus on the user's experience and progress.",
  "themes": ["theme1", "theme2"],
  "cognitive_patterns": ["pattern1", "pattern2"],
  "action_items": ["item1", "item2"]
}

Rules:
- "content": 2-4 sentences. Warm, empathetic tone.
- "themes": 1-5 short topic labels.
- "cognitive_patterns": 0-4 thinking patterns observed. Everyday language, not DSM.
- "action_items": 0-3 concrete next steps. If none, use an empty array.

NEVER diagnose, use clinical terminology, or refer to user as "patient" or "client".

Conversation:
${conversationText}`;

      try {
        const rawResponse = await spawnClaudeStreaming(summaryPrompt, () => {});
        if (!rawResponse.trim()) {
          errors.push(`${session.id}: empty response`);
          continue;
        }

        let jsonStr = rawResponse.trim();
        const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeFenceMatch?.[1]) jsonStr = codeFenceMatch[1].trim();

        const parsed = JSON.parse(jsonStr) as {
          content?: string;
          themes?: string[];
          cognitive_patterns?: string[];
          action_items?: string[];
        };

        const content = parsed.content;
        if (!content || typeof content !== "string") {
          errors.push(`${session.id}: missing content field`);
          continue;
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

        await db.insert(sessionSummaries).values({
          userId: user.id,
          sessionId: session.id,
          level: "session",
          content,
          themes: themes.length > 0 ? themes : null,
          cognitivePatterns: cognitivePatterns.length > 0 ? cognitivePatterns : null,
          actionItems: actionItems.length > 0 ? actionItems : null,
          periodStart: session.startedAt,
          periodEnd: session.endedAt ?? new Date(),
        });

        backfilled++;
        console.log(`[backfill] Generated summary for session ${session.id}`);
      } catch (err) {
        errors.push(`${session.id}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }

    // Invalidate cache so next insights request uses the new summaries
    invalidateInsightsCache();

    return c.json({
      backfilled,
      total: missingSessions.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  });

// ── Export ────────────────────────────────────────────────────────

export type JourneyRoutes = typeof app;
export default app;
