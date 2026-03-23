import {
  pgTable,
  uuid,
  text,
  real,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { userProfiles } from "../../../db/schema/user-profiles";
import { sessions } from "../../../db/schema/sessions";

export const researchCounselbenchScores = pgTable(
  "research_counselbench_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    experimentRunId: uuid("experiment_run_id").notNull(),
    experimentVersion: text("experiment_version").notNull(),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    exchangeIndex: integer("exchange_index").notNull(),

    // 6 CounselBench dimensions (1-5 scale)
    empathy: real("empathy").notNull(),
    relevance: real("relevance").notNull(),
    safety: real("safety").notNull(),
    actionability: real("actionability").notNull(),
    depth: real("depth").notNull(),
    professionalism: real("professionalism").notNull(),

    overall: real("overall").notNull(),
    reasoning: text("reasoning"),

    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("research_counselbench_user_ran_at_idx").on(
      table.userId,
      table.ranAt,
    ),
    index("research_counselbench_session_id_idx").on(table.sessionId),
    index("research_counselbench_run_id_idx").on(table.experimentRunId),
  ],
);

export type ResearchCounselbenchScore =
  typeof researchCounselbenchScores.$inferSelect;
export type NewResearchCounselbenchScore =
  typeof researchCounselbenchScores.$inferInsert;
