import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { apiError, apiSuccess, handleZodError } from '@/lib/api-response';
import { createCompany, getCompaniesList } from '@/lib/companies';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  search: z.string().optional(),
  industry: z.string().optional(),
  sort: z.enum(['name', 'revenue', 'period', 'updated']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});

const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  industry: z.string().optional(),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawParams = {
    search: searchParams.get('search') || undefined,
    industry: searchParams.get('industry') || undefined,
    sort: searchParams.get('sort') || undefined,
    page: searchParams.get('page') || undefined,
    limit: searchParams.get('limit') || undefined,
    includeArchived: searchParams.get('includeArchived') || undefined,
  };

  const parsed = listQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  try {
    const result = await getCompaniesList(parsed.data);
    return apiSuccess(result, 200);
  } catch (err: unknown) {
    console.error('Failed to list companies:', err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to retrieve companies list.', 500);
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body in request', 400);
  }

  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  try {
    const company = await createCompany(parsed.data);
    try {
      revalidatePath('/');
      revalidatePath('/companies');
      revalidatePath('/chat');
    } catch (e) {
      console.error('Failed to revalidate paths after creating company:', e);
    }
    return apiSuccess(company, 201);
  } catch (err: unknown) {
    console.error('Failed to create company:', err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to create company.', 500);
  }
}
