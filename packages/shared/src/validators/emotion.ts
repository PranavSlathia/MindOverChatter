import { z } from "zod";

export const EmotionChannelSchema = z.enum(["text", "voice", "face"]);

export const EmotionReadingSchema = z.object({
  sessionId: z.string().uuid(),
  messageId: z.string().uuid().optional(), // Nullable — face readings may not be tied to a message
  channel: EmotionChannelSchema,
  emotionLabel: z.string().min(1),
  confidence: z.number().min(0).max(1),
  signalWeight: z.number().min(0).max(1), // text=0.8, voice=0.5, face=0.3
  rawScores: z.record(z.string(), z.number()).optional(),
  prosodyData: z
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

export type EmotionChannel = z.infer<typeof EmotionChannelSchema>;
export type EmotionReading = z.infer<typeof EmotionReadingSchema>;
