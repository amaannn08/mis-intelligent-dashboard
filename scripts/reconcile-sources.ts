#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';
import { parseArgs } from 'node:util';
import { processDocument } from '../packages/core/src/pipeline/index.js';

interface DiagnosticRow {
  id: string;
  filename: string;
  company_name: string;
  company_slug: string;
  reporting_period: string | null;
  uploaded_at: string;
  status: string;
  drive_file_id: string | null;
  mis_metrics_count: string;
  document_sheets_count: string;
  chunks_count: string;
}

async function getConnectionString(): Promise<string | undefined> {
  let conn =
    process.env.MIS_PROD_DATABASE_URL_DIRECT ||
    process.env.MIS_PROD_DATABASE_URL;

  const hermesPath = '/home/amann/.hermes/private/mis-secrets.env';
  if (!conn && fs.existsSync(hermesPath)) {
    const env = dotenv.parse(fs.readFileSync(hermesPath, 'utf8'));
    conn = env.MIS_PROD_DATABASE_URL_DIRECT || env.MIS_PROD_DATABASE_URL;
  }
  return conn;
}

export async function runReconciliationDiagnostics(options: {
  connString?: string;
  readOnly?: boolean;
}): Promise<DiagnosticRow[]> {
  const conn = options.connString || (await getConnectionString());
  if (!conn) {
    throw new Error('No database connection string available.');
  }

  const client = new pg.Client({ connectionString: conn });
  await client.connect();

  try {
    if (options.readOnly) {
      await client.query('SET default_transaction_read_only = ON;');
    }

    const query = `
      SELECT 
        d.id,
        d.filename,
        c.name as company_name,
        c.slug as company_slug,
        d.reporting_period,
        d.uploaded_at::text,
        d.status,
        d.drive_file_id,
        COUNT(DISTINCT mm.id)::text as mis_metrics_count,
        0::text as document_sheets_count,
        COUNT(DISTINCT dc.id)::text as chunks_count
      FROM documents d
      LEFT JOIN companies c ON d.company_id = c.id
      LEFT JOIN mis_metrics mm ON d.id = mm.document_id
      LEFT JOIN document_chunks dc ON d.id = dc.document_id
      WHERE d.drive_file_id IS NULL
      GROUP BY d.id, d.filename, c.name, c.slug, d.reporting_period, d.uploaded_at, d.status, d.drive_file_id
      ORDER BY d.uploaded_at ASC;
    `;

    const res = await client.query<DiagnosticRow>(query);
    return res.rows;
  } finally {
    await client.end();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      diagnostics: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: true },
      reparse: { type: 'boolean', default: false },
      'document-id': { type: 'string' },
      limit: { type: 'string' },
    },
    allowPositionals: true,
  });

  console.log('=== MIS Source & Web Direct Upload Reconciliation Diagnostics ===');

  const rows = await runReconciliationDiagnostics({ readOnly: true });
  console.log(`\nFound ${rows.length} web direct upload documents (drive_file_id IS NULL):\n`);

  console.table(
    rows.map((r) => ({
      ID: r.id,
      Company: r.company_name,
      Filename: r.filename,
      Period: r.reporting_period,
      Status: r.status,
      'MIS Metrics': parseInt(r.mis_metrics_count, 10),
      Chunks: parseInt(r.chunks_count, 10),
      UploadedAt: r.uploaded_at.split('T')[0],
      NeedsReparse: parseInt(r.mis_metrics_count, 10) === 0 ? 'YES (0 metrics)' : 'No',
    }))
  );

  const needsReparse = rows.filter((r) => parseInt(r.mis_metrics_count, 10) === 0);
  console.log(`\nDirect uploads requiring re-parse: ${needsReparse.length}`);

  if (values.reparse && !values['dry-run']) {
    console.log('\n[SAFETY] Bulk reparse of production is blocked in Milestone 1 per reviewer instructions.');
    console.log('[SAFETY] Please review code and tests before executing production reparse in Milestone 4.');
  } else {
    console.log('\n[DRY RUN] Read-only diagnostics complete. No production modifications made.');
  }
}

if (process.argv[1]?.endsWith('reconcile-sources.ts')) {
  main().catch((err) => {
    console.error('Reconciliation diagnostics failed:', err);
    process.exit(1);
  });
}
