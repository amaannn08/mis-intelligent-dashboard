import { eq } from 'drizzle-orm';
import { db as defaultDb, documents, documentSheets } from '@mis/db';
import type { RawWorkbookExtraction } from './types.js';

/**
 * Idempotently and durably persists raw workbook sheets and coverage metadata.
 * Designed to execute within a pipeline transaction or standalone.
 */
export async function saveDocumentRawSheets(
  txOrDb: any,
  documentId: string,
  rawExtraction: RawWorkbookExtraction,
  semanticMetricsBySheet?: Map<string, number>,
  sheetLayouts?: Map<string, string>
): Promise<void> {
  const db = txOrDb || defaultDb;

  // 1. Delete existing sheet records for this document
  await db.delete(documentSheets).where(eq(documentSheets.documentId, documentId));

  // 2. Insert all sheets
  if (rawExtraction.sheets.length > 0) {
    const sheetRows = rawExtraction.sheets.map((s) => {
      const metricCount = semanticMetricsBySheet?.get(s.sheetName) ?? 0;
      const detectedLayout = sheetLayouts?.get(s.sheetName) || s.detectedLayout || 'unknown';
      const isSemanticParsed = metricCount > 0 || detectedLayout === 'notes_and_metadata';

      return {
        documentId,
        sheetIndex: s.sheetIndex,
        sheetName: s.sheetName,
        dimensions: s.dimensions,
        rowCount: s.rowCount,
        colCount: s.colCount,
        nonEmptyRows: s.nonEmptyRows,
        nonEmptyCells: s.nonEmptyCells,
        totalCells: s.totalCells,
        numericCells: s.numericCells,
        textCells: s.textCells,
        formulaCells: s.formulaCells,
        errorCells: s.errorCells,
        merges: s.merges,
        headers: s.headers ?? null,
        detectedLayout,
        semanticParsed: isSemanticParsed,
        semanticMetricCount: metricCount,
        cells: s.cells,
      };
    });

    // Batch insert sheets
    const BATCH_SIZE = 50;
    for (let i = 0; i < sheetRows.length; i += BATCH_SIZE) {
      const batch = sheetRows.slice(i, i + BATCH_SIZE);
      await db.insert(documentSheets).values(batch);
    }
  }

  // 3. Mark document as raw-preserved with total sheet count
  await db
    .update(documents)
    .set({
      rawPreserved: true,
      totalSheets: rawExtraction.totalSheets,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}
