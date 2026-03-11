// ── Assessment Context Injection & Formulation Utilities ────────
// Pure functions for building context blocks and formulation text.
// No DB or side-effect imports — safe to test in isolation.

import type { AssessmentType, AssessmentSeverity } from "@moc/shared";

// ── Human-Readable Labels ───────────────────────────────────────

/** Map assessment type enums to user-facing descriptions. Never expose raw enum values. */
export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  phq9: "PHQ-9 mood check-in",
  gad7: "GAD-7 anxiety check-in",
  iss_sleep: "sleep quality screening",
  panic_screener: "panic and worry screening",
  trauma_gating: "stress and difficult experiences screening",
  functioning: "daily functioning screening",
  substance_use: "substance use screening",
  relationship: "relationship wellbeing screening",
  // Wave 1
  dass21: "DASS-21 emotional health check-in",
  rosenberg_se: "self-esteem check-in",
  who5: "WHO-5 wellbeing check-in",
  phq4: "PHQ-4 brief mood and anxiety check-in",
  pc_ptsd5: "stress response screening",
  // Wave 2
  ipip_big5: "personality traits exploration",
  ucla_loneliness: "social connectedness check-in",
  copenhagen_burnout: "burnout and energy check-in",
  ace_score: "early life experiences reflection",
  isi: "sleep and insomnia check-in",
  harrower_inkblot: "perceptual style exploration",
  // Wave 3
  pss: "perceived stress check-in",
  mspss: "social support check-in",
  ecr: "relationship patterns exploration",
  pcl5: "trauma response check-in",
  ace_iq: "expanded early life experiences reflection",
};

/** Map severity enums to descriptive, non-clinical phrases. No diagnostic labels. */
export const SEVERITY_DESCRIPTIONS: Record<AssessmentSeverity, string> = {
  minimal: "a minimal level of difficulty",
  mild: "a mild level of difficulty",
  moderate: "a moderate level of difficulty",
  moderately_severe: "a moderately significant level of difficulty",
  severe: "a significant level of difficulty",
};

/**
 * Build the context block injected into the SDK session.
 * CRITICAL: No raw scores. No diagnostic labels. Factual only.
 */
export function buildAssessmentContextBlock(
  type: AssessmentType,
  severity: AssessmentSeverity,
  nextScreener: AssessmentType | null,
): string {
  const label = ASSESSMENT_TYPE_LABELS[type];
  const severityDesc = SEVERITY_DESCRIPTIONS[severity];

  // Personality instruments don't use severity framing
  if (type === "ipip_big5" || type === "harrower_inkblot" || type === "ecr") {
    return `The user just completed a ${label}. This is for self-understanding, not diagnosis. Acknowledge it warmly and offer to discuss what they found interesting or surprising.`;
  }

  // ACE is sensitive — frame carefully
  if (type === "ace_score" || type === "ace_iq") {
    return `The user just completed an ${label}. This was a reflection on their childhood experiences. Acknowledge their willingness to explore this gently and with warmth. Do not interpret or score.`;
  }

  let block = `The user just completed a ${label}. Their responses indicate ${severityDesc}.`;

  if (nextScreener) {
    const nextLabel = ASSESSMENT_TYPE_LABELS[nextScreener];
    block += ` A follow-up ${nextLabel} is available if the user is open to continuing.`;
  } else {
    block += " No further screenings are indicated at this time.";
  }

  block += " Acknowledge this gently and naturally in your next response without repeating specific scores or using clinical language.";

  return block;
}

/**
 * Build the formulation text stored as a symptom_episode memory.
 * Internal only — never returned in any API response.
 */
export function buildFormulationText(
  type: AssessmentType,
  severity: AssessmentSeverity,
  nextScreener: AssessmentType | null,
): string {
  const label = ASSESSMENT_TYPE_LABELS[type];
  const severityDesc = SEVERITY_DESCRIPTIONS[severity];
  let text = `Internal formulation: User completed ${label}. Severity: ${severityDesc}.`;

  if (nextScreener) {
    const nextLabel = ASSESSMENT_TYPE_LABELS[nextScreener];
    text += ` Next: ${nextLabel} recommended.`;
  }

  return text;
}
