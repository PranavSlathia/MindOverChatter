import { z } from "zod";

export const CreateSessionSchema = z.object({});

export const SendMessageSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1),
  voiceEmotion: z
    .object({
      label: z.enum(["happy", "sad", "angry", "neutral"]),
      confidence: z.number().min(0).max(1),
    })
    .optional(),
  facialEmotion: z.record(z.string(), z.number()).optional(),
  prosody: z
    .object({
      pitch_mean: z.number(),
      pitch_std: z.number(),
      energy_mean: z.number(),
      speaking_rate: z.number(),
    })
    .optional(),
});

export const SessionHistorySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type CreateSession = z.infer<typeof CreateSessionSchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type SessionHistory = z.infer<typeof SessionHistorySchema>;
