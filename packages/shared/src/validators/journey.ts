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

// ── Journey Formulation ──────────────────────────────────────────

export const DomainKeySchema = z.enum([
  "connection",
  "momentum",
  "groundedness",
  "meaning",
  "self_regard",
  "vitality",
]);

const EvidenceRefSchema = z.object({
  sourceType: z.string(),
  sourceId: z.string().optional(),
});

const DomainSignalSchema = z.object({
  level: z.enum(["low", "medium", "high"]),
  trend: z.enum(["improving", "stable", "declining"]),
  evidence: z.string(),
  contributions: z.array(z.object({
    assessmentType: z.string(),
    subscale: z.string().optional(),
    normalizedScore: z.number(),
  })).optional(),
});

export const JourneyFormulationSchema = z.object({
  // Internal structured formulation (clinical-grade, not shown raw)
  formulation: z.object({
    presentingTheme: z.string(),
    roots: z.array(
      z.object({
        content: z.string(),
        sourceType: z.string(),
        confidence: z.number(),
        evidenceRefs: z.array(EvidenceRefSchema).optional(),
      }),
    ),
    recentActivators: z.array(
      z.object({
        content: z.string(),
        confidence: z.number(),
        evidenceRefs: z.array(EvidenceRefSchema).optional(),
      }),
    ),
    perpetuatingCycles: z.array(
      z.object({
        pattern: z.string(),
        mechanism: z.string(),
        evidenceRefs: z.array(EvidenceRefSchema).optional(),
      }),
    ),
    protectiveStrengths: z.array(
      z.object({
        content: z.string(),
        sourceType: z.string(),
        evidenceRefs: z.array(EvidenceRefSchema).optional(),
      }),
    ),
  }),
  // User-facing reflection layer — how we communicate the formulation warmly
  userReflection: z.object({
    summary: z.string(),
    encouragement: z.string(),
  }),
  activeStates: z.array(
    z.object({
      label: z.string(),
      confidence: z.number(),
      signal: z.string(),
      domain: DomainKeySchema,
      evidenceRefs: z.array(EvidenceRefSchema).optional(),
    }),
  ),
  domainSignals: z
    .object({
      connection: DomainSignalSchema,
      momentum: DomainSignalSchema,
      groundedness: DomainSignalSchema,
      meaning: DomainSignalSchema,
      self_regard: DomainSignalSchema,
      vitality: DomainSignalSchema,
    })
    .partial(),
  questionsWorthExploring: z.array(
    z.object({
      question: z.string(),
      rationale: z.string(),
      linkedTo: z.string(),
    }),
  ),
  themeOfToday: z.string(),
  dataConfidence: z.enum(["sparse", "emerging", "established"]),
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
export type JourneyFormulation = z.infer<typeof JourneyFormulationSchema>;
export type DomainKey = z.infer<typeof DomainKeySchema>;
export type AssessmentHistoryQuery = z.infer<typeof AssessmentHistoryQuerySchema>;
