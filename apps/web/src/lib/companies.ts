import { pool, db, companies, metrics, type Company, type Metric } from '@mis/db';
import { eq, and, gte, lte, inArray, asc } from 'drizzle-orm';

export interface CompanySummary {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  latestPeriod: string | null;
  latestRevenue: number | null;
  latestEbitda: number | null;
  lastUpdated: string;
}

export interface GetCompaniesOptions {
  search?: string;
  industry?: string;
  sort?: 'name' | 'revenue' | 'period' | 'updated';
  page?: number;
  limit?: number;
  includeArchived?: boolean;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'company'
  );
}

/**
 * Fetch companies with search, filtering, sorting, pagination, and aggregated summary metrics.
 */
export async function getCompaniesList(
  options: GetCompaniesOptions = {}
): Promise<{ companies: CompanySummary[]; total: number }> {
  const {
    search,
    industry,
    sort = 'updated',
    page = 1,
    limit = 20,
    includeArchived = false,
  } = options;

  const offset = Math.max(0, (page - 1) * limit);

  // Build WHERE clauses
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!includeArchived) {
    conditions.push('c.archived_at IS NULL');
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    const searchIdx = params.length;
    conditions.push(
      `(c.name ILIKE $${searchIdx} OR c.slug ILIKE $${searchIdx} OR COALESCE(c.description, '') ILIKE $${searchIdx})`
    );
  }

  if (industry && industry.trim()) {
    params.push(industry.trim());
    const indIdx = params.length;
    conditions.push(`c.industry = $${indIdx}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Determine sort clause
  let orderClause = 'ORDER BY GREATEST(c.updated_at, cd.last_doc_uploaded, lam.updated_at) DESC NULLS LAST, c.name ASC';
  if (sort === 'name') {
    orderClause = 'ORDER BY c.name ASC';
  } else if (sort === 'revenue') {
    orderClause = 'ORDER BY lr.revenue_val DESC NULLS LAST, c.name ASC';
  } else if (sort === 'period') {
    orderClause = 'ORDER BY COALESCE(lr.reporting_period, le.reporting_period, lam.reporting_period) DESC NULLS LAST, c.name ASC';
  }

  // Count total matching companies
  const countSql = `
    SELECT count(*)::int AS total
    FROM companies c
    ${whereClause}
  `;
  const countRes = await pool.query(countSql, params);
  const total = countRes.rows[0]?.total ?? 0;

  // Main list query with summary columns
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const listSql = `
    WITH company_docs AS (
      SELECT 
        company_id, 
        COUNT(*)::int AS doc_count,
        MAX(uploaded_at) AS last_doc_uploaded
      FROM documents
      WHERE status != 'failed'
      GROUP BY company_id
    ),
    latest_rev AS (
      SELECT DISTINCT ON (company_id)
        company_id,
        reporting_period,
        value::numeric AS revenue_val,
        updated_at
      FROM metrics
      WHERE metric_key = 'revenue'
      ORDER BY company_id, reporting_period DESC, updated_at DESC
    ),
    latest_ebitda AS (
      SELECT DISTINCT ON (company_id)
        company_id,
        reporting_period,
        value::numeric AS ebitda_val,
        updated_at
      FROM metrics
      WHERE metric_key = 'ebitda'
      ORDER BY company_id, reporting_period DESC, updated_at DESC
    ),
    latest_any_metric AS (
      SELECT DISTINCT ON (company_id)
        company_id,
        reporting_period,
        updated_at
      FROM metrics
      ORDER BY company_id, reporting_period DESC, updated_at DESC
    )
    SELECT 
      c.id,
      c.name,
      c.slug,
      c.industry,
      c.description,
      c.archived_at,
      c.created_at,
      c.updated_at,
      COALESCE(cd.doc_count, 0) AS document_count,
      COALESCE(lr.reporting_period, le.reporting_period, lam.reporting_period) AS latest_period,
      lr.revenue_val AS latest_revenue,
      le.ebitda_val AS latest_ebitda,
      GREATEST(c.updated_at, cd.last_doc_uploaded, lam.updated_at) AS last_updated
    FROM companies c
    LEFT JOIN company_docs cd ON cd.company_id = c.id
    LEFT JOIN latest_rev lr ON lr.company_id = c.id
    LEFT JOIN latest_ebitda le ON le.company_id = c.id
    LEFT JOIN latest_any_metric lam ON lam.company_id = c.id
    ${whereClause}
    ${orderClause}
    LIMIT $${limitIdx} OFFSET $${offsetIdx};
  `;

  const listRes = await pool.query(listSql, params);

  const formattedCompanies: CompanySummary[] = listRes.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    industry: row.industry,
    description: row.description,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    documentCount: Number(row.document_count || 0),
    latestPeriod: row.latest_period || null,
    latestRevenue: row.latest_revenue !== null ? Number(row.latest_revenue) : null,
    latestEbitda: row.latest_ebitda !== null ? Number(row.latest_ebitda) : null,
    lastUpdated: new Date(row.last_updated).toISOString(),
  }));

  return { companies: formattedCompanies, total };
}

/**
 * Create a new company with guaranteed unique slug generation.
 */
export async function createCompany(data: {
  name: string;
  industry?: string;
  description?: string;
}): Promise<Company> {
  const baseSlug = generateSlug(data.name);

  // Guarantee slug uniqueness
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, slug));
    if (!existing) break;
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  const [created] = await db
    .insert(companies)
    .values({
      name: data.name.trim(),
      slug,
      industry: data.industry?.trim() || null,
      description: data.description?.trim() || null,
    })
    .returning();

  return created;
}

/**
 * Fetch a company by either UUID or slug, including latest metrics per metric key.
 */
export async function getCompanyByIdOrSlug(
  idOrSlug: string
): Promise<(Company & { latestMetrics: Record<string, Metric> }) | null> {
  const isId = isUuid(idOrSlug);

  const [company] = await db
    .select()
    .from(companies)
    .where(isId ? eq(companies.id, idOrSlug) : eq(companies.slug, idOrSlug));

  if (!company) {
    return null;
  }

  // Fetch latest metrics per metric_key
  const latestMetricsSql = `
    SELECT DISTINCT ON (metric_key) *
    FROM metrics
    WHERE company_id = $1
    ORDER BY metric_key, reporting_period DESC, updated_at DESC;
  `;
  const metricsRes = await pool.query(latestMetricsSql, [company.id]);
  const latestMetrics: Record<string, Metric> = {};

  for (const m of metricsRes.rows) {
    latestMetrics[m.metric_key] = {
      id: m.id,
      companyId: m.company_id,
      documentId: m.document_id,
      metricKey: m.metric_key,
      value: String(m.value),
      unit: m.unit,
      reportingPeriod: m.reporting_period,
      sourceReference: m.source_reference,
      valueKind: m.value_kind,
      confidence: m.confidence ? String(m.confidence) : null,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    };
  }

  return { ...company, latestMetrics };
}

/**
 * Update company metadata.
 */
export async function updateCompany(
  idOrSlug: string,
  data: { name?: string; industry?: string; description?: string }
): Promise<Company | null> {
  const company = await getCompanyByIdOrSlug(idOrSlug);
  if (!company) return null;

  const updateFields: Partial<Company> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) {
    updateFields.name = data.name.trim();
  }
  if (data.industry !== undefined) {
    updateFields.industry = data.industry.trim() || null;
  }
  if (data.description !== undefined) {
    updateFields.description = data.description.trim() || null;
  }

  const [updated] = await db
    .update(companies)
    .set(updateFields)
    .where(eq(companies.id, company.id))
    .returning();

  return updated;
}

/**
 * Delete or archive a company.
 * Default is soft archive (archivedAt = now()).
 * Hard delete removes company and cascades cleanly to metrics/documents/chunks/blobs.
 */
export async function deleteCompany(
  idOrSlug: string,
  hard = false
): Promise<{ ok: boolean; archived: boolean; deleted: boolean } | null> {
  const company = await getCompanyByIdOrSlug(idOrSlug);
  if (!company) return null;

  if (hard) {
    await db.delete(companies).where(eq(companies.id, company.id));
    return { ok: true, archived: false, deleted: true };
  } else {
    await db
      .update(companies)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(companies.id, company.id));
    return { ok: true, archived: true, deleted: false };
  }
}

export interface MetricPoint {
  period: string;
  value: number;
  unit: string;
  valueKind: string;
  confidence: number | null;
  sourceReference: string | null;
}

/**
 * Get metric time-series for a company, grouped by metric key for charts.
 */
export async function getCompanyMetricSeries(
  idOrSlug: string,
  options: { from?: string; to?: string; keys?: string[] } = {}
): Promise<{ series: Record<string, MetricPoint[]> } | null> {
  const company = await getCompanyByIdOrSlug(idOrSlug);
  if (!company) return null;

  const conditions = [eq(metrics.companyId, company.id)];

  if (options.from) {
    conditions.push(gte(metrics.reportingPeriod, options.from));
  }
  if (options.to) {
    conditions.push(lte(metrics.reportingPeriod, options.to));
  }
  if (options.keys && options.keys.length > 0) {
    conditions.push(inArray(metrics.metricKey, options.keys));
  }

  const rows = await db
    .select()
    .from(metrics)
    .where(and(...conditions))
    .orderBy(asc(metrics.reportingPeriod), asc(metrics.createdAt));

  const series: Record<string, MetricPoint[]> = {};

  for (const r of rows) {
    if (!series[r.metricKey]) {
      series[r.metricKey] = [];
    }
    series[r.metricKey].push({
      period: r.reportingPeriod,
      value: Number(r.value),
      unit: r.unit,
      valueKind: r.valueKind,
      confidence: r.confidence ? Number(r.confidence) : null,
      sourceReference: r.sourceReference,
    });
  }

  return { series };
}
