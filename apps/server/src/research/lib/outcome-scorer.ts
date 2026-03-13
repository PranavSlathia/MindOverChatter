// ── Outcome Scorer ────────────────────────────────────────────────
// Pure function — zero DB calls, zero service imports.
// Scores PHQ-9 / GAD-7 assessment trajectories to produce a normalized
// outcome score and direction signal for the calibration gate.

import type { AssessmentRow } from "./read-only-queries.js";

// ── Public types ─────────────────────────────────────────────────

export type OutcomeDirection = "improving" | "stable" | "worsening" | "unknown";
export type OutcomeConfidence = "strong" | "emerging" | "sparse" | "absent";

export interface OutcomeScore {
  /** Normalized 0.0–1.0. Higher = better outcome (lower symptoms). */
  score: number;
  direction: OutcomeDirection;
  confidence: OutcomeConfidence;
  assessmentsUsed: number;
  reasoning: string;
}

// ── Score normalization ──────────────────────────────────────────

/** Maximum raw scores per assessment type. */
const MAX_SCORE: Record<string, number> = {
  phq9: 27,
  gad7: 21,
  // Other types may appear in the table; they are included in trajectory
  // if they have a total_score, but capped at their own range if known.
  phq4: 12,
  dass21: 63,
  who5: 25,
};

function normalizeScore(type: string, raw: number): number {
  const max = MAX_SCORE[type] ?? raw;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, raw / max));
}

// ── Linear regression slope ──────────────────────────────────────
// Simple least-squares slope over (index, value) pairs.
// Returns NaN for fewer than 2 points.

function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return NaN;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i] ?? 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// ── Main scorer ──────────────────────────────────────────────────

/**
 * Scores an assessment trajectory to produce a normalized outcome signal.
 * Only PHQ-9 and GAD-7 assessments are used for trajectory; other types
 * are included if present.
 *
 * Direction thresholds (applied to slope of normalized scores):
 *   slope < -0.05  → improving  (lower normalized score = fewer symptoms)
 *   slope > +0.05  → worsening
 *   otherwise      → stable
 *
 * Confidence tiers:
 *   0 assessments → absent
 *   1-2           → sparse
 *   3-4           → emerging
 *   5+            → strong
 */
export function scoreOutcome(assessments: AssessmentRow[]): OutcomeScore {
  if (assessments.length === 0) {
    return {
      score: 0.5,
      direction: "unknown",
      confidence: "absent",
      assessmentsUsed: 0,
      reasoning: "No assessments available — cannot compute outcome trajectory.",
    };
  }

  // Confidence tier
  const count = assessments.length;
  let confidence: OutcomeConfidence;
  if (count >= 5) {
    confidence = "strong";
  } else if (count >= 3) {
    confidence = "emerging";
  } else {
    confidence = "sparse";
  }

  if (count === 1) {
    const first = assessments[0];
    const normalized = first ? normalizeScore(first.type, first.totalScore) : 0;
    const outcomeScore = Math.max(0, Math.min(1, 1 - normalized));
    return {
      score: outcomeScore,
      direction: "unknown",
      confidence: "sparse",
      assessmentsUsed: 1,
      reasoning: `Single assessment (${first?.type ?? "unknown"}, score ${first?.totalScore ?? 0}) — cannot compute trajectory direction with fewer than 2 data points.`,
    };
  }

  // Use the most recent 3 assessments for slope computation
  // (assessments come in DESC order — oldest last, most recent first)
  // Reverse so index 0 = oldest, last index = most recent (chronological for slope)
  const forSlope = assessments.slice(0, 3).reverse();
  const normalizedScores = forSlope.map((a) => normalizeScore(a.type, a.totalScore));
  const slope = linearSlope(normalizedScores);

  let direction: OutcomeDirection;
  if (isNaN(slope)) {
    direction = "unknown";
  } else if (slope < -0.05) {
    direction = "improving";
  } else if (slope > 0.05) {
    direction = "worsening";
  } else {
    direction = "stable";
  }

  // Final score: invert the most recent normalized score so higher = better
  const latest = assessments[0];
  const latestNormalized = latest ? normalizeScore(latest.type, latest.totalScore) : 0;
  const score = Math.max(0, Math.min(1, 1 - latestNormalized));

  const slopeDisplay = isNaN(slope) ? "N/A" : slope.toFixed(4);
  const reasoning =
    `${count} assessments analyzed. Latest: ${latest?.type ?? "unknown"} score ` +
    `${latest?.totalScore ?? 0} (normalized ${latestNormalized.toFixed(3)}). ` +
    `Slope over most recent ${forSlope.length} points: ${slopeDisplay}. ` +
    `Direction: ${direction}. Outcome score (inverted): ${score.toFixed(3)}.`;

  return {
    score,
    direction,
    confidence,
    assessmentsUsed: count,
    reasoning,
  };
}
