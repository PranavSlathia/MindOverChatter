import { z } from "zod";

export const SessionStatusSchema = z.enum([
  "active",
  "completed",
  "crisis_escalated",
]);

export const CreateSessionSchema = z.object({});

export const EndSessionSchema = z.object({
  reason: z.string().optional(),
});

// Query param schemas use z.coerce to parse string -> number from URL params
export const SessionHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const SessionMessagesQuerySchema = z.object({
  sessionId: z.string().uuid(),
});

/** @deprecated Use SessionHistoryQuerySchema (coerces query-param strings) */
export const SessionHistorySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type CreateSession = z.infer<typeof CreateSessionSchema>;
export type EndSession = z.infer<typeof EndSessionSchema>;
export type SessionHistory = z.infer<typeof SessionHistoryQuerySchema>;
