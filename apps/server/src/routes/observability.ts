// ── Observability Routes ────────────────────────────────────────
// GET /turns   — Query turn events with optional filters
// GET /alerts  — Filter depth alerts and unsafe validator results
// GET /stats   — Aggregate pipeline statistics

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, desc, sql, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { turnEvents, sessions } from "../db/schema/index";

// ── Query Schemas ────────────────────────────────────────────────

const TurnsQuerySchema = z.object({
  sessionId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const AlertsQuerySchema = z.object({
  type: z.enum(["depth", "unsafe", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const StatsQuerySchema = z.object({
  sessionId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ── Route Definitions ────────────────────────────────────────────

const app = new Hono()

  // ── GET /turns — Query turn events ──────────────────────────
  .get("/turns", zValidator("query", TurnsQuerySchema), async (c) => {
    const { sessionId, from, to, limit, offset } = c.req.valid("query");

    const conditions = [];
    if (sessionId) conditions.push(eq(turnEvents.sessionId, sessionId));
    if (from) conditions.push(gte(turnEvents.createdAt, new Date(from)));
    if (to) conditions.push(lte(turnEvents.createdAt, new Date(to)));

    const rows = await db
      .select()
      .from(turnEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(turnEvents.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      turns: rows.map(serializeTurnEvent),
      limit,
      offset,
      count: rows.length,
    });
  })

  // ── GET /alerts — Filter alerts ─────────────────────────────
  .get("/alerts", zValidator("query", AlertsQuerySchema), async (c) => {
    const { type, limit, offset } = c.req.valid("query");

    let condition;
    if (type === "depth") {
      condition = eq(turnEvents.depthAlertFired, true);
    } else if (type === "unsafe") {
      condition = eq(turnEvents.validatorSafe, false);
    } else {
      // "all" — either depth alert or unsafe
      condition = or(
        eq(turnEvents.depthAlertFired, true),
        eq(turnEvents.validatorSafe, false),
      );
    }

    const rows = await db
      .select()
      .from(turnEvents)
      .where(condition)
      .orderBy(desc(turnEvents.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      alerts: rows.map(serializeTurnEvent),
      limit,
      offset,
      count: rows.length,
    });
  })

  // ── GET /stats — Aggregate statistics ───────────────────────
  .get("/stats", zValidator("query", StatsQuerySchema), async (c) => {
    const { sessionId, from, to } = c.req.valid("query");

    const conditions = [];
    if (sessionId) conditions.push(eq(turnEvents.sessionId, sessionId));
    if (from) conditions.push(gte(turnEvents.createdAt, new Date(from)));
    if (to) conditions.push(lte(turnEvents.createdAt, new Date(to)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Single aggregation query for all stats
    const [stats] = await db
      .select({
        totalTurns: sql<number>`count(*)::int`,
        crisisTurns: sql<number>`count(*) filter (where ${turnEvents.crisisDetected} = true)::int`,
        supervisorRuns: sql<number>`count(*) filter (where ${turnEvents.supervisorRan} = true)::int`,
        validatorRuns: sql<number>`count(*) filter (where ${turnEvents.validatorRan} = true)::int`,
        avgValidatorScore: sql<number>`avg(${turnEvents.validatorScore})`,
        unsafeTurns: sql<number>`count(*) filter (where ${turnEvents.validatorSafe} = false)::int`,
        depthAlerts: sql<number>`count(*) filter (where ${turnEvents.depthAlertFired} = true)::int`,
        modeShifts: sql<number>`count(*) filter (where ${turnEvents.modeShiftSource} != 'none' and ${turnEvents.modeShiftSource} is not null)::int`,
        avgPipelineMs: sql<number>`avg(${turnEvents.totalPipelineMs})`,
        avgClaudeMs: sql<number>`avg(${turnEvents.claudeResponseMs})`,
        avgSupervisorMs: sql<number>`avg(${turnEvents.supervisorLatencyMs})`,
        depthSurface: sql<number>`count(*) filter (where ${turnEvents.supervisorDepth} = 'surface')::int`,
        depthMedium: sql<number>`count(*) filter (where ${turnEvents.supervisorDepth} = 'medium')::int`,
        depthDeep: sql<number>`count(*) filter (where ${turnEvents.supervisorDepth} = 'deep')::int`,
      })
      .from(turnEvents)
      .where(whereClause);

    // Top activated skills (separate query for array aggregation)
    const skillRows = await db
      .select({
        skill: sql<string>`unnest(${turnEvents.supervisorSkills})`,
        count: sql<number>`count(*)::int`,
      })
      .from(turnEvents)
      .where(whereClause)
      .groupBy(sql`unnest(${turnEvents.supervisorSkills})`)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // Top validator issue types
    const issueRows = await db
      .select({
        issueType: sql<string>`elem->>'type'`,
        count: sql<number>`count(*)::int`,
      })
      .from(turnEvents)
      .where(whereClause)
      .innerJoin(
        sql`jsonb_array_elements(${turnEvents.validatorIssues}) as elem`,
        sql`true`,
      )
      .groupBy(sql`elem->>'type'`)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    return c.json({
      totalTurns: stats?.totalTurns ?? 0,
      crisisTurns: stats?.crisisTurns ?? 0,
      supervisor: {
        runs: stats?.supervisorRuns ?? 0,
        avgLatencyMs: round(stats?.avgSupervisorMs),
      },
      validator: {
        runs: stats?.validatorRuns ?? 0,
        avgScore: round(stats?.avgValidatorScore),
        unsafeTurns: stats?.unsafeTurns ?? 0,
        issueBreakdown: issueRows.map((r) => ({
          type: r.issueType,
          count: r.count,
        })),
      },
      depth: {
        surface: stats?.depthSurface ?? 0,
        medium: stats?.depthMedium ?? 0,
        deep: stats?.depthDeep ?? 0,
        alerts: stats?.depthAlerts ?? 0,
      },
      modeShifts: stats?.modeShifts ?? 0,
      timing: {
        avgPipelineMs: round(stats?.avgPipelineMs),
        avgClaudeMs: round(stats?.avgClaudeMs),
      },
      skillActivations: skillRows.map((r) => ({
        skill: r.skill,
        count: r.count,
      })),
    });
  });

// ── Helpers ──────────────────────────────────────────────────────

function round(val: number | null | undefined): number | null {
  if (val == null) return null;
  return Math.round(val * 100) / 100;
}

function serializeTurnEvent(row: typeof turnEvents.$inferSelect) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    userMessageId: row.userMessageId,
    assistantMessageId: row.assistantMessageId,
    turnNumber: row.turnNumber,
    crisis: {
      detected: row.crisisDetected,
      severity: row.crisisSeverity,
      stages: row.crisisStages,
      matchedPhrases: row.crisisMatchedPhrases,
    },
    mode: {
      before: row.modeBefore,
      after: row.modeAfter,
      shiftSource: row.modeShiftSource,
    },
    supervisor: {
      ran: row.supervisorRan,
      confidence: row.supervisorConfidence,
      depth: row.supervisorDepth,
      skills: row.supervisorSkills,
      focus: row.supervisorFocus,
      latencyMs: row.supervisorLatencyMs,
      depthAlertFired: row.depthAlertFired,
    },
    validator: {
      ran: row.validatorRan,
      score: row.validatorScore,
      safe: row.validatorSafe,
      issues: row.validatorIssues,
      latencyMs: row.validatorLatencyMs,
    },
    context: {
      activeSkills: row.activeSkills,
      memoriesInjectedCount: row.memoriesInjectedCount,
      memoryNotesInjected: row.memoryNotesInjected,
      assessmentMarkers: row.assessmentMarkers,
      textEmotionLabel: row.textEmotionLabel,
      textEmotionConfidence: row.textEmotionConfidence,
    },
    timing: {
      totalPipelineMs: row.totalPipelineMs,
      claudeResponseMs: row.claudeResponseMs,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Type Export for Hono RPC ─────────────────────────────────────

export type ObservabilityRoutes = typeof app;
export default app;
