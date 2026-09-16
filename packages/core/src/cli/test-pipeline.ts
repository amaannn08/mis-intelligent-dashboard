import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables from apps/web/.env.local if not already in env
const envPath = path.resolve(process.cwd(), 'apps/web/.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
dotenv.config();

import { db, pool, documents, companies, metrics, documentChunks, processingJobs } from '@mis/db';
import { eq } from 'drizzle-orm';
import { processDocument } from '../pipeline/index.js';

async function run() {
  const args = process.argv.slice(2);
  const fixtureArg = args[0] || 'packages/core/fixtures/sample_mis.xlsx';
  const companySlug = args[1] || 'noto';

  const resolvedPath = path.isAbsolute(fixtureArg)
    ? fixtureArg
    : path.resolve(process.cwd(), fixtureArg);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Fixture file not found at ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`=== MIS Pipeline CLI Verification ===`);
  console.log(`Fixture: ${resolvedPath}`);
  console.log(`Company Slug: ${companySlug}`);

  // 1. Resolve company
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.slug, companySlug));

  if (!company) {
    console.error(`Error: Company with slug '${companySlug}' not found in database.`);
    process.exit(1);
  }

  console.log(`Matched Company: ${company.name} (ID: ${company.id})`);

  // 2. Compute file metadata
  const fileBytes = fs.readFileSync(resolvedPath);
  const checksum = crypto.createHash('sha256').update(fileBytes).digest('hex');
  const filename = path.basename(resolvedPath);
  const sizeBytes = fileBytes.length;

  // 3. Insert or retrieve document row
  let [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.checksum, checksum));

  if (!doc) {
    [doc] = await db
      .insert(documents)
      .values({
        companyId: company.id,
        filename,
        storagePath: resolvedPath,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileType: 'xlsx',
        sizeBytes,
        checksum,
        status: 'pending',
      })
      .returning();
    console.log(`Created new document record: ${doc?.id}`);
  } else {
    // Reset status to pending for fresh test
    await db
      .update(documents)
      .set({ status: 'pending', error: null })
      .where(eq(documents.id, doc.id));
    console.log(`Using existing document record: ${doc.id}`);
  }

  if (!doc) {
    throw new Error('Failed to create or retrieve document record.');
  }

  // 4. Run pipeline
  console.log(`\nExecuting processDocument(${doc.id})...`);
  const startTime = Date.now();
  const result = await processDocument(doc.id);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n=== Pipeline Completed in ${elapsed}s ===`);
  console.log(`Status: ${result.status}`);
  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  // 5. Query and display Documents row
  const [updatedDoc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, doc.id));

  console.log(`\n--- Document Record ---`);
  console.table([
    {
      id: updatedDoc?.id,
      filename: updatedDoc?.filename,
      status: updatedDoc?.status,
      reportingPeriod: updatedDoc?.reportingPeriod,
      sizeBytes: updatedDoc?.sizeBytes,
      checksum: updatedDoc?.checksum.slice(0, 16) + '...',
      processedAt: updatedDoc?.processedAt?.toISOString(),
    },
  ]);

  // 6. Query and display chunks and embedding dimensions
  const chunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, doc.id));

  const dimResult = await pool.query<{ dims: number }>(
    `SELECT vector_dims(embedding) as dims FROM document_chunks WHERE document_id = $1 LIMIT 1;`,
    [doc.id]
  );
  const actualDims = dimResult.rows[0]?.dims;

  console.log(`\n--- Document Chunks ---`);
  console.log(`Total Chunks Created: ${chunks.length}`);
  console.log(`Stored Embedding Dimensions: ${actualDims ?? 'N/A'}`);
  console.table(
    chunks.map((c) => ({
      chunkIndex: c.chunkIndex,
      tokenCount: c.tokenCount,
      snippet: c.content.slice(0, 70).replace(/\n/g, ' ') + '...',
      sheet: (c.metadata as Record<string, unknown>).sheetName,
    }))
  );

  // 7. Query and display extracted metrics
  const docMetrics = await db
    .select()
    .from(metrics)
    .where(eq(metrics.documentId, doc.id));

  console.log(`\n--- Extracted Metrics (${docMetrics.length} rows) ---`);
  console.table(
    docMetrics.map((m) => ({
      key: m.metricKey,
      value: m.value,
      period: m.reportingPeriod,
      unit: m.unit,
      kind: m.valueKind,
      source: m.sourceReference.length > 55 ? m.sourceReference.slice(0, 52) + '...' : m.sourceReference,
    }))
  );

  // 8. Display processing jobs log
  const jobs = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.documentId, doc.id));

  console.log(`\n--- Processing Jobs Audit Log ---`);
  console.table(
    jobs.map((j) => ({
      step: j.step,
      status: j.status,
      startedAt: j.startedAt?.toISOString().split('T')[1]?.slice(0, 8),
      finishedAt: j.finishedAt?.toISOString().split('T')[1]?.slice(0, 8),
    }))
  );

  await pool.end();
}

run().catch(async (err) => {
  console.error('Fatal CLI Error:', err);
  await pool.end();
  process.exit(1);
});
