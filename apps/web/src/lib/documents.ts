import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  db,
  documents,
  documentBlobs,
  processingJobs,
  metrics,
  companies,
  type Document,
  type ProcessingJob,
  type Metric,
} from '@mis/db';
import { eq, and, desc, asc } from 'drizzle-orm';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  BLOB_RETENTION_MAX_BYTES,
  UPLOAD_MAX_BYTES_DEVELOPMENT,
  UPLOAD_MAX_BYTES_PRODUCTION,
} from './constants';

export interface FileValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  detectedType?: 'xlsx' | 'xls' | 'pdf';
}

/**
 * Validate upload file size against server-side ceilings (4.5MB prod, 15MB dev).
 */
export function validateFileSize(sizeBytes: number): { valid: boolean; maxAllowed: number } {
  const maxAllowed =
    process.env.NODE_ENV === 'production'
      ? UPLOAD_MAX_BYTES_PRODUCTION
      : UPLOAD_MAX_BYTES_DEVELOPMENT;

  return {
    valid: sizeBytes <= maxAllowed,
    maxAllowed,
  };
}

/**
 * Check magic bytes to prevent disguised executable uploads.
 */
export function validateFileBytesAndExtension(
  filename: string,
  mime: string,
  buffer: Buffer
): FileValidationResult {
  const ext = path.extname(filename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return {
      valid: false,
      errorCode: 'INVALID_EXTENSION',
      errorMessage: `Unsupported file extension '${ext}'. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`,
    };
  }

  // Check MIME type if provided and not generic
  if (mime && !ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      valid: false,
      errorCode: 'INVALID_MIME_TYPE',
      errorMessage: `Unsupported MIME type '${mime}'.`,
    };
  }

  // Magic bytes check
  if (ext === '.pdf') {
    // PDF starts with %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    const isPdf =
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d;

    if (!isPdf) {
      return {
        valid: false,
        errorCode: 'INVALID_FILE_CONTENT',
        errorMessage: 'File content does not match standard PDF binary signature.',
      };
    }
    return { valid: true, detectedType: 'pdf' };
  }

  if (ext === '.xlsx') {
    // XLSX is a ZIP archive starting with PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    const isZip =
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04;

    if (!isZip) {
      return {
        valid: false,
        errorCode: 'INVALID_FILE_CONTENT',
        errorMessage: 'File content does not match standard XLSX binary signature.',
      };
    }
    return { valid: true, detectedType: 'xlsx' };
  }

  if (ext === '.xls') {
    // Legacy XLS is OLE2 compound document starting with 0xD0, 0xCF, 0x11, 0xE0
    const isOle =
      buffer.length >= 4 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0;

    if (!isOle) {
      return {
        valid: false,
        errorCode: 'INVALID_FILE_CONTENT',
        errorMessage: 'File content does not match standard XLS binary signature.',
      };
    }
    return { valid: true, detectedType: 'xls' };
  }

  return { valid: true, detectedType: ext.replace('.', '') as 'xlsx' | 'xls' | 'pdf' };
}

/**
 * Sanitise a user filename against directory traversal and unsafe characters.
 */
export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename);
  const ext = path.extname(base);
  const nameWithoutExt = path.basename(base, ext);
  const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${cleanName || 'document'}${ext.toLowerCase()}`;
}

/**
 * Compute SHA-256 hex checksum of a buffer.
 */
export function computeChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Check if a non-failed document with the same checksum already exists for the company.
 */
export async function checkDuplicateDocument(
  companyId: string,
  checksum: string
): Promise<Document | null> {
  const [existing] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.companyId, companyId),
        eq(documents.checksum, checksum)
      )
    );

  return existing || null;
}

export interface StoreDocumentResult {
  document: Document;
  originalRetained: boolean;
}

/**
 * Persist document metadata row and binary according to LOCKED DECISION:
 * - Bytes in document_blobs table (bytea) when <= 4 MB.
 * - original_retained = false when > 4 MB.
 * - In dev, mirror file to gitignored ./uploads/ directory.
 */
export async function storeDocumentMetadataAndBytes(params: {
  companyId: string;
  filename: string;
  mime: string;
  fileType: 'xlsx' | 'xls' | 'pdf';
  buffer: Buffer;
}): Promise<StoreDocumentResult> {
  const { companyId, filename, mime, fileType, buffer } = params;

  // Verify company exists
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId));

  if (!company) {
    throw new Error(`Company with ID '${companyId}' not found.`);
  }

  const checksum = computeChecksum(buffer);
  const safeFilename = sanitizeFilename(filename);
  const originalRetained = buffer.length <= BLOB_RETENTION_MAX_BYTES;

  // Mirror to ./uploads/ in dev or local storage
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch {
    // In restricted read-only filesystems (e.g. Vercel), catch and proceed
  }

  // Create document row first
  const [doc] = await db
    .insert(documents)
    .values({
      companyId,
      filename: safeFilename,
      storagePath: path.join('uploads', `${Date.now()}-${safeFilename}`),
      mime,
      fileType,
      sizeBytes: buffer.length,
      checksum,
      status: 'pending',
      originalRetained,
      uploadedAt: new Date(),
    })
    .returning();

  // Try writing to ./uploads/ for dev convenience
  try {
    const localDiskPath = path.resolve(uploadsDir, `${doc.id}-${safeFilename}`);
    fs.writeFileSync(localDiskPath, buffer);
    // Update storagePath with actual filename
    await db
      .update(documents)
      .set({ storagePath: localDiskPath })
      .where(eq(documents.id, doc.id));
    doc.storagePath = localDiskPath;
  } catch {
    // Disk write might fail on serverless read-only filesystem
  }

  // Persist original bytes in document_blobs table if <= 4 MB
  if (originalRetained) {
    await db.insert(documentBlobs).values({
      documentId: doc.id,
      data: buffer,
      sizeBytes: buffer.length,
    });
  }

  return {
    document: doc,
    originalRetained,
  };
}

/**
 * Fetch documents list with optional companyId or status filter.
 */
export async function getDocumentsList(filters: {
  companyId?: string;
  status?: string;
}): Promise<Document[]> {
  const conditions = [];

  if (filters.companyId) {
    conditions.push(eq(documents.companyId, filters.companyId));
  }
  if (filters.status) {
    conditions.push(eq(documents.status, filters.status as Document['status']));
  }

  return db
    .select()
    .from(documents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(documents.uploadedAt));
}

export interface DocumentDetail {
  document: Document;
  jobs: ProcessingJob[];
  metrics: Metric[];
  blobRetained: boolean;
}

/**
 * Fetch document by ID with processing jobs log, extracted metrics, and retention flag.
 */
export async function getDocumentDetail(id: string): Promise<DocumentDetail | null> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return null;

  const jobs = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.documentId, id))
    .orderBy(asc(processingJobs.startedAt));

  const extractedMetrics = await db
    .select()
    .from(metrics)
    .where(eq(metrics.documentId, id))
    .orderBy(asc(metrics.metricKey), asc(metrics.reportingPeriod));

  return {
    document: doc,
    jobs,
    metrics: extractedMetrics,
    blobRetained: doc.originalRetained,
  };
}

/**
 * Fetch original binary buffer from Vercel Blob, document_blobs fallback, or disk mirror.
 */
export async function getDocumentBinary(
  id: string
): Promise<{ buffer: Buffer; mime: string; filename: string } | null> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return null;

  // 1. Try Vercel Blob (Private store)
  if (doc.blobUrl) {
    try {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      const res = await fetch(doc.blobUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return {
          buffer: Buffer.from(arrayBuf),
          mime: doc.mime || 'application/octet-stream',
          filename: doc.filename,
        };
      }
    } catch (err) {
      console.warn(`Vercel Blob fetch failed for doc ${id}, attempting fallback:`, err);
    }
  }

  // 2. Try document_blobs table (legacy fallback for existing files)
  const [blob] = await db
    .select()
    .from(documentBlobs)
    .where(eq(documentBlobs.documentId, id));

  if (blob && blob.data) {
    return {
      buffer: blob.data,
      mime: doc.mime || 'application/octet-stream',
      filename: doc.filename,
    };
  }

  // 3. Try disk storagePath (dev mirror)
  if (doc.storagePath) {
    const resolvedPath = path.isAbsolute(doc.storagePath)
      ? doc.storagePath
      : path.resolve(process.cwd(), doc.storagePath);

    if (fs.existsSync(resolvedPath)) {
      const fileBytes = fs.readFileSync(resolvedPath);
      return {
        buffer: fileBytes,
        mime: doc.mime || 'application/octet-stream',
        filename: doc.filename,
      };
    }
  }

  return null;
}

/**
 * Delete document and cascade delete jobs, chunks, metrics, blobs, and Vercel Blob / disk storage.
 */
export async function deleteDocument(id: string): Promise<boolean> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return false;

  // Clean up blob from Vercel Blob if present
  if (doc.blobUrl) {
    try {
      const { del } = await import('@vercel/blob');
      await del(doc.blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch (e) {
      console.warn(`Failed to delete blob from Vercel Blob for doc ${id}:`, e);
    }
  }

  // Clean up disk file if present
  if (doc.storagePath) {
    try {
      const resolvedPath = path.isAbsolute(doc.storagePath)
        ? doc.storagePath
        : path.resolve(process.cwd(), doc.storagePath);
      if (fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
    } catch {
      // Ignore disk delete errors
    }
  }

  // Delete DB row (cascades to chunks, jobs, metrics, blobs)
  await db.delete(documents).where(eq(documents.id, id));
  return true;
}
