import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { documentStatusEnum } from './enums';

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    storagePath: text('storage_path').notNull(),
    mime: text('mime').notNull(),
    fileType: text('file_type').notNull(),
    reportingPeriod: varchar('reporting_period', { length: 7 }), // 'YYYY-MM'
    sizeBytes: integer('size_bytes').notNull(),
    checksum: text('checksum').notNull(),
    status: documentStatusEnum('status').notNull().default('pending'),
    error: text('error'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('documents_company_checksum_idx').on(table.companyId, table.checksum),
    index('documents_company_reporting_period_idx').on(table.companyId, table.reportingPeriod),
  ]
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
