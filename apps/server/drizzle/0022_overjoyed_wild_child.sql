ALTER TABLE "memories" ADD COLUMN "mem0_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "memories_mem0_id_idx" ON "memories" USING btree ("mem0_id");