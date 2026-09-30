import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import xlsx from 'xlsx';
import { execFileSync } from 'node:child_process';
import { NextRequest } from 'next/server';

// Load hermes secrets to point directly to Production Neon
const hermesPath = '/home/amann/.hermes/private/mis-secrets.env';
let hermesEnv: Record<string, string> = {};
if (fs.existsSync(hermesPath)) {
  hermesEnv = dotenv.parse(fs.readFileSync(hermesPath, 'utf8'));
}

process.env.DATABASE_URL = hermesEnv.MIS_PROD_DATABASE_URL;
process.env.TARGET_ENV = 'prod';
process.env.COOKIE_SECRET = hermesEnv.COOKIE_SECRET || 'dev-cookie-secret-for-testing-only-replace-in-prod-min-32-chars';

async function testDownloadRoute() {
  console.log('='.repeat(70));
  console.log('TESTING DOCUMENT DOWNLOAD ROUTE WITHOUT VERCEL BLOB');
  console.log('='.repeat(70));

  const { signSession } = await import('../apps/web/src/lib/auth.js');
  const { GET } = await import('../apps/web/src/app/api/documents/[id]/file/route.js');
  const { db, documents } = await import('../packages/db/src/index.js');

  // Query Pratilipi document
  const allDocs = await db.select().from(documents);
  const pratilipiDoc = allDocs.find((d) => d.filename.includes('Pratilipi MIS_ Mar_ 26'));

  if (!pratilipiDoc) {
    throw new Error('Pratilipi document not found in production database!');
  }

  console.log(`Document ID:        ${pratilipiDoc.id}`);
  console.log(`Filename:           ${pratilipiDoc.filename}`);
  console.log(`Size in DB:         ${pratilipiDoc.sizeBytes} bytes (${(pratilipiDoc.sizeBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Blob URL in DB:     ${pratilipiDoc.blobUrl ?? 'NULL (Fallback to document_blobs bytea)'}`);
  console.log(`Original Retained:  ${pratilipiDoc.originalRetained}`);

  // Create signed session cookie
  const sessionToken = await signSession('admin');
  const url = `http://localhost:3000/api/documents/${pratilipiDoc.id}/file`;

  const request = new NextRequest(url, {
    method: 'GET',
    headers: {
      cookie: `mis_session=${sessionToken}`,
    },
  });

  console.log('\nInvoking GET /api/documents/[id]/file handler...');
  const response = await GET(request, {
    params: Promise.resolve({ id: pratilipiDoc.id }),
  });

  console.log(`Response Status:     ${response.status}`);
  console.log(`Content-Type:        ${response.headers.get('content-type')}`);
  console.log(`Content-Length:      ${response.headers.get('content-length')}`);
  console.log(`Content-Disposition: ${response.headers.get('content-disposition')}`);

  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`Route returned non-200 status: ${response.status} - ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  console.log(`Downloaded Bytes:    ${buffer.length}`);
  console.log(`Downloaded SHA-256:  ${sha256}`);
  console.log(`DB Checksum:         ${pratilipiDoc.checksum}`);

  if (buffer.length !== pratilipiDoc.sizeBytes) {
    throw new Error(`Size mismatch: got ${buffer.length}, expected ${pratilipiDoc.sizeBytes}`);
  }

  if (sha256 !== pratilipiDoc.checksum) {
    throw new Error(`Checksum mismatch! Downloaded: ${sha256}, DB: ${pratilipiDoc.checksum}`);
  }

  const outPath = '/tmp/pratilipi_downloaded_test.xlsx';
  fs.writeFileSync(outPath, buffer);
  console.log(`Saved file to:       ${outPath}`);

  // Test 1: Unzip test
  console.log('\nRunning zip integrity check on XLSX package (unzip -t)...');
  const unzipOutput = execFileSync('unzip', ['-t', outPath], { encoding: 'utf8' });
  const unzipLines = unzipOutput.trim().split('\n');
  console.log(`Unzip test result:   ${unzipLines[unzipLines.length - 1]}`);

  // Test 2: XLSX workbook parse
  console.log('\nParsing workbook with xlsx parser...');
  const xlsxLib = (xlsx as unknown as { default?: typeof xlsx }).default || xlsx;
  const workbook = xlsxLib.readFile(outPath);
  console.log(`Workbook Sheets (${workbook.SheetNames.length}):`, workbook.SheetNames);

  console.log('\n' + '='.repeat(70));
  console.log('✅ ALL DOWNLOAD ROUTE VERIFICATION CHECKS PASSED!');
  console.log('='.repeat(70));
}

testDownloadRoute()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
