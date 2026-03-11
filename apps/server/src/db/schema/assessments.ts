import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { userProfiles } from "./user-profiles";

export const assessmentTypeEnum = pgEnum("assessment_type", ["phq9", "gad7"]);

export const assessmentSeverityEnum = pgEnum("assessment_severity", [
  "minimal",
  "mild",
  "moderate",
  "moderately_severe",
  "severe",
]);

export const assessments = pgTable("assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => sessions.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  type: assessmentTypeEnum("type").notNull(),
  answers: jsonb("answers").notNull(), // Array of 0-3 per question
  totalScore: integer("total_score").notNull(), // PHQ-9: 0-27, GAD-7: 0-21
  severity: assessmentSeverityEnum("severity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
