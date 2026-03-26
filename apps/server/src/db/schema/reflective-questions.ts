import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { userProfiles } from "./user-profiles";
import { userFormulations } from "./user-formulations";
import { sessions } from "./sessions";

// ── Enums ──────────────────────────────────────────────────────────

export const questionStatusEnum = pgEnum("question_status", [
  "open",
  "answered",
  "deferred",
  "retired",
]);

export const reflectionStatusEnum = pgEnum("reflection_status", [
  "draft",
  "submitted",
  "reviewed",
  "integrated",
]);

// ── reflective_questions ───────────────────────────────────────────

export const reflectiveQuestions = pgTable("reflective_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  rationale: text("rationale"), // internal clinical reasoning, NEVER shown to user
  linkedTo: text("linked_to"), // formulation domain (roots, recentActivators, etc.)
  sourceFormulationId: uuid("source_formulation_id").references(
    () => userFormulations.id,
    { onDelete: "set null" },
  ),
  sourceSessionId: uuid("source_session_id").references(
    () => sessions.id,
    { onDelete: "set null" },
  ),
  status: questionStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ReflectiveQuestion = typeof reflectiveQuestions.$inferSelect;
export type NewReflectiveQuestion = typeof reflectiveQuestions.$inferInsert;

// ── reflections ────────────────────────────────────────────────────

export const reflections = pgTable("reflections", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => reflectiveQuestions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  status: reflectionStatusEnum("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  integratedAt: timestamp("integrated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Reflection = typeof reflections.$inferSelect;
export type NewReflection = typeof reflections.$inferInsert;
