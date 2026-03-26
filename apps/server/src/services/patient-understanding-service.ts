import {
  JourneyFormulationSchema,
  TherapyPlanSchema,
  type EvidenceRef,
  type PatientUnderstandingItem as PatientUnderstandingItemDto,
  type PatientUnderstandingSnapshot as PatientUnderstandingSnapshotDto,
  type UnderstandingItemCategory,
  type UnderstandingItemProvenance,
} from "@moc/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  assessments,
  memories,
  patientUnderstandingItems,
  patientUnderstandingSnapshots,
  reflections,
  reflectiveQuestions,
  sessionSummaries,
  sessions,
  therapyPlans,
  userFormulations,
} from "../db/schema/index.js";
import { extractNarrativeCandidatesFromReflection } from "./clinical-rules-service.js";

type GenerationReason = "session_end" | "reflection_submit" | "manual";

type SnapshotDataConfidence = "sparse" | "emerging" | "established";

type AssessmentRow = {
  id: string;
  type: string;
  totalScore: number;
  severity: string;
  answers?: unknown;
  createdAt: Date;
};

type NarrativeSource = {
  sourceType: EvidenceRef["sourceType"];
  sourceId: string;
  createdAt: string;
  text: string;
};

type UnderstandingCandidate = Omit<PatientUnderstandingItemDto, "id" | "snapshotId" | "userId" | "createdAt">;

type EvaluatedHypothesis = {
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

const ASSESSMENT_KEYWORDS: Record<string, string[]> = {
  phq9: ["depression", "mood", "energy", "hopeless", "motivation", "sleep"],
  phq4: ["depression", "anxiety", "worry", "mood"],
  gad7: ["anxiety", "worry", "panic", "restless", "tension"],
  panic_screener: ["panic", "heart racing", "panic attacks"],
  trauma_gating: ["trauma", "flashbacks", "nightmares"],
  pc_ptsd5: ["trauma", "flashbacks", "avoidance", "hypervigilance"],
  pcl5: ["trauma", "flashbacks", "avoidance", "hypervigilance"],
  iss_sleep: ["sleep", "insomnia", "rest"],
  isi: ["sleep", "insomnia", "rest"],
  functioning: ["functioning", "work", "daily life", "tasks"],
  relationship: ["relationship", "conflict", "family", "partner"],
  substance_use: ["substance", "drinking", "alcohol", "drug"],
  rosenberg_se: ["self-worth", "self-esteem", "confidence", "shame"],
  who5: ["wellbeing", "energy", "interest", "hope"],
};

const HYPOTHESIS_THRESHOLD_TEXT =
  "At least one validated assessment signal plus one narrative corroboration, or two narrative corroborations with no active contradiction.";

const NARRATIVE_CONTRADICTION_PATTERNS = [
  /\bno\b/,
  /\bnot\b/,
  /\bnever\b/,
  /\bwithout\b/,
  /\bbetter\b/,
  /\bimproved\b/,
  /\bmore manageable\b/,
  /\bless intense\b/,
];

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function keywordsFromText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function countKeywordOverlap(a: string, b: string): number {
  const aWords = new Set(keywordsFromText(a));
  const bWords = new Set(keywordsFromText(b));
  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap++;
  }
  return overlap;
}

function makeEvidenceRef(
  sourceType: EvidenceRef["sourceType"],
  sourceId: string,
  createdAt?: Date | null,
  excerpt?: string | null,
): EvidenceRef {
  return {
    sourceType,
    sourceId,
    createdAt: iso(createdAt) ?? null,
    excerpt: excerpt ?? null,
  };
}

function makeCandidate(input: {
  category: UnderstandingItemCategory;
  title: string;
  detail: string;
  provenance: UnderstandingItemProvenance;
  confidence: number;
  sourceRefs: EvidenceRef[];
  supportingEvidenceCount?: number;
  contradictingEvidenceCount?: number;
  status?: "active" | "superseded";
  lastReviewedAt?: Date;
}): UnderstandingCandidate {
  return {
    category: input.category,
    title: input.title,
    detail: input.detail,
    provenance: input.provenance,
    confidence: input.confidence,
    supportingEvidenceCount: input.supportingEvidenceCount ?? input.sourceRefs.length,
    contradictingEvidenceCount: input.contradictingEvidenceCount ?? 0,
    status: input.status ?? "active",
    sourceRefs: input.sourceRefs,
    lastReviewedAt: (input.lastReviewedAt ?? new Date()).toISOString(),
  };
}

function dedupeCandidates(candidates: UnderstandingCandidate[]): UnderstandingCandidate[] {
  const seen = new Set<string>();
  const deduped: UnderstandingCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.category}:${candidate.title.toLowerCase()}:${candidate.detail.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function computeAssessmentTrend(rows: AssessmentRow[]): "improving" | "stable" | "worsening" {
  if (rows.length < 2) return "stable";
  const ordered = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return "stable";

  const firstRank = SEVERITY_RANK[first.severity] ?? 0;
  const lastRank = SEVERITY_RANK[last.severity] ?? 0;
  if (lastRank < firstRank) return "improving";
  if (lastRank > firstRank) return "worsening";
  return "stable";
}

function countAssessmentCorroborations(hypothesisText: string, rows: AssessmentRow[]): number {
  const hypothesisKeywords = new Set(keywordsFromText(hypothesisText));
  return rows.filter((row) => {
    const severityRank = SEVERITY_RANK[row.severity] ?? 0;
    if (severityRank < 2) return false;
    const keywords = ASSESSMENT_KEYWORDS[row.type] ?? [];
    return keywords.some((keyword) => hypothesisKeywords.has(keyword));
  }).length;
}

function countNarrativeCorroborations(hypothesisText: string, sources: NarrativeSource[]): number {
  return sources.filter((source) => countKeywordOverlap(hypothesisText, source.text) >= 2).length;
}

function matchingAssessmentRows(hypothesisText: string, rows: AssessmentRow[]): AssessmentRow[] {
  const hypothesisKeywords = new Set(keywordsFromText(hypothesisText));
  return rows.filter((row) => {
    const keywords = ASSESSMENT_KEYWORDS[row.type] ?? [];
    return keywords.some((keyword) => hypothesisKeywords.has(keyword));
  });
}

function countAssessmentContradictions(hypothesisText: string, rows: AssessmentRow[]): number {
  return matchingAssessmentRows(hypothesisText, rows).filter((row) => {
    const severityRank = SEVERITY_RANK[row.severity] ?? 0;
    return severityRank <= 1;
  }).length;
}

function narrativeContradictionSources(
  hypothesisText: string,
  sources: NarrativeSource[],
): NarrativeSource[] {
  return sources.filter((source) => {
    if (countKeywordOverlap(hypothesisText, source.text) < 2) return false;
    const normalizedText = source.text.toLowerCase();
    return NARRATIVE_CONTRADICTION_PATTERNS.some((pattern) => pattern.test(normalizedText));
  });
}

function evaluateHypotheses(input: {
  rawHypotheses: Array<{ hypothesis: string; confidence: number; evidence: string }>;
  assessments: AssessmentRow[];
  narrativeSources: NarrativeSource[];
  therapyPlanId: string;
  therapyPlanCreatedAt: Date;
}): EvaluatedHypothesis[] {
  return input.rawHypotheses.map((raw) => {
    const combinedText = `${raw.hypothesis} ${raw.evidence}`;
    const assessmentCount = countAssessmentCorroborations(combinedText, input.assessments);
    const narrativeCount = countNarrativeCorroborations(combinedText, input.narrativeSources);
    const assessmentContradictions = countAssessmentContradictions(combinedText, input.assessments);
    const narrativeContradictions = narrativeContradictionSources(combinedText, input.narrativeSources);
    const contradictingCount = assessmentContradictions + narrativeContradictions.length;
    const status =
      contradictingCount === 0 &&
      ((assessmentCount >= 1 && narrativeCount >= 1) ||
        (assessmentCount === 0 && narrativeCount >= 2))
        ? "supported"
        : "insufficient_evidence";

    const matchingNarrativeRefs = input.narrativeSources
      .filter((source) => countKeywordOverlap(combinedText, source.text) >= 2)
      .slice(0, 3)
      .map((source) => ({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        createdAt: source.createdAt,
        excerpt: source.text.slice(0, 180),
      }));

    const matchingAssessmentRefs = matchingAssessmentRows(combinedText, input.assessments)
      .slice(0, 3)
      .map((row) => makeEvidenceRef("assessment", row.id, row.createdAt, `${row.type}:${row.severity}`));

    const contradictionRefs = [
      ...matchingAssessmentRows(combinedText, input.assessments)
        .filter((row) => (SEVERITY_RANK[row.severity] ?? 0) <= 1)
        .slice(0, 2)
        .map((row) => makeEvidenceRef("assessment", row.id, row.createdAt, `${row.type}:${row.severity}`)),
      ...narrativeContradictions.slice(0, 2).map((source) => ({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        createdAt: source.createdAt,
        excerpt: source.text.slice(0, 180),
      })),
    ];

    return {
      hypothesis: raw.hypothesis,
      confidence: status === "supported" ? Math.min(raw.confidence, 0.9) : Math.min(raw.confidence, 0.72),
      evidence: raw.evidence,
      status,
      assessmentCount,
      narrativeCount,
      contradictingCount,
      evidenceRefs: [
        makeEvidenceRef(
          "therapy_plan",
          input.therapyPlanId,
          input.therapyPlanCreatedAt,
          raw.evidence,
        ),
        ...matchingAssessmentRefs,
        ...matchingNarrativeRefs,
      ],
      contradictionRefs,
    };
  });
}

function buildHypothesisCandidates(input: {
  rawHypotheses: Array<{ hypothesis: string; confidence: number; evidence: string }>;
  assessments: AssessmentRow[];
  narrativeSources: NarrativeSource[];
  therapyPlanId: string;
  therapyPlanCreatedAt: Date;
}): { supported: UnderstandingCandidate[]; suppressedCount: number } {
  const evaluations = evaluateHypotheses(input);
  const supported: UnderstandingCandidate[] = [];
  for (const evaluation of evaluations) {
    if (evaluation.status !== "supported") continue;
    supported.push(
      makeCandidate({
        category: "hypothesis",
        title: evaluation.hypothesis,
        detail: evaluation.evidence,
        provenance: "hypothesized",
        confidence: evaluation.confidence,
        sourceRefs: evaluation.evidenceRefs,
        supportingEvidenceCount: evaluation.assessmentCount + evaluation.narrativeCount + 1,
        contradictingEvidenceCount: evaluation.contradictingCount,
      }),
    );
  }

  return {
    supported,
    suppressedCount: evaluations.filter((evaluation) => evaluation.status !== "supported").length,
  };
}

export async function getLatestPatientUnderstanding(userId: string): Promise<{
  snapshot: PatientUnderstandingSnapshotDto;
  items: PatientUnderstandingItemDto[];
} | null> {
  const [snapshotRow] = await db
    .select()
    .from(patientUnderstandingSnapshots)
    .where(eq(patientUnderstandingSnapshots.userId, userId))
    .orderBy(desc(patientUnderstandingSnapshots.createdAt))
    .limit(1);

  if (!snapshotRow) return null;

  const itemRows = await db
    .select()
    .from(patientUnderstandingItems)
    .where(eq(patientUnderstandingItems.snapshotId, snapshotRow.id))
    .orderBy(desc(patientUnderstandingItems.confidence), desc(patientUnderstandingItems.createdAt));

  return {
    snapshot: {
      id: snapshotRow.id,
      userId: snapshotRow.userId,
      dataConfidence: snapshotRow.dataConfidence,
      summary: snapshotRow.summary as PatientUnderstandingSnapshotDto["summary"],
      createdAt: snapshotRow.createdAt.toISOString(),
    },
    items: itemRows.map((row) => ({
      id: row.id,
      snapshotId: row.snapshotId,
      userId: row.userId,
      category: row.category,
      title: row.title,
      detail: row.detail,
      provenance: row.provenance,
      confidence: row.confidence,
      supportingEvidenceCount: row.supportingEvidenceCount,
      contradictingEvidenceCount: row.contradictingEvidenceCount,
      status: row.status,
      sourceRefs: row.sourceRefs as EvidenceRef[],
      lastReviewedAt: row.lastReviewedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function generateAndPersistPatientUnderstanding(
  userId: string,
  reason: GenerationReason = "manual",
): Promise<{
  snapshot: PatientUnderstandingSnapshotDto;
  items: PatientUnderstandingItemDto[];
  suppressedHypotheses: number;
}> {
  const [
    formulationRows,
    therapyPlanRows,
    assessmentRows,
    memoryRows,
    reflectionRows,
    openQuestionRows,
    sessionRows,
    summaryRows,
  ] = await Promise.all([
    db
      .select({
        id: userFormulations.id,
        snapshot: userFormulations.snapshot,
        dataConfidence: userFormulations.dataConfidence,
        createdAt: userFormulations.createdAt,
      })
      .from(userFormulations)
      .where(eq(userFormulations.userId, userId))
      .orderBy(desc(userFormulations.createdAt))
      .limit(1),

    db
      .select({
        id: therapyPlans.id,
        plan: therapyPlans.plan,
        createdAt: therapyPlans.createdAt,
      })
      .from(therapyPlans)
      .where(eq(therapyPlans.userId, userId))
      .orderBy(desc(therapyPlans.createdAt))
      .limit(1),

    db
      .select({
        id: assessments.id,
        type: assessments.type,
        totalScore: assessments.totalScore,
        severity: assessments.severity,
        answers: assessments.answers,
        createdAt: assessments.createdAt,
      })
      .from(assessments)
      .where(eq(assessments.userId, userId))
      .orderBy(desc(assessments.createdAt)),

    db
      .select({
        id: memories.id,
        content: memories.content,
        memoryType: memories.memoryType,
        confidence: memories.confidence,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(and(eq(memories.userId, userId), isNull(memories.supersededBy)))
      .orderBy(desc(memories.confidence))
      .limit(50),

    db
      .select({
        id: reflections.id,
        text: reflections.text,
        status: reflections.status,
        submittedAt: reflections.submittedAt,
        integratedAt: reflections.integratedAt,
        questionId: reflections.questionId,
      })
      .from(reflections)
      .where(eq(reflections.userId, userId))
      .orderBy(desc(reflections.createdAt))
      .limit(30),

    db
      .select({
        id: reflectiveQuestions.id,
        question: reflectiveQuestions.question,
        linkedTo: reflectiveQuestions.linkedTo,
        createdAt: reflectiveQuestions.createdAt,
      })
      .from(reflectiveQuestions)
      .where(
        and(
          eq(reflectiveQuestions.userId, userId),
          eq(reflectiveQuestions.status, "open"),
        ),
      )
      .orderBy(desc(reflectiveQuestions.createdAt))
      .limit(10),

    db
      .select({
        id: sessions.id,
        status: sessions.status,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.startedAt))
      .limit(30),

    db
      .select({
        id: sessionSummaries.id,
        content: sessionSummaries.content,
        createdAt: sessionSummaries.createdAt,
      })
      .from(sessionSummaries)
      .where(and(eq(sessionSummaries.userId, userId), eq(sessionSummaries.level, "session")))
      .orderBy(desc(sessionSummaries.createdAt))
      .limit(12),
  ]);

  const [formulationRow] = formulationRows;
  const [therapyPlanRow] = therapyPlanRows;
  const parsedFormulation = formulationRow
    ? JourneyFormulationSchema.safeParse({
        ...(formulationRow.snapshot as Record<string, unknown>),
        cachedAt: formulationRow.createdAt.toISOString(),
      })
    : null;
  const formulation = parsedFormulation?.success ? parsedFormulation.data : null;

  const parsedTherapyPlan = therapyPlanRow
    ? TherapyPlanSchema.safeParse(therapyPlanRow.plan)
    : null;
  const therapyPlan = parsedTherapyPlan?.success ? parsedTherapyPlan.data : null;

  const narrativeSources: NarrativeSource[] = [
    ...summaryRows.map((row) => ({
      sourceType: "session_summary" as const,
      sourceId: row.id,
      createdAt: row.createdAt.toISOString(),
      text: row.content,
    })),
    ...memoryRows.map((row) => ({
      sourceType: "memory" as const,
      sourceId: row.id,
      createdAt: row.createdAt.toISOString(),
      text: row.content,
    })),
    ...reflectionRows.map((row) => ({
      sourceType: "reflection" as const,
      sourceId: row.id,
      createdAt: iso(row.integratedAt ?? row.submittedAt) ?? new Date().toISOString(),
      text: row.text,
    })),
  ];

  const candidates: UnderstandingCandidate[] = [];

  if (formulationRow && formulation) {
    const formulationRef = makeEvidenceRef(
      "formulation",
      formulationRow.id,
      formulationRow.createdAt,
      formulation.formulation.presentingTheme || formulation.userReflection.summary,
    );

    if (formulation.formulation.presentingTheme) {
      candidates.push(
        makeCandidate({
          category: "presenting_concern",
          title: formulation.formulation.presentingTheme,
          detail: formulation.userReflection.summary,
          provenance: "inferred",
          confidence: 0.82,
          sourceRefs: [formulationRef],
        }),
      );
    }

    for (const state of formulation.activeStates.slice(0, 5)) {
      candidates.push(
        makeCandidate({
          category: "symptom",
          title: state.label,
          detail: state.signal,
          provenance: "inferred",
          confidence: Math.min(Math.max(state.confidence, 0.55), 0.92),
          sourceRefs: [formulationRef],
        }),
      );
    }

    for (const activator of formulation.formulation.recentActivators.slice(0, 4)) {
      candidates.push(
        makeCandidate({
          category: "trigger",
          title: activator.content,
          detail: activator.content,
          provenance: "inferred",
          confidence: Math.min(Math.max(activator.confidence, 0.55), 0.9),
          sourceRefs: [formulationRef],
        }),
      );
    }

    for (const cycle of formulation.formulation.perpetuatingCycles.slice(0, 4)) {
      candidates.push(
        makeCandidate({
          category: "perpetuating_pattern",
          title: cycle.pattern,
          detail: cycle.mechanism,
          provenance: "inferred",
          confidence: 0.74,
          sourceRefs: [formulationRef],
        }),
      );
    }

    for (const strength of formulation.formulation.protectiveStrengths.slice(0, 5)) {
      candidates.push(
        makeCandidate({
          category: "protective_factor",
          title: strength.content,
          detail: `Protective strength surfaced from ${strength.sourceType}.`,
          provenance: "inferred",
          confidence: 0.76,
          sourceRefs: [formulationRef],
        }),
      );
    }

    const copingSteps =
      (
        formulation as {
          copingSteps?: Array<{ step: string; rationale: string; domain: string }>;
        }
      ).copingSteps ?? [];
    for (const step of copingSteps.slice(0, 4)) {
      candidates.push(
        makeCandidate({
          category: "coping_strategy",
          title: step.step,
          detail: step.rationale,
          provenance: "inferred",
          confidence: 0.72,
          sourceRefs: [formulationRef],
        }),
      );
    }
  }

  for (const memory of memoryRows) {
    if (memory.memoryType === "recurring_trigger") {
      candidates.push(
        makeCandidate({
          category: "trigger",
          title: memory.content,
          detail: "Recurring trigger extracted from conversation history.",
          provenance: "self_reported",
          confidence: Math.min(memory.confidence, 0.9),
          sourceRefs: [makeEvidenceRef("memory", memory.id, memory.createdAt, memory.content)],
        }),
      );
    }

    if (memory.memoryType === "coping_strategy") {
      candidates.push(
        makeCandidate({
          category: "coping_strategy",
          title: memory.content,
          detail: "User-shared coping strategy remembered across sessions.",
          provenance: "self_reported",
          confidence: Math.min(memory.confidence, 0.9),
          sourceRefs: [makeEvidenceRef("memory", memory.id, memory.createdAt, memory.content)],
        }),
      );
    }

    if (memory.memoryType === "safety_critical") {
      candidates.push(
        makeCandidate({
          category: "risk_factor",
          title: memory.content,
          detail: "Safety-critical memory requiring clinician attention.",
          provenance: "self_reported",
          confidence: Math.min(memory.confidence, 0.98),
          sourceRefs: [makeEvidenceRef("memory", memory.id, memory.createdAt, memory.content)],
        }),
      );
    }
  }

  const functioningAssessments = assessmentRows.filter((row) => row.type === "functioning");
  for (const row of functioningAssessments.slice(0, 2)) {
    candidates.push(
      makeCandidate({
        category: "functional_impact",
        title: `Functioning screening: ${row.severity.replaceAll("_", " ")}`,
        detail: `Latest functioning screener suggests ${row.severity.replaceAll("_", " ")} impact on daily life.`,
        provenance: "observed",
        confidence: 0.83,
        sourceRefs: [makeEvidenceRef("assessment", row.id, row.createdAt, row.type)],
      }),
    );
  }

  const phqRiskRows = assessmentRows.filter((row) => {
    if (row.type !== "phq9" || !Array.isArray(row.answers)) return false;
    const answer = row.answers[8];
    return typeof answer === "number" && answer > 0;
  });
  for (const row of phqRiskRows.slice(0, 1)) {
    candidates.push(
      makeCandidate({
        category: "risk_factor",
        title: "PHQ-9 item 9 elevation",
        detail: "Recent PHQ-9 responses indicate passive or active self-harm thoughts were endorsed.",
        provenance: "observed",
        confidence: 0.9,
        sourceRefs: [makeEvidenceRef("assessment", row.id, row.createdAt, row.type)],
      }),
    );
  }

  for (const reflection of reflectionRows.filter((row) => row.status === "integrated").slice(0, 5)) {
    candidates.push(
      makeCandidate({
        category: "presenting_concern",
        title: "Integrated reflection",
        detail: reflection.text.slice(0, 220),
        provenance: "self_reported",
        confidence: 0.68,
        sourceRefs: [
          makeEvidenceRef(
            "reflection",
            reflection.id,
            reflection.integratedAt ?? reflection.submittedAt,
            reflection.text.slice(0, 180),
          ),
        ],
      }),
    );

    for (const extracted of extractNarrativeCandidatesFromReflection({
      text: reflection.text,
      reflectionId: reflection.id,
      createdAt: reflection.integratedAt ?? reflection.submittedAt,
    })) {
      candidates.push(
        makeCandidate({
          category: extracted.category,
          title: extracted.title,
          detail: extracted.detail,
          provenance: extracted.provenance,
          confidence: extracted.confidence,
          sourceRefs: extracted.sourceRefs,
        }),
      );
    }
  }

  for (const question of openQuestionRows.slice(0, 5)) {
    candidates.push(
      makeCandidate({
        category: "unanswered_question",
        title: question.question,
        detail: question.linkedTo ? `Linked to ${question.linkedTo}.` : "Open reflective question.",
        provenance: "inferred",
        confidence: 0.62,
        sourceRefs: [
          makeEvidenceRef(
            "reflective_question",
            question.id,
            question.createdAt,
            question.question,
          ),
        ],
      }),
    );
  }

  if (therapyPlanRow && therapyPlan) {
    for (const area of therapyPlan.unexplored_areas.slice(0, 4)) {
      candidates.push(
        makeCandidate({
          category: "unanswered_question",
          title: area.topic,
          detail: area.notes,
          provenance: "inferred",
          confidence: area.priority === "high" ? 0.72 : 0.64,
          sourceRefs: [
            makeEvidenceRef("therapy_plan", therapyPlanRow.id, therapyPlanRow.createdAt, area.notes),
          ],
        }),
      );
    }
  }

  let suppressedHypotheses = 0;
  if (therapyPlanRow && therapyPlan) {
    const hypothesisResult = buildHypothesisCandidates({
      rawHypotheses: therapyPlan.working_hypotheses,
      assessments: assessmentRows,
      narrativeSources,
      therapyPlanId: therapyPlanRow.id,
      therapyPlanCreatedAt: therapyPlanRow.createdAt,
    });
    candidates.push(...hypothesisResult.supported);
    suppressedHypotheses = hypothesisResult.suppressedCount;
  }

  const crisisSessions = sessionRows.filter((row) => row.status === "crisis_escalated");
  if (crisisSessions.length > 0) {
    candidates.push(
      makeCandidate({
        category: "risk_factor",
        title: `${crisisSessions.length} crisis-escalated session${crisisSessions.length === 1 ? "" : "s"}`,
        detail: "At least one session required hard-coded crisis escalation and should be reviewed by a human clinician.",
        provenance: "observed",
        confidence: 0.95,
        sourceRefs: crisisSessions.slice(0, 3).map((row) =>
          makeEvidenceRef("session", row.id, row.startedAt, row.status),
        ),
        supportingEvidenceCount: crisisSessions.length,
      }),
    );
  }

  const dedupedCandidates = dedupeCandidates(candidates);
  const dataConfidence: SnapshotDataConfidence =
    formulation?.dataConfidence ?? (dedupedCandidates.length < 6 ? "sparse" : dedupedCandidates.length < 14 ? "emerging" : "established");

  const summary = {
    presentingTheme: formulation?.formulation.presentingTheme || null,
    totalItems: dedupedCandidates.length,
    reflectionsIntegrated: reflectionRows.filter((row) => row.status === "integrated").length,
    generatedReason: reason,
  } as const;

  const [snapshotRow] = await db
    .insert(patientUnderstandingSnapshots)
    .values({
      userId,
      dataConfidence,
      summary,
      generationReason: reason,
    })
    .returning();

  const insertedItems = dedupedCandidates.length
    ? await db
        .insert(patientUnderstandingItems)
        .values(
          dedupedCandidates.map((candidate) => ({
            snapshotId: snapshotRow!.id,
            userId,
            category: candidate.category,
            title: candidate.title,
            detail: candidate.detail,
            provenance: candidate.provenance,
            confidence: candidate.confidence,
            supportingEvidenceCount: candidate.supportingEvidenceCount,
            contradictingEvidenceCount: candidate.contradictingEvidenceCount,
            status: candidate.status,
            sourceRefs: candidate.sourceRefs,
            lastReviewedAt: new Date(candidate.lastReviewedAt),
          })),
        )
        .returning()
    : [];

  return {
    snapshot: {
      id: snapshotRow!.id,
      userId: snapshotRow!.userId,
      dataConfidence: snapshotRow!.dataConfidence,
      summary: snapshotRow!.summary as PatientUnderstandingSnapshotDto["summary"],
      createdAt: snapshotRow!.createdAt.toISOString(),
    },
    items: insertedItems.map((row) => ({
      id: row.id,
      snapshotId: row.snapshotId,
      userId: row.userId,
      category: row.category,
      title: row.title,
      detail: row.detail,
      provenance: row.provenance,
      confidence: row.confidence,
      supportingEvidenceCount: row.supportingEvidenceCount,
      contradictingEvidenceCount: row.contradictingEvidenceCount,
      status: row.status,
      sourceRefs: row.sourceRefs as EvidenceRef[],
      lastReviewedAt: row.lastReviewedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    suppressedHypotheses,
  };
}

export const patientUnderstandingInternals = {
  buildHypothesisCandidates,
  countAssessmentCorroborations,
  countAssessmentContradictions,
  countNarrativeCorroborations,
  computeAssessmentTrend,
  evaluateHypotheses,
  HYPOTHESIS_THRESHOLD_TEXT,
};
