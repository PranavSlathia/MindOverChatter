CREATE TABLE "research_replay_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_run_id" uuid NOT NULL,
	"baseline_direction_content" text NOT NULL,
	"baseline_direction_version" text NOT NULL,
	"candidate_direction_content" text NOT NULL,
	"candidate_direction_version" text NOT NULL,
	"session_ids_used" jsonb NOT NULL,
	"golden_case_count" integer NOT NULL,
	"total_turns_evaluated" integer NOT NULL,
	"gate1_passed" boolean NOT NULL,
	"gate1_fail_reason" text,
	"gate2_score" real,
	"gate2_breakdown" jsonb,
	"gate2_passed" boolean,
	"gate3_phq_gad_trajectory" jsonb,
	"gate3_flagged_for_review" boolean DEFAULT false NOT NULL,
	"gate3_note" text,
	"gate_decision" text NOT NULL,
	"gate_reason" text NOT NULL,
	"turn_scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"promoted_at" timestamp with time zone,
	"promoted_by" text,
	"experiment_version" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_replay_runs_gate_decision_check" CHECK ("research_replay_runs"."gate_decision" IN ('keep', 'discard', 'insufficient_sessions'))
);

--> statement-breakpoint
ALTER TABLE "research_replay_runs" ADD CONSTRAINT "research_replay_runs_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "research_replay_runs_user_id_ran_at_idx" ON "research_replay_runs" USING btree ("user_id","ran_at");
--> statement-breakpoint
CREATE INDEX "research_replay_runs_run_id_idx" ON "research_replay_runs" USING btree ("experiment_run_id");
