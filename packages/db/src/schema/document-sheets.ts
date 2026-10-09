import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bytea } from './document-blobs';
import { documents } from './documents';

export interface RawStoredCell {
  r: number; // 1-based row index
  c: number; // 1-based col index
  coord: string; // e.g. "A1", "B12"
  v: unknown; // Typed raw value (number, string, boolean, date)
  w: string; // Verbatim formatted text
  f?: string; // Formula without "="
  t: string; // Cell type: 'n' | 's' | 'b' | 'e' | 'd' | 'z'
  err?: string; // Error string if type is 'e'
  numFormat?: string; // Number format e.g. "0.00%"
}

export const documentSheets = pgTable(
  'document_sheets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    sheetIndex: integer('sheet_index').notNull(),
    sheetName: text('sheet_name').notNull(),
    dimensions: text('dimensions'), // e.g. "A1:J1000"
    rowCount: integer('row_count').default(0).notNull(),
    colCount: integer('col_count').default(0).notNull(),
    nonEmptyRows: integer('non_empty_rows').default(0).notNull(),
    nonEmptyCells: integer('non_empty_cells').default(0).notNull(),
    totalCells: integer('total_cells').default(0).notNull(),
    numericCells: integer('numeric_cells').default(0).notNull(),
    textCells: integer('text_cells').default(0).notNull(),
    formulaCells: integer('formula_cells').default(0).notNull(),
    errorCells: integer('error_cells').default(0).notNull(),
    merges: jsonb('merges').$type<string[]>(), // e.g. ["A1:C1", "D2:D5"]
    headers: jsonb('headers').$type<string[]>(), // candidate headers
    detectedLayout: text('detected_layout').default('unknown').notNull(), // 'matrix' | 'vertical_series' | 'table' | 'notes' | 'empty'
    semanticParsed: boolean('semantic_parsed').default(false).notNull(),
    semanticMetricCount: integer('semantic_metric_count').default(0).notNull(),
    cells: jsonb('cells').$type<RawStoredCell[]>(),
    rawDataCompressed: bytea('raw_data_compressed'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('document_sheets_doc_sheet_idx').on(table.documentId, table.sheetName),
    index('document_sheets_doc_index_idx').on(table.documentId, table.sheetIndex),
    index('document_sheets_semantic_parsed_idx').on(table.documentId, table.semanticParsed),
  ]
);

export type DocumentSheet = typeof documentSheets.$inferSelect;
export type NewDocumentSheet = typeof documentSheets.$inferInsert;
