import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-response';
import { getDocumentBinary, getDocumentDetail } from '@/lib/documents';
import { isUuid } from '@/lib/companies';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return apiError('BAD_REQUEST', 'Document ID must be a valid UUID.', 400);
  }

  try {
    const detail = await getDocumentDetail(id);
    if (!detail) {
      return apiError('NOT_FOUND', `Document with ID '${id}' not found.`, 404);
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
        'Content-Disposition': `inline; filename="${encodeURIComponent(binaryData.filename)}"`,
        'Content-Length': String(binaryData.buffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: unknown) {
    console.error(`Failed to stream document file ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to retrieve document binary.', 500);
  }
}
