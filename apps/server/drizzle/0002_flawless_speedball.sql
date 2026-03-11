ALTER TYPE "public"."assessment_type" ADD VALUE 'iss_sleep';--> statement-breakpoint
ALTER TYPE "public"."assessment_type" ADD VALUE 'panic_screener';--> statement-breakpoint
ALTER TYPE "public"."assessment_type" ADD VALUE 'trauma_gating';--> statement-breakpoint
ALTER TYPE "public"."assessment_type" ADD VALUE 'functioning';--> statement-breakpoint
ALTER TYPE "public"."assessment_type" ADD VALUE 'substance_use';--> statement-breakpoint
ALTER TYPE "public"."assessment_type" ADD VALUE 'relationship';--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "screener_results" jsonb;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "parent_assessment_id" uuid;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_parent_assessment_id_assessments_id_fk" FOREIGN KEY ("parent_assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action;