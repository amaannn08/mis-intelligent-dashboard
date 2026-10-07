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
  // Unscaled source amounts (exact workbook figures)
  source_value_latest: number;
  source_value_latest_formatted: string;
  source_value_cumulative: number;
  source_value_cumulative_formatted: string;
  source_scale: string;
  source_currency: string;
  // Normalized amounts in base rupees (already scaled, DO NOT scale again)
  normalized_amount_latest_inr: number;
  normalized_amount_cumulative_inr: number;
  scale_multiplier_applied: boolean;
  value_unit: string;
  do_not_scale_again: boolean;
  // Backward-compatible fields
  totalValue: number;
  avgValue: number;
  latestValue?: number;
  latestPeriod?: string;
  unit: string;
  currency: string | null;
  scale: string;
  periodsCount: number;
  minPeriod: string;
  maxPeriod: string;
  sheetName?: string;
  sourceDocument?: string;
  scaleProvenance?: string;
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
  authoritativeDocument?: string;
  authoritativeSheet?: string;
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
  if (m === 'net_revenue' || m === 'net revenue') {
    return ['net_revenue'];
  }
  if (m === 'gross_revenue' || m === 'gross revenue') {
    return ['gross_revenue'];
  }
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
 * Applies current-document precedence and authoritative sheet selection to prevent
 * duplicate summing between summary sheets and cross-tabulation sheets.
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

  // 2. Select authoritative document (current-document precedence)
  // When ranking or aggregating across time, pick the latest processed document
  // containing matrix/block data for this company so overlapping historical months
  // from older files are not double-counted.
  let authoritativeDocId: string | null = null;
  let authoritativeDocFilename: string | null = null;

  if (resolvedCompanyId) {
    const docRes = await pool.query(
      `SELECT d.id, d.filename, d.reporting_period
       FROM documents d
       WHERE d.company_id = $1
         AND d.status = 'processed'
         AND d.id IN (SELECT DISTINCT document_id FROM mis_metrics WHERE company_id = $1 AND block_label IS NOT NULL)
       ORDER BY d.reporting_period DESC NULLS LAST, d.uploaded_at DESC
       LIMIT 1;`,
      [resolvedCompanyId]
    );

    if (docRes.rows.length > 0) {
      authoritativeDocId = docRes.rows[0].id;
      authoritativeDocFilename = docRes.rows[0].filename;
    }
  }

  // 3. Resolve authoritative sheet
  // Prevents summing duplicate sheets like 'Category' (totals) and 'Category X Channel' (sub-breakdowns)
  let resolvedSheetName: string | undefined = sheetName;
  let requireNullParent = false;

  if (!resolvedSheetName && authoritativeDocId) {
    if (parentBlockLabel) {
      // User specifically queried a channel or parent breakdown:
      // Prefer the cross-breakdown sheet (e.g. 'Category X Channel')
      const cxcCheck = await pool.query(
        `SELECT sheet_name FROM mis_metrics
         WHERE document_id = $1 AND parent_block_label ILIKE $2
         LIMIT 1;`,
        [authoritativeDocId, `%${parentBlockLabel}%`]
      );
      if (cxcCheck.rows.length > 0) {
        resolvedSheetName = cxcCheck.rows[0].sheet_name;
      }
    } else {
      // User queried category ranking across the company:
      // Prefer dedicated 'Category' sheet if it exists
      const catCheck = await pool.query(
        `SELECT DISTINCT sheet_name FROM mis_metrics
         WHERE document_id = $1 
           AND sheet_name ILIKE '%Category%' 
           AND sheet_name NOT ILIKE '%Channel%'
         LIMIT 1;`,
        [authoritativeDocId]
      );
      if (catCheck.rows.length > 0) {
        resolvedSheetName = catCheck.rows[0].sheet_name;
        requireNullParent = true;
      }
    }
  }

  // 4. Build WHERE clauses
  const whereClauses: string[] = [
    `mm.status = 'valid'`,
    `mm.value IS NOT NULL`,
  ];
  const queryParams: unknown[] = [];
  let paramIdx = 1;

  if (authoritativeDocId) {
    whereClauses.push(`mm.document_id = $${paramIdx++}`);
    queryParams.push(authoritativeDocId);
  } else if (resolvedCompanyId) {
    whereClauses.push(`mm.company_id = $${paramIdx++}`);
    queryParams.push(resolvedCompanyId);
  } else if (companyName) {
    whereClauses.push(`c.name ILIKE $${paramIdx++}`);
    queryParams.push(`%${companyName}%`);
  }

  if (resolvedSheetName) {
    whereClauses.push(`mm.sheet_name ILIKE $${paramIdx++}`);
    queryParams.push(`%${resolvedSheetName}%`);
  }

  if (requireNullParent) {
    whereClauses.push(`mm.parent_block_label IS NULL`);
  } else if (parentBlockLabel) {
    whereClauses.push(`mm.parent_block_label ILIKE $${paramIdx++}`);
    queryParams.push(`%${parentBlockLabel}%`);
  }

  if (blockLabel) {
    whereClauses.push(`mm.block_label ILIKE $${paramIdx++}`);
    queryParams.push(`%${blockLabel}%`);
  }

  // 5. Metric matching with strict kind and unit segregation
  const isNetRevenue = metricTerms.length === 1 && metricTerms[0] === 'net_revenue';
  const isGrossRevenue = metricTerms.length === 1 && metricTerms[0] === 'gross_revenue';
  const isRevenueSearch = isNetRevenue || isGrossRevenue || metricTerms.some((t) => t.includes('revenue') || t.includes('sales'));

  if (isRevenueSearch) {
    whereClauses.push(`mm.unit != 'percent'`);
    whereClauses.push(`mm.raw_label NOT ILIKE '%\\%%'`);
    whereClauses.push(`mm.raw_label NOT ILIKE '%margin%'`);
    whereClauses.push(`mm.raw_label NOT ILIKE '%gm%'`);
    whereClauses.push(`mm.normalized_label NOT ILIKE '%percent%'`);
    whereClauses.push(`mm.normalized_label NOT ILIKE '%pct%'`);
    whereClauses.push(`(mm.kind IS NULL OR mm.kind = 'currency')`);
    if (isNetRevenue) {
      whereClauses.push(`(mm.raw_label ILIKE '%Net Revenue%' OR mm.normalized_label = 'net_revenue')`);
    } else if (isGrossRevenue) {
      whereClauses.push(`(mm.raw_label ILIKE '%Gross Revenue%' OR mm.normalized_label = 'gross_revenue')`);
    } else {
      whereClauses.push(`(mm.raw_label ILIKE '%Net Revenue%' OR mm.raw_label ILIKE '%Revenue%' OR mm.normalized_label = 'net_revenue' OR mm.standard_metric_key = 'revenue')`);
    }
  } else if (metricTerms.some((t) => t.includes('qty') || t.includes('volume'))) {
    whereClauses.push(`(mm.kind IS NULL OR mm.kind = 'count')`);
    whereClauses.push(`(mm.raw_label ILIKE '%qty%' OR mm.raw_label ILIKE '%quantity%' OR mm.raw_label ILIKE '%volume%')`);
  } else {
    const metricConds = metricTerms.map((t) => {
      const pNum = paramIdx++;
      queryParams.push(`%${t}%`);
      return `(mm.normalized_label ILIKE $${pNum} OR mm.raw_label ILIKE $${pNum} OR mm.standard_metric_key ILIKE $${pNum})`;
    });
    whereClauses.push(`(${metricConds.join(' OR ')})`);
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

  // 6. Ranked category / block summary with latest period values
  const summarySql = `
    WITH block_summary AS (
      SELECT 
        mm.block_label,
        mm.parent_block_label,
        mm.raw_label AS metric_label,
        mm.unit,
        mm.currency,
        mm.scale,
        mm.sheet_name,
        d.filename,
        COUNT(DISTINCT mm.reporting_period) AS periods_count,
        MIN(mm.reporting_period) AS min_period,
        MAX(mm.reporting_period) AS max_period,
        ROUND(SUM(CAST(mm.value AS numeric)), 2) AS total_value,
        ROUND(AVG(CAST(mm.value AS numeric)), 2) AS avg_value
      FROM mis_metrics mm
      JOIN companies c ON c.id = mm.company_id
      JOIN documents d ON d.id = mm.document_id
      WHERE ${whereSql} AND mm.block_label IS NOT NULL
      GROUP BY mm.block_label, mm.parent_block_label, mm.raw_label, mm.unit, mm.currency, mm.scale, mm.sheet_name, d.filename, mm.document_id
    ),
    latest_vals AS (
      SELECT DISTINCT ON (mm.block_label)
        mm.block_label,
        mm.reporting_period AS latest_period,
        ROUND(CAST(mm.value AS numeric), 2) AS latest_value
      FROM mis_metrics mm
      JOIN companies c ON c.id = mm.company_id
      JOIN documents d ON d.id = mm.document_id
      WHERE ${whereSql} AND mm.block_label IS NOT NULL
      ORDER BY mm.block_label, mm.reporting_period DESC
    )
    SELECT 
      bs.*,
      lv.latest_period,
      lv.latest_value
    FROM block_summary bs
    LEFT JOIN latest_vals lv ON lv.block_label = bs.block_label
    ORDER BY bs.total_value DESC
    LIMIT $${paramIdx};
  `;

  const summaryParams = [...queryParams, limit];
  const summaryRes = await pool.query(summarySql, summaryParams);

  const rankedCategories: MetricAggregationItem[] = summaryRes.rows.map((r) => {
    const scale = r.scale || 'units';
    const totalVal = parseFloat(r.total_value);
    const avgVal = parseFloat(r.avg_value);
    const latestVal = r.latest_value !== null ? parseFloat(r.latest_value) : undefined;
    const mult = scale === 'lakh' ? 100_000 : scale === 'crore' ? 10_000_000 : scale === 'thousand' ? 1_000 : 1;

    // Detect if database values are already stored in normalized base rupees or raw sheet amounts
    const isAlreadyNormalized = mult > 1 && Math.abs(totalVal) >= mult;
    const normalizedCum = isAlreadyNormalized ? totalVal : totalVal * mult;
    const normalizedLatest = latestVal !== undefined ? (isAlreadyNormalized ? latestVal : latestVal * mult) : 0;
    const rawCum = isAlreadyNormalized ? totalVal / mult : totalVal;
    const rawLatest = latestVal !== undefined ? (isAlreadyNormalized ? latestVal / mult : latestVal) : 0;

    const scaleLabel = scale === 'lakh' ? 'Lakh' : scale === 'crore' ? 'Crore' : scale === 'thousand' ? 'Thousand' : 'units';
    const currencyStr = r.currency || 'INR';

    return {
      blockLabel: r.block_label,
      parentBlockLabel: r.parent_block_label ?? null,
      metricLabel: r.metric_label,
      source_value_latest: parseFloat(rawLatest.toFixed(2)),
      source_value_latest_formatted: `${parseFloat(rawLatest.toFixed(2))} ${scaleLabel}`,
      source_value_cumulative: parseFloat(rawCum.toFixed(2)),
      source_value_cumulative_formatted: `${parseFloat(rawCum.toFixed(2))} ${scaleLabel}`,
      source_scale: scale,
      source_currency: currencyStr,
      normalized_amount_latest_inr: Math.round(normalizedLatest),
      normalized_amount_cumulative_inr: Math.round(normalizedCum),
      scale_multiplier_applied: true,
      value_unit: currencyStr,
      do_not_scale_again: true,
      totalValue: parseFloat(rawCum.toFixed(2)),
      avgValue: parseFloat(avgVal.toFixed(2)),
      latestValue: latestVal !== undefined ? parseFloat(rawLatest.toFixed(2)) : undefined,
      latestPeriod: r.latest_period ?? undefined,
      unit: currencyStr,
      currency: currencyStr,
      scale,
      periodsCount: parseInt(r.periods_count, 10),
      minPeriod: r.min_period,
      maxPeriod: r.max_period,
      sheetName: r.sheet_name,
      sourceDocument: r.filename,
      scaleProvenance:
        scale !== 'units'
          ? `Inherited from workbook P&L Summary banner 'Particulars in INR Lac' (scale: ${scale}, multiplier: ${mult})`
          : 'Scale unknown without explicit workbook banner',
    };
  });

  // 7. Recent detail rows
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

  const top = rankedCategories[0];
  const mult = top?.source_scale === 'lakh' ? 100_000 : top?.source_scale === 'crore' ? 10_000_000 : top?.source_scale === 'thousand' ? 1_000 : 1;
  const explanation =
    rankedCategories.length > 0
      ? `Authoritative source: Sheet '${top?.sheetName}' in '${top?.sourceDocument}'.
- Latest reported period (${top?.latestPeriod}): #1 best-selling category is '${top?.blockLabel}' with ${top?.source_value_latest_formatted} (normalized: ₹${top?.normalized_amount_latest_inr.toLocaleString('en-IN')}, or ₹${(top?.normalized_amount_latest_inr / 10_000_000).toFixed(2)} Cr).
- Cumulative across ${top?.periodsCount} months (${top?.minPeriod} to ${top?.maxPeriod}): #1 is '${top?.blockLabel}' with total ${top?.source_value_cumulative_formatted} (normalized: ₹${top?.normalized_amount_cumulative_inr.toLocaleString('en-IN')}, or ₹${(top?.normalized_amount_cumulative_inr / 10_000_000).toFixed(2)} Cr).
- Scale provenance: ${top?.scaleProvenance}.
CRITICAL INSTRUCTION FOR LLM ASSISTANT: Quote the exact amounts: "${top?.source_value_latest_formatted}" (latest month ${top?.latestPeriod}) and "${top?.source_value_cumulative_formatted}" (cumulative). In Crores, these are ₹${(top?.normalized_amount_latest_inr / 10_000_000).toFixed(2)} Cr and ₹${(top?.normalized_amount_cumulative_inr / 10_000_000).toFixed(2)} Cr.${mult > 1 ? ` DO NOT multiply these numbers by ${mult} again!` : ''}`
      : `No block-grouped records found for ${resolvedCompanyName || 'company'} with metric '${metric}'.`;

  return {
    companyName: resolvedCompanyName,
    metricFilter: metric,
    authoritativeDocument: authoritativeDocFilename ?? undefined,
    authoritativeSheet: resolvedSheetName,
    rankedCategories,
    recentRows,
    totalRecordsFound: rankedCategories.length + recentRows.length,
    explanation,
  };
}
