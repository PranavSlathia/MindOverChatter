import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  real,
  jsonb,
} from "drizzle-orm/pg-core";
import { messages } from "./messages";
import { sessions } from "./sessions";

export const emotionChannelEnum = pgEnum("emotion_channel", [
  "text",
  "voice",
  "face",
]);

export const emotionReadings = pgTable("emotion_readings", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id").references(() => messages.id, {
    onDelete: "set null",
  }), // NULLABLE — face readings may not be tied to a message
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  channel: emotionChannelEnum("channel").notNull(),
  emotionLabel: text("emotion_label").notNull(), // Primary emotion detected
  confidence: real("confidence").notNull(), // 0-1 confidence score
  signalWeight: real("signal_weight").notNull(), // Channel reliability: text=0.8, voice=0.5, face=0.3
  rawScores: jsonb("raw_scores"), // Full emotion distribution
  prosodyData: jsonb("prosody_data"), // Pitch, energy, MFCCs (voice only)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmotionReading = typeof emotionReadings.$inferSelect;
export type NewEmotionReading = typeof emotionReadings.$inferInsert;
