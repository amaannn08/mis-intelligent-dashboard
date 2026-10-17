/**
 * Backfill script: populates `document_sheets` (raw spreadsheet preservation,
 * migration 0006) for already-processed spreadsheet documents that predate
 * the feature. Deliberately narrow in scope — it only extracts/parses the
 * workbook (local, no external API calls) and writes to document_sheets.
 * It does NOT touch mis_metrics, metrics, document_chunks, or embeddings,
 * so it is safe to re-run and costs nothing.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/backfill-document-sheets.ts [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { eq, isNull, or } from 'drizzle-orm';
import { db, documents, documentBlobs, documentSheets } from '@mis/db';
import {
  extractRawWorkbookData,
  saveDocumentRawSheets,
} from '../packages/core/src/raw-sheets/index.js';
import { parseMatrixSpreadsheet } from '../packages/core/src/parsing/index.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function fetchFileBytes(doc: typeof documents.$inferSelect): Promise<Buffer | null> {
  if (doc.blobUrl) {
    try {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      const res = await fetch(doc.blobUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
    } catch {
      // fall through to disk / document_blobs
    }
  }

  if (doc.storagePath) {
    const resolvedPath = path.isAbsolute(doc.storagePath)
      ? doc.storagePath
      : path.resolve(process.cwd(), doc.storagePath);
    if (fs.existsSync(resolvedPath)) {
      return fs.readFileSync(resolvedPath);
    }
  }

  const [blobRow] = await db
    .select()
    .from(documentBlobs)
    .where(eq(documentBlobs.documentId, doc.id));
  if (blobRow?.data) {
    return blobRow.data as Buffer;
  }

  return null;
}

async function main() {
  const allDocs = await db.select().from(documents).where(
    or(eq(documents.status, 'processed'), isNull(documents.status))
  );

  const spreadsheetDocs = allDocs.filter((d) => /\.xlsx?$/i.test(d.filename));

  console.log(`Found ${spreadsheetDocs.length} spreadsheet document(s) with status='processed'.`);

  let backfilled = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const doc of spreadsheetDocs) {
    const [existing] = await db
      .select({ id: documentSheets.id })
      .from(documentSheets)
      .where(eq(documentSheets.documentId, doc.id))
      .limit(1);

    if (existing) {
      skippedExisting++;
      continue;
    }

    try {
      const fileBytes = await fetchFileBytes(doc);
      if (!fileBytes) {
        console.warn(`[SKIP] ${doc.filename} (${doc.id}) — file binary not found (blobUrl/disk/document_blobs all missed).`);
        failed++;
        continue;
      }

      const rawExtraction = extractRawWorkbookData(fileBytes, doc.filename);

      if (DRY_RUN) {
        console.log(`[DRY-RUN] Would backfill ${doc.filename} (${doc.id}) — ${rawExtraction.sheets.length} sheet(s).`);
        backfilled++;
        continue;
      }

      if (doc.isPortfolioTracker) {
        await saveDocumentRawSheets(undefined, doc.id, rawExtraction);
      } else {
        const matrixResult = parseMatrixSpreadsheet(fileBytes, doc.filename);
        const metricsBySheet = new Map<string, number>();
        for (const m of matrixResult.metrics) {
          metricsBySheet.set(m.sheetName, (metricsBySheet.get(m.sheetName) || 0) + 1);
        }
        await saveDocumentRawSheets(
          undefined,
          doc.id,
          rawExtraction,
          metricsBySheet,
          matrixResult.sheetLayouts
        );
      }

      console.log(`[OK] Backfilled ${doc.filename} (${doc.id}) — ${rawExtraction.sheets.length} sheet(s).`);
      backfilled++;
    } catch (err) {
      console.error(`[FAIL] ${doc.filename} (${doc.id}):`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nDone. backfilled=${backfilled} skipped(existing)=${skippedExisting} failed=${failed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
