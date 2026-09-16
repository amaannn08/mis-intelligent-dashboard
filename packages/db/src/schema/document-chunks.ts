import { index, integer, jsonb, pgTable, text, uuid, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { documents } from './documents';

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenCount: integer('token_count'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  (table) => [
    index('document_chunks_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
    index('document_chunks_metadata_gin_idx').using('gin', table.metadata),
    index('document_chunks_document_chunk_idx').on(table.documentId, table.chunkIndex),
    index('document_chunks_company_idx').on(table.companyId),
  ]
);

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
