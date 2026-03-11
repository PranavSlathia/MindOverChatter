import { z } from "zod";

// ── Update User Profile ──────────────────────────────────────────
export const UpdateUserProfileSchema = z.object({
  displayName: z.string().max(100).nullable().optional(),
  coreTraits: z.array(z.string()).optional(),
  patterns: z.array(z.string()).optional(),
  goals: z.array(z.string()).optional(),
});

export type UpdateUserProfile = z.infer<typeof UpdateUserProfileSchema>;
