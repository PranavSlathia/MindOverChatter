import { z } from "zod";

export const EvidenceSourceTypeSchema = z.enum([
  "assessment",
  "reflection",
  "reflective_question",
  "formulation",
  "therapy_plan",
  "session_summary",
  "memory",
  "mood_log",
  "session",
]);

export const UnderstandingItemCategorySchema = z.enum([
  "presenting_concern",
  "symptom",
  "trigger",
  "perpetuating_pattern",
  "protective_factor",
  "coping_strategy",
  "functional_impact",
  "risk_factor",
  "hypothesis",
  "unanswered_question",
]);

export const UnderstandingItemProvenanceSchema = z.enum([
  "observed",
  "self_reported",
  "inferred",
  "hypothesized",
]);

export const UnderstandingItemStatusSchema = z.enum(["active", "superseded"]);

export const EvidenceRefSchema = z.object({
  sourceType: EvidenceSourceTypeSchema,
  sourceId: z.string(),
  createdAt: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
});

export const PatientUnderstandingItemSchema = z.object({
  id: z.string().uuid(),
  snapshotId: z.string().uuid(),
  userId: z.string().uuid(),
  category: UnderstandingItemCategorySchema,
  title: z.string(),
  detail: z.string(),
  provenance: UnderstandingItemProvenanceSchema,
  confidence: z.number().min(0).max(1),
  supportingEvidenceCount: z.number().int().min(0),
  contradictingEvidenceCount: z.number().int().min(0),
  status: UnderstandingItemStatusSchema,
  sourceRefs: z.array(EvidenceRefSchema),
  lastReviewedAt: z.string(),
  createdAt: z.string(),
});

export const PatientUnderstandingSnapshotSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  dataConfidence: z.enum(["sparse", "emerging", "established"]),
  summary: z.object({
    presentingTheme: z.string().nullable(),
    totalItems: z.number().int().min(0),
    reflectionsIntegrated: z.number().int().min(0),
    generatedReason: z.enum(["session_end", "reflection_submit", "manual"]),
  }),
  createdAt: z.string(),
});

export const ClinicalReportEntrySchema = z.object({
  label: z.string(),
  detail: z.string(),
  confidence: z.number().min(0).max(1),
  provenance: UnderstandingItemProvenanceSchema,
  evidenceRefs: z.array(EvidenceRefSchema),
});

export const AssessmentSummaryEntrySchema = z.object({
  type: z.string(),
  latestSeverity: z.string(),
  latestScore: z.number().nullable(),
  latestAt: z.string(),
});

export const AssessmentTrendEntrySchema = z.object({
  type: z.string(),
  direction: z.enum(["improving", "stable", "worsening"]),
});

export const SymptomTimelineEntrySchema = z.object({
  date: z.string(),
  label: z.string(),
  sourceType: EvidenceSourceTypeSchema,
  sourceId: z.string(),
  severity: z.string().nullable(),
});

export const ClinicalHypothesisSchema = z.object({
  hypothesis: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceSummary: z.string(),
  evidenceRefs: z.array(EvidenceRefSchema),
  corroboratedBy: z.object({
    assessmentCount: z.number().int().min(0),
    narrativeCount: z.number().int().min(0),
    contradictingCount: z.number().int().min(0),
  }),
  status: z.enum(["supported", "insufficient_evidence"]),
});

export const ClinicalTriageSchema = z.object({
  framework: z.literal("mhGAP-inspired"),
  priority: z.enum(["routine", "priority", "urgent", "emergent"]),
  reasons: z.array(z.string()),
  evidenceRefs: z.array(EvidenceRefSchema),
});

export const ClinicalClassificationSchema = z.object({
  system: z.literal("ICD-11"),
  code: z.string().nullable(),
  label: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  evidenceRefs: z.array(EvidenceRefSchema),
});

export const ClinicalContradictionSchema = z.object({
  label: z.string(),
  detail: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  evidenceRefs: z.array(EvidenceRefSchema),
});

export const ClinicalHandoffReportSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  sourceSnapshotId: z.string().uuid(),
  createdAt: z.string(),
  dataConfidence: z.enum(["sparse", "emerging", "established"]),
  summary: z.object({
    generatedFor: z.literal("clinician_handoff"),
    narrative: z.string(),
    caution: z.string(),
  }),
  presentingConcerns: z.array(ClinicalReportEntrySchema),
  symptomTimeline: z.array(SymptomTimelineEntrySchema),
  assessmentSummary: z.object({
    latest: z.array(AssessmentSummaryEntrySchema),
    trends: z.array(AssessmentTrendEntrySchema),
  }),
  functionalImpact: z.array(ClinicalReportEntrySchema),
  triggers: z.array(ClinicalReportEntrySchema),
  perpetuatingPatterns: z.array(ClinicalReportEntrySchema),
  protectiveFactors: z.array(ClinicalReportEntrySchema),
  copingStrategies: z.array(ClinicalReportEntrySchema),
  riskHistory: z.object({
    crisisSessions: z.number().int().min(0),
    safetyFlags: z.array(ClinicalReportEntrySchema),
    notes: z.array(z.string()),
  }),
  clinicalSignals: z.object({
    triage: ClinicalTriageSchema,
    suspectedClassifications: z.array(ClinicalClassificationSchema),
    contradictions: z.array(ClinicalContradictionSchema),
  }),
  openHypotheses: z.array(ClinicalHypothesisSchema),
  unansweredQuestions: z.array(ClinicalReportEntrySchema),
  evidenceCoverage: z.object({
    understandingItems: z.number().int().min(0),
    reflectionsIntegrated: z.number().int().min(0),
    unsupportedHypothesesSuppressed: z.number().int().min(0),
    hypothesisThreshold: z.string(),
    insufficientEvidenceSections: z.array(z.string()),
  }),
});

export const ClinicalHandoffReportResponseSchema = z.object({
  report: ClinicalHandoffReportSchema,
});

export type EvidenceSourceType = z.infer<typeof EvidenceSourceTypeSchema>;
export type UnderstandingItemCategory = z.infer<typeof UnderstandingItemCategorySchema>;
export type UnderstandingItemProvenance = z.infer<typeof UnderstandingItemProvenanceSchema>;
export type UnderstandingItemStatus = z.infer<typeof UnderstandingItemStatusSchema>;
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type PatientUnderstandingItem = z.infer<typeof PatientUnderstandingItemSchema>;
export type PatientUnderstandingSnapshot = z.infer<typeof PatientUnderstandingSnapshotSchema>;
export type ClinicalReportEntry = z.infer<typeof ClinicalReportEntrySchema>;
export type AssessmentSummaryEntry = z.infer<typeof AssessmentSummaryEntrySchema>;
export type AssessmentTrendEntry = z.infer<typeof AssessmentTrendEntrySchema>;
export type SymptomTimelineEntry = z.infer<typeof SymptomTimelineEntrySchema>;
export type ClinicalHypothesis = z.infer<typeof ClinicalHypothesisSchema>;
export type ClinicalTriage = z.infer<typeof ClinicalTriageSchema>;
export type ClinicalClassification = z.infer<typeof ClinicalClassificationSchema>;
export type ClinicalContradiction = z.infer<typeof ClinicalContradictionSchema>;
export type ClinicalHandoffReport = z.infer<typeof ClinicalHandoffReportSchema>;
