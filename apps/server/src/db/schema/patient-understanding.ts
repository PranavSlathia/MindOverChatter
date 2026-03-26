import {
  pgEnum,
  pgTable,
  integer,
  jsonb,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { userProfiles } from "./user-profiles.js";

export const understandingDataConfidenceEnum = pgEnum("understanding_data_confidence", [
  "sparse",
  "emerging",
  "established",
]);

export const understandingGenerationReasonEnum = pgEnum("understanding_generation_reason", [
  "session_end",
  "reflection_submit",
  "manual",
]);

export const understandingItemCategoryEnum = pgEnum("understanding_item_category", [
  "presenting_concern",
  "symptom",
  "trigger",
  "perpetuating_pattern",
  "protective_factor",
  "coping_strategy",
  "functional_impact",
  "risk_factor",
  "hypothesis",
  "unanswered_question",
]);

export const understandingItemProvenanceEnum = pgEnum("understanding_item_provenance", [
  "observed",
  "self_reported",
  "inferred",
  "hypothesized",
]);

export const understandingItemStatusEnum = pgEnum("understanding_item_status", [
  "active",
  "superseded",
]);

export const patientUnderstandingSnapshots = pgTable("patient_understanding_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  dataConfidence: understandingDataConfidenceEnum("data_confidence").notNull(),
  summary: jsonb("summary").notNull(),
  generationReason: understandingGenerationReasonEnum("generation_reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const patientUnderstandingItems = pgTable("patient_understanding_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotId: uuid("snapshot_id")
    .notNull()
    .references(() => patientUnderstandingSnapshots.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  category: understandingItemCategoryEnum("category").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  provenance: understandingItemProvenanceEnum("provenance").notNull(),
  confidence: real("confidence").notNull(),
  supportingEvidenceCount: integer("supporting_evidence_count").notNull().default(0),
  contradictingEvidenceCount: integer("contradicting_evidence_count").notNull().default(0),
  status: understandingItemStatusEnum("status").notNull().default("active"),
  sourceRefs: jsonb("source_refs").notNull(),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PatientUnderstandingSnapshot =
  typeof patientUnderstandingSnapshots.$inferSelect;
export type NewPatientUnderstandingSnapshot =
  typeof patientUnderstandingSnapshots.$inferInsert;
export type PatientUnderstandingItem = typeof patientUnderstandingItems.$inferSelect;
export type NewPatientUnderstandingItem = typeof patientUnderstandingItems.$inferInsert;
