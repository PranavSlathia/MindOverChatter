CREATE TABLE "research_counselbench_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_run_id" uuid NOT NULL,
	"experiment_version" text NOT NULL,
	"session_id" uuid,
	"exchange_index" integer NOT NULL,
	"empathy" real NOT NULL,
	"relevance" real NOT NULL,
	"safety" real NOT NULL,
	"actionability" real NOT NULL,
	"depth" real NOT NULL,
	"professionalism" real NOT NULL,
	"overall" real NOT NULL,
	"reasoning" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_counselbench_scores" ADD CONSTRAINT "research_counselbench_scores_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_counselbench_scores" ADD CONSTRAINT "research_counselbench_scores_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_counselbench_user_ran_at_idx" ON "research_counselbench_scores" USING btree ("user_id","ran_at");--> statement-breakpoint
CREATE INDEX "research_counselbench_session_id_idx" ON "research_counselbench_scores" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "research_counselbench_run_id_idx" ON "research_counselbench_scores" USING btree ("experiment_run_id");