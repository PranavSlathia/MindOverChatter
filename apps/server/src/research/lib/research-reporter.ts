// ── Research Reporter ────────────────────────────────────────────
// Formats experiment results into structured JSON and human-readable Markdown.
// Writes Markdown reports to research/reports/ directory.
//
// NOTE: research/reports/ is gitignored per Rule 4 in research/README.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExperimentAResult } from "../experiments/experiment-a-calibration.js";
import type { ExperimentBResult } from "../experiments/experiment-b-hypotheses.js";
import type { DirectionComplianceResult } from "../experiments/experiment-c-direction.js";
import type { ExperimentDResult } from "../experiments/experiment-d-replay.js";

// ── Reports directory ─────────────────────────────────────────────

const REPORTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../reports");

function ensureReportsDir(): void {
  mkdirSync(REPORTS_DIR, { recursive: true });
}

// ── Date helpers ─────────────────────────────────────────────────

function formatDateYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Experiment A ─────────────────────────────────────────────────

export function formatReportA(result: ExperimentAResult): { json: object; markdown: string } {
  const recommendation =
    result.gateDecision === "keep"
      ? "PROMOTE — proposal passed gate. Review proposed_content before promoting."
      : result.gateDecision === "insufficient_data"
        ? "WAIT — insufficient assessment data. Run more PHQ-9 / GAD-7 assessments first."
        : "DISCARD — proposal failed gate. Do not promote. Review gate_reason for details.";

  const json = {
    experiment: "a",
    experiment_version: "1.0.0",
    run_id: result.runId,
    ran_at: result.ranAt.toISOString(),
    input_summary: {
      live_calibration_length: result.liveCalibrationSnapshot.length,
      assessments_analyzed: result.outcomeScore.assessmentsUsed,
      outcome_direction: result.outcomeScore.direction,
      outcome_score: Number(result.outcomeScore.score.toFixed(4)),
      outcome_confidence: result.outcomeScore.confidence,
    },
    proposal: {
      proposed_content: result.proposedContent,
      proposed_length: result.proposedContent.length,
      safety_passed: result.safetyPassed,
      gate_decision: result.gateDecision,
      gate_reason: result.gateReason,
    },
    recommendation,
    promote_command: `POST /api/research/promote {"runId": "${result.runId}", "experiment": "a"}`,
  };

  const markdown = `# Experiment A — Outcome-Gated Calibration Evaluator

**Run ID**: \`${result.runId}\`
**Ran at**: ${result.ranAt.toISOString()}
**User ID**: \`${result.userId}\`

## Input Summary

| Field | Value |
|-------|-------|
| Live calibration length | ${result.liveCalibrationSnapshot.length} chars |
| Assessments analyzed | ${result.outcomeScore.assessmentsUsed} |
| Outcome direction | ${result.outcomeScore.direction} |
| Outcome score | ${result.outcomeScore.score.toFixed(4)} |
| Outcome confidence | ${result.outcomeScore.confidence} |

## Outcome Reasoning

${result.outcomeScore.reasoning}

## Gate Decision

**${result.gateDecision.toUpperCase()}** — ${result.gateReason}

Safety passed: ${result.safetyPassed ? "YES" : "NO"}

## Proposed Calibration Content

${result.proposedContent.trim() !== "" ? `\`\`\`\n${result.proposedContent}\n\`\`\`` : "_No content proposed (gate did not reach Claude call or Claude returned empty response)._"}

## Recommendation

**${recommendation}**

${result.gateDecision === "keep" ? `\`\`\`\nPOST /api/research/promote\n${JSON.stringify({ runId: result.runId, experiment: "a" }, null, 2)}\n\`\`\`` : ""}
`;

  // Write Markdown to disk
  ensureReportsDir();
  const filename = `${formatDateYMD(result.ranAt)}_experiment-a_${result.runId.slice(0, 8)}.md`;
  const filepath = resolve(REPORTS_DIR, filename);
  writeFileSync(filepath, markdown, "utf-8");

  return { json, markdown };
}

// ── Experiment B ─────────────────────────────────────────────────

export function formatReportB(result: ExperimentBResult): { json: object; markdown: string } {
  const json = {
    experiment: "b",
    experiment_version: "1.0.0",
    run_id: result.runId,
    ran_at: result.ranAt.toISOString(),
    summary: {
      plans_analyzed: result.plansAnalyzedCount,
      sessions_analyzed: result.sessionsAnalyzedCount,
      hypotheses_evaluated: result.hypothesisDeltas.length,
      mean_absolute_delta: Number(result.meanAbsoluteDelta.toFixed(4)),
      max_delta: Number(result.maxDelta.toFixed(4)),
      high_drift_count: result.highDriftCount,
    },
    hypothesis_deltas: result.hypothesisDeltas.map((d) => ({
      hypothesis: d.hypothesis.slice(0, 120),
      actual_confidence: Number(d.actualConfidence.toFixed(3)),
      simulated_confidence: Number(d.simulatedConfidence.toFixed(3)),
      delta: Number(d.delta.toFixed(3)),
      direction: d.direction,
      evidence_basis: d.evidenceBasis,
    })),
  };

  const highDriftDeltas = result.hypothesisDeltas.filter((d) => Math.abs(d.delta) > 0.2);

  const deltaRows = result.hypothesisDeltas
    .map(
      (d) =>
        `| ${d.hypothesis.slice(0, 60)}... | ` +
        `${d.actualConfidence.toFixed(2)} | ` +
        `${d.simulatedConfidence.toFixed(2)} | ` +
        `${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(2)} | ` +
        `${d.direction} |`,
    )
    .join("\n");

  const markdown = `# Experiment B — Hypothesis Confidence Feedback Simulator

**Run ID**: \`${result.runId}\`
**Ran at**: ${result.ranAt.toISOString()}
**User ID**: \`${result.userId}\`

## Summary

| Metric | Value |
|--------|-------|
| Plans analyzed | ${result.plansAnalyzedCount} |
| Sessions analyzed | ${result.sessionsAnalyzedCount} |
| Hypotheses evaluated | ${result.hypothesisDeltas.length} |
| Mean absolute delta | ${result.meanAbsoluteDelta.toFixed(4)} |
| Max delta | ${result.maxDelta.toFixed(4)} |
| High drift count (|delta| > 0.2) | ${result.highDriftCount} |

${result.highDriftCount > 0 ? `## High Drift Hypotheses\n\nThe following hypotheses showed confidence drift > 0.2:\n\n${highDriftDeltas.map((d) => `- **${d.direction.toUpperCase()}** \`${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(2)}\`: ${d.hypothesis}`).join("\n")}\n` : ""}

## All Hypothesis Deltas

| Hypothesis (truncated) | Actual | Simulated | Delta | Direction |
|------------------------|--------|-----------|-------|-----------|
${deltaRows}
`;

  ensureReportsDir();
  const filename = `${formatDateYMD(result.ranAt)}_experiment-b_${result.runId.slice(0, 8)}.md`;
  const filepath = resolve(REPORTS_DIR, filename);
  writeFileSync(filepath, markdown, "utf-8");

  return { json, markdown };
}

// ── Experiment C ─────────────────────────────────────────────────

export function formatReportC(result: DirectionComplianceResult): {
  json: object;
  markdown: string;
} {
  const json = {
    experiment: "c",
    experiment_version: "1.0.0",
    run_id: result.runId,
    ran_at: result.ranAt.toISOString(),
    direction_version: result.directionVersion,
    active_directives_count: result.activeDirectives.length,
    summary: {
      sessions_analyzed: result.sessionsAnalyzed,
      mean_compliance_score: Number(result.meanComplianceScore.toFixed(4)),
      mode_aligned_sessions: result.modeAlignedSessions,
      mode_unaligned_sessions: result.modeUnalignedSessions,
    },
    active_directives: result.activeDirectives,
    data_gaps: result.dataGaps,
  };

  const directiveList =
    result.activeDirectives.length > 0
      ? result.activeDirectives.map((d) => `- ${d}`).join("\n")
      : "_No directives found in therapeutic-direction.md._";

  const gapList = result.dataGaps.map((g) => `- ${g}`).join("\n");

  const markdown = `# Experiment C — therapeutic-direction.md Effectiveness Tracker

**Run ID**: \`${result.runId}\`
**Ran at**: ${result.ranAt.toISOString()}
**User ID**: \`${result.userId}\`
**Direction version**: \`${result.directionVersion}\`

## Active Directives (${result.activeDirectives.length})

${directiveList}

## Compliance Summary

| Metric | Value |
|--------|-------|
| Sessions analyzed | ${result.sessionsAnalyzed} |
| Mean compliance score | ${result.meanComplianceScore.toFixed(4)} |
| Mode-aligned sessions | ${result.modeAlignedSessions} |
| Mode-unaligned sessions | ${result.modeUnalignedSessions} |

## Data Gaps

${gapList}

_Note: Compliance scores are heuristic proxies. A score of 0.5 indicates baseline (no alignment signal). 0.75 indicates either mode alignment OR directive keyword match in session summary themes/action items (whichever contributed the +0.25). 1.0 indicates both mode alignment AND directive keyword match._
`;

  ensureReportsDir();
  const filename = `${formatDateYMD(result.ranAt)}_experiment-c_${result.runId.slice(0, 8)}.md`;
  const filepath = resolve(REPORTS_DIR, filename);
  writeFileSync(filepath, markdown, "utf-8");

  return { json, markdown };
}

// ── Experiment D ─────────────────────────────────────────────────

export function formatReportD(result: ExperimentDResult): { json: object; markdown: string } {
  const trajectoryObj = result.gate3PhqGadTrajectory as Record<string, unknown> | null;
  const trajectoryDirection =
    trajectoryObj && typeof trajectoryObj.direction === "string"
      ? trajectoryObj.direction
      : "unknown";

  const candidateScoreDisplay = result.gate2Score !== null ? result.gate2Score.toFixed(1) : "N/A";

  const baselineScoreDisplay = (() => {
    // Only include baseline scores from turns that passed Gate 1.
    // Gate 1 failures indicate unsafe behaviour — including their Gate 2
    // scores would contaminate the baseline mean.
    const baselineTotals = result.turnScores
      .filter((ts) => ts.gate1Checks.passed)
      .map((ts) => ts.baselineGate2Score)
      .filter((s): s is number => s !== null);
    if (baselineTotals.length === 0) return "N/A";
    const mean = baselineTotals.reduce((a, b) => a + b, 0) / baselineTotals.length;
    return mean.toFixed(1);
  })();

  const recommendation = (() => {
    if (result.gateDecision === "insufficient_sessions") {
      return "WAIT — insufficient session data. Run more sessions before evaluating direction files.";
    }
    if (result.gateDecision === "discard") {
      if (!result.gate1Passed) {
        return "DISCARD — candidate failed safety Gate 1. Do not promote. Fix safety violations first.";
      }
      return `DISCARD — candidate scored ${candidateScoreDisplay} vs baseline ${baselineScoreDisplay}. Gate 2 threshold not met.`;
    }
    return `PROMOTE — candidate scores ${candidateScoreDisplay} vs baseline ${baselineScoreDisplay}. Review diff before editing .claude/skills/therapeutic-direction.md.`;
  })();

  const json = {
    experiment: "d",
    experiment_version: "1.0.0",
    run_id: result.runId,
    ran_at: result.ranAt.toISOString(),
    direction_versions: {
      baseline: result.baselineDirectionVersion,
      candidate: result.candidateDirectionVersion,
    },
    sessions_used: result.sessionsUsed,
    golden_case_count: result.goldenCaseCount,
    total_turns_evaluated: result.totalTurnsEvaluated,
    gate1: {
      passed: result.gate1Passed,
      fail_reason: result.gate1FailReason,
    },
    gate2: {
      score: result.gate2Score,
      passed: result.gate2Passed,
      breakdown: result.gate2Breakdown,
      baseline_score: baselineScoreDisplay === "N/A" ? null : Number(baselineScoreDisplay),
    },
    gate3: {
      trajectory_direction: trajectoryDirection,
      flagged_for_review: result.gate3FlaggedForReview,
    },
    gate_decision: result.gateDecision,
    gate_reason: result.gateReason,
    recommendation,
    promote_command: `POST /api/research/promote {"runId": "${result.runId}", "experiment": "d"}`,
  };

  const breakdownRows = result.gate2Breakdown
    ? [
        `| warmth_pacing | ${result.gate2Breakdown.warmth_pacing.toFixed(1)} / 20 |`,
        `| appropriate_steering | ${result.gate2Breakdown.appropriate_steering.toFixed(1)} / 20 |`,
        `| depth_without_over_interpretation | ${result.gate2Breakdown.depth_without_over_interpretation.toFixed(1)} / 20 |`,
        `| resistance_rupture_handling | ${result.gate2Breakdown.resistance_rupture_handling.toFixed(1)} / 20 |`,
        `| specificity | ${result.gate2Breakdown.specificity.toFixed(1)} / 20 |`,
      ].join("\n")
    : "_No Gate 2 scores computed._";

  const markdown = `# Experiment D — Offline Replay Harness

**Run ID**: \`${result.runId}\`
**Ran at**: ${result.ranAt.toISOString()}
**User ID**: \`${result.userId}\`
**Baseline version**: \`${result.baselineDirectionVersion}\`
**Candidate version**: \`${result.candidateDirectionVersion}\`

## Summary

| Metric | Value |
|--------|-------|
| Sessions used | ${result.sessionsUsed} |
| Golden cases | ${result.goldenCaseCount} |
| Turns evaluated | ${result.totalTurnsEvaluated} |

## Gate 1 — Safety

| Field | Value |
|-------|-------|
| Passed | ${result.gate1Passed ? "YES" : "NO"} |
| Fail reason | ${result.gate1FailReason ?? "—"} |

## Gate 2 — Quality Scoring

| Field | Value |
|-------|-------|
| Candidate score | ${candidateScoreDisplay} / 100 |
| Baseline score | ${baselineScoreDisplay} / 100 |
| Passed | ${result.gate2Passed === null ? "N/A" : result.gate2Passed ? "YES" : "NO"} |

### Score Breakdown (mean over ${result.totalTurnsEvaluated} turns)

| Dimension | Score |
|-----------|-------|
${breakdownRows}

## Gate 3 — Outcome Trajectory

| Field | Value |
|-------|-------|
| Trajectory direction | ${trajectoryDirection} |
| Flagged for review | ${result.gate3FlaggedForReview ? "YES" : "no"} |
${result.gate3Note ? `| Note | ${result.gate3Note} |` : ""}

## Final Decision

**${result.gateDecision.toUpperCase()}** — ${result.gateReason}

## Recommendation

**${recommendation}**

${result.gateDecision === "keep" ? `\`\`\`\nPOST /api/research/promote\n${JSON.stringify({ runId: result.runId, experiment: "d" }, null, 2)}\n\`\`\`` : ""}
`;

  ensureReportsDir();
  const filename = `${formatDateYMD(result.ranAt)}_experiment-d_${result.runId.slice(0, 8)}.md`;
  const filepath = resolve(REPORTS_DIR, filename);
  writeFileSync(filepath, markdown, "utf-8");

  return { json, markdown };
}
