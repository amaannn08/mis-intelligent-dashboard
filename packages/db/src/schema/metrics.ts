import { index, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { documents } from './documents';
import { metricDefinitions } from './metric-definitions';
import { metricValueKindEnum } from './enums';

export const metrics = pgTable(
  'metrics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    metricKey: text('metric_key')
      .notNull()
      .references(() => metricDefinitions.key, { onDelete: 'restrict' }),
    value: numeric('value').notNull(),
    unit: text('unit').notNull(),
    reportingPeriod: varchar('reporting_period', { length: 7 }).notNull(), // 'YYYY-MM'
    sourceReference: text('source_reference').notNull(),
    valueKind: metricValueKindEnum('value_kind').notNull().default('reported'),
    confidence: numeric('confidence'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('metrics_company_key_period_doc_idx').on(
      table.companyId,
      table.metricKey,
      table.reportingPeriod,
      table.documentId
    ),
    index('metrics_company_key_period_idx').on(
      table.companyId,
      table.metricKey,
      table.reportingPeriod
    ),
  ]
);

export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
