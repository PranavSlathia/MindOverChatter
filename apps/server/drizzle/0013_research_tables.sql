CREATE TABLE "research_calibration_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_run_id" uuid NOT NULL,
	"source_session_id" uuid,
	"live_calibration_snapshot" text NOT NULL,
	"assessment_trajectory" jsonb NOT NULL,
	"proposed_content" text NOT NULL,
	"proposed_length" integer NOT NULL,
	"outcome_score" real NOT NULL,
	"gate_decision" text NOT NULL,
	"gate_reason" text NOT NULL,
	"safety_passed" boolean NOT NULL,
	"experiment_version" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone,
	"promoted_by" text,
	CONSTRAINT "research_cal_proposals_gate_decision_check" CHECK ("research_calibration_proposals"."gate_decision" IN ('keep', 'discard', 'insufficient_data'))
);

--> statement-breakpoint
CREATE TABLE "research_hypothesis_simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_run_id" uuid NOT NULL,
	"plan_id" uuid,
	"plans_analyzed_count" integer NOT NULL,
	"sessions_analyzed_count" integer NOT NULL,
	"hypothesis_deltas" jsonb NOT NULL,
	"mean_absolute_delta" real NOT NULL,
	"max_delta" real NOT NULL,
	"high_drift_count" integer NOT NULL,
	"experiment_version" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone,
	"promoted_by" text
);

--> statement-breakpoint
CREATE TABLE "research_direction_compliance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_run_id" uuid NOT NULL,
	"session_id" uuid,
	"direction_content" text NOT NULL,
	"direction_version" text NOT NULL,
	"active_directives" jsonb NOT NULL,
	"recommended_mode" text,
	"actual_dominant_mode" text,
	"mode_aligned" boolean,
	"directive_followed" text[],
	"directive_violated" text[],
	"compliance_score" real,
	"session_outcome" jsonb,
	"assessment_delta" jsonb,
	"experiment_version" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
ALTER TABLE "research_calibration_proposals" ADD CONSTRAINT "research_calibration_proposals_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_calibration_proposals" ADD CONSTRAINT "research_calibration_proposals_source_session_id_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_hypothesis_simulations" ADD CONSTRAINT "research_hypothesis_simulations_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_hypothesis_simulations" ADD CONSTRAINT "research_hypothesis_simulations_plan_id_therapy_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."therapy_plans"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_direction_compliance" ADD CONSTRAINT "research_direction_compliance_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_direction_compliance" ADD CONSTRAINT "research_direction_compliance_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "research_cal_proposals_user_ran_at_idx" ON "research_calibration_proposals" USING btree ("user_id","ran_at");
--> statement-breakpoint
CREATE INDEX "research_cal_proposals_run_id_idx" ON "research_calibration_proposals" USING btree ("experiment_run_id");
--> statement-breakpoint
CREATE INDEX "research_hyp_sims_user_ran_at_idx" ON "research_hypothesis_simulations" USING btree ("user_id","ran_at");
--> statement-breakpoint
CREATE INDEX "research_dir_compliance_user_ran_at_idx" ON "research_direction_compliance" USING btree ("user_id","ran_at");
--> statement-breakpoint
CREATE INDEX "research_dir_compliance_session_id_idx" ON "research_direction_compliance" USING btree ("session_id");
