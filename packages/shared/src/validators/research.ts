import { z } from "zod";

// ---------------------------------------------------------------------------
// Table A: research_calibration_proposals
// ---------------------------------------------------------------------------

export const GateDecisionEnum = z.enum(["keep", "discard", "insufficient_data"]);
export type GateDecision = z.infer<typeof GateDecisionEnum>;

export const ResearchCalibrationProposalSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  experimentRunId: z.string().uuid(),
  sourceSessionId: z.string().uuid().nullable(),
  liveCalibrationSnapshot: z.string(),
  assessmentTrajectory: z.unknown(), // jsonb — structure varies per experiment
  proposedContent: z.string(),
  proposedLength: z.number().int().nonnegative(),
  outcomeScore: z.number(),
  gateDecision: GateDecisionEnum,
  gateReason: z.string(),
  safetyPassed: z.boolean(),
  experimentVersion: z.string(),
  ranAt: z.string().datetime(),
  promotedAt: z.string().datetime().nullable(),
  promotedBy: z.string().nullable(),
});

export type ResearchCalibrationProposal = z.infer<
  typeof ResearchCalibrationProposalSchema
>;

// ---------------------------------------------------------------------------
// Table B: research_hypothesis_simulations
// ---------------------------------------------------------------------------

export const ResearchHypothesisSimulationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  experimentRunId: z.string().uuid(),
  planId: z.string().uuid().nullable(),
  plansAnalyzedCount: z.number().int().nonnegative(),
  sessionsAnalyzedCount: z.number().int().nonnegative(),
  hypothesisDeltas: z.unknown(), // jsonb — keyed by hypothesis text
  meanAbsoluteDelta: z.number(),
  maxDelta: z.number(),
  highDriftCount: z.number().int().nonnegative(),
  experimentVersion: z.string(),
  ranAt: z.string().datetime(),
  promotedAt: z.string().datetime().nullable(),
  promotedBy: z.string().nullable(),
});

export type ResearchHypothesisSimulation = z.infer<
  typeof ResearchHypothesisSimulationSchema
>;

// ---------------------------------------------------------------------------
// Table C: research_direction_compliance
// ---------------------------------------------------------------------------

export const ResearchDirectionComplianceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  experimentRunId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  directionContent: z.string(),
  directionVersion: z.string(),
  activeDirectives: z.unknown(), // jsonb — array of directive strings
  recommendedMode: z.string().nullable(),
  actualDominantMode: z.string().nullable(),
  modeAligned: z.boolean().nullable(),
  directiveFollowed: z.array(z.string()).nullable(),
  directiveViolated: z.array(z.string()).nullable(),
  complianceScore: z.number().min(0).max(1).nullable(),
  sessionOutcome: z.unknown().nullable(), // jsonb
  assessmentDelta: z.unknown().nullable(), // jsonb
  experimentVersion: z.string(),
  ranAt: z.string().datetime(),
});

export type ResearchDirectionCompliance = z.infer<
  typeof ResearchDirectionComplianceSchema
>;
