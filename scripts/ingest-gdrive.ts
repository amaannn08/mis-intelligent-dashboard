import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { put } from '@vercel/blob';
import { eq, and } from 'drizzle-orm';
import {
  db,
  companies,
  documents,
  documentBlobs,
  misMetrics,
  metrics,
  type Company,
} from '../packages/db/src/index.js';
import { processDocument } from '../packages/core/src/pipeline/index.js';

// Load environment variables from apps/web/.env.local and root .env
for (const envFile of ['apps/web/.env.local', 'packages/db/.env', '.env']) {
  const resolved = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved });
  }
}

const SHARED_DRIVE_ID = '0AERIfhS-cDCcUk9PVA';
const ROOT_FOLDER_ID = '19ktgeLgySEXz1wgARN4_TXrNT5uWYCO4';
const DEFAULT_TOKEN_PATH = '/home/amann/intern-weh/mvp/crm/backend/google-token.json';
const DEFAULT_CRM_ENV = '/home/amann/intern-weh/mvp/crm/backend/.env';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  folderPath: string;
  fund: string;
  companySlug?: string;
  isOldMis: boolean;
}

interface IngestOptions {
  dryRun: boolean;
  limit?: number;
  fund?: string;
  company?: string;
}

interface IngestResult {
  file: DriveFile;
  status: 'processed' | 'skipped' | 'failed';
  error?: string;
  metricsCount?: number;
  quarantinedCount?: number;
}

async function getGoogleAccessToken(): Promise<string> {
  const tokenPath = process.env.GOOGLE_TOKEN_PATH || DEFAULT_TOKEN_PATH;
  const crmEnvPath = process.env.CRM_ENV_PATH || DEFAULT_CRM_ENV;

  let clientId = process.env.CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  if ((!clientId || !clientSecret) && fs.existsSync(crmEnvPath)) {
    const crmEnv = dotenv.parse(fs.readFileSync(crmEnvPath, 'utf8'));
    clientId = clientId || crmEnv.CLIENT_ID || crmEnv.GOOGLE_CLIENT_ID;
    clientSecret = clientSecret || crmEnv.CLIENT_SECRET || crmEnv.GOOGLE_CLIENT_SECRET;
  }

  if (!fs.existsSync(tokenPath)) {
    throw new Error(`Google token file not found at: ${tokenPath}`);
  }

  const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const refreshToken = tokenData.refresh_token;

  if (!refreshToken) {
    throw new Error('Refresh token not found in google-token.json');
  }
  if (!clientId || !clientSecret) {
    throw new Error('Google CLIENT_ID and CLIENT_SECRET must be defined.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to refresh Google OAuth2 token: ${errText}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function matchCompanySlug(folderOrPath: string, companiesList: Company[]): string | null {
  const lower = folderOrPath.toLowerCase();

  const overrides: Record<string, string> = {
    'animall': 'animall',
    'apps for bharat': 'apps-for-bharat',
    'clinikk': 'clinikk',
    'downtown': 'downtown',
    'draconic': 'draconic',
    'sixsingularities': 'draconic',
    'flent': 'flent',
    'fragaria': 'fragaria',
    'game theory': 'game-theory',
    'hastin': 'hastin',
    'hectar': 'hectar',
    'infinity box': 'infinity-box',
    'jar': 'jar',
    'changejar': 'jar',
    'knot': 'knot',
    'magma': 'magma',
    'masterchow': 'masterchow',
    'medmitra': 'medmitra',
    'mitigata': 'mitigata',
    'noto': 'noto',
    'praan': 'praan-health',
    'praan health': 'praan-health',
    'pratilipi': 'pratilipi',
    'segmind': 'segmind',
    'svg': 'simple-viral-games',
    'simple viral games': 'simple-viral-games',
    'smallcase': 'smallcase',
    'stellarplay': 'stellar-play',
    'stellar play': 'stellar-play',
    'sustvest': 'sustvest',
    'solargrid': 'sustvest',
    'trell': 'trell',
    'unbox robotics': 'unbox-robotics',
    'unbox': 'unbox-robotics',
    'zevi': 'zevi',
  };

  for (const [pattern, slug] of Object.entries(overrides)) {
    if (lower.includes(pattern)) {
      return slug;
    }
  }

  // Fallback to fuzzy match on DB slugs / names
  const clean = lower.replace(/[^a-z0-9]/g, '');
  for (const c of companiesList) {
    const cSlugClean = c.slug.replace(/[^a-z0-9]/g, '');
    const cNameClean = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean.includes(cSlugClean) || clean.includes(cNameClean)) {
      return c.slug;
    }
  }

  return null;
}

async function listSharedDriveRecursive(
  accessToken: string,
  folderId: string,
  currentPath: string,
  currentFund: string,
  companiesList: Company[]
): Promise<DriveFile[]> {
  const results: DriveFile[] = [];
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  let pageToken = '';

  do {
    const url = `https://www.googleapis.com/drive/v3/files?corpora=drive&driveId=${SHARED_DRIVE_ID}&includeItemsFromAllDrives=true&supportsAllDrives=true&q=${q}&pageSize=100&fields=nextPageToken,files(id,name,mimeType,size)&pageToken=${pageToken}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Drive list failed for folder ${folderId}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      nextPageToken?: string;
      files?: Array<{ id: string; name: string; mimeType: string; size?: string }>;
    };

    pageToken = data.nextPageToken || '';

    for (const item of data.files || []) {
      const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;

      if (item.mimeType === 'application/vnd.google-apps.folder') {
        let nextFund = currentFund;
        if (/fund\s+i\b/i.test(item.name)) nextFund = 'Fund I';
        else if (/fund\s+ii\b/i.test(item.name)) nextFund = 'Fund II';
        else if (/fund\s+iii\b/i.test(item.name)) nextFund = 'Fund III';

        const subItems = await listSharedDriveRecursive(
          accessToken,
          item.id,
          fullPath,
          nextFund,
          companiesList
        );
        results.push(...subItems);
      } else {
        // Skip junk files
        if (
          item.name === '.DS_Store' ||
          item.name.startsWith('~$') ||
          item.name.endsWith('.tmp')
        ) {
          continue;
        }

        const isOldMis =
          /old\s*mis/i.test(fullPath) || /old\s*version/i.test(item.name);
        const companySlug = matchCompanySlug(fullPath, companiesList);

        results.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
          folderPath: currentPath,
          fund: currentFund,
          companySlug: companySlug ?? undefined,
          isOldMis,
        });
      }
    }
  } while (pageToken);

  return results;
}

async function downloadDriveFile(
  accessToken: string,
  file: DriveFile
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  // If Google Sheet, export as xlsx
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet&supportsAllDrives=true`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Export of Google Sheet '${file.name}' failed: ${await res.text()}`);
    }
    const ab = await res.arrayBuffer();
    return {
      buffer: Buffer.from(ab),
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${file.name.replace(/\.[^/.]+$/, '')}.xlsx`,
    };
  }

  // Regular file download
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`;
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Download of file '${file.name}' failed: ${await res.text()}`);
  }
  const ab = await res.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    mimeType: file.mimeType,
    filename: file.name,
  };
}

export async function runIngestion(options: IngestOptions) {
  console.log('='.repeat(70));
  console.log('Starting Google Drive Shared-Drive Ingestion Pipeline');
  console.log(`Root Folder: ${ROOT_FOLDER_ID}`);
  console.log(`Shared Drive: ${SHARED_DRIVE_ID}`);
  console.log(`Dry Run: ${options.dryRun}`);
  if (options.limit) console.log(`Limit: ${options.limit}`);
  if (options.fund) console.log(`Filter Fund: ${options.fund}`);
  if (options.company) console.log(`Filter Company: ${options.company}`);
  console.log('='.repeat(70));

  const allCompanies = await db.select().from(companies);
  const companyBySlug = new Map<string, Company>();
  for (const c of allCompanies) {
    companyBySlug.set(c.slug, c);
  }

  console.log('Obtaining Google OAuth2 access token...');
  const accessToken = await getGoogleAccessToken();
  console.log('Access token obtained successfully.');

  console.log('Scanning shared drive hierarchy recursively...');
  const allFiles = await listSharedDriveRecursive(
    accessToken,
    ROOT_FOLDER_ID,
    'MIS FY 26',
    '',
    allCompanies
  );
  console.log(`Scanned ${allFiles.length} candidate files in shared drive.`);

  // Filter files (exclude root files without company)
  let targetFiles = allFiles.filter((f) => !!f.companySlug);
  if (options.fund) {
    targetFiles = targetFiles.filter(
      (f) => f.fund.toLowerCase() === options.fund!.toLowerCase()
    );
  }
  if (options.company) {
    targetFiles = targetFiles.filter(
      (f) => f.companySlug?.toLowerCase() === options.company!.toLowerCase()
    );
  }

  // Interleave by Fund (Fund I, Fund II, Fund III) so staged runs (--limit 3) hit each fund!
  const byFund: Record<string, DriveFile[]> = {
    'Fund I': [],
    'Fund II': [],
    'Fund III': [],
    'Other': [],
  };
  for (const f of targetFiles) {
    if (byFund[f.fund]) {
      byFund[f.fund]!.push(f);
    } else {
      byFund['Other']!.push(f);
    }
  }

  const interleaved: DriveFile[] = [];
  const maxLen = Math.max(
    byFund['Fund I']!.length,
    byFund['Fund II']!.length,
    byFund['Fund III']!.length,
    byFund['Other']!.length
  );
  for (let i = 0; i < maxLen; i++) {
    if (byFund['Fund I']![i]) interleaved.push(byFund['Fund I']![i]!);
    if (byFund['Fund II']![i]) interleaved.push(byFund['Fund II']![i]!);
    if (byFund['Fund III']![i]) interleaved.push(byFund['Fund III']![i]!);
    if (byFund['Other']![i]) interleaved.push(byFund['Other']![i]!);
  }

  if (options.limit && options.limit > 0) {
    targetFiles = interleaved.slice(0, options.limit);
  } else {
    targetFiles = interleaved;
  }

  console.log(`Selected ${targetFiles.length} files to ingest.`);

  if (options.dryRun) {
    console.log('\n--- DRY RUN FILE MANIFEST ---');
    targetFiles.forEach((f, idx) => {
      console.log(
        `[${idx + 1}/${targetFiles.length}] ${f.fund || 'NoFund'} | ${f.companySlug || 'UNKNOWN'} | ${f.name} | isOld: ${f.isOldMis}`
      );
    });
    console.log('\nDry run complete. No database changes were made.');
    return;
  }

  const results: IngestResult[] = [];
  let fileIndex = 0;

  for (const file of targetFiles) {
    fileIndex++;
    const prefix = `[${fileIndex}/${targetFiles.length}] [${file.fund || 'Fund?'}] [${file.companySlug || 'Unknown'}]`;
    console.log(`\n${prefix} Processing: ${file.name}`);

    const company = file.companySlug ? companyBySlug.get(file.companySlug) : null;
    if (!company) {
      console.warn(`${prefix} ⚠️ Skipped: No matching company found in database for path '${file.folderPath}'`);
      results.push({
        file,
        status: 'skipped',
        error: 'No matching company in DB',
      });
      continue;
    }

    try {
      // 1. Download file bytes
      console.log(`${prefix} Downloading from Google Drive...`);
      const downloaded = await downloadDriveFile(accessToken, file);
      const sha256 = crypto.createHash('sha256').update(downloaded.buffer).digest('hex');

      // 2. Check if identical document already exists and is processed
      const [existingDoc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.companyId, company.id),
            eq(documents.checksum, sha256)
          )
        );

      if (existingDoc && existingDoc.status === 'processed') {
        console.log(`${prefix} ⏭️ Already processed (checksum ${sha256.slice(0, 8)}...). Skipping.`);
        results.push({ file, status: 'skipped' });
        continue;
      }

      // Handle ZIP archive (unpack nested xlsx files)
      if (
        downloaded.filename.endsWith('.zip') ||
        downloaded.mimeType === 'application/zip'
      ) {
        console.log(`${prefix} 📦 Unpacking ZIP archive: ${downloaded.filename}...`);
        const tmpZipDir = path.join(os.tmpdir(), `mis_zip_${Date.now()}`);
        fs.mkdirSync(tmpZipDir, { recursive: true });
        const tmpZipFile = path.join(tmpZipDir, 'archive.zip');
        fs.writeFileSync(tmpZipFile, downloaded.buffer);

        try {
          execFileSync('unzip', ['-o', tmpZipFile, '-d', tmpZipDir]);
          const extractedFiles = fs.readdirSync(tmpZipDir).filter((fn) => !fn.endsWith('.zip'));

          // Ingest original zip as a document record
          let zipBlobUrl: string | null = null;
          if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
              const zipBlob = await put(`mis-drive/${company.slug}/${downloaded.filename}`, downloaded.buffer, {
                access: 'public',
                token: process.env.BLOB_READ_WRITE_TOKEN,
              });
              zipBlobUrl = zipBlob.url;
            } catch (err) {
              console.warn(`${prefix} Blob put failed for zip:`, err);
            }
          }

          const uploadsDir = path.resolve(process.cwd(), 'uploads');
          fs.mkdirSync(uploadsDir, { recursive: true });
          const safeZipFilename = downloaded.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const zipDiskPath = path.join(uploadsDir, `${file.id}_${safeZipFilename}`);
          fs.writeFileSync(zipDiskPath, downloaded.buffer);

          const [zipDoc] = await db.insert(documents).values({
            companyId: company.id,
            filename: downloaded.filename,
            storagePath: zipDiskPath,
            blobUrl: zipBlobUrl,
            mime: 'application/zip',
            fileType: 'zip',
            sizeBytes: downloaded.buffer.length,
            checksum: sha256,
            status: 'processed',
            fund: file.fund,
            driveFileId: file.id,
            driveFolderPath: file.folderPath,
            isOldMis: file.isOldMis,
            originalRetained: true,
          }).onConflictDoUpdate({
            target: [documents.companyId, documents.checksum],
            set: { storagePath: zipDiskPath, updatedAt: new Date(), status: 'processed' },
          }).returning();

          if (zipDoc) {
            await db
              .insert(documentBlobs)
              .values({
                documentId: zipDoc.id,
                data: downloaded.buffer,
                sizeBytes: downloaded.buffer.length,
              })
              .onConflictDoUpdate({
                target: documentBlobs.documentId,
                set: {
                  data: downloaded.buffer,
                  sizeBytes: downloaded.buffer.length,
                },
              });
          }

          // Ingest nested xlsx files
          for (const nestedName of extractedFiles) {
            if (!/\.xlsx?$/i.test(nestedName) || nestedName.startsWith('~$')) continue;
            const nestedPath = path.join(tmpZipDir, nestedName);
            const nestedBytes = fs.readFileSync(nestedPath);
            const nestedSha = crypto.createHash('sha256').update(nestedBytes).digest('hex');

            let nestedBlobUrl: string | null = null;
            if (process.env.BLOB_READ_WRITE_TOKEN) {
              try {
                const b = await put(`mis-drive/${company.slug}/${nestedName}`, nestedBytes, {
                  access: 'public',
                  token: process.env.BLOB_READ_WRITE_TOKEN,
                });
                nestedBlobUrl = b.url;
              } catch (e) {
                console.warn(`${prefix} Blob put failed for nested xlsx:`, e);
              }
            }

            const safeNestedName = nestedName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const nestedDiskPath = path.join(uploadsDir, `${file.id}_${safeNestedName}`);
            fs.writeFileSync(nestedDiskPath, nestedBytes);

            const [nestedDoc] = await db.insert(documents).values({
              companyId: company.id,
              filename: nestedName,
              storagePath: nestedDiskPath,
              blobUrl: nestedBlobUrl,
              mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              fileType: 'xlsx',
              sizeBytes: nestedBytes.length,
              checksum: nestedSha,
              status: 'pending',
              fund: file.fund,
              driveFileId: `${file.id}_${nestedName}`,
              driveFolderPath: file.folderPath,
              isOldMis: file.isOldMis,
              originalRetained: true,
            }).onConflictDoUpdate({
              target: [documents.companyId, documents.checksum],
              set: { updatedAt: new Date(), status: 'pending', storagePath: nestedDiskPath },
            }).returning();

            if (nestedDoc) {
              await db
                .insert(documentBlobs)
                .values({
                  documentId: nestedDoc.id,
                  data: nestedBytes,
                  sizeBytes: nestedBytes.length,
                })
                .onConflictDoUpdate({
                  target: documentBlobs.documentId,
                  set: {
                    data: nestedBytes,
                    sizeBytes: nestedBytes.length,
                  },
                });

              console.log(`${prefix} ⚙️ Processing nested: ${nestedName}...`);
              await processDocument(nestedDoc.id);
            }
          }

          results.push({ file, status: 'processed' });
          continue;
        } finally {
          fs.rmSync(tmpZipDir, { recursive: true, force: true });
        }
      }

      // 3. Upload to Vercel Blob if token is available
      let blobUrl: string | null = null;
      let blobPathname: string | null = null;

      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const blobPath = `mis-drive/${company.slug}/${downloaded.filename}`;
          const blobResult = await put(blobPath, downloaded.buffer, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
          });
          blobUrl = blobResult.url;
          blobPathname = blobResult.pathname;
          console.log(`${prefix} ☁️ Uploaded to Vercel Blob: ${blobUrl}`);
        } catch (blobErr) {
          console.warn(`${prefix} ⚠️ Blob upload failed, proceeding with local fallback:`, blobErr);
        }
      }

      // Ensure local uploads directory mirror
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });
      const safeFilename = downloaded.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const diskPath = path.join(uploadsDir, `${file.id}_${safeFilename}`);
      fs.writeFileSync(diskPath, downloaded.buffer);

      // 4. Upsert document record
      const [doc] = await db
        .insert(documents)
        .values({
          companyId: company.id,
          filename: downloaded.filename,
          storagePath: diskPath,
          blobUrl,
          blobPathname,
          mime: downloaded.mimeType,
          fileType: path.extname(downloaded.filename).replace('.', '').toLowerCase() || 'unknown',
          sizeBytes: downloaded.buffer.length,
          checksum: sha256,
          status: 'pending',
          fund: file.fund,
          driveFileId: file.id,
          driveFolderPath: file.folderPath,
          isOldMis: file.isOldMis,
          originalRetained: true,
        })
        .onConflictDoUpdate({
          target: [documents.companyId, documents.checksum],
          set: {
            fund: file.fund,
            driveFileId: file.id,
            driveFolderPath: file.folderPath,
            isOldMis: file.isOldMis,
            storagePath: diskPath,
            blobUrl: blobUrl ?? documents.blobUrl,
            blobPathname: blobPathname ?? documents.blobPathname,
            originalRetained: true,
            status: 'pending',
          },
        })
        .returning();

      if (!doc) {
        throw new Error(`Failed to create or retrieve document record for ${file.name}`);
      }

      // Store in document_blobs regardless of size as reliable fallback
      await db
        .insert(documentBlobs)
        .values({
          documentId: doc.id,
          data: downloaded.buffer,
          sizeBytes: downloaded.buffer.length,
        })
        .onConflictDoUpdate({
          target: documentBlobs.documentId,
          set: {
            data: downloaded.buffer,
            sizeBytes: downloaded.buffer.length,
          },
        });

      // 5. Run full pipeline (matrix parsing + standard KPIs + chunk + embed)
      console.log(`${prefix} ⚙️ Running processing pipeline on doc ${doc.id}...`);
      const pipeRes = await processDocument(doc.id);

      if (pipeRes.status === 'failed') {
        throw new Error(pipeRes.error || 'Pipeline returned failed status');
      }

      // Inspect extracted counts
      const docMisMetrics = await db
        .select()
        .from(misMetrics)
        .where(eq(misMetrics.documentId, doc.id));
      const docQuarantined = docMisMetrics.filter((m) => m.status === 'quarantined').length;

      console.log(
        `${prefix} ✅ Successfully processed: ${pipeRes.metricsExtracted.length} standard KPIs, ${docMisMetrics.length} granular rows (${docQuarantined} quarantined).`
      );

      results.push({
        file,
        status: 'processed',
        metricsCount: docMisMetrics.length,
        quarantinedCount: docQuarantined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${prefix} ❌ Error: ${msg}`);
      results.push({
        file,
        status: 'failed',
        error: msg,
      });
    }
  }

  // Final Summary Report
  console.log('\n' + '='.repeat(80));
  console.log('GOOGLE DRIVE INGESTION EXECUTION SUMMARY');
  console.log('='.repeat(80));
  const processedCount = results.filter((r) => r.status === 'processed').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  console.log(`Total Target Files: ${targetFiles.length}`);
  console.log(`✅ Processed:       ${processedCount}`);
  console.log(`⏭️  Skipped:         ${skippedCount}`);
  console.log(`❌ Failed:          ${failedCount}`);
  console.log('-'.repeat(80));

  for (const r of results) {
    const icon = r.status === 'processed' ? '✅' : r.status === 'skipped' ? '⏭️ ' : '❌';
    const detail =
      r.status === 'processed'
        ? `${r.metricsCount ?? 0} rows (${r.quarantinedCount ?? 0} quarantined)`
        : r.error || 'Duplicate / non-target';
    console.log(
      `${icon} [${r.file.fund || 'Fund?'}] [${r.file.companySlug || 'Unknown'}] ${r.file.name}: ${detail}`
    );
  }
  console.log('='.repeat(80));
}

// CLI entry point
if (process.argv[1]?.includes('ingest-gdrive')) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const limitArg = args.find((a) => a.startsWith('--limit='));
  let limit: number | undefined;
  if (limitArg) {
    limit = parseInt(limitArg.split('=')[1]!, 10);
  } else {
    const limitIdx = args.indexOf('--limit');
    if (limitIdx !== -1 && args[limitIdx + 1]) {
      limit = parseInt(args[limitIdx + 1]!, 10);
    }
  }

  const fundArg = args.find((a) => a.startsWith('--fund='));
  let fund: string | undefined;
  if (fundArg) {
    fund = fundArg.split('=')[1];
  } else {
    const fundIdx = args.indexOf('--fund');
    if (fundIdx !== -1 && args[fundIdx + 1]) {
      fund = args[fundIdx + 1];
    }
  }

  const compArg = args.find((a) => a.startsWith('--company='));
  let company: string | undefined;
  if (compArg) {
    company = compArg.split('=')[1];
  } else {
    const compIdx = args.indexOf('--company');
    if (compIdx !== -1 && args[compIdx + 1]) {
      company = args[compIdx + 1];
    }
  }

  runIngestion({ dryRun, limit, fund, company })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal Ingestion Error:', err);
      process.exit(1);
    });
}
