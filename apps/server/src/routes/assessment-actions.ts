// ── Assessment Action Recommendations ────────────────────────────
// Pure rule-based engine. No AI, no DB, no side effects.
// Generates conversation hints based on domain signals + correlations + trends.

import type { ComputedDomainSignal, CorrelationResult, DomainKey, DomainTrend, AssessmentInput } from "./assessment-domain-mapping.js";
import type { AssessmentSeverity } from "@moc/shared";

// ── Types ────────────────────────────────────────────────────────

export interface ActionRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  domain: DomainKey;
  conversationHint: string;
  evidenceSummary: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function getDomainLevel(signals: ComputedDomainSignal[], domain: DomainKey): "low" | "medium" | "high" | null {
  return signals.find((s) => s.domain === domain)?.level ?? null;
}

function getDomainTrend(trends: DomainTrend[], domain: DomainKey): "improving" | "stable" | "declining" | null {
  return trends.find((t) => t.domain === domain)?.trend ?? null;
}

function getAssessmentSeverity(assessments: AssessmentInput[], type: string): AssessmentSeverity | null {
  return assessments.find((a) => a.type === type)?.severity ?? null;
}

function isModeratePlus(severity: AssessmentSeverity | null): boolean {
  return severity === "moderate" || severity === "moderately_severe" || severity === "severe";
}

function isConverging(correlations: CorrelationResult[], construct: string): boolean {
  return correlations.find((c) => c.constructName === construct)?.convergence === "converging";
}

// ── Action Rules ─────────────────────────────────────────────────

export function computeActionRecommendations(
  domainSignals: ComputedDomainSignal[],
  correlations: CorrelationResult[],
  trends: DomainTrend[],
  assessments: AssessmentInput[],
): ActionRecommendation[] {
  const actions: ActionRecommendation[] = [];

  // Rule 1: Sleep-vitality connection
  const vitalityLevel = getDomainLevel(domainSignals, "vitality");
  const isiSeverity = getAssessmentSeverity(assessments, "isi");
  const phq9Severity = getAssessmentSeverity(assessments, "phq9");
  if (
    vitalityLevel === "high" &&
    isModeratePlus(isiSeverity) &&
    isModeratePlus(phq9Severity)
  ) {
    actions.push({
      id: "sleep-vitality",
      priority: "high",
      domain: "vitality",
      conversationHint: "Sleep appears to be significantly affecting energy and mood. Exploring sleep habits, bedtime routines, and what helps or hinders rest could be valuable.",
      evidenceSummary: `Vitality domain is high concern, with ISI (${isiSeverity}) and PHQ-9 (${phq9Severity}) both elevated.`,
    });
  }

  // Rule 2: Connection-attachment
  const connectionLevel = getDomainLevel(domainSignals, "connection");
  const uclaSeverity = getAssessmentSeverity(assessments, "ucla_loneliness");
  const ecrSeverity = getAssessmentSeverity(assessments, "ecr");
  const mspssSeverity = getAssessmentSeverity(assessments, "mspss");
  if (
    connectionLevel === "high" &&
    isModeratePlus(uclaSeverity)
  ) {
    // Check if ECR avoidance is high or MSPSS is low (severe = low support)
    const hasAttachmentFactor = ecrSeverity !== null || (mspssSeverity === "severe");
    actions.push({
      id: "connection-attachment",
      priority: "medium",
      domain: "connection",
      conversationHint: hasAttachmentFactor
        ? "Loneliness connects with relationship patterns. Gently exploring attachment style and what closeness means could illuminate paths forward."
        : "Social connection appears strained. Exploring what kinds of relationships feel nourishing and what barriers exist could help.",
      evidenceSummary: `Connection domain high concern. UCLA loneliness: ${uclaSeverity}.${hasAttachmentFactor ? " Attachment/support factors present." : ""}`,
    });
  }

  // Rule 3: Burnout-momentum
  const momentumTrend = getDomainTrend(trends, "momentum");
  const copenhagenSeverity = getAssessmentSeverity(assessments, "copenhagen_burnout");
  if (
    momentumTrend === "declining" &&
    isModeratePlus(copenhagenSeverity)
  ) {
    actions.push({
      id: "burnout-momentum",
      priority: "high",
      domain: "momentum",
      conversationHint: "Energy and motivation are trending down alongside burnout signals. Discussing boundaries, rest, and what drains vs. restores energy could be timely.",
      evidenceSummary: `Momentum declining. Copenhagen burnout: ${copenhagenSeverity}.`,
    });
  }

  // Rule 4: Comorbidity — depression + anxiety convergent
  const groundednessLevel = getDomainLevel(domainSignals, "groundedness");
  if (
    vitalityLevel === "high" &&
    groundednessLevel === "high" &&
    isConverging(correlations, "Depression") &&
    isConverging(correlations, "Anxiety")
  ) {
    actions.push({
      id: "comorbidity-integrated",
      priority: "medium",
      domain: "vitality",
      conversationHint: "Both mood and anxiety are consistently elevated across multiple measures. An integrated approach addressing the interplay between low mood and worry may be more effective than targeting either alone.",
      evidenceSummary: "Vitality and groundedness both high concern. Depression and anxiety constructs converging across instruments.",
    });
  }

  // Rule 5: Self-regard foundation
  const selfRegardLevel = getDomainLevel(domainSignals, "self_regard");
  const rosenbergSev = getAssessmentSeverity(assessments, "rosenberg_se");
  if (
    selfRegardLevel === "high" &&
    rosenbergSev === "severe"
  ) {
    // Check if other domains are also struggling
    const otherHighDomains = domainSignals.filter(
      (s) => s.domain !== "self_regard" && s.level === "high"
    ).length;
    if (otherHighDomains >= 1) {
      actions.push({
        id: "self-regard-foundation",
        priority: "high",
        domain: "self_regard",
        conversationHint: "Self-regard is very low and appears to be a foundation affecting other areas. Starting with self-compassion and challenging the inner critic may create ripple improvements elsewhere.",
        evidenceSummary: `Self-regard severe (Rosenberg: ${rosenbergSev}). ${otherHighDomains} other domain(s) also elevated.`,
      });
    }
  }

  // Rule 6: Improving reinforcement
  for (const trend of trends) {
    if (trend.trend === "improving" && trend.previousLevel !== null) {
      actions.push({
        id: `improving-${trend.domain}`,
        priority: "low",
        domain: trend.domain,
        conversationHint: `The ${trend.domain} domain is showing improvement (${trend.previousLevel} → ${trend.currentLevel}). Acknowledging this progress and exploring what's contributing to the positive change could reinforce it.`,
        evidenceSummary: `${trend.domain}: ${trend.previousLevel} → ${trend.currentLevel} over ${trend.periodDays} days.`,
      });
    }
  }

  // Sort by priority: high > medium > low
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return actions;
}
