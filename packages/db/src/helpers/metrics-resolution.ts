import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '../client.js';
import { metrics } from '../schema/metrics.js';
import { documents } from '../schema/documents.js';

export interface ResolveMetricsOptions {
  from?: string;
  to?: string;
  keys?: string[];
}

/**
 * Deterministic read-time resolution for financial metrics.
 * When multiple documents provide a metric for the same (companyId, metricKey, reportingPeriod):
 * Non-old documents (isOldMis = false) win over older historical archive documents (isOldMis = true).
 * Ties are broken deterministically by latest document uploadedAt, then metric createdAt.
 */
export async function getResolvedCompanyMetrics(
  companyId: string,
  options: ResolveMetricsOptions = {}
) {
  const conditions = [eq(metrics.companyId, companyId)];
  if (options.from) conditions.push(gte(metrics.reportingPeriod, options.from));
  if (options.to) conditions.push(lte(metrics.reportingPeriod, options.to));
  if (options.keys && options.keys.length > 0) {
    conditions.push(inArray(metrics.metricKey, options.keys));
  }

  const rows = await db
    .select({
      id: metrics.id,
      companyId: metrics.companyId,
      documentId: metrics.documentId,
      metricKey: metrics.metricKey,
      value: metrics.value,
      unit: metrics.unit,
      reportingPeriod: metrics.reportingPeriod,
      sourceReference: metrics.sourceReference,
      valueKind: metrics.valueKind,
      confidence: metrics.confidence,
      createdAt: metrics.createdAt,
      isOldMis: documents.isOldMis,
      docUploadedAt: documents.uploadedAt,
    })
    .from(metrics)
    .innerJoin(documents, eq(metrics.documentId, documents.id))
    .where(and(...conditions))
    .orderBy(asc(metrics.reportingPeriod), asc(metrics.createdAt));

  // Deduplicate per (metricKey, reportingPeriod)
  const resolvedMap = new Map<string, (typeof rows)[0]>();

  for (const row of rows) {
    const key = `${row.metricKey}_${row.reportingPeriod}`;
    const existing = resolvedMap.get(key);
    if (!existing) {
      resolvedMap.set(key, row);
      continue;
    }

    // Non-old MIS wins over old MIS
    if (existing.isOldMis && !row.isOldMis) {
      resolvedMap.set(key, row);
    } else if (existing.isOldMis === row.isOldMis) {
      // Both old or both non-old: pick newer uploadedAt
      if (new Date(row.docUploadedAt) > new Date(existing.docUploadedAt)) {
        resolvedMap.set(key, row);
      }
    }
  }

  return Array.from(resolvedMap.values());
}
