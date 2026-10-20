-- Migration 0007: Add attributes column for wide entity/descriptor tables
-- (e.g. SKU Code | Product | Category | Sub Category | <months...>).
-- Idempotent and additive.
ALTER TABLE "mis_metrics" ADD COLUMN IF NOT EXISTS "attributes" jsonb;
