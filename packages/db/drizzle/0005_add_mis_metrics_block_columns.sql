ALTER TABLE "mis_metrics" ADD COLUMN IF NOT EXISTS "block_label" text;--> statement-breakpoint
ALTER TABLE "mis_metrics" ADD COLUMN IF NOT EXISTS "block_index" integer;--> statement-breakpoint
ALTER TABLE "mis_metrics" ADD COLUMN IF NOT EXISTS "parent_block_label" text;--> statement-breakpoint
ALTER TABLE "mis_metrics" ADD COLUMN IF NOT EXISTS "kind" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mis_metrics_company_block_idx" ON "mis_metrics" USING btree ("company_id","block_label");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mis_metrics_block_label_idx" ON "mis_metrics" USING btree ("block_label");
