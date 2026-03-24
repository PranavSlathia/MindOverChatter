import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sessions } from "./sessions";

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
export const messageSourceEnum = pgEnum("message_source", ["text", "voice"]);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  source: messageSourceEnum("source").default("text"),
  audioFilePath: text("audio_file_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
