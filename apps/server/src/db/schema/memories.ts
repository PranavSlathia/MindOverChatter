import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  real,
} from "drizzle-orm/pg-core";
import { userProfiles } from "./user-profiles";

export const memoryTypeEnum = pgEnum("memory_type", [
  "profile_fact",
  "relationship",
  "goal",
  "coping_strategy",
  "recurring_trigger",
  "life_event",
  "symptom_episode",
  "unresolved_thread",
  "safety_critical",
  "win",
  "session_summary",
]);

export const memories = pgTable("memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(), // Extracted fact/memory
  memoryType: memoryTypeEnum("memory_type").notNull(),
  importance: real("importance").notNull(), // 0-1 importance score
  confidence: real("confidence").notNull(), // 0-1 extraction confidence
  sourceSessionId: uuid("source_session_id"), // Which session this was extracted from
  sourceMessageId: uuid("source_message_id"), // Specific message that produced this memory
  lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }), // When user last reaffirmed
  supersededBy: uuid("superseded_by"), // Self-referential FK — points to newer contradicting memory
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
