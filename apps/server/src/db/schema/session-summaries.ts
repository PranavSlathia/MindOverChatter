import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { userProfiles } from "./user-profiles";

export const summaryLevelEnum = pgEnum("summary_level", [
  "turn",
  "session",
  "weekly",
  "monthly",
  "profile",
]);

export const sessionSummaries = pgTable("session_summaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => sessions.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  level: summaryLevelEnum("level").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1024 }),
  themes: text("themes").array(),
  cognitivePatterns: text("cognitive_patterns").array(),
  actionItems: text("action_items").array(),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SessionSummary = typeof sessionSummaries.$inferSelect;
export type NewSessionSummary = typeof sessionSummaries.$inferInsert;
