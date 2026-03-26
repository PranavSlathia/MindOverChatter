import {
  pgTable,
  jsonb,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { patientUnderstandingSnapshots } from "./patient-understanding.js";
import { userProfiles } from "./user-profiles.js";

export const clinicalHandoffReports = pgTable("clinical_handoff_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  sourceSnapshotId: uuid("source_snapshot_id")
    .notNull()
    .references(() => patientUnderstandingSnapshots.id, { onDelete: "cascade" }),
  report: jsonb("report").notNull(),
  formatVersion: text("format_version").notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ClinicalHandoffReportRow = typeof clinicalHandoffReports.$inferSelect;
export type NewClinicalHandoffReport = typeof clinicalHandoffReports.$inferInsert;
