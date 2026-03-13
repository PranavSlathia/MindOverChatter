import {
  pgTable,
  uuid,
  text,
  real,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { userProfiles } from "../../../db/schema/user-profiles";
import { therapyPlans } from "../../../db/schema/therapy-plans";

export const researchHypothesisSimulations = pgTable(
  "research_hypothesis_simulations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    experimentRunId: uuid("experiment_run_id").notNull(),
    planId: uuid("plan_id").references(() => therapyPlans.id, {
      onDelete: "set null",
    }),
    plansAnalyzedCount: integer("plans_analyzed_count").notNull(),
    sessionsAnalyzedCount: integer("sessions_analyzed_count").notNull(),
    hypothesisDeltas: jsonb("hypothesis_deltas").notNull(),
    meanAbsoluteDelta: real("mean_absolute_delta").notNull(),
    maxDelta: real("max_delta").notNull(),
    highDriftCount: integer("high_drift_count").notNull(),
    experimentVersion: text("experiment_version").notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow().notNull(),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    promotedBy: text("promoted_by"),
  },
  (table) => [
    index("research_hyp_sims_user_ran_at_idx").on(table.userId, table.ranAt),
  ],
);

export type ResearchHypothesisSimulation =
  typeof researchHypothesisSimulations.$inferSelect;
export type NewResearchHypothesisSimulation =
  typeof researchHypothesisSimulations.$inferInsert;
