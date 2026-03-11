import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name"),
  coreTraits: jsonb("core_traits"), // Persistent personality traits
  patterns: jsonb("patterns"), // Long-term behavioral patterns
  goals: jsonb("goals"), // Long-term therapeutic goals
  profileEmbedding: vector("profile_embedding", { dimensions: 1024 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
