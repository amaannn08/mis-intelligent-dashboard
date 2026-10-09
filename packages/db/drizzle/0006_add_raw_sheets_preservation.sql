-- Migration 0006: Add raw sheets preservation and document archive provenance
-- Idempotent and additive: creates document_sheets table and adds archive/provenance columns to documents

CREATE TABLE IF NOT EXISTS "document_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE cascade,
	"sheet_index" integer NOT NULL,
	"sheet_name" text NOT NULL,
	"dimensions" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"col_count" integer DEFAULT 0 NOT NULL,
	"non_empty_rows" integer DEFAULT 0 NOT NULL,
	"non_empty_cells" integer DEFAULT 0 NOT NULL,
	"total_cells" integer DEFAULT 0 NOT NULL,
	"numeric_cells" integer DEFAULT 0 NOT NULL,
	"text_cells" integer DEFAULT 0 NOT NULL,
	"formula_cells" integer DEFAULT 0 NOT NULL,
	"error_cells" integer DEFAULT 0 NOT NULL,
	"merges" jsonb,
	"headers" jsonb,
	"detected_layout" text DEFAULT 'unknown' NOT NULL,
	"semantic_parsed" boolean DEFAULT false NOT NULL,
	"semantic_metric_count" integer DEFAULT 0 NOT NULL,
	"cells" jsonb,
	"raw_data_compressed" bytea,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "documents" ALTER COLUMN "company_id" DROP NOT NULL;
ALTER TABLE "document_chunks" ALTER COLUMN "company_id" DROP NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "parent_document_id" uuid REFERENCES "documents"("id") ON DELETE cascade;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "archive_entry_path" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "is_portfolio_tracker" boolean DEFAULT false NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "extraction_version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "total_sheets" integer DEFAULT 0 NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "raw_preserved" boolean DEFAULT false NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS "document_sheets_doc_sheet_idx" ON "document_sheets" ("document_id", "sheet_name");
CREATE INDEX IF NOT EXISTS "document_sheets_doc_index_idx" ON "document_sheets" ("document_id", "sheet_index");
CREATE INDEX IF NOT EXISTS "document_sheets_semantic_parsed_idx" ON "document_sheets" ("document_id", "semantic_parsed");
CREATE INDEX IF NOT EXISTS "documents_parent_doc_idx" ON "documents" ("parent_document_id");
CREATE INDEX IF NOT EXISTS "documents_is_portfolio_tracker_idx" ON "documents" ("is_portfolio_tracker");
