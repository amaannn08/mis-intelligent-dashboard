import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { documents } from './documents';
import { metricDefinitions } from './metric-definitions';

export const misMetrics = pgTable(
  'mis_metrics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    fund: text('fund'), // 'Fund I' | 'Fund II' | 'Fund III'
    sheetName: text('sheet_name').notNull(),
    rawLabel: text('raw_label').notNull(), // Verbatim: 'Total Revenue (000\' US$)'
    normalizedLabel: text('normalized_label').notNull(), // 'total_revenue'
    parentLabel: text('parent_label'), // Hierarchy: 'Fullstack model'
    standardMetricKey: text('standard_metric_key') // 'revenue' | 'ebitda' | null
      .references(() => metricDefinitions.key, { onDelete: 'set null' }),
    reportingPeriod: varchar('reporting_period', { length: 7 }).notNull(), // '2026-03'
    periodDate: date('period_date'), // '2026-03-31'
    granularity: text('granularity').notNull().default('monthly'), // 'monthly' | 'quarterly' | 'annual'
    value: numeric('value'), // Normalized number (null if quarantined error)
    rawValue: text('raw_value').notNull(), // Verbatim cell text: '462', '#REF!', '$76,362'
    unit: text('unit').notNull(), // 'INR' | 'USD' | 'percent' | 'count'
    currency: text('currency'), // 'INR' | 'USD' | null
    scale: text('scale').notNull().default('units'), // 'units' | 'lakh' | 'crore' | 'thousand' | 'million'
    rowIndex: integer('row_index').notNull(),
    colIndex: integer('col_index').notNull(),
    sourceReference: text('source_reference').notNull(),
    confidence: numeric('confidence').notNull().default('1.0'),
    status: text('status').notNull().default('valid'), // 'valid' | 'quarantined' | 'derived'
    validationNotes: text('validation_notes'), // e.g. '#REF! error quarantined'
    blockLabel: text('block_label'), // e.g. 'Condiments'
    blockIndex: integer('block_index'), // Sequential index of block within sheet
    parentBlockLabel: text('parent_block_label'), // e.g. 'Blinkit'
    kind: text('kind'), // 'currency' | 'count' | 'percent' | 'ratio'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('mis_metrics_doc_sheet_row_col_idx').on(
      table.documentId,
      table.sheetName,
      table.rowIndex,
      table.colIndex
    ),
    index('mis_metrics_company_period_idx').on(table.companyId, table.reportingPeriod),
    index('mis_metrics_standard_key_idx').on(
      table.companyId,
      table.standardMetricKey,
      table.reportingPeriod
    ),
    index('mis_metrics_status_idx').on(table.status),
    index('mis_metrics_company_block_idx').on(table.companyId, table.blockLabel),
    index('mis_metrics_block_label_idx').on(table.blockLabel),
  ]
);

export type MisMetric = typeof misMetrics.$inferSelect;
export type NewMisMetric = typeof misMetrics.$inferInsert;
