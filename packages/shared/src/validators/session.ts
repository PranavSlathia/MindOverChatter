import { z } from "zod";

export const SessionStatusSchema = z.enum([
  "active",
  "completed",
  "crisis_escalated",
]);

export const CreateSessionSchema = z.object({});

export const SessionHistorySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type CreateSession = z.infer<typeof CreateSessionSchema>;
export type SessionHistory = z.infer<typeof SessionHistorySchema>;
