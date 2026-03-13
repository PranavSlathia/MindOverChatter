import { z } from "zod";

export const MemoryBlockLabelSchema = z.enum([
  "user/overview",
  "user/goals",
  "user/triggers",
  "user/coping_strategies",
  "user/relationships",
  "companion/therapeutic_calibration",
]);

export type MemoryBlockLabel = z.infer<typeof MemoryBlockLabelSchema>;

export const MemoryBlockSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  label: MemoryBlockLabelSchema,
  content: z.string(),
  charLimit: z.number().int().positive(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
  sourceSessionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type MemoryBlock = z.infer<typeof MemoryBlockSchema>;

export const UpsertMemoryBlockSchema = z.object({
  label: MemoryBlockLabelSchema,
  content: z.string(),
  charLimit: z.number().int().positive().optional(),
  updatedBy: z.string().optional(),
  sourceSessionId: z.string().uuid().nullable().optional(),
});

export type UpsertMemoryBlock = z.infer<typeof UpsertMemoryBlockSchema>;
