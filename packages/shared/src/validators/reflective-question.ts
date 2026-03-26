import { z } from "zod";

// ── Status Enums ────────────────────────────────────────────────

export const QuestionStatusSchema = z.enum([
  "open",
  "answered",
  "deferred",
  "retired",
]);

export const ReflectionStatusSchema = z.enum([
  "draft",
  "submitted",
  "reviewed",
  "integrated",
]);

// ── Full row shape for API responses ────────────────────────────

export const ReflectiveQuestionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  question: z.string(),
  linkedTo: z.string().nullable(),
  sourceFormulationId: z.string().uuid().nullable(),
  sourceSessionId: z.string().uuid().nullable(),
  status: QuestionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  // NOTE: rationale is intentionally excluded — internal only, NEVER sent to client
});

export const ReflectionSchema = z.object({
  id: z.string().uuid(),
  questionId: z.string().uuid(),
  userId: z.string().uuid(),
  text: z.string(),
  status: ReflectionStatusSchema,
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  integratedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ReflectiveQuestionCardSchema = z.object({
  id: z.string().uuid(),
  question: z.string(),
  linkedTo: z.string().nullable(),
  status: QuestionStatusSchema,
  reflectionText: z.string().nullable(),
  reflectionStatus: ReflectionStatusSchema.nullable(),
  answeredAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ReflectiveQuestionListResponseSchema = z.object({
  questions: z.array(ReflectiveQuestionCardSchema),
});

export const SaveReflectionResponseSchema = z.object({
  question: ReflectiveQuestionCardSchema,
});

// ── Save/update a reflection ────────────────────────────────────

export const SaveReflectionSchema = z.object({
  text: z.string().min(1).max(5000),
  submit: z.boolean().optional().default(false),
});

export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;
export type ReflectionStatus = z.infer<typeof ReflectionStatusSchema>;
export type ReflectiveQuestion = z.infer<typeof ReflectiveQuestionSchema>;
export type Reflection = z.infer<typeof ReflectionSchema>;
export type ReflectiveQuestionCard = z.infer<typeof ReflectiveQuestionCardSchema>;
export type SaveReflection = z.infer<typeof SaveReflectionSchema>;
