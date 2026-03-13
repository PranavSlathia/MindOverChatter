import {
  pgTable,
  uuid,
  text,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { userProfiles } from "../../../db/schema/user-profiles";
import { sessions } from "../../../db/schema/sessions";

export const researchDirectionCompliance = pgTable(
  "research_direction_compliance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    experimentRunId: uuid("experiment_run_id").notNull(),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    directionContent: text("direction_content").notNull(),
    directionVersion: text("direction_version").notNull(),
    activeDirectives: jsonb("active_directives").notNull(),
    recommendedMode: text("recommended_mode"),
    actualDominantMode: text("actual_dominant_mode"),
    modeAligned: boolean("mode_aligned"),
    directiveFollowed: text("directive_followed").array(),
    directiveViolated: text("directive_violated").array(),
    complianceScore: real("compliance_score"),
    sessionOutcome: jsonb("session_outcome"),
    assessmentDelta: jsonb("assessment_delta"),
    experimentVersion: text("experiment_version").notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("research_dir_compliance_user_ran_at_idx").on(
      table.userId,
      table.ranAt,
    ),
    index("research_dir_compliance_session_id_idx").on(table.sessionId),
  ],
);

export type ResearchDirectionCompliance =
  typeof researchDirectionCompliance.$inferSelect;
export type NewResearchDirectionCompliance =
  typeof researchDirectionCompliance.$inferInsert;
