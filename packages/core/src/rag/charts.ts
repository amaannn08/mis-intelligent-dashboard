import type { MetricContextRow } from './structured.js';

export interface ChartPoint {
  period: string; // 'YYYY-MM'
  value: number;  // raw numeric value
}

export interface ChartSeriesData {
  companyId: string | null;
  companyName: string;
  valueKind?: 'reported' | 'calculated' | 'estimated';
  points: ChartPoint[];
}

export interface ChartConfig {
  id: string;                                   // unique chart identifier e.g. "revenue"
  metricKey: string;                            // metric key e.g. "revenue", "ebitda"
  label: string;                                // human label e.g. "Net Revenue", "EBITDA"
  unit: 'currency' | 'percent' | 'number';
  series: ChartSeriesData[];
}

export interface ChartPayload {
  charts: ChartConfig[];
}

export interface BuildChartPayloadOptions {
  structuredRows: MetricContextRow[];
  metricKeys?: string[];
  targetCompanyId?: string | null;
  detectedCompanyNames?: string[];
  question?: string;
  maxCharts?: number;              // default: 4
  maxCompaniesPerChart?: number;   // default: 5
  defaultPeriodWindow?: number;    // default: 6
}

const METRIC_LABELS: Record<string, string> = {
  revenue: 'Net Revenue',
  ebitda: 'EBITDA',
  gross_margin: 'Gross Margin',
  burn: 'Monthly Cash Burn',
  run_rate: 'Run Rate',
};

function normalizeUnit(unit: string | undefined): 'currency' | 'percent' | 'number' {
  if (!unit) return 'number';
  const u = unit.toLowerCase().trim();
  if (u === 'currency' || u === 'inr' || u === '₹' || u === 'rs' || u === 'rupees') {
    return 'currency';
  }
  if (u === 'percent' || u === '%' || u.includes('pct')) {
    return 'percent';
  }
  return 'number';
}

function detectPeriodWindow(question?: string, defaultWindow = 6): number {
  const cap = 12;
  if (!question) return Math.min(defaultWindow, cap);
  const q = question.toLowerCase();

  // All periods
  if (/\b(all|overall|since inception|entire history|all periods|full history)\b/i.test(q)) {
    return cap;
  }

  // 12 months / 1 year
  if (/\b(12m|12 months|past year|last year|past 12|last 12|12 period)\b/i.test(q)) {
    return 12;
  }

  // Explicit number of months / periods (e.g. "past 4 months", "last 8 periods")
  const match = q.match(/\b(past|last|recent)\s+(\d{1,2})\s*(months|periods|m)\b/i);
  if (match && match[2]) {
    const parsed = parseInt(match[2], 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(parsed, cap);
    }
  }

  return Math.min(defaultWindow, cap);
}

/**
 * Pure, deterministic builder that transforms retrieved SQL metrics rows into
 * visual chart configurations for inline display.
 *
 * Rules:
 * - Data originates strictly from `structuredRows` (never model hallucinated).
 * - Charts match the answer's scope (Binding Addition 4): targetCompanyId or detectedCompanyNames.
 * - For company-scoped questions: 1 chart per metric with 1 series for that company.
 * - For portfolio-wide comparisons: 1 chart per metric with up to 5 company series.
 * - Sorts periods ascending chronologically.
 * - Caps max charts at 4, max 12 points per series.
 * - Omit metrics with no data.
 */
export function buildChartPayload(options: BuildChartPayloadOptions): ChartPayload {
  const {
    structuredRows = [],
    metricKeys = [],
    targetCompanyId = null,
    detectedCompanyNames = [],
    question = '',
    maxCharts = 4,
    maxCompaniesPerChart = 5,
    defaultPeriodWindow = 6,
  } = options;

  if (!structuredRows || structuredRows.length === 0) {
    return { charts: [] };
  }

  // 1. Filter rows by target company or detected companies (Scope resolution - Binding Addition 4)
  let filteredRows = structuredRows;
  if (targetCompanyId) {
    filteredRows = structuredRows.filter((r) => r.companyId === targetCompanyId);
  } else if (detectedCompanyNames && detectedCompanyNames.length > 0) {
    const lowerDetected = new Set(detectedCompanyNames.map((n) => n.trim().toLowerCase()));
    filteredRows = structuredRows.filter(
      (r) => r.companyName && lowerDetected.has(r.companyName.trim().toLowerCase())
    );
  }

  if (filteredRows.length === 0) {
    return { charts: [] };
  }

  const windowSize = detectPeriodWindow(question, defaultPeriodWindow);

  // Group rows by metricKey -> companyName -> Map<period, value>
  type CompanyData = {
    companyId: string | null;
    companyName: string;
    unit: string;
    periodMap: Map<string, number>;
  };

  const byMetric = new Map<string, Map<string, CompanyData>>();

  for (const row of filteredRows) {
    if (!row.metricKey || !row.reportingPeriod) continue;

    const numVal = typeof row.value === 'string' ? Number(row.value) : row.value;
    if (isNaN(numVal)) continue;

    const metricKey = row.metricKey.trim().toLowerCase();
    const companyName = (row.companyName || 'Unknown').trim();
    const companyId = row.companyId || null;

    if (!byMetric.has(metricKey)) {
      byMetric.set(metricKey, new Map());
    }

    const companyMap = byMetric.get(metricKey)!;
    if (!companyMap.has(companyName)) {
      companyMap.set(companyName, {
        companyId,
        companyName,
        unit: row.unit || 'currency',
        periodMap: new Map(),
      });
    }

    // Overwrite with latest row for same period if duplicated
    companyMap.get(companyName)!.periodMap.set(row.reportingPeriod.trim(), numVal);
  }

  // Determine which metric keys to process
  // If metricKeys specified, preserve their order and ONLY include keys present in byMetric
  let keysToProcess: string[] = [];
  if (metricKeys && metricKeys.length > 0) {
    const lowerRequested = metricKeys.map((k) => k.toLowerCase().trim());
    // For ARR questions, ensure revenue actuals are included as the base metric
    if (/\barr\b/i.test(question) || lowerRequested.includes('run_rate')) {
      if (byMetric.has('revenue') && !lowerRequested.includes('revenue')) {
        lowerRequested.push('revenue');
      }
    }
    keysToProcess = lowerRequested.filter((k) => byMetric.has(k));

    // If query specifically asks for ARR, chart the revenue actuals from which it is proxied
    if (/\barr\b/i.test(question) && keysToProcess.includes('revenue')) {
      keysToProcess = keysToProcess.filter((k) => k !== 'run_rate');
    }

    // If both ebitda and burn are matched but the question asks for "ebitda burn",
    // prioritize ebitda so we render 1 chart for revenue and 1 chart for ebitda burn (2 separately scaled charts total)
    if (keysToProcess.includes('ebitda') && keysToProcess.includes('burn')) {
      if (/ebitda\s+burn/i.test(question) || !/\b(cash\s+burn|net\s+burn)\b/i.test(question)) {
        keysToProcess = keysToProcess.filter((k) => k !== 'burn');
      }
    }
  } else {
    keysToProcess = Array.from(byMetric.keys());
  }

  if (keysToProcess.length === 0) {
    return { charts: [] };
  }

  // Check if single company query
  const distinctCompanies = new Set<string>();
  for (const compMap of byMetric.values()) {
    for (const compName of compMap.keys()) {
      distinctCompanies.add(compName);
    }
  }

  const isSingleCompany =
    Boolean(targetCompanyId) ||
    (detectedCompanyNames && detectedCompanyNames.length === 1) ||
    distinctCompanies.size === 1;

  const charts: ChartConfig[] = [];

  for (const metricKey of keysToProcess) {
    if (charts.length >= maxCharts) break;

    const companyMap = byMetric.get(metricKey);
    if (!companyMap || companyMap.size === 0) continue;

    const label = METRIC_LABELS[metricKey] || metricKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const firstComp = companyMap.values().next().value;
    const unit = normalizeUnit(firstComp?.unit);

    if (isSingleCompany) {
      // Find the target company or the single company
      let targetCompData: CompanyData | undefined;
      if (targetCompanyId) {
        targetCompData = Array.from(companyMap.values()).find((c) => c.companyId === targetCompanyId);
      }
      if (!targetCompData && detectedCompanyNames.length > 0) {
        targetCompData = Array.from(companyMap.values()).find((c) =>
          detectedCompanyNames.some((d) => d.toLowerCase() === c.companyName.toLowerCase())
        );
      }
      if (!targetCompData) {
        targetCompData = companyMap.values().next().value;
      }

      if (!targetCompData || targetCompData.periodMap.size === 0) continue;

      // Sort periods chronologically ascending
      const sortedPeriods = Array.from(targetCompData.periodMap.keys()).sort((a, b) =>
        a.localeCompare(b)
      );

      const windowedPeriods = isFinite(windowSize)
        ? sortedPeriods.slice(-windowSize)
        : sortedPeriods;

      const points: ChartPoint[] = windowedPeriods.map((period) => ({
        period,
        value: targetCompData!.periodMap.get(period)!,
      }));

      if (points.length === 0) continue;

      charts.push({
        id: `${metricKey}-${targetCompData.companyName.toLowerCase().replace(/\s+/g, '-')}`,
        metricKey,
        label,
        unit,
        series: [
          {
            companyId: targetCompData.companyId,
            companyName: targetCompData.companyName,
            points,
          },
        ],
      });
    } else {
      // Multi-company / Portfolio comparison: 1 chart for this metric, up to 5 companies
      // Gather all companies and sort by latest period value descending
      const compList = Array.from(companyMap.values());
      const isBurn = metricKey.includes('burn');

      compList.sort((a, b) => {
        const aPeriods = Array.from(a.periodMap.keys()).sort((p1, p2) => p1.localeCompare(p2));
        const bPeriods = Array.from(b.periodMap.keys()).sort((p1, p2) => p1.localeCompare(p2));
        const aLatestVal = aPeriods.length > 0 ? a.periodMap.get(aPeriods[aPeriods.length - 1]!)! : 0;
        const bLatestVal = bPeriods.length > 0 ? b.periodMap.get(bPeriods[bPeriods.length - 1]!)! : 0;

        if (isBurn) {
          return Math.abs(bLatestVal) - Math.abs(aLatestVal);
        }
        return bLatestVal - aLatestVal;
      });

      const selectedComps = compList.slice(0, maxCompaniesPerChart);
      const seriesList: ChartSeriesData[] = [];

      for (const comp of selectedComps) {
        const sortedPeriods = Array.from(comp.periodMap.keys()).sort((a, b) => a.localeCompare(b));
        const windowedPeriods = isFinite(windowSize)
          ? sortedPeriods.slice(-windowSize)
          : sortedPeriods;

        const points: ChartPoint[] = windowedPeriods.map((period) => ({
          period,
          value: comp.periodMap.get(period)!,
        }));

        if (points.length > 0) {
          seriesList.push({
            companyId: comp.companyId,
            companyName: comp.companyName,
            points,
          });
        }
      }

      if (seriesList.length === 0) continue;

      charts.push({
        id: `${metricKey}-comparison`,
        metricKey,
        label,
        unit,
        series: seriesList,
      });
    }
  }

  return { charts };
}
