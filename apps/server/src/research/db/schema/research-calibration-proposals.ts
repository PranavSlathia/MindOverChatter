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
import { sessions } from "../../../db/schema/sessions";

export const researchCalibrationProposals = pgTable(
  "research_calibration_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    experimentRunId: uuid("experiment_run_id").notNull(),
    sourceSessionId: uuid("source_session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    liveCalibrationSnapshot: text("live_calibration_snapshot").notNull(),
    assessmentTrajectory: jsonb("assessment_trajectory").notNull(),
    proposedContent: text("proposed_content").notNull(),
    proposedLength: integer("proposed_length").notNull(),
    outcomeScore: real("outcome_score").notNull(),
    gateDecision: text("gate_decision")
      .notNull()
      .$type<"keep" | "discard" | "insufficient_data">(),
    gateReason: text("gate_reason").notNull(),
    safetyPassed: boolean("safety_passed").notNull(),
    experimentVersion: text("experiment_version").notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow().notNull(),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    promotedBy: text("promoted_by"),
  },
  (table) => [
    index("research_cal_proposals_user_ran_at_idx").on(
      table.userId,
      table.ranAt,
    ),
    index("research_cal_proposals_run_id_idx").on(table.experimentRunId),
    check(
      "research_cal_proposals_gate_decision_check",
      sql`${table.gateDecision} IN ('keep', 'discard', 'insufficient_data')`,
    ),
  ],
);

export type ResearchCalibrationProposal =
  typeof researchCalibrationProposals.$inferSelect;
export type NewResearchCalibrationProposal =
  typeof researchCalibrationProposals.$inferInsert;
