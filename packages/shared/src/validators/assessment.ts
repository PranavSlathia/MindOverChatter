import { z } from "zod";

export const AssessmentTypeSchema = z.enum([
  "phq9",
  "gad7",
  "iss_sleep",
  "panic_screener",
  "trauma_gating",
  "functioning",
  "substance_use",
  "relationship",
  // Wave 1
  "dass21",
  "rosenberg_se",
  "who5",
  "phq4",
  "pc_ptsd5",
  // Wave 2
  "ipip_big5",
  "ucla_loneliness",
  "copenhagen_burnout",
  "ace_score",
  "isi",
  "harrower_inkblot",
  // Wave 3
  "pss",
  "mspss",
  "ecr",
  "pcl5",
  "ace_iq",
]);

export const AssessmentSeveritySchema = z.enum([
  "minimal",
  "mild",
  "moderate",
  "moderately_severe",
  "severe",
]);

/** Expected question counts per assessment type. */
export const ASSESSMENT_QUESTION_COUNTS: Record<z.infer<typeof AssessmentTypeSchema>, number> = {
  phq9: 9,
  gad7: 7,
  iss_sleep: 7,
  panic_screener: 7,
  trauma_gating: 4,
  functioning: 5,
  substance_use: 4,
  relationship: 5,
  // Wave 1
  dass21: 21,
  rosenberg_se: 10,
  who5: 5,
  phq4: 4,
  pc_ptsd5: 5,
  // Wave 2
  ipip_big5: 50,
  ucla_loneliness: 20,
  copenhagen_burnout: 19,
  ace_score: 10,
  isi: 7,
  harrower_inkblot: 10,
  // Wave 3
  pss: 10,
  mspss: 12,
  ecr: 36,
  pcl5: 20,
  ace_iq: 13,
};

/** Max answer value per assessment type (most are 0-3, but some differ). */
const MAX_ANSWER_VALUES: Partial<Record<z.infer<typeof AssessmentTypeSchema>, number>> = {
  who5: 5,
  ipip_big5: 5,
  ucla_loneliness: 4,
  copenhagen_burnout: 4,
  isi: 4,
  pc_ptsd5: 1,
  ace_score: 1,
  pss: 4,
  mspss: 7,
  ecr: 7,
  pcl5: 4,
  ace_iq: 1,
};

/** Min answer value per assessment type (most start at 0). */
const MIN_ANSWER_VALUES: Partial<Record<z.infer<typeof AssessmentTypeSchema>, number>> = {
  ipip_big5: 1,
  ucla_loneliness: 1,
  mspss: 1,
  ecr: 1,
};

/**
 * Client submission for a completed assessment.
 * totalScore and severity are computed SERVER-SIDE — never trusted from client.
 * Answer count is validated against the expected question count per type.
 * sessionId is optional — standalone assessments don't require an active session.
 */
export const SubmitAssessmentSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    type: AssessmentTypeSchema,
    answers: z.array(z.number().int().min(0).max(7)).min(1),
    parentAssessmentId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    const expected = ASSESSMENT_QUESTION_COUNTS[data.type];
    if (data.answers.length !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${data.type} requires exactly ${String(expected)} answers, got ${String(data.answers.length)}`,
        path: ["answers"],
      });
    }

    // Validate answer range per type
    const maxVal = MAX_ANSWER_VALUES[data.type] ?? 3;
    const minVal = MIN_ANSWER_VALUES[data.type] ?? 0;
    for (let i = 0; i < data.answers.length; i++) {
      if (data.answers[i]! < minVal || data.answers[i]! > maxVal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${data.type} answer values must be ${String(minVal)}-${String(maxVal)}, got ${String(data.answers[i])} at index ${String(i)}`,
          path: ["answers", i],
        });
      }
    }
  });

export type AssessmentType = z.infer<typeof AssessmentTypeSchema>;
export type AssessmentSeverity = z.infer<typeof AssessmentSeveritySchema>;
export type SubmitAssessment = z.infer<typeof SubmitAssessmentSchema>;
