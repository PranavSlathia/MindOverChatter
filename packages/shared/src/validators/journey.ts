import { z } from "zod";

// ── Journey Timeline ─────────────────────────────────────────────

export const JourneyTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const JourneyTimelineItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session"),
    data: z.object({
      id: z.string(),
      startedAt: z.string(),
      endedAt: z.string().nullable(),
      summary: z.string().nullable(),
      themes: z.array(z.string()).nullable(),
    }),
  }),
  z.object({
    type: z.literal("memory"),
    data: z.object({
      id: z.string(),
      content: z.string(),
      memoryType: z.string(),
      confidence: z.number(),
      createdAt: z.string(),
    }),
  }),
  z.object({
    type: z.literal("assessment"),
    data: z.object({
      id: z.string(),
      type: z.string(),
      totalScore: z.number(),
      severity: z.string(),
      createdAt: z.string(),
    }),
  }),
  z.object({
    type: z.literal("mood"),
    data: z.object({
      id: z.string(),
      valence: z.number(),
      arousal: z.number(),
      createdAt: z.string(),
    }),
  }),
]);

export const JourneyTimelineResponseSchema = z.object({
  items: z.array(JourneyTimelineItemSchema),
  limit: z.number(),
  offset: z.number(),
});

// ── Journey Insights ─────────────────────────────────────────────

export const JourneyInsightsResponseSchema = z.object({
  clinicalUnderstanding: z.string(),
  userReflection: z.string(),
  actionItems: z.array(z.string()),
  patterns: z.object({
    recurring_triggers: z.array(z.object({ id: z.string(), content: z.string() })),
    unresolved_threads: z.array(z.object({ id: z.string(), content: z.string() })),
    wins: z.array(z.object({ id: z.string(), content: z.string() })),
  }),
  moodTrend: z.object({
    direction: z.enum(["improving", "stable", "declining"]),
    period: z.string(),
  }),
  cachedAt: z.string().optional(),
});

// ── Assessment History ───────────────────────────────────────────

export const AssessmentHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Type Exports ─────────────────────────────────────────────────

export type JourneyTimelineQuery = z.infer<typeof JourneyTimelineQuerySchema>;
export type JourneyTimelineItem = z.infer<typeof JourneyTimelineItemSchema>;
export type JourneyTimelineResponse = z.infer<typeof JourneyTimelineResponseSchema>;
export type JourneyInsightsResponse = z.infer<typeof JourneyInsightsResponseSchema>;
export type AssessmentHistoryQuery = z.infer<typeof AssessmentHistoryQuerySchema>;
