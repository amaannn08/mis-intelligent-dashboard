/**
 * Re-runs the full ingestion pipeline (parse -> extract -> chunk -> embed)
 * for every existing spreadsheet document, so already-uploaded files pick
 * up the matrix-parser wide-descriptor-table fix (SKU/product/attributes),
 * the new mis_metrics.attributes column, and document_sheets backfill —
 * all via the exact same processDocument() path used for every new upload.
 *
 * Idempotent per document: mis_metrics, document_sheets, and
 * document_chunks are each deleted-and-reinserted for that document_id by
 * processDocument itself, so re-running this is safe.
 *
 * Usage:
 *   npx tsx scripts/reprocess-spreadsheets.ts --local [--dry-run] [--limit N]
 *   npx tsx scripts/reprocess-spreadsheets.ts --prod  [--dry-run] [--limit N]
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

function maskUrl(conn: string): string {
  try {
    const u = new URL(conn);
    return `${u.protocol}//${u.username ? u.username + ':***@' : ''}${u.host}${u.pathname}`;
  } catch {
    return '***masked***';
  }
}

function setupEnvironmentAndDb(target: 'prod' | 'local'): string {
  const hermesPath = '/home/amann/.hermes/private/mis-secrets.env';
  let hermesEnv: Record<string, string> = {};
  if (fs.existsSync(hermesPath)) {
    hermesEnv = dotenv.parse(fs.readFileSync(hermesPath, 'utf8'));
  }

  let connectionString: string | undefined;

  if (target === 'prod') {
    connectionString = process.env.MIS_PROD_DATABASE_URL || hermesEnv.MIS_PROD_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'Production target requested, but MIS_PROD_DATABASE_URL is not set in environment or /home/amann/.hermes/private/mis-secrets.env. Aborting.'
      );
    }
    process.env.DATABASE_URL = connectionString;
    process.env.TARGET_ENV = 'prod';
    if (hermesEnv.MIS_GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
      process.env.GEMINI_API_KEY = hermesEnv.MIS_GEMINI_API_KEY;
    }
    if (hermesEnv.MIS_DEEPSEEK_API_KEY && !process.env.DEEPSEEK_API_KEY) {
      process.env.DEEPSEEK_API_KEY = hermesEnv.MIS_DEEPSEEK_API_KEY;
    }
    if (hermesEnv.MIS_BLOB_READ_WRITE_TOKEN && !process.env.BLOB_READ_WRITE_TOKEN) {
      process.env.BLOB_READ_WRITE_TOKEN = hermesEnv.MIS_BLOB_READ_WRITE_TOKEN;
    }
  } else {
    process.env.TARGET_ENV = 'local';
    for (const envFile of ['apps/web/.env.local', 'packages/db/.env', '.env']) {
      const resolved = path.resolve(process.cwd(), envFile);
      if (fs.existsSync(resolved)) {
        dotenv.config({ path: resolved });
        if (process.env.DATABASE_URL) break;
      }
    }
    connectionString = process.env.DATABASE_URL || hermesEnv.MIS_DEV_DATABASE_URL;
    if (!connectionString) {
      throw new Error('Local target requested, but DATABASE_URL is not set in environment or .env.local.');
    }
    process.env.DATABASE_URL = connectionString;
  }

  return connectionString;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  let target: 'prod' | 'local' = 'prod';
  if (args.includes('--local')) target = 'local';
  if (args.includes('--prod')) target = 'prod';

  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : undefined;

  const connectionString = setupEnvironmentAndDb(target);
  console.log(`[Target] ${target.toUpperCase()}: ${maskUrl(connectionString)}${dryRun ? ' (DRY RUN)' : ''}`);

  // Import AFTER env vars are set, since @mis/db reads DATABASE_URL at module load.
  const { db, documents } = await import('@mis/db');
  const { processDocument } = await import('../packages/core/src/pipeline/index.js');
  const { eq, or, inArray } = await import('drizzle-orm');

  const allDocs = await db
    .select()
    .from(documents)
    .where(or(eq(documents.status, 'processed'), eq(documents.status, 'failed')));

  let spreadsheetDocs = allDocs.filter((d) => /\.xlsx?$/i.test(d.filename));
  if (limit) spreadsheetDocs = spreadsheetDocs.slice(0, limit);

  console.log(`Found ${allDocs.length} total document(s); ${spreadsheetDocs.length} spreadsheet document(s) to reprocess.`);

  if (dryRun) {
    for (const doc of spreadsheetDocs) {
      console.log(`[DRY-RUN] Would reprocess ${doc.filename} (${doc.id}), company=${doc.companyId}`);
    }
    console.log(`\nDry run complete. ${spreadsheetDocs.length} document(s) would be reprocessed.`);
    process.exit(0);
  }

  let succeeded = 0;
  let failed = 0;
  const failures: Array<{ id: string; filename: string; error: string }> = [];

  for (let i = 0; i < spreadsheetDocs.length; i++) {
    const doc = spreadsheetDocs[i]!;
    const label = `[${i + 1}/${spreadsheetDocs.length}] ${doc.filename} (${doc.id})`;
    try {
      const result = await processDocument(doc.id);
      if (result.status === 'processed') {
        console.log(`${label} -> OK`);
        succeeded++;
      } else {
        console.error(`${label} -> FAILED: ${result.error}`);
        failed++;
        failures.push({ id: doc.id, filename: doc.filename, error: result.error || 'unknown error' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${label} -> ERROR: ${msg}`);
      failed++;
      failures.push({ id: doc.id, filename: doc.filename, error: msg });
    }
  }

  console.log(`\nDone. succeeded=${succeeded} failed=${failed} total=${spreadsheetDocs.length}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.filename} (${f.id}): ${f.error}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
