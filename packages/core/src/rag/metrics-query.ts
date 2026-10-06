import { pool } from '@mis/db';

export interface QueryMisMetricsParams {
  companyName?: string;
  companyId?: string;
  metric?: string; // e.g. 'net_revenue', 'gross_revenue', 'qty', 'revenue', 'cogs'
  parentBlockLabel?: string; // e.g. 'Blinkit', 'Zepto'
  blockLabel?: string; // e.g. 'Condiments'
  sheetName?: string;
  period?: string; // 'YYYY-MM'
  periodStart?: string;
  periodEnd?: string;
  limit?: number;
}

export interface MetricAggregationItem {
  blockLabel: string;
  parentBlockLabel: string | null;
  metricLabel: string;
  unit: string;
  currency: string | null;
  scale: string;
  periodsCount: number;
  minPeriod: string;
  maxPeriod: string;
  totalValue: number;
  avgValue: number;
  latestValue?: number;
}

export interface MetricDetailRow {
  blockLabel: string | null;
  parentBlockLabel: string | null;
  metricLabel: string;
  reportingPeriod: string;
  value: number;
  unit: string;
  currency: string | null;
  scale: string;
  sheetName: string;
  sourceReference: string;
}

export interface QueryMisMetricsResult {
  companyName: string;
  metricFilter: string;
  rankedCategories: MetricAggregationItem[];
  recentRows: MetricDetailRow[];
  totalRecordsFound: number;
  explanation: string;
}

/**
 * Normalizes user/model metric search terms to target mis_metrics labels.
 */
function expandMetricSearchTerms(metric?: string): string[] {
  if (!metric) return ['net_revenue', 'gross_revenue', 'revenue'];
  const m = metric.toLowerCase().trim();
  if (m === 'revenue' || m === 'sales' || m === 'selling' || m === 'best selling') {
    return ['net_revenue', 'gross_revenue', 'revenue'];
  }
  if (m === 'qty' || m === 'quantity' || m === 'volume') {
    return ['qty', 'quantity', 'volume'];
  }
  if (m === 'cogs' || m === 'cost') {
    return ['cogs', 'cost of goods sold'];
  }
  if (m === 'cm1' || m === 'contribution margin 1') {
    return ['cm1'];
  }
  if (m === 'cm2' || m === 'contribution margin 2') {
    return ['cm2'];
  }
  if (m === 'gross_margin' || m === 'gm') {
    return ['gross_margin', 'gross profit', 'gm'];
  }
  return [m.replace(/\s+/g, '_'), m];
}

/**
 * Query mis_metrics with structured filtering and block aggregation.
 * Answers questions like "which category is best selling" with grouped, ranked data.
 */
export async function queryMisMetrics(
  params: QueryMisMetricsParams
): Promise<QueryMisMetricsResult> {
  const {
    companyName,
    companyId,
    metric = 'net_revenue',
    parentBlockLabel,
    blockLabel,
    sheetName,
    period,
    periodStart,
    periodEnd,
    limit = 20,
  } = params;

  const metricTerms = expandMetricSearchTerms(metric);

  // 1. Resolve company
  let resolvedCompanyId: string | null = companyId || null;
  let resolvedCompanyName = companyName || '';

  if (!resolvedCompanyId && companyName) {
    const compRes = await pool.query(
      `SELECT id, name FROM companies WHERE name ILIKE $1 OR slug ILIKE $1 LIMIT 1;`,
      [`%${companyName}%`]
    );
    if (compRes.rows.length > 0) {
      resolvedCompanyId = compRes.rows[0].id;
      resolvedCompanyName = compRes.rows[0].name;
    }
  } else if (resolvedCompanyId && !resolvedCompanyName) {
    const compRes = await pool.query(`SELECT id, name FROM companies WHERE id = $1 LIMIT 1;`, [
      resolvedCompanyId,
    ]);
    if (compRes.rows.length > 0) {
      resolvedCompanyName = compRes.rows[0].name;
    }
  }

  // 2. Build where clause
  const whereClauses: string[] = [
    `mm.status = 'valid'`,
    `mm.value IS NOT NULL`,
    `mm.value ~ '^[0-9]+(\.[0-9]+)?$'`, // numeric value check
  ];
  const queryParams: unknown[] = [];
  let paramIdx = 1;

  if (resolvedCompanyId) {
    whereClauses.push(`mm.company_id = $${paramIdx++}`);
    queryParams.push(resolvedCompanyId);
  } else if (companyName) {
    whereClauses.push(`c.name ILIKE $${paramIdx++}`);
    queryParams.push(`%${companyName}%`);
  }

  // Metric matching
  const metricConds = metricTerms.map((t) => {
    const pNum = paramIdx++;
    queryParams.push(`%${t}%`);
    return `(mm.normalized_label ILIKE $${pNum} OR mm.raw_label ILIKE $${pNum} OR mm.standard_metric_key ILIKE $${pNum})`;
  });
  whereClauses.push(`(${metricConds.join(' OR ')})`);

  if (parentBlockLabel) {
    whereClauses.push(`mm.parent_block_label ILIKE $${paramIdx++}`);
    queryParams.push(`%${parentBlockLabel}%`);
  }

  if (blockLabel) {
    whereClauses.push(`mm.block_label ILIKE $${paramIdx++}`);
    queryParams.push(`%${blockLabel}%`);
  }

  if (sheetName) {
    whereClauses.push(`mm.sheet_name ILIKE $${paramIdx++}`);
    queryParams.push(`%${sheetName}%`);
  }

  if (period) {
    whereClauses.push(`mm.reporting_period = $${paramIdx++}`);
    queryParams.push(period);
  } else {
    if (periodStart) {
      whereClauses.push(`mm.reporting_period >= $${paramIdx++}`);
      queryParams.push(periodStart);
    }
    if (periodEnd) {
      whereClauses.push(`mm.reporting_period <= $${paramIdx++}`);
      queryParams.push(periodEnd);
    }
  }

  const whereSql = whereClauses.join(' AND ');

  // 3. Ranked category / block summary
  const summarySql = `
    SELECT 
      mm.block_label,
      mm.parent_block_label,
      mm.raw_label AS metric_label,
      mm.unit,
      mm.currency,
      mm.scale,
      COUNT(DISTINCT mm.reporting_period) AS periods_count,
      MIN(mm.reporting_period) AS min_period,
      MAX(mm.reporting_period) AS max_period,
      ROUND(SUM(CAST(mm.value AS numeric)), 2) AS total_value,
      ROUND(AVG(CAST(mm.value AS numeric)), 2) AS avg_value
    FROM mis_metrics mm
    JOIN companies c ON c.id = mm.company_id
    WHERE ${whereSql} AND mm.block_label IS NOT NULL
    GROUP BY mm.block_label, mm.parent_block_label, mm.raw_label, mm.unit, mm.currency, mm.scale
    ORDER BY total_value DESC
    LIMIT $${paramIdx};
  `;

  const summaryParams = [...queryParams, limit];
  const summaryRes = await pool.query(summarySql, summaryParams);

  const rankedCategories: MetricAggregationItem[] = summaryRes.rows.map((r) => ({
    blockLabel: r.block_label,
    parentBlockLabel: r.parent_block_label ?? null,
    metricLabel: r.metric_label,
    unit: r.unit,
    currency: r.currency ?? null,
    scale: r.scale,
    periodsCount: parseInt(r.periods_count, 10),
    minPeriod: r.min_period,
    maxPeriod: r.max_period,
    totalValue: parseFloat(r.total_value),
    avgValue: parseFloat(r.avg_value),
  }));

  // 4. Sample / recent detail rows
  const detailSql = `
    SELECT 
      mm.block_label,
      mm.parent_block_label,
      mm.raw_label AS metric_label,
      mm.reporting_period,
      CAST(mm.value AS numeric) AS value,
      mm.unit,
      mm.currency,
      mm.scale,
      mm.sheet_name,
      mm.source_reference
    FROM mis_metrics mm
    JOIN companies c ON c.id = mm.company_id
    WHERE ${whereSql}
    ORDER BY mm.reporting_period DESC, CAST(mm.value AS numeric) DESC
    LIMIT $${paramIdx};
  `;

  const detailRes = await pool.query(detailSql, summaryParams);
  const recentRows: MetricDetailRow[] = detailRes.rows.map((r) => ({
    blockLabel: r.block_label ?? null,
    parentBlockLabel: r.parent_block_label ?? null,
    metricLabel: r.metric_label,
    reportingPeriod: r.reporting_period,
    value: parseFloat(r.value),
    unit: r.unit,
    currency: r.currency ?? null,
    scale: r.scale,
    sheetName: r.sheet_name,
    sourceReference: r.source_reference,
  }));

  const explanation =
    rankedCategories.length > 0
      ? `Found ${rankedCategories.length} ranked blocks for ${resolvedCompanyName || 'company'} (${metric}) across periods ${rankedCategories[0]?.minPeriod} to ${rankedCategories[0]?.maxPeriod}. Top block is '${rankedCategories[0]?.blockLabel}' with total ${rankedCategories[0]?.totalValue} ${rankedCategories[0]?.unit} (${rankedCategories[0]?.scale}).`
      : `No block-grouped records found for ${resolvedCompanyName || 'company'} with metric '${metric}'.`;

  return {
    companyName: resolvedCompanyName,
    metricFilter: metric,
    rankedCategories,
    recentRows,
    totalRecordsFound: rankedCategories.length + recentRows.length,
    explanation,
  };
}
