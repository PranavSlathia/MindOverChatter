import { z } from "zod";

export const AssessmentTypeSchema = z.enum(["phq9", "gad7"]);

export const AssessmentSeveritySchema = z.enum([
  "minimal",
  "mild",
  "moderate",
  "moderately_severe",
  "severe",
]);

export const CreateAssessmentSchema = z.object({
  sessionId: z.string().uuid().optional(),
  type: AssessmentTypeSchema,
  answers: z.array(z.number().int().min(0).max(3)), // 0-3 per question
  totalScore: z.number().int().min(0), // PHQ-9: 0-27, GAD-7: 0-21
  severity: AssessmentSeveritySchema,
});

export type AssessmentType = z.infer<typeof AssessmentTypeSchema>;
export type AssessmentSeverity = z.infer<typeof AssessmentSeveritySchema>;
export type CreateAssessment = z.infer<typeof CreateAssessmentSchema>;
