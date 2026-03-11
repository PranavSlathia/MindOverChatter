import { z } from "zod";

export const MoodSourceSchema = z.enum(["user_input", "ai_inferred", "assessment"]);

export const CreateMoodLogSchema = z.object({
  sessionId: z.string().uuid().optional(),
  valence: z.number().min(-1).max(1), // -1 to +1 (pleasant <-> unpleasant)
  arousal: z.number().min(0).max(1), // 0 to 1 (deactivated <-> activated)
  source: MoodSourceSchema,
});

export type MoodSource = z.infer<typeof MoodSourceSchema>;
export type CreateMoodLog = z.infer<typeof CreateMoodLogSchema>;
