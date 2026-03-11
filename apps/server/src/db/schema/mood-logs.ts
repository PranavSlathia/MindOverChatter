import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  real,
} from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { userProfiles } from "./user-profiles";

export const moodSourceEnum = pgEnum("mood_source", [
  "user_input",
  "ai_inferred",
  "assessment",
]);

export const moodLogs = pgTable("mood_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => sessions.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  valence: real("valence").notNull(), // -1 to +1 (pleasant <-> unpleasant)
  arousal: real("arousal").notNull(), // 0 to 1 (deactivated <-> activated)
  source: moodSourceEnum("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MoodLog = typeof moodLogs.$inferSelect;
export type NewMoodLog = typeof moodLogs.$inferInsert;
