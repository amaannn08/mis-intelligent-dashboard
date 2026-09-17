export interface MetricContextRow {
  id?: string;
  companyId: string;
  companyName: string;
  documentId?: string;
  filename?: string;
  metricKey: string;
  value: string | number;
  unit: string;
  reportingPeriod: string; // 'YYYY-MM'
  sourceReference: string;
  citationIndex?: number;
}

export interface StructuredContextOptions {
  rows: MetricContextRow[];
  isRanking?: boolean;
  singleCompany?: boolean;
}

/**
 * Format numeric value in Indian numbering system (₹ Lakh / Crore).
 */
export function formatIndianCurrency(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return 'Not available';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 'Not available';

  const isNegative = num < 0;
  const abs = Math.abs(num);
  const sign = isNegative ? '-' : '';

  let formatted = '';
  if (abs >= 10_000_000) {
    const cr = abs / 10_000_000;
    const crStr = (cr >= 10 ? cr.toFixed(1) : cr.toFixed(2))
      .replace(/0+$/, '')
      .replace(/\.$/, '');
    formatted = `${crStr} Cr`;
  } else if (abs >= 100_000) {
    const lakh = abs / 100_000;
    const lakhStr = (lakh >= 10 ? lakh.toFixed(1) : lakh.toFixed(2))
      .replace(/0+$/, '')
      .replace(/\.$/, '');
    formatted = `${lakhStr} L`;
  } else if (abs >= 1_000) {
    const k = abs / 1_000;
    const kStr = k.toFixed(1).replace(/0+$/, '').replace(/\.$/, '');
    formatted = `${kStr} k`;
  } else {
    formatted = abs.toLocaleString('en-IN', { maximumFractionDigits: 1 });
  }

  return `${sign}₹${formatted}`;
}

/**
 * Format numeric value as percentage.
 */
export function formatPercent(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return 'Not available';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 'Not available';

  const isNegative = num < 0;
  const abs = Math.abs(num);
  const sign = isNegative ? '-' : '';

  return `${sign}${abs.toFixed(1)}%`;
}

/**
 * Format metric value according to unit (currency | percent | other).
 */
export function formatMetricValue(
  val: number | string | null | undefined,
  unit: string
): string {
  if (val === null || val === undefined || val === '') return 'Not available';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 'Not available';

  const lowerUnit = (unit || '').toLowerCase();
  if (lowerUnit === 'percent' || lowerUnit === '%' || lowerUnit.includes('pct')) {
    return formatPercent(num);
  }
  if (lowerUnit === 'currency' || lowerUnit === 'inr' || lowerUnit === '₹') {
    return formatIndianCurrency(num);
  }
  return num.toLocaleString('en-IN');
}

/**
 * Calculate MoM % change between two periods.
 * Works correctly for both positive and negative values (e.g. burn / negative EBITDA):
 * change = ((current - previous) / |previous|) * 100
 */
export function calculateMoM(
  current: number,
  previous: number | null | undefined
): { changePercent: number | null; formatted: string } {
  if (previous === null || previous === undefined || isNaN(previous) || previous === 0) {
    return { changePercent: null, formatted: 'N/A' };
  }

  const diff = current - previous;
  const changePercent = (diff / Math.abs(previous)) * 100;

  let formatted = '';
  if (changePercent > 0) {
    formatted = `+${changePercent.toFixed(1)}%`;
  } else if (changePercent < 0) {
    formatted = `${changePercent.toFixed(1)}%`;
  } else {
    formatted = '0.0%';
  }

  return { changePercent, formatted };
}

interface PeriodItem {
  period: string;
  value: number;
  formattedValue: string;
  unit: string;
  sourceReference: string;
  filename?: string;
  documentId?: string;
  citationIndex?: number;
}

interface CompanyMetricGroup {
  companyName: string;
  metricKey: string;
  unit: string;
  periods: PeriodItem[];
  latest: PeriodItem;
  previous?: PeriodItem;
  momFormatted: string;
  momPercent: number | null;
}

/**
 * Build the structured metrics context block for LLM RAG prompting.
 * Renders per company and metric key: latest period, previous period, MoM % change, and source reference.
 * For ranking questions, lists all portfolio companies ordered for the metric.
 * For single company questions, includes the series of up to the last 6 periods.
 */
export function buildStructuredMetricsContext(options: StructuredContextOptions): string {
  const { rows, isRanking = false, singleCompany = false } = options;
  if (!rows || rows.length === 0) {
    return '';
  }

  // 1. Group rows by companyName and metricKey
  const groupsMap = new Map<string, { companyName: string; metricKey: string; unit: string; items: PeriodItem[] }>();

  for (const row of rows) {
    const key = `${row.companyName}::${row.metricKey}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        companyName: row.companyName,
        metricKey: row.metricKey,
        unit: row.unit,
        items: [],
      });
    }

    const numVal = typeof row.value === 'string' ? parseFloat(row.value) : row.value;
    groupsMap.get(key)!.items.push({
      period: row.reportingPeriod,
      value: numVal,
      formattedValue: formatMetricValue(numVal, row.unit),
      unit: row.unit,
      sourceReference: row.sourceReference,
      filename: row.filename,
      documentId: row.documentId,
      citationIndex: row.citationIndex,
    });
  }

  // 2. Sort periods chronologically and extract latest, previous, MoM
  const metricGroups: CompanyMetricGroup[] = [];

  for (const group of groupsMap.values()) {
    // Sort periods ascending (e.g. '2025-05', '2025-06')
    group.items.sort((a, b) => a.period.localeCompare(b.period));

    const latest = group.items[group.items.length - 1]!;
    const previous = group.items.length >= 2 ? group.items[group.items.length - 2] : undefined;
    const { formatted: momFormatted, changePercent: momPercent } = calculateMoM(
      latest.value,
      previous?.value
    );

    metricGroups.push({
      companyName: group.companyName,
      metricKey: group.metricKey,
      unit: group.unit,
      periods: group.items,
      latest,
      previous,
      momFormatted,
      momPercent,
    });
  }

  // 3. Render according to mode (ranking vs single/multi company)
  const lines: string[] = ['STRUCTURED METRICS:'];

  if (isRanking) {
    // Group by metricKey
    const byMetric = new Map<string, CompanyMetricGroup[]>();
    for (const g of metricGroups) {
      if (!byMetric.has(g.metricKey)) {
        byMetric.set(g.metricKey, []);
      }
      byMetric.get(g.metricKey)!.push(g);
    }

    for (const [metricKey, list] of byMetric.entries()) {
      // Sort companies by latest value descending (for burn, highest burn often means largest magnitude)
      const isBurn = metricKey.toLowerCase().includes('burn');
      list.sort((a, b) => {
        if (isBurn) {
          // Compare absolute burn magnitude
          return Math.abs(b.latest.value) - Math.abs(a.latest.value);
        }
        return b.latest.value - a.latest.value;
      });

      const sampleUnit = list[0]?.unit || 'currency';
      lines.push(`\n[Portfolio Ranking for Metric: ${metricKey} (${sampleUnit})]`);

      for (const item of list) {
        const citationTag = item.latest.citationIndex ? `[${item.latest.citationIndex}] ` : '';
        const prevText = item.previous
          ? ` | Previous (${item.previous.period}): ${item.previous.formattedValue}`
          : '';
        const sourceText = item.latest.filename
          ? ` | Source: ${item.latest.filename} [${item.latest.sourceReference}]`
          : ` | Source: ${item.latest.sourceReference}`;

        lines.push(
          `- ${citationTag}${item.companyName}: Latest (${item.latest.period}): ${item.latest.formattedValue}${prevText} | MoM: ${item.momFormatted}${sourceText}`
        );
      }
    }
  } else {
    // Group by companyName
    const byCompany = new Map<string, CompanyMetricGroup[]>();
    for (const g of metricGroups) {
      if (!byCompany.has(g.companyName)) {
        byCompany.set(g.companyName, []);
      }
      byCompany.get(g.companyName)!.push(g);
    }

    for (const [companyName, metrics] of byCompany.entries()) {
      lines.push(`\nCompany: ${companyName}`);
      for (const m of metrics) {
        const citationTag = m.latest.citationIndex ? `[${m.latest.citationIndex}] ` : '';
        const prevText = m.previous
          ? `  Previous: ${m.previous.period}: ${m.previous.formattedValue}\n`
          : '';
        const sourceText = m.latest.filename
          ? `Source: ${m.latest.filename} (${m.latest.sourceReference})`
          : `Source: ${m.latest.sourceReference}`;

        lines.push(`- Metric: ${m.metricKey} (${m.unit})`);
        lines.push(`  Latest: ${m.latest.period}: ${m.latest.formattedValue}`);
        if (prevText) lines.push(prevText.trimEnd());
        lines.push(`  MoM Change: ${m.momFormatted}`);
        lines.push(`  ${citationTag}${sourceText}`);

        // If singleCompany or series requested, include last 6 periods
        if (singleCompany || m.periods.length > 1) {
          const seriesWindow = m.periods.slice(-6);
          lines.push(`  Series (last ${seriesWindow.length} periods):`);
          for (let i = 0; i < seriesWindow.length; i++) {
            const currentItem = seriesWindow[i]!;
            const prevItem = i > 0 ? seriesWindow[i - 1] : undefined;
            const periodMom = prevItem ? calculateMoM(currentItem.value, prevItem.value).formatted : 'N/A';
            const momTag = periodMom !== 'N/A' ? ` (${periodMom} MoM)` : '';
            lines.push(
              `    * ${currentItem.period}: ${currentItem.formattedValue}${momTag} | Ref: ${currentItem.sourceReference}`
            );
          }
        }
      }
    }
  }

  return lines.join('\n');
}
