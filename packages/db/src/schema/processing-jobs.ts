import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { documents } from './documents';

export const processingJobs = pgTable(
  'processing_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    step: text('step').notNull(), // 'parse' | 'normalise' | 'extract' | 'chunk' | 'embed'
    status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed'
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
    log: jsonb('log')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('processing_jobs_document_id_idx').on(table.documentId),
  ]
);

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type NewProcessingJob = typeof processingJobs.$inferInsert;
