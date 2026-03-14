// ── Experiment A — Outcome-Gated Calibration Evaluator ───────────
// Proposes a new therapeutic calibration block rewrite and gates it
// against the user's PHQ-9 / GAD-7 outcome trajectory.
//
// INVARIANT: Does NOT import upsertBlock. All writes go to
// research_calibration_proposals, never to memory_blocks.
//
// Claude spawn: cwd=/tmp, CLAUDECODE stripped from env (same as live hook).

import { randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import { isSafeCalibration, isRefusalCalibration, sanitizeForPrompt } from "../../hooks/calibration-safety.js";
import { spawnClaudeStreaming } from "../../sdk/session-manager.js";
import { researchCalibrationProposals } from "../db/schema/index.js";
import type { OutcomeScore } from "../lib/outcome-scorer.js";
import { scoreOutcome } from "../lib/outcome-scorer.js";
import type { AssessmentRow } from "../lib/read-only-queries.js";
import { getAssessmentTrajectory, getLiveCalibrationBlock } from "../lib/read-only-queries.js";

// ── Experiment version ────────────────────────────────────────────

const EXPERIMENT_VERSION = "1.1.0";

// ── Calibration block char limit (matches memory-block-service enforced limit) ──

const CALIBRATION_MAX_CHARS = 800;

// ── Public types ─────────────────────────────────────────────────

export interface ExperimentAResult {
  runId: string;
  userId: string;
  gateDecision: "keep" | "discard" | "insufficient_data";
  gateReason: string;
  outcomeScore: OutcomeScore;
  proposedContent: string;
  safetyPassed: boolean;
  liveCalibrationSnapshot: string;
  assessmentTrajectory: AssessmentRow[];
  ranAt: Date;
}

// ── Calibration rewrite prompt ────────────────────────────────────
// Mirrors the live calibration hook prompt (session-hooks.ts) exactly.
// Difference: framed as a research proposal, not a live update.

function describeOutcome(score: OutcomeScore): string {
  if (score.confidence === "sparse") {
    return "The user has had only a few check-ins so far — not enough data to see a clear pattern.";
  }
  const dir =
    score.direction === "improving"
      ? "The user's check-ins suggest they are doing better over time."
      : score.direction === "worsening"
        ? "The user's check-ins suggest they have been struggling more than usual lately."
        : "The user's check-ins have been fairly stable.";
  return dir;
}

function buildCalibrationPrompt(currentContent: string, outcomeScore: OutcomeScore): string {
  const outcomeDescription = describeOutcome(outcomeScore);
  return `Write communication style notes for an AI wellness companion. Output ONLY the notes — no preamble, no explanation, no bullets. Start the first note on the very first line.

Current notes (revise or keep as-is):
${currentContent !== "" ? currentContent : "(none yet)"}

Recent pattern:
${outcomeDescription}

Rules:
- Plain text, no markdown, no bullet symbols, no headers
- Maximum 700 characters total
- Tone, pacing, language, and question style only
- Specific ("responds better to X than Y"), not generic
- No clinical labels, diagnoses, or treatment references`;
}

// ── Main experiment function ──────────────────────────────────────

export async function runExperimentA(userId: string): Promise<ExperimentAResult> {
  const runId = randomUUID();
  const ranAt = new Date();

  // Step 1 — read live calibration block
  const rawCalibration = await getLiveCalibrationBlock(db, userId);
  const liveCalibrationSnapshot = rawCalibration;

  // Step 2 — read assessment trajectory
  const assessmentTrajectory = await getAssessmentTrajectory(db, userId, 10);

  // Step 3 — score outcome
  const outcomeScore = scoreOutcome(assessmentTrajectory);

  // Step 4 — gate: insufficient data path
  if (outcomeScore.confidence === "absent" || outcomeScore.confidence === "sparse") {
    const gateReason =
      `Insufficient assessment data for outcome-gated calibration. ` +
      `Confidence: ${outcomeScore.confidence}, assessments: ${outcomeScore.assessmentsUsed}. ` +
      `Minimum 3 assessments required (emerging confidence).`;

    await db.insert(researchCalibrationProposals).values({
      userId,
      experimentRunId: runId,
      liveCalibrationSnapshot: liveCalibrationSnapshot,
      assessmentTrajectory: assessmentTrajectory as unknown as Record<string, unknown>[],
      proposedContent: "",
      proposedLength: 0,
      outcomeScore: outcomeScore.score,
      gateDecision: "insufficient_data",
      gateReason,
      safetyPassed: false,
      experimentVersion: EXPERIMENT_VERSION,
      ranAt,
    });

    return {
      runId,
      userId,
      gateDecision: "insufficient_data",
      gateReason,
      outcomeScore,
      proposedContent: "",
      safetyPassed: false,
      liveCalibrationSnapshot,
      assessmentTrajectory,
      ranAt,
    };
  }

  // Step 5 — build calibration prompt and sanitize inputs
  const sanitizedCalibration = sanitizeForPrompt(liveCalibrationSnapshot);
  const prompt = buildCalibrationPrompt(sanitizedCalibration, outcomeScore);

  // Step 6 — call Claude (same spawn pattern as live calibration hook)
  let rawResult: string;
  try {
    rawResult = await spawnClaudeStreaming(prompt, () => {});
  } catch (err) {
    const gateReason = `Claude spawn failed: ${err instanceof Error ? err.message : String(err)}`;

    await db.insert(researchCalibrationProposals).values({
      userId,
      experimentRunId: runId,
      liveCalibrationSnapshot,
      assessmentTrajectory: assessmentTrajectory as unknown as Record<string, unknown>[],
      proposedContent: "",
      proposedLength: 0,
      outcomeScore: outcomeScore.score,
      gateDecision: "discard",
      gateReason,
      safetyPassed: false,
      experimentVersion: EXPERIMENT_VERSION,
      ranAt,
    });

    return {
      runId,
      userId,
      gateDecision: "discard",
      gateReason,
      outcomeScore,
      proposedContent: "",
      safetyPassed: false,
      liveCalibrationSnapshot,
      assessmentTrajectory,
      ranAt,
    };
  }

  // Step 7 — sanitize and strip routing hook bleed
  // Global hooks sometimes prepend a "[Category N]..." classification preamble to
  // spawned Claude responses. Strip any such prefix before gate checks.
  const stripped = rawResult.trim().replace(/^\[Category\s+\d+\][^\n]*\n+(With [^\n]+\n+)?/i, "").trim();
  const proposedContent = sanitizeForPrompt(stripped);

  // Step 8 — content validity checks (length + refusal) before safety gate
  let gateDecision: "keep" | "discard" | "insufficient_data";
  let gateReason: string;

  if (proposedContent.trim() === "") {
    gateDecision = "discard";
    gateReason = "Claude returned an empty response — no proposed content to evaluate.";
  } else if (proposedContent.length > CALIBRATION_MAX_CHARS) {
    gateDecision = "discard";
    gateReason =
      `Proposed content exceeds calibration block char limit ` +
      `(${proposedContent.length} > ${CALIBRATION_MAX_CHARS}). ` +
      `Claude likely returned a refusal essay or verbose meta-commentary instead of calibration notes.`;
  } else if (isRefusalCalibration(proposedContent)) {
    gateDecision = "discard";
    gateReason =
      "Claude returned a refusal or meta-response instead of calibration notes. " +
      "Content contains refusal language patterns and is not usable as calibration data.";
  } else {
    // Step 9 — run safety blocklist
    const safetyPassed = isSafeCalibration(proposedContent);

    if (!safetyPassed) {
      gateDecision = "discard";
      gateReason = "Proposed content failed safety blocklist check — unsafe content detected.";
    } else if (outcomeScore.direction === "worsening" && outcomeScore.score < 0.4) {
      gateDecision = "discard";
      gateReason =
        `Outcome gate: worsening trajectory (direction=${outcomeScore.direction}, ` +
        `score=${outcomeScore.score.toFixed(3)}) indicates current calibration ` +
        `is associated with declining outcomes. Proposed rewrite discarded — ` +
        `operator should review calibration approach manually.`;
    } else {
      gateDecision = "keep";
      gateReason =
        `Outcome gate passed: direction=${outcomeScore.direction}, ` +
        `score=${outcomeScore.score.toFixed(3)}, confidence=${outcomeScore.confidence}. ` +
        `Safety check passed. Proposed content is ready for human review and promotion.`;
    }
  }

  // safetyPassed is true only when content passed all validity checks AND the
  // isSafeCalibration blocklist check (i.e., we reached gateDecision = 'keep').
  // All earlier discard paths (empty, oversize, refusal, blocklist fail) set
  // safetyPassed to false because the content is not safe to promote.
  const safetyPassed = gateDecision === "keep";

  // Step 10 — write row to research_calibration_proposals
  await db.insert(researchCalibrationProposals).values({
    userId,
    experimentRunId: runId,
    liveCalibrationSnapshot,
    assessmentTrajectory: assessmentTrajectory as unknown as Record<string, unknown>[],
    proposedContent,
    proposedLength: proposedContent.length,
    outcomeScore: outcomeScore.score,
    gateDecision,
    gateReason,
    safetyPassed,
    experimentVersion: EXPERIMENT_VERSION,
    ranAt,
  });

  // Step 11 — return result
  return {
    runId,
    userId,
    gateDecision,
    gateReason,
    outcomeScore,
    proposedContent,
    safetyPassed,
    liveCalibrationSnapshot,
    assessmentTrajectory,
    ranAt,
  };
}
