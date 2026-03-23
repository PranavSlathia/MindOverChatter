import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { userProfiles } from "./user-profiles";

export const sessionStatusEnum = pgEnum("session_status", [
  "active",
  "completed",
  "crisis_escalated",
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  sdkSessionId: text("sdk_session_id"), // Claude Agent SDK session ID
  status: sessionStatusEnum("status").notNull().default("active"),
  summary: text("summary"), // 300-500 word session summary
  summaryEmbedding: vector("summary_embedding", { dimensions: 1024 }),
  themes: text("themes").array(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
  voiceMetrics: jsonb("voice_metrics"), // Voice V2: enriched metrics from voice session
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
