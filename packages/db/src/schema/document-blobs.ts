import { customType, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { documents } from './documents';

export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(val: Buffer): Buffer {
    return val;
  },
  fromDriver(val: unknown): Buffer {
    if (Buffer.isBuffer(val)) {
      return val;
    }
    return Buffer.from(val as string);
  },
});

export const documentBlobs = pgTable('document_blobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id')
    .notNull()
    .unique()
    .references(() => documents.id, { onDelete: 'cascade' }),
  data: bytea('data').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type DocumentBlob = typeof documentBlobs.$inferSelect;
export type NewDocumentBlob = typeof documentBlobs.$inferInsert;
