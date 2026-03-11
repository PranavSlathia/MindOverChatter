CREATE TABLE "user_formulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"domain_signals" jsonb,
	"action_recommendations" jsonb,
	"data_confidence" text NOT NULL,
	"triggered_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_formulations" ADD CONSTRAINT "user_formulations_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;