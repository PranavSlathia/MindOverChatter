DO $$
BEGIN
	CREATE TYPE "public"."developmental_dimension" AS ENUM('attachment_quality', 'family_climate', 'schema_formation', 'formative_events', 'origin_to_present');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
ALTER TYPE "public"."memory_type" ADD VALUE IF NOT EXISTS 'formative_experience';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_developmental_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_run_id" uuid NOT NULL,
	"session_id" uuid,
	"dimension" "developmental_dimension" NOT NULL,
	"score" real NOT NULL,
	"notes" text,
	"experiment_version" text NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "research_developmental_coverage" ADD CONSTRAINT "research_developmental_coverage_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "research_developmental_coverage" ADD CONSTRAINT "research_developmental_coverage_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_dev_coverage_user_run_idx" ON "research_developmental_coverage" USING btree ("user_id","experiment_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_dev_coverage_session_idx" ON "research_developmental_coverage" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_dev_coverage_dimension_idx" ON "research_developmental_coverage" USING btree ("dimension");
