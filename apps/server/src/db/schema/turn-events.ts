import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { sessions } from "./sessions";

export const turnEvents = pgTable(
  "turn_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userMessageId: uuid("user_message_id"),
    assistantMessageId: uuid("assistant_message_id"),
    turnNumber: integer("turn_number").notNull().default(0),

    // -- Crisis stage
    crisisDetected: boolean("crisis_detected").notNull().default(false),
    crisisSeverity: text("crisis_severity"),
    crisisStages: jsonb("crisis_stages"),
    crisisMatchedPhrases: text("crisis_matched_phrases").array(),

    // -- Mode stage
    modeBefore: text("mode_before"),
    modeAfter: text("mode_after"),
    modeShiftSource: text("mode_shift_source"), // 'regex' | 'supervisor' | 'none'

    // -- Supervisor stage
    supervisorRan: boolean("supervisor_ran").notNull().default(false),
    supervisorConfidence: real("supervisor_confidence"),
    supervisorDepth: text("supervisor_depth"), // 'surface' | 'medium' | 'deep'
    supervisorSkills: text("supervisor_skills").array(),
    supervisorFocus: text("supervisor_focus"),
    supervisorLatencyMs: integer("supervisor_latency_ms"),
    depthAlertFired: boolean("depth_alert_fired").notNull().default(false),

    // -- Validator stage
    validatorRan: boolean("validator_ran").notNull().default(false),
    validatorScore: real("validator_score"),
    validatorSafe: boolean("validator_safe"),
    validatorIssues: jsonb("validator_issues"),
    validatorLatencyMs: integer("validator_latency_ms"),

    // -- Context
    activeSkills: text("active_skills").array(),
    memoriesInjectedCount: integer("memories_injected_count"),
    memoryNotesInjected: integer("memory_notes_injected"),
    assessmentMarkers: text("assessment_markers").array(),
    textEmotionLabel: text("text_emotion_label"),
    textEmotionConfidence: real("text_emotion_confidence"),

    // -- Timing
    totalPipelineMs: integer("total_pipeline_ms"),
    claudeResponseMs: integer("claude_response_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("turn_events_session_turn_idx").on(table.sessionId, table.turnNumber),
    index("turn_events_created_at_idx").on(table.createdAt),
    index("turn_events_depth_alert_idx")
      .on(table.sessionId)
      .where(sql`depth_alert_fired = true`),
    index("turn_events_validator_unsafe_idx")
      .on(table.sessionId)
      .where(sql`validator_safe = false`),
  ],
);

export type TurnEvent = typeof turnEvents.$inferSelect;
export type NewTurnEvent = typeof turnEvents.$inferInsert;
