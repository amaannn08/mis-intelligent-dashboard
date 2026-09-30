/**
 * scripts/repair-blobs.ts
 *
 * Standalone repair command:
 * Uploads locally retained document binaries (from document_blobs or disk mirror)
 * to Vercel Blob and populates documents.blob_url / blob_pathname when a valid
 * BLOB_READ_WRITE_TOKEN is provided.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { put } from '@vercel/blob';
import { eq, isNull } from 'drizzle-orm';

function maskUrl(conn: string): string {
  try {
    const u = new URL(conn);
    return `${u.protocol}//${u.username ? u.username + ':***@' : ''}${u.host}${u.pathname}`;
  } catch {
    return '***masked***';
  }
}

async function runRepair() {
  const args = process.argv.slice(2);
  let target = 'prod';
  for (const a of args) {
    if (a.startsWith('--target=')) {
      target = a.split('=')[1]!.toLowerCase();
    } else if (a === '--local') {
      target = 'local';
    } else if (a === '--prod') {
      target = 'prod';
    }
  }

  // Load hermes secrets if available
  const hermesPath = '/home/amann/.hermes/private/mis-secrets.env';
  let hermesEnv: Record<string, string> = {};
  if (fs.existsSync(hermesPath)) {
    hermesEnv = dotenv.parse(fs.readFileSync(hermesPath, 'utf8'));
  }

  let connectionString: string | undefined;
  if (target === 'prod') {
    connectionString = process.env.MIS_PROD_DATABASE_URL || hermesEnv.MIS_PROD_DATABASE_URL;
    if (!connectionString) {
      throw new Error('Production target requested, but MIS_PROD_DATABASE_URL is not set.');
    }
    process.env.DATABASE_URL = connectionString;
    process.env.TARGET_ENV = 'prod';
  } else {
    connectionString = process.env.DATABASE_URL || hermesEnv.MIS_DEV_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'Local target requested, but DATABASE_URL is not set in environment or .env.local.'
      );
    }
    process.env.DATABASE_URL = connectionString;
    process.env.TARGET_ENV = 'local';
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || hermesEnv.MIS_BLOB_READ_WRITE_TOKEN;

  console.log('='.repeat(70));
  console.log('VERCEL BLOB STORAGE REPAIR UTILITY');
  console.log('='.repeat(70));
  console.log(`Database Target: ${target.toUpperCase()}`);
  console.log(`Database Host:   ${maskUrl(connectionString)}`);
  console.log(`Blob Token:      ${blobToken ? 'Supplied (length ' + blobToken.length + ')' : 'MISSING'}`);
  console.log('='.repeat(70));

  if (!blobToken) {
    console.warn(
      '\n⚠️ No valid BLOB_READ_WRITE_TOKEN was provided.\n' +
      'To repair documents with missing Blob URLs, please set BLOB_READ_WRITE_TOKEN in your environment or mis-secrets.env.\n' +
      'Documents will continue to stream securely from document_blobs bytea storage.'
    );
    return;
  }

  const { db, documents, documentBlobs, companies } = await import('../packages/db/src/index.js');

  const pendingDocs = await db
    .select({
      id: documents.id,
      filename: documents.filename,
      storagePath: documents.storagePath,
      companyId: documents.companyId,
      blobUrl: documents.blobUrl,
    })
    .from(documents)
    .where(isNull(documents.blobUrl));

  console.log(`Found ${pendingDocs.length} documents missing Vercel Blob URLs.`);
  if (pendingDocs.length === 0) {
    console.log('All documents already have Vercel Blob URLs populated. Nothing to repair.');
    return;
  }

  let repairedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < pendingDocs.length; i++) {
    const doc = pendingDocs[i]!;
    const prefix = `[${i + 1}/${pendingDocs.length}] [${doc.filename}]`;

    // 1. Fetch file bytes from documentBlobs or disk
    let fileBytes: Buffer | null = null;
    const [blobRow] = await db
      .select()
      .from(documentBlobs)
      .where(eq(documentBlobs.documentId, doc.id));

    if (blobRow?.data) {
      fileBytes = blobRow.data;
    } else if (doc.storagePath) {
      const resolved = path.isAbsolute(doc.storagePath)
        ? doc.storagePath
        : path.resolve(process.cwd(), doc.storagePath);
      if (fs.existsSync(resolved)) {
        fileBytes = fs.readFileSync(resolved);
      }
    }

    if (!fileBytes) {
      console.warn(`${prefix} ⚠️ Skipped: Binary not found in document_blobs or disk mirror.`);
      failedCount++;
      continue;
    }

    // 2. Fetch company slug
    const [company] = await db
      .select({ slug: companies.slug })
      .from(companies)
      .where(eq(companies.id, doc.companyId));
    const companySlug = company?.slug || 'unknown';

    try {
      const blobPath = `mis-drive/${companySlug}/${doc.filename}`;
      const blobResult = await put(blobPath, fileBytes, {
        access: 'public',
        token: blobToken,
      });

      await db
        .update(documents)
        .set({
          blobUrl: blobResult.url,
          blobPathname: blobResult.pathname,
        })
        .where(eq(documents.id, doc.id));

      console.log(`${prefix} ✅ Repaired: ${blobResult.url}`);
      repairedCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${prefix} ❌ Upload failed: ${msg}`);
      failedCount++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Blob Repair Summary: ${repairedCount} repaired, ${failedCount} skipped/failed.`);
  console.log('='.repeat(70));
}

runRepair()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Blob repair failed:', err);
    process.exit(1);
  });
