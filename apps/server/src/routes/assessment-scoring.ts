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

/**
 * DASS-21: Depression, Anxiety, Stress Scales
 * 21 items scored 0-3. Three subscales of 7 items each, multiplied by 2.
 * Depression items: 3,5,10,13,16,17,21 (0-indexed: 2,4,9,12,15,16,20)
 * Anxiety items: 2,4,7,9,15,19,20 (0-indexed: 1,3,6,8,14,18,19)
 * Stress items: 1,6,8,11,12,14,18 (0-indexed: 0,5,7,10,11,13,17)
 */
const DASS21_DEPRESSION_ITEMS = [2, 4, 9, 12, 15, 16, 20];
const DASS21_ANXIETY_ITEMS = [1, 3, 6, 8, 14, 18, 19];
const DASS21_STRESS_ITEMS = [0, 5, 7, 10, 11, 13, 17];

function dass21Subscales(answers: number[]): { depression: number; anxiety: number; stress: number } {
  const sum = (indices: number[]) => indices.reduce((s, i) => s + (answers[i] ?? 0), 0) * 2;
  return {
    depression: sum(DASS21_DEPRESSION_ITEMS),
    anxiety: sum(DASS21_ANXIETY_ITEMS),
    stress: sum(DASS21_STRESS_ITEMS),
  };
}

function dass21Severity(answers: number[]): AssessmentSeverity {
  const { depression, anxiety, stress } = dass21Subscales(answers);
  // Use worst subscale for overall severity
  // Depression: 0-9 normal, 10-13 mild, 14-20 moderate, 21-27 severe, 28+ extremely severe
  // Anxiety: 0-7 normal, 8-9 mild, 10-14 moderate, 15-19 severe, 20+ extremely severe
  // Stress: 0-14 normal, 15-18 mild, 19-25 moderate, 26-33 severe, 34+ extremely severe
  const depSev = depression >= 28 ? 4 : depression >= 21 ? 3 : depression >= 14 ? 2 : depression >= 10 ? 1 : 0;
  const anxSev = anxiety >= 20 ? 4 : anxiety >= 15 ? 3 : anxiety >= 10 ? 2 : anxiety >= 8 ? 1 : 0;
  const strSev = stress >= 34 ? 4 : stress >= 26 ? 3 : stress >= 19 ? 2 : stress >= 15 ? 1 : 0;
  const worst = Math.max(depSev, anxSev, strSev);
  const map: AssessmentSeverity[] = ["minimal", "mild", "moderate", "moderately_severe", "severe"];
  return map[worst]!;
}

/**
 * Rosenberg Self-Esteem Scale (RSE-10)
 * 10 items, 0-3 (Strongly Agree to Strongly Disagree)
 * Items 2,5,6,8,9 (0-indexed: 1,4,5,7,8) are reverse-scored
 * Total range: 0-30. Higher = higher self-esteem.
 * Severity is inverted: low self-esteem = high severity.
 */
const ROSENBERG_REVERSE_ITEMS = [1, 4, 5, 7, 8];

function rosenbergScore(answers: number[]): number {
  return answers.reduce((sum, val, i) => {
    return sum + (ROSENBERG_REVERSE_ITEMS.includes(i) ? 3 - val : val);
  }, 0);
}

function rosenbergSeverity(answers: number[]): AssessmentSeverity {
  const score = rosenbergScore(answers);
  // Inverted: low score = high severity
  if (score >= 25) return "minimal";
  if (score >= 20) return "mild";
  if (score >= 15) return "moderate";
  return "severe";
}

/**
 * WHO-5 Well-Being Index
 * 5 items, 0-5 scale. Raw score 0-25. Multiply by 4 for percentage.
 * Lower = worse wellbeing (inverted severity).
 */
function who5Severity(score: number): AssessmentSeverity {
  // score is raw sum (0-25)
  if (score >= 18) return "minimal";
  if (score >= 13) return "mild";
  if (score >= 8) return "moderate";
  return "severe";
}

/**
 * PHQ-4: Ultra-brief depression + anxiety screener
 * 4 items, 0-3. Items 1-2 = anxiety (GAD-2), Items 3-4 = depression (PHQ-2).
 * Total 0-12.
 */
function phq4Severity(score: number): AssessmentSeverity {
  if (score <= 2) return "minimal";
  if (score <= 5) return "mild";
  if (score <= 8) return "moderate";
  return "severe";
}

/**
 * PC-PTSD-5: Primary Care PTSD Screen
 * 5 yes/no items (0-1). Total 0-5.
 * Cutoff ≥ 3 for probable PTSD.
 */
function pcPtsd5Severity(score: number): AssessmentSeverity {
  if (score <= 1) return "minimal";
  if (score === 2) return "mild";
  if (score <= 3) return "moderate";
  return "severe";
}

/**
 * IPIP Big Five (50-item)
 * 50 items, 1-5 scale. 10 items per factor.
 * No single severity — personality traits aren't pathological.
 * Returns minimal severity; subscales computed separately.
 */
const IPIP_FACTORS = {
  extraversion: { items: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45], reverse: [5, 15, 25, 35, 45] },
  agreeableness: { items: [1, 6, 11, 16, 21, 26, 31, 36, 41, 46], reverse: [1, 11, 21, 31, 41] },
  conscientiousness: { items: [2, 7, 12, 17, 22, 27, 32, 37, 42, 47], reverse: [7, 17, 27, 37, 47] },
  neuroticism: { items: [3, 8, 13, 18, 23, 28, 33, 38, 43, 48], reverse: [8, 18, 28, 38, 48] },
  openness: { items: [4, 9, 14, 19, 24, 29, 34, 39, 44, 49], reverse: [9, 19, 29, 39, 49] },
} as const;

export function ipipSubscales(answers: number[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [factor, { items, reverse }] of Object.entries(IPIP_FACTORS)) {
    result[factor] = items.reduce<number>((sum, i) => {
      const val = answers[i] ?? 3;
      return sum + ((reverse as readonly number[]).includes(i) ? 6 - val : val);
    }, 0);
  }
  return result;
}

/**
 * UCLA Loneliness Scale v3
 * 20 items, 1-4 scale. Items 1,5,6,9,10,15,16,19,20 (0-indexed: 0,4,5,8,9,14,15,18,19) reverse-scored.
 * Total 20-80. Higher = more lonely.
 */
const UCLA_REVERSE_ITEMS = [0, 4, 5, 8, 9, 14, 15, 18, 19];

function uclaScore(answers: number[]): number {
  return answers.reduce((sum, val, i) => {
    return sum + (UCLA_REVERSE_ITEMS.includes(i) ? 5 - val : val);
  }, 0);
}

function uclaSeverity(answers: number[]): AssessmentSeverity {
  const score = uclaScore(answers);
  if (score <= 34) return "minimal";
  if (score <= 49) return "mild";
  if (score <= 64) return "moderate";
  return "severe";
}

/**
 * Copenhagen Burnout Inventory
 * 19 items across 3 subscales. 0-4 scale → converted to 0-100.
 * Personal burnout: items 1-6 (0-5)
 * Work burnout: items 7-13 (6-12)
 * Client burnout: items 14-19 (13-18)
 */
function copenhagenBurnoutAvg(answers: number[], start: number, end: number): number {
  const items = answers.slice(start, end);
  if (items.length === 0) return 0;
  const sum = items.reduce((s, v) => s + v, 0);
  return (sum / (items.length * 4)) * 100;
}

function copenhagenSeverity(answers: number[]): AssessmentSeverity {
  const personal = copenhagenBurnoutAvg(answers, 0, 6);
  const work = copenhagenBurnoutAvg(answers, 6, 13);
  const client = copenhagenBurnoutAvg(answers, 13, 19);
  const worst = Math.max(personal, work, client);
  if (worst <= 25) return "minimal";
  if (worst <= 50) return "mild";
  if (worst <= 75) return "moderate";
  return "severe";
}

/**
 * ACE (Adverse Childhood Experiences)
 * 10 yes/no items (0-1). Total 0-10.
 * Not a clinical severity per se, but higher = more risk.
 */
function aceSeverity(score: number): AssessmentSeverity {
  if (score === 0) return "minimal";
  if (score <= 3) return "mild";
  if (score <= 6) return "moderate";
  return "severe";
}

/**
 * ISI (Insomnia Severity Index)
 * 7 items, 0-4 scale. Total 0-28.
 * 0-7: no clinically significant insomnia
 * 8-14: subthreshold insomnia
 * 15-21: moderate clinical insomnia
 * 22-28: severe clinical insomnia
 */
function isiSeverity(score: number): AssessmentSeverity {
  if (score <= 7) return "minimal";
  if (score <= 14) return "mild";
  if (score <= 21) return "moderate";
  return "severe";
}

/**
 * Harrower-Erickson Multiple Choice Rorschach (MCR)
 * 10 cards, 3 choices each (0-2). Simplified scoring.
 * Each response maps to categories. Higher variety = healthier.
 * Simplified: use sum as a rough indicator.
 */
function harrowerSeverity(score: number): AssessmentSeverity {
  // Simplified — not clinically rigorous
  if (score <= 5) return "minimal";
  if (score <= 10) return "mild";
  if (score <= 15) return "moderate";
  return "severe";
}

/**
 * PSS (Perceived Stress Scale)
 * 10 items, 0-4 scale. Items 4,5,7,8 (0-indexed: 3,4,6,7) are reverse-scored (4 - value).
 * Total range: 0-40.
 */
const PSS_REVERSE_ITEMS = [3, 4, 6, 7];

function pssScore(answers: number[]): number {
  return answers.reduce((sum, val, i) => {
    return sum + (PSS_REVERSE_ITEMS.includes(i) ? 4 - val : val);
  }, 0);
}

function pssSeverity(score: number): AssessmentSeverity {
  if (score <= 13) return "minimal";
  if (score <= 26) return "moderate";
  return "severe";
}

/**
 * MSPSS (Multidimensional Scale of Perceived Social Support)
 * 12 items, 1-7 scale. 3 subscales:
 *   Significant Other: items 1,2,5,10 (0-indexed: 0,1,4,9)
 *   Family: items 3,4,8,11 (0-indexed: 2,3,7,10)
 *   Friends: items 6,7,9,12 (0-indexed: 5,6,8,11)
 */
const MSPSS_SIGNIFICANT_OTHER = [0, 1, 4, 9];
const MSPSS_FAMILY = [2, 3, 7, 10];
const MSPSS_FRIENDS = [5, 6, 8, 11];

function mspssSubscales(answers: number[]): { significantOther: number; family: number; friends: number; overall: number } {
  const mean = (indices: number[]) => {
    const sum = indices.reduce((s, i) => s + (answers[i] ?? 0), 0);
    return sum / indices.length;
  };
  const overall = answers.reduce((s, v) => s + v, 0) / answers.length;
  return {
    significantOther: mean(MSPSS_SIGNIFICANT_OTHER),
    family: mean(MSPSS_FAMILY),
    friends: mean(MSPSS_FRIENDS),
    overall,
  };
}

function mspssSeverity(answers: number[]): AssessmentSeverity {
  // Inverted: low support = high severity
  const { overall } = mspssSubscales(answers);
  if (overall >= 5.1) return "minimal";
  if (overall >= 3) return "moderate";
  return "severe";
}

/**
 * ECR (Experiences in Close Relationships) — Brennan ECR-36
 * 36 items, 1-7 scale. 2 subscales of 18 items each.
 *   Avoidance: odd items (0-indexed: 0,2,4,...,34)
 *     Reverse-scored (8 - value) at 0-indexed: 2,14,18,24,26,28,30,32,34
 *   Anxiety: even items (0-indexed: 1,3,5,...,35)
 *     Reverse-scored (8 - value) at 0-indexed: 3,11,23,33
 * Each subscale mean = sum / 18. Range 1-7.
 */
const ECR_AVOIDANCE_ITEMS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34];
const ECR_ANXIETY_ITEMS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35];
const ECR_AVOIDANCE_REVERSE = [2, 14, 18, 24, 26, 28, 30, 32, 34];
const ECR_ANXIETY_REVERSE = [3, 11, 23, 33];

function ecrSubscales(answers: number[]): { anxiety: number; avoidance: number } {
  const scoreItems = (items: number[], reverseSet: number[]) => {
    const sum = items.reduce((s, i) => {
      const val = answers[i] ?? 1;
      return s + (reverseSet.includes(i) ? 8 - val : val);
    }, 0);
    return sum / items.length;
  };
  return {
    avoidance: scoreItems(ECR_AVOIDANCE_ITEMS, ECR_AVOIDANCE_REVERSE),
    anxiety: scoreItems(ECR_ANXIETY_ITEMS, ECR_ANXIETY_REVERSE),
  };
}

/**
 * PCL-5 (PTSD Checklist for DSM-5)
 * 20 items, 0-4 scale. Total 0-80.
 * DSM-5 symptom clusters:
 *   Intrusions (B): items 1-5 (0-indexed: 0-4)
 *   Avoidance (C): items 6-7 (0-indexed: 5-6)
 *   Negative cognitions (D): items 8-14 (0-indexed: 7-13)
 *   Hyperarousal (E): items 15-20 (0-indexed: 14-19)
 */
function pcl5Subscales(answers: number[]): { intrusions: number; avoidance: number; negativeCognitions: number; hyperarousal: number } {
  const sum = (start: number, end: number) => answers.slice(start, end).reduce((s, v) => s + v, 0);
  return {
    intrusions: sum(0, 5),
    avoidance: sum(5, 7),
    negativeCognitions: sum(7, 14),
    hyperarousal: sum(14, 20),
  };
}

function pcl5Severity(score: number): AssessmentSeverity {
  if (score <= 10) return "minimal";
  if (score <= 20) return "mild";
  if (score <= 30) return "moderate";
  return "severe";
}

/**
 * ACE-IQ (Adverse Childhood Experiences — International Questionnaire)
 * 13 yes/no items (0-1). Total 0-13.
 */
function aceIqSeverity(score: number): AssessmentSeverity {
  if (score === 0) return "minimal";
  if (score <= 3) return "mild";
  if (score <= 7) return "moderate";
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
  answers: (number | string)[],
): { totalScore: number; severity: AssessmentSeverity } {
  // CBT Thought Record is a reflection tool — not a scored instrument
  if (type === "cbt_thought_record") {
    return { totalScore: 0, severity: "minimal" };
  }

  const numericAnswers = answers as number[];
  const totalScore = numericAnswers.reduce((sum, val) => sum + val, 0);

  let severity: AssessmentSeverity;
  switch (type) {
    case "phq9":
      severity = phq9Severity(totalScore);
      break;
    case "gad7":
      severity = gad7Severity(totalScore);
      break;
    case "dass21":
      severity = dass21Severity(numericAnswers);
      break;
    case "rosenberg_se":
      severity = rosenbergSeverity(numericAnswers);
      break;
    case "who5":
      severity = who5Severity(totalScore);
      break;
    case "phq4":
      severity = phq4Severity(totalScore);
      break;
    case "pc_ptsd5":
      severity = pcPtsd5Severity(totalScore);
      break;
    case "ipip_big5":
      // Personality — not a severity concept
      severity = "minimal";
      break;
    case "ucla_loneliness":
      severity = uclaSeverity(numericAnswers);
      break;
    case "copenhagen_burnout":
      severity = copenhagenSeverity(numericAnswers);
      break;
    case "ace_score":
      severity = aceSeverity(totalScore);
      break;
    case "isi":
      severity = isiSeverity(totalScore);
      break;
    case "harrower_inkblot":
      severity = harrowerSeverity(totalScore);
      break;
    case "pss":
      severity = pssSeverity(pssScore(numericAnswers));
      break;
    case "mspss":
      severity = mspssSeverity(numericAnswers);
      break;
    case "ecr":
      // Personality instrument — not a severity concept
      severity = "minimal";
      break;
    case "pcl5":
      severity = pcl5Severity(totalScore);
      break;
    case "ace_iq":
      severity = aceIqSeverity(totalScore);
      break;
    default:
      severity = screenerSeverity(totalScore, SCREENER_QUESTION_COUNTS[type] ?? numericAnswers.length);
      break;
  }

  return { totalScore, severity };
}

// ── Subscale Exports ──────────────────────────────────────────────

export { dass21Subscales, rosenbergScore, uclaScore, copenhagenBurnoutAvg, pssScore, mspssSubscales, ecrSubscales, pcl5Subscales };

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
