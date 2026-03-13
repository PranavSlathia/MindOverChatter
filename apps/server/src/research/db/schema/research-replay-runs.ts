import {
  pgTable,
  uuid,
  text,
  real,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { userProfiles } from "../../../db/schema/user-profiles";

export const researchReplayRuns = pgTable(
  "research_replay_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    experimentRunId: uuid("experiment_run_id").notNull(),

    baselineDirectionContent: text("baseline_direction_content").notNull(),
    baselineDirectionVersion: text("baseline_direction_version").notNull(),
    candidateDirectionContent: text("candidate_direction_content").notNull(),
    candidateDirectionVersion: text("candidate_direction_version").notNull(),

    sessionIdsUsed: jsonb("session_ids_used").notNull(),
    goldenCaseCount: integer("golden_case_count").notNull(),
    totalTurnsEvaluated: integer("total_turns_evaluated").notNull(),

    gate1Passed: boolean("gate1_passed").notNull(),
    gate1FailReason: text("gate1_fail_reason"),

    gate2Score: real("gate2_score"),
    gate2Breakdown: jsonb("gate2_breakdown"),
    gate2Passed: boolean("gate2_passed"),

    gate3PhqGadTrajectory: jsonb("gate3_phq_gad_trajectory"),
    gate3FlaggedForReview: boolean("gate3_flagged_for_review")
      .notNull()
      .default(false),
    gate3Note: text("gate3_note"),

    gateDecision: text("gate_decision")
      .notNull()
      .$type<"keep" | "discard" | "insufficient_sessions">(),
    gateReason: text("gate_reason").notNull(),

    turnScores: jsonb("turn_scores").notNull().default(sql`'[]'::jsonb`),

    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    promotedBy: text("promoted_by"),

    experimentVersion: text("experiment_version").notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("research_replay_runs_user_id_ran_at_idx").on(
      table.userId,
      table.ranAt,
    ),
    index("research_replay_runs_run_id_idx").on(table.experimentRunId),
    check(
      "research_replay_runs_gate_decision_check",
      sql`${table.gateDecision} IN ('keep', 'discard', 'insufficient_sessions')`,
    ),
  ],
);

export type ResearchReplayRun = typeof researchReplayRuns.$inferSelect;
export type NewResearchReplayRun = typeof researchReplayRuns.$inferInsert;
