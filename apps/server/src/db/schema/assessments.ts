import {
  pgTable,
  pgEnum,
  uuid,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { userProfiles } from "./user-profiles";

export const assessmentTypeEnum = pgEnum("assessment_type", [
  "phq9",
  "gad7",
  "iss_sleep",
  "panic_screener",
  "trauma_gating",
  "functioning",
  "substance_use",
  "relationship",
  // Wave 1: High-value, low-risk instruments
  "dass21",
  "rosenberg_se",
  "who5",
  "phq4",
  "pc_ptsd5",
  // Wave 2: Personality, loneliness, burnout, adversity, insomnia
  "ipip_big5",
  "ucla_loneliness",
  "copenhagen_burnout",
  "ace_score",
  "isi",
  "harrower_inkblot",
  // Wave 3: Stress, social support, attachment, trauma, expanded ACE
  "pss",
  "mspss",
  "ecr",
  "pcl5",
  "ace_iq",
]);

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
  // Drizzle requires a lazy thunk with `any` for self-referential FKs
  parentAssessmentId: uuid("parent_assessment_id").references(
    (): any => assessments.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
