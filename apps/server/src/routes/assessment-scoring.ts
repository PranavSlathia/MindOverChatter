// ── Assessment Scoring & Branching Logic ─────────────────────────
// Pure functions — no DB, no side effects. Easy to test.

import type { AssessmentType, AssessmentSeverity } from "@moc/shared";

// ── Severity Computation ──────────────────────────────────────────

/**
 * PHQ-9 severity thresholds (0-27 range, 9 questions x 0-3)
 *   0-4   minimal
 *   5-9   mild
 *   10-14 moderate
 *   15-19 moderately_severe
 *   20-27 severe
 */
function phq9Severity(score: number): AssessmentSeverity {
  if (score <= 4) return "minimal";
  if (score <= 9) return "mild";
  if (score <= 14) return "moderate";
  if (score <= 19) return "moderately_severe";
  return "severe";
}

/**
 * GAD-7 severity thresholds (0-21 range, 7 questions x 0-3)
 *   0-4   minimal
 *   5-9   mild
 *   10-14 moderate
 *   15-21 severe  (no moderately_severe for GAD-7)
 */
function gad7Severity(score: number): AssessmentSeverity {
  if (score <= 4) return "minimal";
  if (score <= 9) return "mild";
  if (score <= 14) return "moderate";
  return "severe";
}

/**
 * Generic screener severity using simple low/moderate/high thresholds.
 * Most screeners use 4-7 questions (0-3 Likert), so max score is 12-21.
 * We use percentage-of-max to normalize across different question counts.
 *
 *   0-33%  minimal
 *   34-66% moderate
 *   67%+   severe
 */
function screenerSeverity(score: number, questionCount: number): AssessmentSeverity {
  const maxScore = questionCount * 3;
  if (maxScore === 0) return "minimal";
  const pct = score / maxScore;
  if (pct <= 0.33) return "minimal";
  if (pct <= 0.66) return "moderate";
  return "severe";
}

/** Expected question counts per screener type. */
const SCREENER_QUESTION_COUNTS: Record<string, number> = {
  iss_sleep: 7,
  panic_screener: 7,
  trauma_gating: 4,
  functioning: 5,
  substance_use: 4,
  relationship: 5,
};

/**
 * Compute severity from answers array and assessment type.
 */
export function computeSeverity(
  type: AssessmentType,
  answers: number[],
): { totalScore: number; severity: AssessmentSeverity } {
  const totalScore = answers.reduce((sum, val) => sum + val, 0);

  let severity: AssessmentSeverity;
  switch (type) {
    case "phq9":
      severity = phq9Severity(totalScore);
      break;
    case "gad7":
      severity = gad7Severity(totalScore);
      break;
    default:
      severity = screenerSeverity(totalScore, SCREENER_QUESTION_COUNTS[type] ?? answers.length);
      break;
  }

  return { totalScore, severity };
}

// ── Next Screener Logic ───────────────────────────────────────────

/**
 * PHQ-9 branching: severity -> ordered list of screeners to administer.
 * The route picks the FIRST one that hasn't been completed yet.
 */
const PHQ9_SCREENER_CHAIN: Record<string, AssessmentType[]> = {
  minimal: [],
  mild: ["iss_sleep"],
  moderate: ["iss_sleep", "functioning"],
  moderately_severe: ["iss_sleep", "panic_screener", "functioning"],
  severe: ["iss_sleep", "panic_screener", "trauma_gating", "functioning"],
};

/**
 * GAD-7 branching: severity -> ordered list of screeners.
 */
const GAD7_SCREENER_CHAIN: Record<string, AssessmentType[]> = {
  minimal: [],
  mild: ["panic_screener"],
  moderate: ["panic_screener", "substance_use"],
  moderately_severe: ["panic_screener", "substance_use", "functioning"],
  severe: ["panic_screener", "substance_use", "functioning"],
};

/**
 * Get the full screener chain for a primary assessment.
 * Screener types themselves return empty chains (no chaining from screeners).
 */
export function getScreenerChain(
  type: AssessmentType,
  severity: AssessmentSeverity,
): AssessmentType[] {
  switch (type) {
    case "phq9":
      return PHQ9_SCREENER_CHAIN[severity] ?? [];
    case "gad7":
      return GAD7_SCREENER_CHAIN[severity] ?? [];
    default:
      // Screeners do not chain further
      return [];
  }
}

/**
 * Determine the next screener to administer.
 *
 * @param type - The assessment that was just completed
 * @param severity - Computed severity of the completed assessment
 * @param completedScreeners - Set of screener types already completed in this chain
 * @returns The next screener type, or null if the chain is complete
 */
export function getNextScreener(
  type: AssessmentType,
  severity: AssessmentSeverity,
  completedScreeners: Set<AssessmentType> = new Set(),
): AssessmentType | null {
  const chain = getScreenerChain(type, severity);
  for (const screener of chain) {
    if (!completedScreeners.has(screener)) {
      return screener;
    }
  }
  return null;
}
