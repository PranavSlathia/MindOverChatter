import {
  pgTable,
  pgEnum,
  uuid,
  text,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { userProfiles } from "../../../db/schema/user-profiles";
import { sessions } from "../../../db/schema/sessions";

export const developmentalDimensionEnum = pgEnum("developmental_dimension", [
  "attachment_quality",
  "family_climate",
  "schema_formation",
  "formative_events",
  "origin_to_present",
]);

export const researchDevelopmentalCoverage = pgTable(
  "research_developmental_coverage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    experimentRunId: uuid("experiment_run_id").notNull(),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    dimension: developmentalDimensionEnum("dimension").notNull(),
    score: real("score").notNull(), // 0.0, 0.5, or 1.0
    notes: text("notes"),
    experimentVersion: text("experiment_version").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("research_dev_coverage_user_run_idx").on(table.userId, table.experimentRunId),
    index("research_dev_coverage_session_idx").on(table.sessionId),
    index("research_dev_coverage_dimension_idx").on(table.dimension),
  ],
);

export type ResearchDevelopmentalCoverage =
  typeof researchDevelopmentalCoverage.$inferSelect;
export type NewResearchDevelopmentalCoverage =
  typeof researchDevelopmentalCoverage.$inferInsert;
