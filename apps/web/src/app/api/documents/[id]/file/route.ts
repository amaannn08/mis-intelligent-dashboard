import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-response';
import { getDocumentBinary, getDocumentDetail } from '@/lib/documents';
import { isUuid } from '@/lib/companies';
import { verifySession } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/constants';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteParams
) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(sessionCookie);
  if (!session) {
    return apiError('UNAUTHORIZED', 'Authentication required to access document binary.', 401);
  }

  const { id } = await context.params;

  if (!isUuid(id)) {
    return apiError('BAD_REQUEST', 'Document ID must be a valid UUID.', 400);
  }

  try {
    const detail = await getDocumentDetail(id);
    if (!detail) {
      return apiError('NOT_FOUND', `Document with ID '${id}' not found.`, 404);
    }

    // 1. Direct stream from Vercel Blob if available (handles >4MB files like Pratilipi)
    if (detail.document.blobUrl) {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      const blobRes = await fetch(detail.document.blobUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (blobRes.ok && blobRes.body) {
        return new NextResponse(blobRes.body as unknown as BodyInit, {
          status: 200,
          headers: {
            'Content-Type': detail.document.mime || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(detail.document.filename)}"`,
            'Content-Length': String(detail.document.sizeBytes),
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }
    }

    if (!detail.document.originalRetained) {
      return apiError(
        'FILE_NOT_RETAINED',
        'Original file was larger than 4 MB and was not retained in database storage. Parsed data and metrics are available.',
        404
      );
    }

    const binaryData = await getDocumentBinary(id);
    if (!binaryData) {
      return apiError(
        'NOT_FOUND',
        'Original file binary was not found in database or local storage.',
        404
      );
    }

    // Return binary stream with headers
    return new NextResponse(new Uint8Array(binaryData.buffer), {
      status: 200,
      headers: {
        'Content-Type': binaryData.mime || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(binaryData.filename)}"`,
        'Content-Length': String(binaryData.buffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    });

  } catch (err: unknown) {
    console.error(`Failed to stream document file ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to retrieve document binary.', 500);
  }
}
