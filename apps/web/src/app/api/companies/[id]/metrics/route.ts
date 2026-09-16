import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess, handleZodError } from '@/lib/api-response';
import { getCompanyMetricSeries } from '@/lib/companies';

export const dynamic = 'force-dynamic';

const metricsQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'From period must be in YYYY-MM format')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'To period must be in YYYY-MM format')
    .optional(),
  keys: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteParams
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);

  const rawParams = {
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
    keys: searchParams.get('keys') || undefined,
  };

  const parsed = metricsQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  const { from, to, keys } = parsed.data;
  const keyList = keys
    ? keys
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    : undefined;

  try {
    const result = await getCompanyMetricSeries(id, { from, to, keys: keyList });
    if (!result) {
      return apiError('NOT_FOUND', `Company with identifier '${id}' not found.`, 404);
    }
    return apiSuccess(result, 200);
  } catch (err: unknown) {
    console.error(`Failed to get metric series for company ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to retrieve metrics series.', 500);
  }
}
