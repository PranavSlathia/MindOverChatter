CREATE TYPE "public"."message_source" AS ENUM('text', 'voice');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('open', 'answered', 'deferred', 'retired');--> statement-breakpoint
CREATE TYPE "public"."reflection_status" AS ENUM('draft', 'submitted', 'reviewed', 'integrated');--> statement-breakpoint
CREATE TYPE "public"."understanding_data_confidence" AS ENUM('sparse', 'emerging', 'established');--> statement-breakpoint
CREATE TYPE "public"."understanding_generation_reason" AS ENUM('session_end', 'reflection_submit', 'manual');--> statement-breakpoint
CREATE TYPE "public"."understanding_item_category" AS ENUM('presenting_concern', 'symptom', 'trigger', 'perpetuating_pattern', 'protective_factor', 'coping_strategy', 'functional_impact', 'risk_factor', 'hypothesis', 'unanswered_question');--> statement-breakpoint
CREATE TYPE "public"."understanding_item_provenance" AS ENUM('observed', 'self_reported', 'inferred', 'hypothesized');--> statement-breakpoint
CREATE TYPE "public"."understanding_item_status" AS ENUM('active', 'superseded');--> statement-breakpoint
CREATE TABLE "clinical_handoff_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"report" jsonb NOT NULL,
	"format_version" text DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reflections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" "reflection_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"integrated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reflective_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question" text NOT NULL,
	"rationale" text,
	"linked_to" text,
	"source_formulation_id" uuid,
	"source_session_id" uuid,
	"status" "question_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_understanding_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "understanding_item_category" NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"provenance" "understanding_item_provenance" NOT NULL,
	"confidence" real NOT NULL,
	"supporting_evidence_count" integer DEFAULT 0 NOT NULL,
	"contradicting_evidence_count" integer DEFAULT 0 NOT NULL,
	"status" "understanding_item_status" DEFAULT 'active' NOT NULL,
	"source_refs" jsonb NOT NULL,
	"last_reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_understanding_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_confidence" "understanding_data_confidence" NOT NULL,
	"summary" jsonb NOT NULL,
	"generation_reason" "understanding_generation_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "source" "message_source" DEFAULT 'text';--> statement-breakpoint
ALTER TABLE "clinical_handoff_reports" ADD CONSTRAINT "clinical_handoff_reports_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_handoff_reports" ADD CONSTRAINT "clinical_handoff_reports_source_snapshot_id_patient_understanding_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."patient_understanding_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_question_id_reflective_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."reflective_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflective_questions" ADD CONSTRAINT "reflective_questions_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflective_questions" ADD CONSTRAINT "reflective_questions_source_formulation_id_user_formulations_id_fk" FOREIGN KEY ("source_formulation_id") REFERENCES "public"."user_formulations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflective_questions" ADD CONSTRAINT "reflective_questions_source_session_id_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_understanding_items" ADD CONSTRAINT "patient_understanding_items_snapshot_id_patient_understanding_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."patient_understanding_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_understanding_items" ADD CONSTRAINT "patient_understanding_items_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_understanding_snapshots" ADD CONSTRAINT "patient_understanding_snapshots_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;