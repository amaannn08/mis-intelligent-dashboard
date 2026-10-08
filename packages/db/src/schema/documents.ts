import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
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
    blobUrl: text('blob_url'),
    blobPathname: text('blob_pathname'),
    mime: text('mime').notNull(),
    fileType: text('file_type').notNull(),
    reportingPeriod: varchar('reporting_period', { length: 7 }), // 'YYYY-MM'
    sizeBytes: integer('size_bytes').notNull(),
    checksum: text('checksum').notNull(),
    status: documentStatusEnum('status').notNull().default('pending'),
    error: text('error'),
    originalRetained: boolean('original_retained').default(true).notNull(),
    fund: text('fund'), // 'Fund I' | 'Fund II' | 'Fund III'
    driveFileId: text('drive_file_id'), // Google Drive file ID for sync
    driveFolderPath: text('drive_folder_path'), // e.g. 'MIS FY 26/Fund I/Animall'
    isOldMis: boolean('is_old_mis').default(false).notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('documents_company_checksum_idx').on(table.companyId, table.checksum),
    index('documents_company_reporting_period_idx').on(table.companyId, table.reportingPeriod),
    index('documents_drive_file_id_idx').on(table.driveFileId),
    index('documents_fund_company_idx').on(table.fund, table.companyId),
  ]
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
