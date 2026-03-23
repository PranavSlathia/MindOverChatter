CREATE TABLE "turn_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_message_id" uuid,
	"assistant_message_id" uuid,
	"turn_number" integer DEFAULT 0 NOT NULL,
	"crisis_detected" boolean DEFAULT false NOT NULL,
	"crisis_severity" text,
	"crisis_stages" jsonb,
	"crisis_matched_phrases" text[],
	"mode_before" text,
	"mode_after" text,
	"mode_shift_source" text,
	"supervisor_ran" boolean DEFAULT false NOT NULL,
	"supervisor_confidence" real,
	"supervisor_depth" text,
	"supervisor_skills" text[],
	"supervisor_focus" text,
	"supervisor_latency_ms" integer,
	"depth_alert_fired" boolean DEFAULT false NOT NULL,
	"validator_ran" boolean DEFAULT false NOT NULL,
	"validator_score" real,
	"validator_safe" boolean,
	"validator_issues" jsonb,
	"validator_latency_ms" integer,
	"active_skills" text[],
	"memories_injected_count" integer,
	"memory_notes_injected" integer,
	"assessment_markers" text[],
	"text_emotion_label" text,
	"text_emotion_confidence" real,
	"total_pipeline_ms" integer,
	"claude_response_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turn_events" ADD CONSTRAINT "turn_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "turn_events_session_turn_idx" ON "turn_events" USING btree ("session_id","turn_number");--> statement-breakpoint
CREATE INDEX "turn_events_created_at_idx" ON "turn_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "turn_events_depth_alert_idx" ON "turn_events" USING btree ("session_id") WHERE depth_alert_fired = true;--> statement-breakpoint
CREATE INDEX "turn_events_validator_unsafe_idx" ON "turn_events" USING btree ("session_id") WHERE validator_safe = false;