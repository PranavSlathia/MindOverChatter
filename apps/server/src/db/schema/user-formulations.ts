import {
  pgTable,
  uuid,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { userProfiles } from "./user-profiles";

export const userFormulations = pgTable(
  "user_formulations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    snapshot: jsonb("snapshot").notNull(),
    domainSignals: jsonb("domain_signals"),
    actionRecommendations: jsonb("action_recommendations"),
    dataConfidence: text("data_confidence").notNull(),
    triggeredBy: text("triggered_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_formulations_user_id_version_unique").on(
      table.userId,
      table.version,
    ),
  ],
);

export type UserFormulation = typeof userFormulations.$inferSelect;
export type NewUserFormulation = typeof userFormulations.$inferInsert;
