// ── Research Routes ───────────────────────────────────────────────
// All routes are guarded by RESEARCH_ENABLED=true.
// These routes are intentionally NOT exported as Hono RPC types —
// the frontend never sees them.
//
// POST /api/research/run               — run one or all experiments
// GET  /api/research/results/:userId   — last 10 rows from each table
// GET  /api/research/report/:runId     — JSON report for a specific run
// POST /api/research/promote           — promote / mark-reviewed a run

import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/index.js";
import { researchCalibrationProposals } from "../db/schema/research-calibration-proposals.js";
import { researchDirectionCompliance } from "../db/schema/research-direction-compliance.js";
import { researchHypothesisSimulations } from "../db/schema/research-hypothesis-simulations.js";
import { researchReplayRuns } from "../db/schema/research-replay-runs.js";
import { runExperimentA } from "../experiments/experiment-a-calibration.js";
import { runExperimentB } from "../experiments/experiment-b-hypotheses.js";
import { runExperimentC } from "../experiments/experiment-c-direction.js";
import { runExperimentD } from "../experiments/experiment-d-replay.js";
import type { OutcomeConfidence, OutcomeDirection } from "../lib/outcome-scorer.js";
import { promote } from "../lib/promote.js";
import {
  formatReportA,
  formatReportB,
  formatReportC,
  formatReportD,
} from "../lib/research-reporter.js";

// ── Zod request schemas ───────────────────────────────────────────

const RunExperimentSchema = z.object({
  experiment: z.enum(["a", "b", "c", "d", "all"]),
  userId: z.string().uuid(),
  candidateContent: z.string().optional(),
});

const PromoteSchema = z.object({
  runId: z.string().uuid(),
  experiment: z.enum(["a", "b", "c", "d"]),
  force: z.boolean().optional().default(false),
});

// ── Router ────────────────────────────────────────────────────────

const research = new Hono();

// Apply guard to all routes
research.use("*", async (c, next) => {
  if (process.env.RESEARCH_ENABLED !== "true") {
    return c.json(
      {
        error: "Research sandbox is disabled.",
        detail: "Set RESEARCH_ENABLED=true to enable research routes.",
      },
      403,
    );
  }
  await next();
});

// ── POST /run ─────────────────────────────────────────────────────
// Runs the specified experiment(s) for a userId and returns JSON reports.

research.post("/run", zValidator("json", RunExperimentSchema), async (c) => {
  const { experiment, userId, candidateContent } = c.req.valid("json");

  const reports: object[] = [];

  try {
    if (experiment === "a" || experiment === "all") {
      const result = await runExperimentA(userId);
      const { json } = formatReportA(result);
      reports.push(json);
    }

    if (experiment === "b" || experiment === "all") {
      const result = await runExperimentB(userId);
      const { json } = formatReportB(result);
      reports.push(json);
    }

    if (experiment === "c" || experiment === "all") {
      const result = await runExperimentC(userId);
      const { json } = formatReportC(result);
      reports.push(json);
    }

    if (experiment === "d" || experiment === "all") {
      const result = await runExperimentD(userId, candidateContent);
      const { json } = formatReportD(result);
      reports.push(json);
    }

    return c.json({ ok: true, reports });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 500);
  }
});

// ── GET /results/:userId ──────────────────────────────────────────
// Returns last 10 rows from each research table for the user.

research.get("/results/:userId", async (c) => {
  const userId = c.req.param("userId");

  // Validate UUID format
  const parsed = z.string().uuid().safeParse(userId);
  if (!parsed.success) {
    return c.json({ error: "Invalid userId — must be a UUID." }, 400);
  }

  const [calibrationRows, hypothesisRows, complianceRows, replayRows] = await Promise.all([
    db
      .select({
        id: researchCalibrationProposals.id,
        userId: researchCalibrationProposals.userId,
        experimentRunId: researchCalibrationProposals.experimentRunId,
        proposedLength: researchCalibrationProposals.proposedLength,
        outcomeScore: researchCalibrationProposals.outcomeScore,
        gateDecision: researchCalibrationProposals.gateDecision,
        gateReason: researchCalibrationProposals.gateReason,
        safetyPassed: researchCalibrationProposals.safetyPassed,
        experimentVersion: researchCalibrationProposals.experimentVersion,
        ranAt: researchCalibrationProposals.ranAt,
        promotedAt: researchCalibrationProposals.promotedAt,
        promotedBy: researchCalibrationProposals.promotedBy,
        sourceSessionId: researchCalibrationProposals.sourceSessionId,
        // liveCalibrationSnapshot, assessmentTrajectory, proposedContent intentionally omitted
      })
      .from(researchCalibrationProposals)
      .where(eq(researchCalibrationProposals.userId, userId))
      .orderBy(desc(researchCalibrationProposals.ranAt))
      .limit(10),

    db
      .select()
      .from(researchHypothesisSimulations)
      .where(eq(researchHypothesisSimulations.userId, userId))
      .orderBy(desc(researchHypothesisSimulations.ranAt))
      .limit(10),

    db
      .select()
      .from(researchDirectionCompliance)
      .where(eq(researchDirectionCompliance.userId, userId))
      .orderBy(desc(researchDirectionCompliance.ranAt))
      .limit(10),

    db
      .select({
        id: researchReplayRuns.id,
        userId: researchReplayRuns.userId,
        experimentRunId: researchReplayRuns.experimentRunId,
        baselineDirectionVersion: researchReplayRuns.baselineDirectionVersion,
        candidateDirectionVersion: researchReplayRuns.candidateDirectionVersion,
        sessionsUsed: researchReplayRuns.sessionIdsUsed,
        goldenCaseCount: researchReplayRuns.goldenCaseCount,
        totalTurnsEvaluated: researchReplayRuns.totalTurnsEvaluated,
        gate1Passed: researchReplayRuns.gate1Passed,
        gate1FailReason: researchReplayRuns.gate1FailReason,
        gate2Score: researchReplayRuns.gate2Score,
        gate2Passed: researchReplayRuns.gate2Passed,
        gate3FlaggedForReview: researchReplayRuns.gate3FlaggedForReview,
        gate3Note: researchReplayRuns.gate3Note,
        gateDecision: researchReplayRuns.gateDecision,
        gateReason: researchReplayRuns.gateReason,
        experimentVersion: researchReplayRuns.experimentVersion,
        ranAt: researchReplayRuns.ranAt,
        promotedAt: researchReplayRuns.promotedAt,
        promotedBy: researchReplayRuns.promotedBy,
        // baselineDirectionContent, candidateDirectionContent, turnScores intentionally omitted (large)
      })
      .from(researchReplayRuns)
      .where(eq(researchReplayRuns.userId, userId))
      .orderBy(desc(researchReplayRuns.ranAt))
      .limit(10),
  ]);

  return c.json({
    ok: true,
    results: {
      calibrationProposals: calibrationRows,
      hypothesisSimulations: hypothesisRows,
      directionCompliance: complianceRows,
      replayRuns: replayRows,
    },
  });
});

// ── GET /report/:runId ────────────────────────────────────────────
// Returns the JSON report for a specific run.
// Query param: ?experiment=a|b|c|d

research.get("/report/:runId", async (c) => {
  const runId = c.req.param("runId");
  const experiment = c.req.query("experiment");

  const runIdParsed = z.string().uuid().safeParse(runId);
  if (!runIdParsed.success) {
    return c.json({ error: "Invalid runId — must be a UUID." }, 400);
  }

  const experimentParsed = z.enum(["a", "b", "c", "d"]).safeParse(experiment);
  if (!experimentParsed.success) {
    return c.json({ error: "Query param 'experiment' must be 'a', 'b', 'c', or 'd'." }, 400);
  }

  const exp = experimentParsed.data;

  try {
    if (exp === "a") {
      const rows = await db
        .select()
        .from(researchCalibrationProposals)
        .where(eq(researchCalibrationProposals.experimentRunId, runId))
        .limit(1);

      if (!rows[0]) {
        return c.json({ error: `No experiment A row found for runId=${runId}.` }, 404);
      }

      const row = rows[0];

      // Reconstruct a minimal ExperimentAResult for the reporter.
      // Note: outcomeScore fields beyond the persisted numeric value are
      // not stored in the table — we reconstruct with available data.
      const result = {
        runId: row.experimentRunId,
        userId: row.userId,
        gateDecision: row.gateDecision as "keep" | "discard" | "insufficient_data",
        gateReason: row.gateReason,
        outcomeScore: {
          score: row.outcomeScore,
          direction: "stable" as OutcomeDirection,
          confidence: "sparse" as OutcomeConfidence,
          assessmentsUsed: 0,
          reasoning: "(reconstructed from stored row — full detail in original run report)",
        },
        proposedContent: row.proposedContent,
        safetyPassed: row.safetyPassed,
        liveCalibrationSnapshot: row.liveCalibrationSnapshot,
        assessmentTrajectory: [],
        ranAt: row.ranAt,
      };

      const { json } = formatReportA(result);
      return c.json({ ok: true, report: json });
    }

    if (exp === "b") {
      const rows = await db
        .select()
        .from(researchHypothesisSimulations)
        .where(eq(researchHypothesisSimulations.experimentRunId, runId))
        .limit(1);

      if (!rows[0]) {
        return c.json({ error: `No experiment B row found for runId=${runId}.` }, 404);
      }

      const row = rows[0];

      const result = {
        runId: row.experimentRunId,
        userId: row.userId,
        plansAnalyzedCount: row.plansAnalyzedCount,
        sessionsAnalyzedCount: row.sessionsAnalyzedCount,
        hypothesisDeltas: Array.isArray(row.hypothesisDeltas) ? row.hypothesisDeltas : [],
        meanAbsoluteDelta: row.meanAbsoluteDelta,
        maxDelta: row.maxDelta,
        highDriftCount: row.highDriftCount,
        ranAt: row.ranAt,
      };

      const { json } = formatReportB(result as Parameters<typeof formatReportB>[0]);
      return c.json({ ok: true, report: json });
    }

    if (exp === "d") {
      const rows = await db
        .select({
          id: researchReplayRuns.id,
          userId: researchReplayRuns.userId,
          experimentRunId: researchReplayRuns.experimentRunId,
          baselineDirectionVersion: researchReplayRuns.baselineDirectionVersion,
          candidateDirectionVersion: researchReplayRuns.candidateDirectionVersion,
          sessionIdsUsed: researchReplayRuns.sessionIdsUsed,
          goldenCaseCount: researchReplayRuns.goldenCaseCount,
          totalTurnsEvaluated: researchReplayRuns.totalTurnsEvaluated,
          gate1Passed: researchReplayRuns.gate1Passed,
          gate1FailReason: researchReplayRuns.gate1FailReason,
          gate2Score: researchReplayRuns.gate2Score,
          gate2Passed: researchReplayRuns.gate2Passed,
          gate3FlaggedForReview: researchReplayRuns.gate3FlaggedForReview,
          gate3Note: researchReplayRuns.gate3Note,
          gateDecision: researchReplayRuns.gateDecision,
          gateReason: researchReplayRuns.gateReason,
          turnScores: researchReplayRuns.turnScores,
          experimentVersion: researchReplayRuns.experimentVersion,
          ranAt: researchReplayRuns.ranAt,
          promotedAt: researchReplayRuns.promotedAt,
          promotedBy: researchReplayRuns.promotedBy,
        })
        .from(researchReplayRuns)
        .where(eq(researchReplayRuns.experimentRunId, runId))
        .limit(1);

      if (!rows[0]) {
        return c.json({ error: `No experiment D row found for runId=${runId}.` }, 404);
      }

      const row = rows[0];

      const sessionIds = Array.isArray(row.sessionIdsUsed) ? (row.sessionIdsUsed as string[]) : [];

      const result = {
        runId: row.experimentRunId,
        userId: row.userId,
        baselineDirectionVersion: row.baselineDirectionVersion ?? "unknown",
        candidateDirectionVersion: row.candidateDirectionVersion ?? null,
        sessionsUsed: sessionIds.length,
        goldenCaseCount: row.goldenCaseCount,
        totalTurnsEvaluated: row.totalTurnsEvaluated,
        gate1Passed: row.gate1Passed,
        gate1FailReason: row.gate1FailReason ?? null,
        gate2Score: row.gate2Score ?? null,
        gate2Breakdown: null, // not stored separately — full detail in original run report
        gate2Passed: row.gate2Passed,
        gate3PhqGadTrajectory: null, // not stored separately — full detail in original run report
        gate3FlaggedForReview: row.gate3FlaggedForReview,
        gate3Note: row.gate3Note ?? null,
        gateDecision: row.gateDecision as "keep" | "discard" | "insufficient_sessions",
        gateReason: row.gateReason,
        turnScores: Array.isArray(row.turnScores) ? row.turnScores : [],
        ranAt: row.ranAt,
      };

      const { json } = formatReportD(result as Parameters<typeof formatReportD>[0]);
      return c.json({ ok: true, report: json });
    }

    // exp === 'c'
    const rows = await db
      .select()
      .from(researchDirectionCompliance)
      .where(eq(researchDirectionCompliance.experimentRunId, runId))
      .limit(1);

    if (!rows[0]) {
      return c.json({ error: `No experiment C row found for runId=${runId}.` }, 404);
    }

    const row = rows[0];

    const result = {
      runId: row.experimentRunId,
      userId: row.userId,
      directionVersion: row.directionVersion,
      activeDirectives: Array.isArray(row.activeDirectives)
        ? (row.activeDirectives as string[])
        : [],
      sessionsAnalyzed: 1,
      meanComplianceScore: row.complianceScore ?? 0,
      modeAlignedSessions: row.modeAligned === true ? 1 : 0,
      modeUnalignedSessions: row.modeAligned === false ? 1 : 0,
      dataGaps: ["Report reconstructed from single row — full detail in original run report."],
      ranAt: row.ranAt,
    };

    const { json } = formatReportC(result);
    return c.json({ ok: true, report: json });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 500);
  }
});

// ── POST /promote ─────────────────────────────────────────────────
// Promotes a gate-approved research run to live state (Experiment A),
// or records an operator review acknowledgement (B/C).

research.post("/promote", zValidator("json", PromoteSchema), async (c) => {
  const { runId, experiment, force } = c.req.valid("json");

  try {
    const result = await promote(runId, experiment, force);

    if (!result.success) {
      return c.json({ ok: false, ...result }, 422);
    }

    return c.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 500);
  }
});

export { research };
