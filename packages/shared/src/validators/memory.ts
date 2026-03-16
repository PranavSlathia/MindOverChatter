import { z } from "zod";

export const MemoryTypeSchema = z.enum([
  "profile_fact",
  "relationship",
  "goal",
  "coping_strategy",
  "recurring_trigger",
  "life_event",
  "symptom_episode",
  "unresolved_thread",
  "safety_critical",
  "win",
  "session_summary",
  "formative_experience",
]);

export const SearchMemoriesSchema = z.object({
  query: z.string().min(1),
  memoryType: MemoryTypeSchema.optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const MemorySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  content: z.string(),
  memoryType: MemoryTypeSchema,
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  sourceSessionId: z.string().uuid().nullable(),
  sourceMessageId: z.string().uuid().nullable(),
  lastConfirmedAt: z.string().datetime().nullable(),
  supersededBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Memory Service Response Validators ────────────────────────

export const MemorySearchResultSchema = z.object({
  id: z.string(),
  content: z.string(),
  memoryType: MemoryTypeSchema,
  confidence: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  createdAt: z.string(),
});

export const MemoryAddedResultSchema = z.object({
  id: z.string(),
  supersededId: z.string().nullable(),
  content: z.string(),
  memoryType: MemoryTypeSchema,
  confidence: z.number().min(0).max(1),
  event: z.enum(["ADD", "UPDATE", "DELETE", "NONE"]),
});

// ── Inferred Types ──────────────────────────────────────────────

export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export type SearchMemories = z.infer<typeof SearchMemoriesSchema>;
export type Memory = z.infer<typeof MemorySchema>;
export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;
export type MemoryAddedResult = z.infer<typeof MemoryAddedResultSchema>;
