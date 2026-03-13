import { z } from "zod";

export const SessionModeEnum = z.enum([
  "follow_support",
  "assess_map",
  "deepen_history",
  "challenge_pattern",
  "consolidate_close",
]);
export type SessionMode = z.infer<typeof SessionModeEnum>;

export const UnexploredAreaSchema = z.object({
  topic: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  notes: z.string(),
  approach: z.string(),
});

export const TherapeuticGoalSchema = z.object({
  goal: z.string(),
  description: z.string(),
  progress: z.enum(["nascent", "building", "established"]),
  visible_label: z.string().min(1),
});

export const WorkingHypothesisSchema = z.object({
  hypothesis: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
  internal_only: z.literal(true),
});

export const NaturalCallbackSchema = z.object({
  trigger_topic: z.string(),
  probe_question: z.string(),
  priority: z.enum(["high", "medium", "low"]),
});

export const TherapyPlanSchema = z.object({
  unexplored_areas: z.array(UnexploredAreaSchema).max(5),
  therapeutic_goals: z.array(TherapeuticGoalSchema).max(4),
  working_hypotheses: z.array(WorkingHypothesisSchema).max(4),
  next_session_focus: z.string().max(300),
  natural_callbacks: z.array(NaturalCallbackSchema).max(5),
  recommended_session_mode: SessionModeEnum.optional(),
  directive_authority: z.enum(["low", "medium", "high"]).optional(),
  engagement_notes: z.string().max(200).optional(),
});

// Only goals are returned to the frontend — everything else is internal
export const TherapyPlanGoalsResponseSchema = z.object({
  goals: z.array(
    z.object({
      visible_label: z.string(),
      progress: z.enum(["nascent", "building", "established"]),
    }),
  ),
  hasTherapyPlan: z.boolean(),
  lastUpdatedAt: z.string().nullable(),
});

export type UnexploredArea = z.infer<typeof UnexploredAreaSchema>;
export type TherapeuticGoal = z.infer<typeof TherapeuticGoalSchema>;
export type WorkingHypothesis = z.infer<typeof WorkingHypothesisSchema>;
export type NaturalCallback = z.infer<typeof NaturalCallbackSchema>;
export type TherapyPlan = z.infer<typeof TherapyPlanSchema>;
export type TherapyPlanGoalsResponse = z.infer<typeof TherapyPlanGoalsResponseSchema>;
