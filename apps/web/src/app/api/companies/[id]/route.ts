import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess, handleZodError } from '@/lib/api-response';
import {
  deleteCompany,
  getCompanyByIdOrSlug,
  updateCompany,
} from '@/lib/companies';

export const dynamic = 'force-dynamic';

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().optional(),
  description: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
) {
  const { id } = await context.params;
  try {
    const company = await getCompanyByIdOrSlug(id);
    if (!company) {
      return apiError('NOT_FOUND', `Company with identifier '${id}' not found.`, 404);
    }
    return apiSuccess(company, 200);
  } catch (err: unknown) {
    console.error(`Failed to get company ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to retrieve company.', 500);
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteParams
) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body in request', 400);
  }

  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  try {
    const updated = await updateCompany(id, parsed.data);
    if (!updated) {
      return apiError('NOT_FOUND', `Company with identifier '${id}' not found.`, 404);
    }
    return apiSuccess(updated, 200);
  } catch (err: unknown) {
    console.error(`Failed to update company ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to update company.', 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteParams
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const isHard = searchParams.get('hard') === 'true';
  const isConfirmed = searchParams.get('confirm') === 'true';

  if (isHard && !isConfirmed) {
    return apiError(
      'CONFIRMATION_REQUIRED',
      'Hard delete permanently erases the company and all cascading metrics/documents. Please provide ?confirm=true to proceed.',
      400
    );
  }

  try {
    const result = await deleteCompany(id, isHard);
    if (!result) {
      return apiError('NOT_FOUND', `Company with identifier '${id}' not found.`, 404);
    }
    return apiSuccess(result, 200);
  } catch (err: unknown) {
    console.error(`Failed to delete/archive company ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to delete/archive company.', 500);
  }
}
