import type {
  ClinicalClassification,
  ClinicalContradiction,
  ClinicalTriage,
  EvidenceRef,
  PatientUnderstandingItem,
} from "@moc/shared/validators/clinical-report";

type AssessmentLike = {
  id: string;
  type: string;
  severity: string;
  totalScore: number | null;
  createdAt: Date;
};

type SessionLike = {
  id: string;
  startedAt: Date;
};

type HypothesisEvaluationLike = {
  hypothesis: string;
  confidence: number;
  evidence: string;
  status: "supported" | "insufficient_evidence";
  assessmentCount: number;
  narrativeCount: number;
  contradictingCount: number;
  evidenceRefs: EvidenceRef[];
  contradictionRefs: EvidenceRef[];
};

const SEVERITY_RANK: Record<string, number> = {
  minimal: 0,
  mild: 1,
  moderate: 2,
  moderately_severe: 3,
  severe: 4,
};

type ClassificationRule = {
  label: string;
  assessmentTypes: string[];
  keywords: string[];
  minSeverityRank: number;
};

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    label: "Depressive symptom cluster",
    assessmentTypes: ["phq9", "phq4"],
    keywords: ["depress", "low mood", "hopeless", "sad", "motivation", "energy"],
    minSeverityRank: 2,
  },
  {
    label: "Anxiety symptom cluster",
    assessmentTypes: ["gad7", "phq4"],
    keywords: ["anx", "worry", "panic", "restless", "tension"],
    minSeverityRank: 2,
  },
  {
    label: "Panic symptom cluster",
    assessmentTypes: ["panic_screener", "gad7"],
    keywords: ["panic", "heart racing", "shortness of breath", "fear"],
    minSeverityRank: 1,
  },
  {
    label: "Trauma-related stress cluster",
    assessmentTypes: ["pc_ptsd5", "pcl5", "trauma_gating"],
    keywords: ["trauma", "flashback", "nightmare", "avoidance", "hypervigilance"],
    minSeverityRank: 1,
  },
  {
    label: "Sleep-wake difficulty cluster",
    assessmentTypes: ["isi", "iss_sleep"],
    keywords: ["sleep", "insomnia", "rest", "tired"],
    minSeverityRank: 1,
  },
];

const REFLECTION_EXTRACTION_RULES: Array<{
  category: PatientUnderstandingItem["category"];
  label: string;
  detail: string;
  keywords: string[];
  confidence: number;
}> = [
  {
    category: "symptom",
    label: "Sleep disruption",
    detail: "Reflection language suggests ongoing sleep disturbance.",
    keywords: ["sleep", "insomnia", "awake", "nightmare", "tired", "exhausted"],
    confidence: 0.66,
  },
  {
    category: "symptom",
    label: "Anxiety activation",
    detail: "Reflection language suggests worry, tension, or panic-like activation.",
    keywords: ["anxious", "anxiety", "worry", "panic", "tense", "restless"],
    confidence: 0.69,
  },
  {
    category: "symptom",
    label: "Low mood / hopelessness",
    detail: "Reflection language suggests low mood, depletion, or hopelessness.",
    keywords: ["sad", "down", "numb", "hopeless", "empty", "low"],
    confidence: 0.68,
  },
  {
    category: "trigger",
    label: "Work or performance stress",
    detail: "Reflection references work, pressure, deadlines, or performance strain.",
    keywords: ["work", "job", "deadline", "performance", "manager", "burnout"],
    confidence: 0.64,
  },
  {
    category: "trigger",
    label: "Relationship strain",
    detail: "Reflection references interpersonal conflict, distance, or rejection.",
    keywords: ["partner", "relationship", "family", "friend", "argument", "conflict"],
    confidence: 0.65,
  },
  {
    category: "functional_impact",
    label: "Daily functioning strain",
    detail: "Reflection indicates difficulty completing ordinary daily tasks.",
    keywords: ["can't", "cannot", "hard to", "struggle", "avoid", "work", "focus"],
    confidence: 0.67,
  },
  {
    category: "coping_strategy",
    label: "Reflective coping practice",
    detail: "The user is using reflective writing as an active coping strategy.",
    keywords: ["journal", "write", "reflection", "reflect", "process"],
    confidence: 0.61,
  },
  {
    category: "protective_factor",
    label: "Support system mentioned",
    detail: "Reflection mentions another person or support source that may be protective.",
    keywords: ["friend", "partner", "family", "support", "therapist", "coach"],
    confidence: 0.6,
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function includesKeyword(text: string, keyword: string): boolean {
  return normalize(text).includes(keyword.toLowerCase());
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => includesKeyword(text, keyword));
}

function shortExcerpt(text: string, max = 180): string {
  const value = text.trim();
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function extractNarrativeCandidatesFromReflection(input: {
  text: string;
  reflectionId: string;
  createdAt: Date | null;
}): Array<{
  category: PatientUnderstandingItem["category"];
  title: string;
  detail: string;
  provenance: PatientUnderstandingItem["provenance"];
  confidence: number;
  sourceRefs: EvidenceRef[];
}> {
  const extracted: Array<{
    category: PatientUnderstandingItem["category"];
    title: string;
    detail: string;
    provenance: PatientUnderstandingItem["provenance"];
    confidence: number;
    sourceRefs: EvidenceRef[];
  }> = [];

  for (const rule of REFLECTION_EXTRACTION_RULES) {
    if (!matchesKeywords(input.text, rule.keywords)) continue;
    extracted.push({
      category: rule.category,
      title: rule.label,
      detail: rule.detail,
      provenance: "self_reported",
      confidence: rule.confidence,
      sourceRefs: [
        {
          sourceType: "reflection",
          sourceId: input.reflectionId,
          createdAt: input.createdAt?.toISOString() ?? null,
          excerpt: shortExcerpt(input.text),
        },
      ],
    });
  }

  return extracted;
}

export function buildClinicalTriage(input: {
  assessments: AssessmentLike[];
  understandingItems: PatientUnderstandingItem[];
  crisisSessions: SessionLike[];
}): ClinicalTriage {
  const reasons: string[] = [];
  const evidenceRefs: EvidenceRef[] = [];

  if (input.crisisSessions.length > 0) {
    reasons.push("A prior session already triggered crisis escalation.");
    evidenceRefs.push(
      ...input.crisisSessions.slice(0, 3).map((session) => ({
        sourceType: "session" as const,
        sourceId: session.id,
        createdAt: session.startedAt.toISOString(),
        excerpt: "crisis_escalated",
      })),
    );
    return {
      framework: "mhGAP-inspired",
      priority: "emergent",
      reasons,
      evidenceRefs,
    };
  }

  const highRiskItems = input.understandingItems.filter((item) => item.category === "risk_factor");
  if (highRiskItems.length > 0) {
    reasons.push("Risk-relevant evidence is present and requires direct clinician review.");
    evidenceRefs.push(...highRiskItems.slice(0, 3).flatMap((item) => item.sourceRefs.slice(0, 2)));
  }

  const severeAssessments = input.assessments.filter(
    (row) => (SEVERITY_RANK[row.severity] ?? 0) >= 3,
  );
  if (severeAssessments.length > 0) {
    reasons.push("At least one recent validated assessment landed in the severe range.");
    evidenceRefs.push(
      ...severeAssessments.slice(0, 3).map((row) => ({
        sourceType: "assessment" as const,
        sourceId: row.id,
        createdAt: row.createdAt.toISOString(),
        excerpt: `${row.type}:${row.severity}`,
      })),
    );
  }

  const moderateAssessments = input.assessments.filter(
    (row) => (SEVERITY_RANK[row.severity] ?? 0) === 2,
  );
  if (moderateAssessments.length >= 2) {
    reasons.push("Multiple moderate assessment signals suggest the case should be prioritised.");
    evidenceRefs.push(
      ...moderateAssessments.slice(0, 2).map((row) => ({
        sourceType: "assessment" as const,
        sourceId: row.id,
        createdAt: row.createdAt.toISOString(),
        excerpt: `${row.type}:${row.severity}`,
      })),
    );
  }

  if (highRiskItems.length > 0 || severeAssessments.length > 0) {
    return {
      framework: "mhGAP-inspired",
      priority: "urgent",
      reasons,
      evidenceRefs,
    };
  }

  if (moderateAssessments.length >= 2) {
    return {
      framework: "mhGAP-inspired",
      priority: "priority",
      reasons,
      evidenceRefs,
    };
  }

  return {
    framework: "mhGAP-inspired",
    priority: "routine",
    reasons: reasons.length > 0 ? reasons : ["Current evidence does not indicate urgent escalation."],
    evidenceRefs,
  };
}

export function buildClinicalClassifications(input: {
  assessments: AssessmentLike[];
  understandingItems: PatientUnderstandingItem[];
}): ClinicalClassification[] {
  const classifications: ClinicalClassification[] = [];

  for (const rule of CLASSIFICATION_RULES) {
    const matchingAssessments = input.assessments.filter((row) => {
      const severityRank = SEVERITY_RANK[row.severity] ?? 0;
      return severityRank >= rule.minSeverityRank && rule.assessmentTypes.includes(row.type);
    });

    const matchingNarratives = input.understandingItems.filter((item) => {
      if (!["symptom", "presenting_concern", "hypothesis"].includes(item.category)) return false;
      return matchesKeywords(`${item.title} ${item.detail}`, rule.keywords);
    });

    if (matchingAssessments.length === 0 && matchingNarratives.length === 0) continue;

    const confidence = Math.min(
      0.55 + matchingAssessments.length * 0.15 + matchingNarratives.length * 0.08,
      0.9,
    );
    classifications.push({
      system: "ICD-11",
      code: null,
      label: rule.label,
      confidence,
      rationale:
        matchingAssessments.length > 0
          ? `Backed by ${matchingAssessments.length} matching assessment signal(s) and ${matchingNarratives.length} corroborating narrative signal(s).`
          : `Backed by ${matchingNarratives.length} corroborating narrative signal(s); structured coding should remain provisional.`,
      evidenceRefs: [
        ...matchingAssessments.slice(0, 3).map((row) => ({
          sourceType: "assessment" as const,
          sourceId: row.id,
          createdAt: row.createdAt.toISOString(),
          excerpt: `${row.type}:${row.severity}`,
        })),
        ...matchingNarratives.slice(0, 3).flatMap((item) => item.sourceRefs.slice(0, 2)),
      ],
    });
  }

  return classifications.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

export function buildClinicalContradictions(input: {
  hypotheses: HypothesisEvaluationLike[];
  assessments: AssessmentLike[];
}): ClinicalContradiction[] {
  const contradictions: ClinicalContradiction[] = input.hypotheses
    .filter((hypothesis) => hypothesis.contradictingCount > 0)
    .slice(0, 4)
    .map((hypothesis) => ({
      label: hypothesis.hypothesis,
      detail:
        "Some evidence pushes against this working hypothesis, so it should stay provisional until a clinician reviews it directly.",
      severity: hypothesis.contradictingCount >= 2 ? "high" : "medium",
      evidenceRefs: hypothesis.contradictionRefs,
    }));

  const severeToMinimalReversal = input.assessments
    .reduce<Record<string, AssessmentLike[]>>((acc, row) => {
      (acc[row.type] ??= []).push(row);
      return acc;
    }, {});

  for (const rows of Object.values(severeToMinimalReversal)) {
    const ordered = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last || first.id === last.id) continue;
    if ((SEVERITY_RANK[first.severity] ?? 0) < 2) continue;
    if ((SEVERITY_RANK[last.severity] ?? 0) > 1) continue;

    contradictions.push({
      label: `${first.type.toUpperCase()} trend reversal`,
      detail:
        "Earlier assessment severity was meaningfully higher than the latest assessment, so static conclusions may now be outdated.",
      severity: "low",
      evidenceRefs: [
        {
          sourceType: "assessment",
          sourceId: first.id,
          createdAt: first.createdAt.toISOString(),
          excerpt: `${first.type}:${first.severity}`,
        },
        {
          sourceType: "assessment",
          sourceId: last.id,
          createdAt: last.createdAt.toISOString(),
          excerpt: `${last.type}:${last.severity}`,
        },
      ],
    });
  }

  const deduped = new Map<string, ClinicalContradiction>();
  for (const contradiction of contradictions) {
    const key = `${contradiction.label}:${contradiction.detail}`;
    if (!deduped.has(key)) deduped.set(key, contradiction);
  }

  return [...deduped.values()].slice(0, 6);
}
