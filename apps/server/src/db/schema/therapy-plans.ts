import {
  pgTable,
  uuid,
  integer,
  text,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { userProfiles } from "./user-profiles";

export const therapyPlans = pgTable(
  "therapy_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    plan: jsonb("plan").notNull(),
    triggeredBy: text("triggered_by").notNull(), // "session_end" | "assessment_submit" | "manual"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Safety net: prevents duplicate version numbers even if the advisory lock is bypassed
    unique("therapy_plans_user_id_version_unique").on(table.userId, table.version),
  ],
);

export type TherapyPlanRow = typeof therapyPlans.$inferSelect;
export type NewTherapyPlan = typeof therapyPlans.$inferInsert;
