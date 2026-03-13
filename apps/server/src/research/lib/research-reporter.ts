// ── Research Reporter ────────────────────────────────────────────
// Formats experiment results into structured JSON and human-readable Markdown.
// Writes Markdown reports to research/reports/ directory.
//
// NOTE: research/reports/ is gitignored per Rule 4 in research/README.md.

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExperimentAResult } from "../experiments/experiment-a-calibration.js";
import type { ExperimentBResult } from "../experiments/experiment-b-hypotheses.js";
import type { DirectionComplianceResult } from "../experiments/experiment-c-direction.js";

// ── Reports directory ─────────────────────────────────────────────

const REPORTS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../reports",
);

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

${result.proposedContent.trim() !== "" ? "```\n" + result.proposedContent + "\n```" : "_No content proposed (gate did not reach Claude call or Claude returned empty response)._"}

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

export function formatReportC(result: DirectionComplianceResult): { json: object; markdown: string } {
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

  const directiveList = result.activeDirectives.length > 0
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

_Note: Compliance scores are heuristic proxies. A score of 0.5 indicates baseline (no alignment signal). 0.75 indicates mode alignment only. 1.0 indicates both mode alignment and directive keyword match in summary._
`;

  ensureReportsDir();
  const filename = `${formatDateYMD(result.ranAt)}_experiment-c_${result.runId.slice(0, 8)}.md`;
  const filepath = resolve(REPORTS_DIR, filename);
  writeFileSync(filepath, markdown, "utf-8");

  return { json, markdown };
}
