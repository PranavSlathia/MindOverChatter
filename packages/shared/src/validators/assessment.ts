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
};

/**
 * Client submission for a completed assessment.
 * totalScore and severity are computed SERVER-SIDE — never trusted from client.
 * Answer count is validated against the expected question count per type.
 */
export const SubmitAssessmentSchema = z
  .object({
    sessionId: z.string().uuid(),
    type: AssessmentTypeSchema,
    answers: z.array(z.number().int().min(0).max(3)).min(1),
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
  });

export type AssessmentType = z.infer<typeof AssessmentTypeSchema>;
export type AssessmentSeverity = z.infer<typeof AssessmentSeveritySchema>;
export type SubmitAssessment = z.infer<typeof SubmitAssessmentSchema>;
