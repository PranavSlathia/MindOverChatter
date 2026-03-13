// ── Research Promote ─────────────────────────────────────────────
// The ONLY file in the research module permitted to call upsertBlock.
// (Rule 1 in research/README.md)
//
// Safety guards for Experiment A (in order):
//   1. Row must exist
//   2. Row must not already be promoted
//   3. gate_decision must be 'keep' OR force=true
//   4. proposed_content must not be empty
//   5. proposed_content must not exceed CALIBRATION_MAX_CHARS
//   6. proposed_content must not be a refusal or meta-response (isRefusalCalibration)
//   7. proposed_content must pass isSafeCalibration (re-checked at promote time)
//
// Guards 4-7 are symmetric with the evaluator gates in experiment-a-calibration.ts.
// Any proposal that could not pass those gates at evaluation time must also be
// blocked at promotion time — even if the DB row has gate_decision='keep'.
//
// Experiments B, C, D have no live write — promote just marks the row
// as reviewed so the Operator has an audit trail.

import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { isSafeCalibration, isRefusalCalibration, sanitizeForPrompt } from "../../hooks/calibration-safety.js";

// Must match CALIBRATION_MAX_CHARS in experiment-a-calibration.ts
const CALIBRATION_MAX_CHARS = 800;
import { upsertBlock } from "../../services/memory-block-service.js";
import { researchCalibrationProposals } from "../db/schema/research-calibration-proposals.js";
import { researchDirectionCompliance } from "../db/schema/research-direction-compliance.js";
import { researchHypothesisSimulations } from "../db/schema/research-hypothesis-simulations.js";
import { researchReplayRuns } from "../db/schema/research-replay-runs.js";

// ── Public types ──────────────────────────────────────────────────

export interface PromoteResult {
  success: boolean;
  runId: string;
  experiment: "a" | "b" | "c" | "d";
  message: string;
  promotedAt?: Date;
}

// ── promote ───────────────────────────────────────────────────────

/**
 * Promotes a gate-approved research run to live state (Experiment A),
 * or records an operator review acknowledgement (Experiments B, C, D).
 *
 * @param runId     - The experimentRunId (UUID) returned by the experiment.
 * @param experiment - Which experiment table to look up ('a' | 'b' | 'c' | 'd').
 * @param force      - Pass true to promote even when gate_decision === 'discard'
 *                     or 'insufficient_data'.
 */
export async function promote(
  runId: string,
  experiment: "a" | "b" | "c" | "d",
  force = false,
): Promise<PromoteResult> {
  switch (experiment) {
    case "a":
      return promoteExperimentA(runId, force);
    case "b":
      return promoteExperimentB(runId);
    case "c":
      return promoteExperimentC(runId);
    case "d":
      return promoteExperimentD(runId, force);
  }
}

// ── Experiment A — live write to memory_blocks ────────────────────

async function promoteExperimentA(runId: string, force: boolean): Promise<PromoteResult> {
  // Guard 1 — row must exist
  const rows = await db
    .select()
    .from(researchCalibrationProposals)
    .where(eq(researchCalibrationProposals.experimentRunId, runId))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return {
      success: false,
      runId,
      experiment: "a",
      message: `No research_calibration_proposals row found for runId=${runId}.`,
    };
  }

  // Guard 2 — must not already be promoted
  if (row.promotedAt !== null) {
    return {
      success: false,
      runId,
      experiment: "a",
      message: `Run ${runId} has already been promoted at ${row.promotedAt!.toISOString()}. Already promoted.`,
    };
  }

  // Guard 3 — gate decision must be 'keep' unless force=true
  // Also blocks 'insufficient_data': those rows have proposedContent === ""
  // and would erase the live calibration block if promoted.
  if ((row.gateDecision === "discard" || row.gateDecision === "insufficient_data") && !force) {
    return {
      success: false,
      runId,
      experiment: "a",
      message:
        `Gate decision for run ${runId} is '${row.gateDecision}'. ` +
        `Pass force=true to override and promote anyway.`,
    };
  }

  // Guard 4 — content must not be empty
  if (!row.proposedContent || row.proposedContent.trim() === "") {
    return {
      success: false,
      runId,
      experiment: "a",
      message: `Proposed content for run ${runId} is empty. Promotion blocked.`,
    };
  }

  // Guard 5 — content must not exceed calibration block char limit
  if (row.proposedContent.length > CALIBRATION_MAX_CHARS) {
    return {
      success: false,
      runId,
      experiment: "a",
      message:
        `Proposed content for run ${runId} exceeds char limit ` +
        `(${row.proposedContent.length} > ${CALIBRATION_MAX_CHARS}). Promotion blocked.`,
    };
  }

  // Guard 6 — content must not be a refusal or meta-response
  if (isRefusalCalibration(row.proposedContent)) {
    return {
      success: false,
      runId,
      experiment: "a",
      message: `Proposed content for run ${runId} contains refusal or meta-response language. Promotion blocked.`,
    };
  }

  // Guard 7 — re-run isSafeCalibration at promote time
  if (!isSafeCalibration(row.proposedContent)) {
    return {
      success: false,
      runId,
      experiment: "a",
      message: `Proposed content for run ${runId} failed safety re-check at promote time. Promotion blocked.`,
    };
  }

  // Sanitize before write
  const sanitized = sanitizeForPrompt(row.proposedContent);

  // Write to live memory_blocks
  await upsertBlock(db, {
    userId: row.userId,
    label: "companion/therapeutic_calibration",
    content: sanitized,
    updatedBy: "research/promoted",
    sourceSessionId: row.sourceSessionId ?? null,
  });

  // Stamp promoted_at and promoted_by on the research row
  const promotedAt = new Date();
  await db
    .update(researchCalibrationProposals)
    .set({ promotedAt, promotedBy: "operator" })
    .where(eq(researchCalibrationProposals.experimentRunId, runId));

  return {
    success: true,
    runId,
    experiment: "a",
    message: `Run ${runId} promoted successfully. companion/therapeutic_calibration block updated.`,
    promotedAt,
  };
}

// ── Experiment B — mark reviewed, no live write ───────────────────

async function promoteExperimentB(runId: string): Promise<PromoteResult> {
  const rows = await db
    .select()
    .from(researchHypothesisSimulations)
    .where(eq(researchHypothesisSimulations.experimentRunId, runId))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return {
      success: false,
      runId,
      experiment: "b",
      message: `No research_hypothesis_simulations row found for runId=${runId}.`,
    };
  }

  if (row.promotedAt !== null) {
    return {
      success: false,
      runId,
      experiment: "b",
      message: `Run ${runId} has already been marked as reviewed at ${row.promotedAt!.toISOString()}.`,
    };
  }

  const promotedAt = new Date();
  await db
    .update(researchHypothesisSimulations)
    .set({ promotedAt, promotedBy: "operator" })
    .where(eq(researchHypothesisSimulations.experimentRunId, runId));

  return {
    success: true,
    runId,
    experiment: "b",
    message:
      "Run marked as reviewed. No live DB write — apply learnings manually to the relevant service.",
    promotedAt,
  };
}

// ── Experiment C — mark reviewed, no live write ───────────────────
// research_direction_compliance does not have promotedAt/promotedBy columns
// (each run produces many rows, one per session). We record the review by
// returning success — the Operator acknowledges the report externally.

async function promoteExperimentC(runId: string): Promise<PromoteResult> {
  // Experiment C rows don't have promotedAt columns (one row per session, not per run).
  // We validate the runId exists in the table and return acknowledgement.
  const rows = await db
    .select({ id: researchDirectionCompliance.id })
    .from(researchDirectionCompliance)
    .where(eq(researchDirectionCompliance.experimentRunId, runId))
    .limit(1);

  if (rows.length === 0) {
    return {
      success: false,
      runId,
      experiment: "c",
      message: `No research_direction_compliance rows found for runId=${runId}.`,
    };
  }

  const promotedAt = new Date();

  return {
    success: true,
    runId,
    experiment: "c",
    message:
      "Run marked as reviewed. No live DB write — apply learnings manually to the relevant service.",
    promotedAt,
  };
}

// ── Experiment D — mark reviewed, no live write ───────────────────
// Experiment D evaluates candidate direction files. Promotion stamps
// the row as reviewed and instructs the Operator to apply learnings
// by manually editing .claude/skills/therapeutic-direction.md.

async function promoteExperimentD(runId: string, force: boolean): Promise<PromoteResult> {
  // Guard 1 — row must exist
  const rows = await db
    .select()
    .from(researchReplayRuns)
    .where(eq(researchReplayRuns.experimentRunId, runId))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return {
      success: false,
      runId,
      experiment: "d",
      message: `No research_replay_runs row found for runId=${runId}.`,
    };
  }

  // Guard 2 — must not already be promoted
  if (row.promotedAt !== null) {
    return {
      success: false,
      runId,
      experiment: "d",
      message: `Run ${runId} has already been promoted at ${row.promotedAt!.toISOString()}. Already promoted.`,
    };
  }

  // Guard 3 — gate decision must be 'keep' unless force=true
  if (row.gateDecision !== "keep" && !force) {
    return {
      success: false,
      runId,
      experiment: "d",
      message: `Gate decision for run ${runId} is '${row.gateDecision}'. Pass force=true to override and promote anyway.`,
    };
  }

  // Stamp promoted_at and promoted_by on the research row
  const promotedAt = new Date();
  await db
    .update(researchReplayRuns)
    .set({ promotedAt, promotedBy: "operator" })
    .where(eq(researchReplayRuns.experimentRunId, runId));

  return {
    success: true,
    runId,
    experiment: "d",
    message:
      "Run marked as reviewed. Apply learnings by manually editing .claude/skills/therapeutic-direction.md with the candidate content.",
    promotedAt,
  };
}
