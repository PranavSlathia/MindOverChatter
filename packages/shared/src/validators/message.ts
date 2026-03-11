import { z } from "zod";

export const SendMessageSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1),
  voiceEmotion: z
    .object({
      label: z.enum([
        "happy",
        "sad",
        "angry",
        "neutral",
        "fearful",
        "disgusted",
        "surprised",
      ]),
      confidence: z.number().min(0).max(1),
    })
    .optional(),
  facialEmotion: z.record(z.string(), z.number()).optional(),
  prosody: z
    .object({
      pitch_mean: z.number(),
      pitch_std: z.number(),
      energy_mean: z.number(),
      energy_std: z.number().optional(),
      speaking_rate: z.number(),
      mfcc_summary: z.array(z.number()).optional(),
    })
    .optional(),
});

export const MessageResponseSchema = z.object({
  messageId: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export type SendMessage = z.infer<typeof SendMessageSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
