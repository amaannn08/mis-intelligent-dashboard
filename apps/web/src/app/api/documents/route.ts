import path from 'node:path';
import { NextRequest, NextResponse, after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { apiError, apiSuccess, handleZodError } from '@/lib/api-response';
import {
  checkDuplicateDocument,
  computeChecksum,
  getDocumentsList,
  sanitizeFilename,
  storeDocumentMetadataAndBytes,
  validateFileBytesAndExtension,
  validateFileSize,
} from '@/lib/documents';
import { isUuid } from '@/lib/companies';
import { processDocument } from '@mis/core';
import { db, documents, companies } from '@mis/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawParams = {
    companyId: searchParams.get('companyId') || undefined,
    status: searchParams.get('status') || undefined,
  };

  const parsed = listQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  try {
    const docs = await getDocumentsList(parsed.data);
    return apiSuccess({ documents: docs }, 200);
  } catch (err: unknown) {
    console.error('Failed to list documents:', err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to retrieve documents list.', 500);
  }
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';

  const invalidateCaches = () => {
    try {
      revalidatePath('/');
      revalidatePath('/companies');
      revalidatePath('/companies/[slug]', 'page');
    } catch (e) {
      console.error('Failed to revalidate paths after document upload:', e);
    }
  };

  // Branch A: Direct Vercel Blob Registration (JSON body)
  if (contentType.includes('application/json')) {
    let body: {
      companyId?: string;
      blobUrl?: string;
      blobPathname?: string;
      filename?: string;
      sizeBytes?: number;
      checksum?: string;
      mime?: string;
    };

    try {
      body = await request.json();
    } catch {
      return apiError('BAD_REQUEST', 'Expected valid JSON request body.', 400);
    }

    const { companyId, blobUrl, blobPathname, filename, sizeBytes, checksum, mime } = body;

    if (!companyId || typeof companyId !== 'string' || !isUuid(companyId)) {
      if (blobUrl) {
        try {
          const { del } = await import('@vercel/blob');
          await del(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch {}
      }
      return apiError('BAD_REQUEST', 'A valid companyId (UUID) is required.', 400);
    }

    if (!blobUrl || typeof blobUrl !== 'string') {
      return apiError('BAD_REQUEST', 'A valid blobUrl is required.', 400);
    }

    // Verify company exists
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId));

    if (!company) {
      try {
        const { del } = await import('@vercel/blob');
        await del(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch {}
      return apiError('NOT_FOUND', `Company with ID '${companyId}' not found.`, 404);
    }

    // Deduplicate by SHA-256 checksum per company
    if (checksum) {
      const existingDoc = await checkDuplicateDocument(companyId, checksum);
      if (existingDoc && existingDoc.status !== 'failed') {
        try {
          const { del } = await import('@vercel/blob');
          await del(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (delErr) {
          console.warn('Failed to delete duplicate blob:', delErr);
        }
        return apiError(
          'DUPLICATE_FILE',
          `A document with identical content already exists for this company (ID: ${existingDoc.id}, Status: ${existingDoc.status}).`,
          409
        );
      }
    }

    const safeFilename = sanitizeFilename(filename || 'document');
    const ext = path.extname(safeFilename).toLowerCase();
    const detectedType = ext === '.pdf' ? 'pdf' : ext === '.xls' ? 'xls' : 'xlsx';

    const [doc] = await db
      .insert(documents)
      .values({
        companyId,
        filename: safeFilename,
        storagePath: blobUrl,
        blobUrl,
        blobPathname: blobPathname || null,
        mime: mime || 'application/octet-stream',
        fileType: detectedType,
        sizeBytes: Number(sizeBytes) || 0,
        checksum: checksum || `chk-${Date.now()}`,
        status: 'pending',
        originalRetained: true,
        uploadedAt: new Date(),
      })
      .returning();

    invalidateCaches();

    const { searchParams } = new URL(request.url);
    const isSync = searchParams.get('sync') === 'true';

    if (isSync && process.env.NODE_ENV !== 'production') {
      try {
        await processDocument(doc.id);
        invalidateCaches();
      } catch (err) {
        console.error(`Synchronous processing failed for doc ${doc.id}:`, err);
      }
    } else {
      after(async () => {
        try {
          await processDocument(doc.id);
          invalidateCaches();
        } catch (err) {
          console.error(`Detached processing error for doc ${doc.id}:`, err);
        }
      });
    }

    return NextResponse.json(
      {
        document: {
          id: doc.id,
          status: doc.status,
          filename: doc.filename,
          companyId: doc.companyId,
          originalRetained: doc.originalRetained,
        },
        message: 'Upload accepted. Processing started.',
      },
      { status: 202 }
    );
  }

  // Branch B: Multipart/Form-Data (Direct / Dev fallback)
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError('BAD_REQUEST', 'Expected multipart/form-data or application/json request body.', 400);
  }

  const companyId = formData.get('companyId');
  const file = formData.get('file');

  if (!companyId || typeof companyId !== 'string' || !isUuid(companyId)) {
    return apiError('BAD_REQUEST', 'A valid companyId (UUID) is required.', 400);
  }

  if (!file || !(file instanceof Blob)) {
    return apiError('BAD_REQUEST', 'A file upload is required in the "file" field.', 400);
  }

  // 1. Enforce upload size ceiling (4.5 MB in production, 15 MB in dev)
  const sizeValidation = validateFileSize(file.size);
  if (!sizeValidation.valid) {
    const maxMb = (sizeValidation.maxAllowed / (1024 * 1024)).toFixed(1);
    return apiError(
      'FILE_TOO_LARGE',
      `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the ${maxMb} MB server ceiling.`,
      400
    );
  }

  const filename = file.name || 'document';
  const buffer = Buffer.from(await file.arrayBuffer());

  // 2. Validate MIME type, extension, and magic bytes
  const typeValidation = validateFileBytesAndExtension(filename, file.type, buffer);
  if (!typeValidation.valid) {
    return apiError(
      typeValidation.errorCode || 'INVALID_FILE',
      typeValidation.errorMessage || 'Invalid file format.',
      400
    );
  }

  const detectedType = typeValidation.detectedType || 'xlsx';

  // 3. Deduplicate by SHA-256 checksum per company
  const checksum = computeChecksum(buffer);
  const existingDoc = await checkDuplicateDocument(companyId, checksum);
  if (existingDoc && existingDoc.status !== 'failed') {
    return apiError(
      'DUPLICATE_FILE',
      `A document with identical content already exists for this company (ID: ${existingDoc.id}, Status: ${existingDoc.status}).`,
      409
    );
  }

  // 4. Store metadata and persist bytes per LOCKED DECISION
  let stored;
  try {
    stored = await storeDocumentMetadataAndBytes({
      companyId,
      filename,
      mime: file.type || 'application/octet-stream',
      fileType: detectedType,
      buffer,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found')) {
      return apiError('NOT_FOUND', msg, 404);
    }
    console.error('Failed to store document:', err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to store document.', 500);
  }

  const doc = stored.document;

  // 5. Asynchronous Seam: kick off pipeline detached via Next.js after()
  const { searchParams } = new URL(request.url);
  const isSync = searchParams.get('sync') === 'true';

  invalidateCaches();

  if (isSync && process.env.NODE_ENV !== 'production') {
    // Optional synchronous execution in dev for debugging convenience
    try {
      await processDocument(doc.id);
      invalidateCaches();
    } catch (err) {
      console.error(`Synchronous processing failed for doc ${doc.id}:`, err);
    }
  } else {
    // Standard serverless detached processing
    after(async () => {
      try {
        await processDocument(doc.id);
        invalidateCaches();
      } catch (err) {
        console.error(`Detached processing error for doc ${doc.id}:`, err);
      }
    });
  }

  return NextResponse.json(
    {
      document: {
        id: doc.id,
        status: doc.status,
        filename: doc.filename,
        companyId: doc.companyId,
        originalRetained: doc.originalRetained,
      },
      message: 'Upload accepted. Processing started.',
    },
    { status: 202 }
  );
}
