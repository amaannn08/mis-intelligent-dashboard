ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "fund" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "drive_folder_path" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "is_old_mis" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_drive_file_id_idx" ON "documents" USING btree ("drive_file_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_fund_company_idx" ON "documents" USING btree ("fund","company_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mis_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"fund" text,
	"sheet_name" text NOT NULL,
	"raw_label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"parent_label" text,
	"standard_metric_key" text,
	"reporting_period" varchar(7) NOT NULL,
	"period_date" date,
	"granularity" text DEFAULT 'monthly' NOT NULL,
	"value" numeric,
	"raw_value" text NOT NULL,
	"unit" text NOT NULL,
	"currency" text,
	"scale" text DEFAULT 'units' NOT NULL,
	"row_index" integer NOT NULL,
	"col_index" integer NOT NULL,
	"source_reference" text NOT NULL,
	"confidence" numeric DEFAULT '1.0' NOT NULL,
	"status" text DEFAULT 'valid' NOT NULL,
	"validation_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mis_metrics" ADD CONSTRAINT "mis_metrics_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mis_metrics" ADD CONSTRAINT "mis_metrics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mis_metrics" ADD CONSTRAINT "mis_metrics_standard_metric_key_metric_definitions_key_fk" FOREIGN KEY ("standard_metric_key") REFERENCES "public"."metric_definitions"("key") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mis_metrics_doc_sheet_row_col_idx" ON "mis_metrics" USING btree ("document_id","sheet_name","row_index","col_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mis_metrics_company_period_idx" ON "mis_metrics" USING btree ("company_id","reporting_period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mis_metrics_standard_key_idx" ON "mis_metrics" USING btree ("company_id","standard_metric_key","reporting_period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mis_metrics_status_idx" ON "mis_metrics" USING btree ("status");
