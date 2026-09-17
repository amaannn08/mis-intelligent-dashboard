import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { apiError, apiSuccess } from '@/lib/api-response';
import { deleteDocument, getDocumentDetail } from '@/lib/documents';
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
    return apiSuccess(detail, 200);
  } catch (err: unknown) {
    console.error(`Failed to get document detail for ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to retrieve document details.', 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteParams
) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return apiError('BAD_REQUEST', 'Document ID must be a valid UUID.', 400);
  }

  try {
    const deleted = await deleteDocument(id);
    if (!deleted) {
      return apiError('NOT_FOUND', `Document with ID '${id}' not found.`, 404);
    }
    try {
      revalidatePath('/');
      revalidatePath('/companies');
      revalidatePath('/companies/[slug]', 'page');
    } catch (e) {
      console.error('Failed to revalidate paths after document deletion:', e);
    }
    return apiSuccess({ ok: true }, 200);
  } catch (err: unknown) {
    console.error(`Failed to delete document ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to delete document.', 500);
  }
}
