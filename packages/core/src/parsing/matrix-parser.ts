import * as XLSX from 'xlsx';
import type { MatrixParseResult, ParsedMatrixMetric } from '../types.js';

export const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

/**
 * Convert Excel serial date number (e.g. 45383) to UTC Date.
 */
export function excelSerialToDate(serial: number): Date | null {
  if (serial < 35000 || serial > 65000) return null; // ~1995 to 2078
  // Excel epoch is 1899-12-30 due to 1900 leap year bug
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + serial * 86400 * 1000);
}

export interface ParsedPeriodInfo {
  reportingPeriod: string; // YYYY-MM
  periodDate?: string; // exact YYYY-MM-DD
  granularity: 'daily' | 'monthly' | 'quarterly' | 'annual' | 'snapshot';
  rawLabel: string;
}

/**
 * Robust cell-level period parser handling serial dates, calendar dates,
 * daily timestamps, Indian fiscal quarters, and comparative header strings.
 */
export function parseReportingPeriodInfo(
  val: unknown,
  contextYear?: number
): ParsedPeriodInfo | null {
  if (val === null || val === undefined) return null;

  // Numeric Excel serial date (e.g. 45383 -> 2024-04-01)
  if (typeof val === 'number') {
    const d = excelSerialToDate(val);
    if (d) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return {
        reportingPeriod: `${year}-${month}`,
        periodDate: `${year}-${month}-${day}`,
        granularity: 'daily',
        rawLabel: String(val),
      };
    }
    return null;
  }

  // JS Date instance
  if (val instanceof Date) {
    const year = val.getUTCFullYear();
    const month = String(val.getUTCMonth() + 1).padStart(2, '0');
    const day = String(val.getUTCDate()).padStart(2, '0');
    return {
      reportingPeriod: `${year}-${month}`,
      periodDate: `${year}-${month}-${day}`,
      granularity: 'daily',
      rawLabel: val.toISOString(),
    };
  }

  const rawStr = String(val).trim();
  if (!rawStr || rawStr.length > 80) return null;

  // Fast path: if string contains neither digits nor month substring, it cannot be a reporting period
  if (!/[0-9]/.test(rawStr) && !/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(rawStr)) {
    return null;
  }

  // Clean comparative headers: strip newlines and common prefixes like "As at", "Consolidated as on", "ended on"
  const s = rawStr
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/^.*?(?:as\s+at|as\s+on|ended\s+on|for\s+the\s+year\s+ended\s+on|consolidated\s+as\s+on)\s+/i, '')
    .trim();

  // YYYY-MM-DD (e.g. 2025-08-19)
  const ymdMatch = s.match(/^(20[2-3][0-9])[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12][0-9]|3[01])$/);
  if (ymdMatch && ymdMatch[1] && ymdMatch[2] && ymdMatch[3]) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return {
      reportingPeriod: `${y}-${m}`,
      periodDate: `${y}-${m}-${d}`,
      granularity: 'daily',
      rawLabel: rawStr,
    };
  }

  // DD/MM/YYYY or D/M/YYYY (e.g. 01/10/2024 or 1/4/2022 or 30/4/2022)
  const dmyMatch = s.match(/^([0-3]?[0-9])[-/.](0?[1-9]|1[0-2])[-/.](20[2-3][0-9])$/);
  if (dmyMatch && dmyMatch[1] && dmyMatch[2] && dmyMatch[3]) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return {
      reportingPeriod: `${y}-${m}`,
      periodDate: `${y}-${m}-${d}`,
      granularity: 'daily',
      rawLabel: rawStr,
    };
  }

  // DD-Mon-YY or DD-Mon-YYYY (e.g. 31-Mar-26, 31st March 2025, 31 dec 2025)
  const dMonYMatch = s.match(
    /^([0-3]?[0-9])(?:st|nd|rd|th)?[\s'-]+([a-zA-Z]{3,9})[\s'-]+(?:20)?([0-9]{2}|20[2-3][0-9])$/
  );
  if (dMonYMatch && dMonYMatch[1] && dMonYMatch[2] && dMonYMatch[3]) {
    const d = dMonYMatch[1].padStart(2, '0');
    const m = MONTH_MAP[dMonYMatch[2].toLowerCase()];
    let y = parseInt(dMonYMatch[3], 10);
    if (y < 100) y += 2000;
    if (m) {
      return {
        reportingPeriod: `${y}-${m}`,
        periodDate: `${y}-${m}-${d}`,
        granularity: 'daily',
        rawLabel: rawStr,
      };
    }
  }

  // YYYY-MM (e.g. 2025-06)
  const yyyyMm = s.match(/^(20[2-3][0-9])[-/.](0[1-9]|1[0-2])$/);
  if (yyyyMm && yyyyMm[1] && yyyyMm[2]) {
    return {
      reportingPeriod: `${yyyyMm[1]}-${yyyyMm[2]}`,
      periodDate: `${yyyyMm[1]}-${yyyyMm[2]}-01`,
      granularity: 'monthly',
      rawLabel: rawStr,
    };
  }

  // MM/YYYY (e.g. 06/2025)
  const mmyMatch = s.match(/^(0?[1-9]|1[0-2])[-/.](20[2-3][0-9])$/);
  if (mmyMatch && mmyMatch[1] && mmyMatch[2]) {
    const m = mmyMatch[1].padStart(2, '0');
    return {
      reportingPeriod: `${mmyMatch[2]}-${m}`,
      periodDate: `${mmyMatch[2]}-${m}-01`,
      granularity: 'monthly',
      rawLabel: rawStr,
    };
  }

  // Month-YY or Month 'YY (e.g. Apr-24, Apr '24, Apr-2024)
  const myMatch = s.match(/^([a-zA-Z]{3,9})[\s'-]+(?:20)?([0-9]{2})$/);
  if (myMatch && myMatch[1] && myMatch[2]) {
    const m = MONTH_MAP[myMatch[1].toLowerCase()];
    if (m) {
      const y = 2000 + parseInt(myMatch[2], 10);
      return {
        reportingPeriod: `${y}-${m}`,
        periodDate: `${y}-${m}-01`,
        granularity: 'monthly',
        rawLabel: rawStr,
      };
    }
  }

  // Month YYYY (e.g. April 2024)
  const mFullYMatch = s.match(/^([a-zA-Z]{3,9})[\s'-]+(20[2-3][0-9])$/);
  if (mFullYMatch && mFullYMatch[1] && mFullYMatch[2]) {
    const m = MONTH_MAP[mFullYMatch[1].toLowerCase()];
    if (m) {
      return {
        reportingPeriod: `${mFullYMatch[2]}-${m}`,
        periodDate: `${mFullYMatch[2]}-${m}-01`,
        granularity: 'monthly',
        rawLabel: rawStr,
      };
    }
  }

  // Indian FY Quarter: Q1 FY26, Q2-FY26, Q3 FY2026
  const qFyMatch = s.match(/\bQ([1-4])\s*[-/]?\s*FY\s*'?([0-9]{2,4})\b/i);
  if (qFyMatch && qFyMatch[1] && qFyMatch[2]) {
    const q = parseInt(qFyMatch[1], 10);
    let y = parseInt(qFyMatch[2], 10);
    if (y < 100) y += 2000;
    const months = ['06', '09', '12', '03'];
    const retY = q === 4 ? y : y - 1;
    return {
      reportingPeriod: `${retY}-${months[q - 1]}`,
      periodDate: `${retY}-${months[q - 1]}-01`,
      granularity: 'quarterly',
      rawLabel: rawStr,
    };
  }

  // FY alone or FY range: FY26 -> 2026-03, FY 2025-26 -> 2026-03
  const fyMatch = s.match(/\bFY\s*'?([0-9]{2,4})[-/]?([0-9]{2,4})?\b/i);
  if (fyMatch && fyMatch[1]) {
    let y = parseInt(fyMatch[2] || fyMatch[1], 10);
    if (y < 100) y += 2000;
    return {
      reportingPeriod: `${y}-03`,
      periodDate: `${y}-03-31`,
      granularity: 'annual',
      rawLabel: rawStr,
    };
  }

  // Single month alone (e.g. 'March') with contextYear
  const sm = s.toLowerCase();
  if (MONTH_MAP[sm] && contextYear) {
    return {
      reportingPeriod: `${contextYear}-${MONTH_MAP[sm]}`,
      periodDate: `${contextYear}-${MONTH_MAP[sm]}-01`,
      granularity: 'monthly',
      rawLabel: rawStr,
    };
  }

  return null;
}

/**
 * Backward-compatible wrapper returning YYYY-MM period string.
 */
export function parseReportingPeriodCell(val: unknown, contextYear?: number): string | null {
  return parseReportingPeriodInfo(val, contextYear)?.reportingPeriod ?? null;
}

export interface ScaleAndCurrency {
  scaleMultiplier: number;
  scaleName: 'lakh' | 'crore' | 'million' | 'thousand' | 'units';
  currency?: 'INR' | 'USD' | 'EUR' | 'GBP';
  isExplicitCurrency: boolean;
}

/**
 * Detect scale multiplier and explicit currency context from text.
 * If currency is not stated, isExplicitCurrency is false and currency is undefined.
 */
export function detectScaleAndCurrency(text: string): ScaleAndCurrency {
  const lower = text.toLowerCase();
  let currency: 'INR' | 'USD' | 'EUR' | 'GBP' | undefined = undefined;
  let isExplicitCurrency = false;

  if (
    /(?:^|[^a-z0-9])(?:usd|dollars?)(?:[^a-z0-9]|$)/i.test(lower) ||
    /us\$/i.test(lower) ||
    (lower.includes('$') && !lower.includes('rs') && !lower.includes('₹'))
  ) {
    currency = 'USD';
    isExplicitCurrency = true;
  } else if (/(?:^|[^a-z0-9])(?:eur|euros?)(?:[^a-z0-9]|$)/i.test(lower) || /€/.test(lower)) {
    currency = 'EUR';
    isExplicitCurrency = true;
  } else if (/(?:^|[^a-z0-9])(?:gbp|pounds?)(?:[^a-z0-9]|$)/i.test(lower) || /£/.test(lower)) {
    currency = 'GBP';
    isExplicitCurrency = true;
  } else if (
    /[₹]|(?:^|[^a-z0-9])(?:inr|rs\.?|rupees?)(?:[^a-z0-9]|$)/i.test(lower)
  ) {
    currency = 'INR';
    isExplicitCurrency = true;
  }

  if (/\b(?:crores?|crs?)\b/i.test(lower) || /in\s+(?:₹|rs\.?|inr)?\s*(?:cr|crores?)/i.test(lower)) {
    return { scaleMultiplier: 10_000_000, scaleName: 'crore', currency, isExplicitCurrency };
  }
  if (/\b(?:lakhs?|lacs?)\b/i.test(lower) || /in\s+(?:₹|rs\.?|inr)?\s*(?:l|lakhs?|lacs?)/i.test(lower)) {
    return { scaleMultiplier: 100_000, scaleName: 'lakh', currency, isExplicitCurrency };
  }
  if (/\b(?:millions?|mn)\b/i.test(lower) || /in\s*(?:m|millions?)/i.test(lower)) {
    return { scaleMultiplier: 1_000_000, scaleName: 'million', currency, isExplicitCurrency };
  }
  if (/(?:\b(?:thousands?|in\s*k)\b|['"]000\b|\b000['"]|\(000\)|['"]000s?\b)/i.test(lower)) {
    return { scaleMultiplier: 1_000, scaleName: 'thousand', currency, isExplicitCurrency };
  }

  return { scaleMultiplier: 1, scaleName: 'units', currency, isExplicitCurrency };
}

export interface ParsedCellValue {
  num: number | null;
  isNegative: boolean;
  isPercentage: boolean;
  isError: boolean;
  rawString: string;
}

/**
 * Extract numeric value from cell while explicitly flagging Excel errors and zero representations.
 */
export function parseRawCellValue(raw: unknown): ParsedCellValue {
  if (raw === null || raw === undefined) {
    return { num: null, isNegative: false, isPercentage: false, isError: false, rawString: '' };
  }

  if (typeof raw === 'number') {
    if (isNaN(raw)) {
      return { num: null, isNegative: false, isPercentage: false, isError: true, rawString: 'NaN' };
    }
    return { num: raw, isNegative: raw < 0, isPercentage: false, isError: false, rawString: String(raw) };
  }

  const str = String(raw).trim();
  if (!str) {
    return { num: null, isNegative: false, isPercentage: false, isError: false, rawString: '' };
  }

  // Excel formula errors
  if (/^#(?:REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!)$/i.test(str)) {
    return { num: null, isNegative: false, isPercentage: false, isError: true, rawString: str };
  }

  // Dash/zero indicators
  if (/^(?:-|–|—|\s*-\s*)$/.test(str)) {
    return { num: 0, isNegative: false, isPercentage: false, isError: false, rawString: str };
  }

  const isPercentage = str.includes('%');
  const isParenNegative = /^\s*\(\s*([^()]+)\s*\)\s*$/.test(str);
  const isTrailingNegative = /-\s*$/.test(str) && !/^\s*-/.test(str);
  const isLeadingNegative = /^\s*-/.test(str);
  const isNegative = isParenNegative || isTrailingNegative || isLeadingNegative;

  const cleaned = str
    .replace(/[₹$€£]/g, '')
    .replace(/(?:^|\b)(?:Rs\.?|INR|USD|EUR|GBP)(?:\b|\s*)/gi, '')
    .replace(/[()%]/g, '')
    .replace(/-/g, '')
    .trim()
    .replace(/,/g, '');

  if (!cleaned || isNaN(Number(cleaned))) {
    return { num: null, isNegative: false, isPercentage: false, isError: false, rawString: str };
  }

  const absNum = parseFloat(cleaned);
  const finalValue = isNegative ? -absNum : absNum;

  return { num: finalValue, isNegative, isPercentage, isError: false, rawString: str };
}

export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Match label against standard dashboard KPIs (revenue, ebitda, gross_margin, burn, run_rate).
 */
export function matchStandardKpi(label: string): string | undefined {
  const norm = label.toLowerCase();

  // Percentage gross margin
  if (norm.includes('%') || norm.includes('margin %') || norm.includes('gm %')) {
    if (norm.includes('gross') || norm.includes('gm')) return 'gross_margin';
  }

  // Revenue indicators
  if (
    /\b(?:net\s+revenue|total\s+revenue|revenue\s+from\s+operations|operating\s+revenue|total\s+income|gross\s+revenue|turnover|^revenue$)\b/i.test(
      norm
    ) &&
    !norm.includes('%') &&
    !/\baverage\b/i.test(norm) &&
    !/\bper\b/i.test(norm)
  ) {
    return 'revenue';
  }

  // EBITDA
  if (/\b(?:ebitda|operating\s+ebitda)\b/i.test(norm) && !norm.includes('%')) {
    return 'ebitda';
  }

  // Burn
  if (/\b(?:burn|net\s+burn|cash\s+burn|monthly\s+burn)\b/i.test(norm) && !norm.includes('%')) {
    return 'burn';
  }

  // Run rate
  if (/\b(?:run\s+rate|annual\s+run\s+rate|arr)\b/i.test(norm) && !norm.includes('%')) {
    return 'run_rate';
  }

  return undefined;
}

export function isGenericTableHeader(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    !t ||
    /^(?:particulars|metrics?|kpis?|description|line\s*items?|items?|accounts?|details?|summary)(?:\s+(?:in|of|\(|for)\b.*)?$/i.test(
      t
    )
  );
}

export interface MetricKindAndUnit {
  kind: 'count' | 'percent' | 'currency' | 'ratio';
  unit: string;
  currency?: string;
}

/**
 * Infer unit and kind from raw metric label and active currency scale.
 * If currency is unknown, keeps unit: 'unknown' rather than guessing INR.
 */
export function inferMetricKindAndUnit(
  label: string,
  activeScale: ScaleAndCurrency
): MetricKindAndUnit {
  const norm = label.trim().toLowerCase();

  // 1. Ratio check: e.g. "Current Ratio", "Quick Ratio", "Debt Equity Ratio", "LTV / CAC Ratio"
  if (/\b(?:ratio)\b/i.test(norm) && !norm.includes('%')) {
    return { kind: 'ratio', unit: 'ratio' };
  }

  // 2. Percentage check: suffixed %, or includes %, mix, share, margin %, gm %, rate %, pct
  // Must NOT classify monetary "Gross Margin", "Channel Margin", or "Cost Rate" as percent without % or context!
  if (
    norm.includes('%') ||
    norm.includes('margin %') ||
    norm.includes('gm %') ||
    norm.includes('roas %') ||
    norm.includes('rate %') ||
    /\b(?:percentage|pct|ctr|cvr)\b/i.test(norm) ||
    /\b(?:share|mix)\b/i.test(norm)
  ) {
    return { kind: 'percent', unit: 'percent' };
  }

  // 2. Count / Quantity check: Qty, Volume, Orders, Counts, Units, Headcount, Impressions, Clicks, Installs, etc.
  if (
    /^(?:qty|quantity|count|volume|units?|orders?|headcount|skus?|users?|subscribers?|customers?|impressions?|clicks?|installs?|sessions?)\b/i.test(
      norm
    ) ||
    /\b(?:qty|quantity|units?|count|orders?|volume|impressions?|clicks?|installs?)\b/i.test(norm)
  ) {
    return { kind: 'count', unit: 'count' };
  }

  // 3. Row-level explicit currency override
  const rowScale = detectScaleAndCurrency(label);
  if (rowScale.isExplicitCurrency && rowScale.currency) {
    return {
      kind: 'currency',
      unit: rowScale.currency,
      currency: rowScale.currency,
    };
  }

  // 4. Sheet/Workbook explicit currency
  if (activeScale.isExplicitCurrency && activeScale.currency) {
    return {
      kind: 'currency',
      unit: activeScale.currency,
      currency: activeScale.currency,
    };
  }

  // 5. Explicit unknown currency
  return {
    kind: 'currency',
    unit: 'unknown',
    currency: undefined,
  };
}

interface SheetBlock {
  labelCol: number;
  blockLabel?: string;
  blockIndex: number;
  periods: Array<{ colIndex: number; periodInfo: ParsedPeriodInfo }>;
}

/**
 * Layout 1: Dual-Side Balance Sheet & Provisional Statements (e.g. Segmind).
 * Detects side-by-side Liabilities (left) and Assets (right) tables.
 */
function parseDualSideBalanceSheet(
  sheetName: string,
  rows: unknown[][],
  sheetScale: ScaleAndCurrency,
  sheetYear?: number
): ParsedMatrixMetric[] {
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('liabilities') && rowStr.includes('assets')) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx < 0) return [];

  const hRow = rows[headerRowIdx]!;
  // Detect reporting period from header row or rows above
  let periodInfo: ParsedPeriodInfo | null = null;
  for (const cell of hRow) {
    periodInfo = parseReportingPeriodInfo(cell, sheetYear);
    if (periodInfo) break;
  }

  if (!periodInfo) {
    for (let r = 0; r < headerRowIdx; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        periodInfo = parseReportingPeriodInfo(cell, sheetYear);
        if (periodInfo) break;
      }
      if (periodInfo) break;
    }
  }

  const reportingPeriod = periodInfo?.reportingPeriod ?? (sheetYear ? `${sheetYear}-03` : '2026-03');
  const periodDate = periodInfo?.periodDate ?? `${reportingPeriod}-31`;
  const granularity = 'snapshot';

  const metrics: ParsedMatrixMetric[] = [];

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    // Left side: Liabilities (Col 0 is label, Col 1 or 2 is value)
    const lLabel = String(row[0] || '').trim();
    if (lLabel) {
      const valColIndex = row[1] !== undefined && String(row[1]).trim() !== '' ? 1 : 2;
      const cellVal = row[valColIndex];
      const parsed = parseRawCellValue(cellVal);
      if (parsed.num !== null || parsed.isError) {
        const colLetter = String.fromCharCode(65 + valColIndex);
        const metricKind = inferMetricKindAndUnit(lLabel, sheetScale);
        metrics.push({
          sheetName,
          rawLabel: lLabel,
          normalizedLabel: normalizeLabel(lLabel),
          standardMetricKey: matchStandardKpi(lLabel),
          reportingPeriod,
          periodDate,
          granularity,
          value: parsed.num,
          rawValue: parsed.rawString,
          unit: metricKind.unit,
          currency: metricKind.currency,
          scale: sheetScale.scaleName,
          rowIndex: r + 1,
          colIndex: valColIndex + 1,
          sourceReference: `Sheet '${sheetName}', Row ${r + 1}, Col ${colLetter} '${lLabel}'`,
          confidence: 1.0,
          status: parsed.isError ? 'quarantined' : 'valid',
          validationNotes: parsed.isError ? `Formula error ${parsed.rawString}` : undefined,
          blockLabel: 'Liabilities',
          blockIndex: 0,
          kind: metricKind.kind,
        });
      }
    }

    // Right side: Assets (Col 3 is label, Col 4 or 5 is value)
    const rLabel = String(row[3] || '').trim();
    if (rLabel) {
      const valColIndex = row[4] !== undefined && String(row[4]).trim() !== '' ? 4 : 5;
      const cellVal = row[valColIndex];
      const parsed = parseRawCellValue(cellVal);
      if (parsed.num !== null || parsed.isError) {
        const colLetter = String.fromCharCode(65 + valColIndex);
        const metricKind = inferMetricKindAndUnit(rLabel, sheetScale);
        metrics.push({
          sheetName,
          rawLabel: rLabel,
          normalizedLabel: normalizeLabel(rLabel),
          standardMetricKey: matchStandardKpi(rLabel),
          reportingPeriod,
          periodDate,
          granularity,
          value: parsed.num,
          rawValue: parsed.rawString,
          unit: metricKind.unit,
          currency: metricKind.currency,
          scale: sheetScale.scaleName,
          rowIndex: r + 1,
          colIndex: valColIndex + 1,
          sourceReference: `Sheet '${sheetName}', Row ${r + 1}, Col ${colLetter} '${rLabel}'`,
          confidence: 1.0,
          status: parsed.isError ? 'quarantined' : 'valid',
          validationNotes: parsed.isError ? `Formula error ${parsed.rawString}` : undefined,
          blockLabel: 'Assets',
          blockIndex: 1,
          kind: metricKind.kind,
        });
      }
    }
  }

  return metrics;
}

/**
 * Layout 2: Vertical Time-Series Parser (e.g. SVG Daily Tracker, Hopmate Cohorts, NOTO POs).
 * Dates run vertically down Column A or B; metric labels run across the header row.
 */
function parseVerticalTimeSeries(
  sheetName: string,
  rows: unknown[][],
  sheetScale: ScaleAndCurrency,
  dateCol: number,
  headerRowIdx: number,
  sheetYear?: number
): ParsedMatrixMetric[] {
  const headerRow = rows[headerRowIdx];
  if (!Array.isArray(headerRow)) return [];

  const metrics: ParsedMatrixMetric[] = [];
  const colCount = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)));

  // Pre-scan date column to see if grain is truly monthly vs daily
  const parsedDates: ParsedPeriodInfo[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const info = parseReportingPeriodInfo(row[dateCol], sheetYear);
    if (info) parsedDates.push(info);
  }

  const dateHeaderStr = String(headerRow[dateCol] || '').toLowerCase();
  const sheetLower = sheetName.toLowerCase();
  const nameIndicatesMonthly =
    sheetLower.includes('month wise') ||
    sheetLower.includes('month-wise') ||
    sheetLower.includes('monthly') ||
    dateHeaderStr.includes('month wise') ||
    dateHeaderStr.includes('month-wise') ||
    dateHeaderStr.includes('monthly');

  let isMonthlyGrain = false;
  if (nameIndicatesMonthly) {
    isMonthlyGrain = true;
  } else if (parsedDates.length >= 2) {
    const uniqueMonths = new Set(parsedDates.map((d) => d.reportingPeriod));
    const allDaysFirst = parsedDates.every((d) => d.periodDate && d.periodDate.endsWith('-01'));
    if (uniqueMonths.size === parsedDates.length && allDaysFirst) {
      isMonthlyGrain = true;
    }
  }

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const dateCell = row[dateCol];
    const periodInfo = parseReportingPeriodInfo(dateCell, sheetYear);
    if (!periodInfo) continue;

    const effectiveGranularity = isMonthlyGrain ? 'monthly' : periodInfo.granularity;
    const effectivePeriodDate = isMonthlyGrain
      ? `${periodInfo.reportingPeriod}-01`
      : periodInfo.periodDate;

    for (let c = 0; c < colCount; c++) {
      if (c === dateCol) continue;

      const headerText = String(headerRow[c] || '').trim();
      if (!headerText) continue;

      // Skip non-metric calendar attributes (e.g. Day name: Tuesday, Month name: August)
      const hLower = headerText.toLowerCase();
      if (hLower === 'day' || hLower === 'month' || hLower === 'year') {
        const cellStr = String(row[c] || '').trim();
        if (/[a-zA-Z]/.test(cellStr) && isNaN(Number(cellStr))) {
          continue;
        }
      }

      const cellVal = row[c];
      const parsed = parseRawCellValue(cellVal);
      if (parsed.num === null && !parsed.isError) continue;

      const colScale = detectScaleAndCurrency(headerText);
      const activeColScale = colScale.isExplicitCurrency ? colScale : sheetScale;
      const metricKind = inferMetricKindAndUnit(headerText, activeColScale);
      const standardKey = matchStandardKpi(headerText);

      let finalValue = parsed.num;
      if (finalValue !== null) {
        if (metricKind.kind === 'percent') {
          if (finalValue > -1 && finalValue < 1 && finalValue !== 0 && !parsed.rawString.includes('%')) {
            finalValue = parseFloat((finalValue * 100).toFixed(4));
          } else {
            finalValue = parseFloat(finalValue.toFixed(4));
          }
        } else if (metricKind.kind === 'currency') {
          if (activeColScale.scaleMultiplier > 1 && Math.abs(finalValue) < 100_000) {
            finalValue = parseFloat((finalValue * activeColScale.scaleMultiplier).toFixed(2));
          }
        }
      }

      const colLetter = String.fromCharCode(65 + (c % 26));
      metrics.push({
        sheetName,
        rawLabel: headerText,
        normalizedLabel: normalizeLabel(headerText),
        standardMetricKey: standardKey,
        reportingPeriod: periodInfo.reportingPeriod,
        periodDate: effectivePeriodDate,
        granularity: effectiveGranularity,
        value: finalValue,
        rawValue: parsed.rawString,
        unit: metricKind.unit,
        currency: metricKind.currency,
        scale: metricKind.kind === 'count' || metricKind.kind === 'percent' ? 'units' : activeColScale.scaleName,
        rowIndex: r + 1,
        colIndex: c + 1,
        sourceReference: `Sheet '${sheetName}', Row ${r + 1}, Col ${colLetter} '${headerText}'`,
        confidence: 1.0,
        status: parsed.isError ? 'quarantined' : 'valid',
        validationNotes: parsed.isError ? `Formula error ${parsed.rawString}` : undefined,
        kind: metricKind.kind,
        periodProvenance: 'source',
      });
    }
  }

  return metrics;
}

/**
 * Layout 3: Single-Period Dimensional Columns (e.g. Magma Dec25, SVG FY25-26 MIS).
 * Columns represent business units / dimensions or amount/share; rows represent line items.
 */
function parseSinglePeriodDimensional(
  sheetName: string,
  rows: unknown[][],
  sheetScale: ScaleAndCurrency,
  canonicalPeriod: string,
  granularity: 'daily' | 'monthly' | 'quarterly' | 'annual' | 'snapshot' = 'monthly',
  periodDate?: string,
  provenance: 'source' | 'inferred' = 'inferred'
): ParsedMatrixMetric[] {
  const metrics: ParsedMatrixMetric[] = [];
  const defaultPeriodDate =
    periodDate ??
    (granularity === 'annual'
      ? `${canonicalPeriod.split('-')[0]}-03-31`
      : `${canonicalPeriod}-01`);

  // Pattern 1: Magma Dec25 style: Row 0 has ["MIS"|"Cash Flow", "Unit", Dim1, Dim2, ...]
  const row0 = rows[0];
  if (
    Array.isArray(row0) &&
    row0.length >= 3 &&
    String(row0[1] || '').trim().toLowerCase().includes('unit')
  ) {
    const dimensions: Array<{ colIndex: number; label: string }> = [];
    for (let c = 2; c < row0.length; c++) {
      const dim = String(row0[c] || '').trim();
      if (dim) dimensions.push({ colIndex: c, label: dim });
    }

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const rawLabel = String(row[0] || '').trim();
      if (!rawLabel) continue;

      const unitCell = String(row[1] || '').trim();
      const rowScale = detectScaleAndCurrency(`${rawLabel} ${unitCell}`);
      const activeScale = rowScale.isExplicitCurrency ? rowScale : sheetScale;
      const metricKind = inferMetricKindAndUnit(rawLabel, activeScale);
      const standardKey = matchStandardKpi(rawLabel);

      for (const dim of dimensions) {
        const cellVal = row[dim.colIndex];
        const parsed = parseRawCellValue(cellVal);
        if (parsed.num === null && !parsed.isError) continue;

        let finalValue = parsed.num;
        if (finalValue !== null && metricKind.kind === 'currency' && activeScale.scaleMultiplier > 1 && Math.abs(finalValue) < 100_000) {
          finalValue = parseFloat((finalValue * activeScale.scaleMultiplier).toFixed(2));
        }

        const colLetter = String.fromCharCode(65 + (dim.colIndex % 26));
        metrics.push({
          sheetName,
          rawLabel,
          normalizedLabel: normalizeLabel(rawLabel),
          standardMetricKey: standardKey,
          reportingPeriod: canonicalPeriod,
          periodDate: defaultPeriodDate,
          granularity,
          value: finalValue,
          rawValue: parsed.rawString,
          unit: metricKind.unit,
          currency: metricKind.currency,
          scale: activeScale.scaleName,
          rowIndex: r + 1,
          colIndex: dim.colIndex + 1,
          sourceReference: `Sheet '${sheetName}', Row ${r + 1}, Col ${colLetter} '${rawLabel}'`,
          confidence: 1.0,
          status: parsed.isError ? 'quarantined' : 'valid',
          validationNotes: parsed.isError ? `Formula error ${parsed.rawString}` : undefined,
          blockLabel: dim.label,
          blockIndex: dim.colIndex - 2,
          kind: metricKind.kind,
          periodProvenance: provenance,
        });
      }
    }

    return metrics;
  }

  // Pattern 2: SVG FY25-26 MIS style: Row 5 has ["Stream"|"Category", "Amount (INR)", "Share"]
  let parentSection = '';
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const col0 = String(row[0] || '').trim();
    const col1 = String(row[1] || '').trim();
    const col2 = String(row[2] || '').trim();

    if (col0 && !col1 && !col2) {
      if (!col0.toLowerCase().includes('management information')) {
        parentSection = col0;
      }
      continue;
    }

    if (
      col0.toLowerCase() === 'stream' ||
      col0.toLowerCase() === 'category' ||
      col0.toLowerCase() === 'particulars'
    ) {
      continue;
    }

    // Col 1 has Amount
    if (col0 && col1) {
      const parsed1 = parseRawCellValue(col1);
      if (parsed1.num !== null || parsed1.isError) {
        const rowScale = detectScaleAndCurrency(`${col0} ${rows[5]?.[1] || ''}`);
        const activeScale = rowScale.isExplicitCurrency ? rowScale : sheetScale;
        const metricKind = inferMetricKindAndUnit(col0, activeScale);
        const standardKey = matchStandardKpi(col0);

        metrics.push({
          sheetName,
          rawLabel: col0,
          normalizedLabel: normalizeLabel(col0),
          parentLabel: parentSection || undefined,
          standardMetricKey: standardKey,
          reportingPeriod: canonicalPeriod,
          periodDate: defaultPeriodDate,
          granularity,
          value: parsed1.num,
          rawValue: parsed1.rawString,
          unit: metricKind.unit,
          currency: metricKind.currency,
          scale: activeScale.scaleName,
          rowIndex: r + 1,
          colIndex: 2,
          sourceReference: `Sheet '${sheetName}', Row ${r + 1}, Col B '${col0}'`,
          confidence: 1.0,
          status: parsed1.isError ? 'quarantined' : 'valid',
          validationNotes: parsed1.isError ? `Formula error ${parsed1.rawString}` : undefined,
          blockLabel: parentSection || undefined,
          kind: metricKind.kind,
          periodProvenance: provenance,
        });
      }
    }

    // Col 2 has Share %
    if (col0 && col2 && col2.includes('%')) {
      const parsed2 = parseRawCellValue(col2);
      if (parsed2.num !== null || parsed2.isError) {
        const shareLabel = `${col0} (Share)`;
        metrics.push({
          sheetName,
          rawLabel: shareLabel,
          normalizedLabel: normalizeLabel(shareLabel),
          parentLabel: parentSection || undefined,
          reportingPeriod: canonicalPeriod,
          periodDate: defaultPeriodDate,
          granularity,
          value: parsed2.num,
          rawValue: parsed2.rawString,
          unit: 'percent',
          currency: undefined,
          scale: 'units',
          rowIndex: r + 1,
          colIndex: 3,
          sourceReference: `Sheet '${sheetName}', Row ${r + 1}, Col C '${shareLabel}'`,
          confidence: 1.0,
          status: parsed2.isError ? 'quarantined' : 'valid',
          validationNotes: parsed2.isError ? `Formula error ${parsed2.rawString}` : undefined,
          blockLabel: parentSection || undefined,
          kind: 'percent',
          periodProvenance: provenance,
        });
      }
    }
  }

  return metrics;
}

/**
 * Parse an Excel workbook buffer into normalized matrix metrics across universal layouts.
 */
export function parseMatrixSpreadsheet(
  buf: Buffer | Uint8Array,
  filename: string
): MatrixParseResult {
  const nodeBuf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const wb = XLSX.read(nodeBuf, { type: 'buffer', dense: true });

  const allMetrics: ParsedMatrixMetric[] = [];
  const sheetsAnalyzed: string[] = [];
  const sheetLayouts = new Map<string, string>();

  const fyFileMatch = filename.match(/\bFY\s*'?([0-9]{2,4})[-/]?([0-9]{2,4})?\b/i);
  let yearFromFilename: number | undefined;
  if (fyFileMatch && fyFileMatch[1]) {
    let y = parseInt(fyFileMatch[2] || fyFileMatch[1], 10);
    if (y < 100) y += 2000;
    yearFromFilename = y;
  } else {
    const yearMatch = filename.match(/(?:20[2-3][0-9])/);
    yearFromFilename = yearMatch ? parseInt(yearMatch[0], 10) : undefined;
  }
  const canonicalFilenamePeriod = extractPeriodFromFilename(filename);

  // Detect workbook-level default scale and currency context
  let workbookScale: ScaleAndCurrency = {
    scaleMultiplier: 1,
    scaleName: 'units',
    currency: undefined,
    isExplicitCurrency: false,
  };

  for (const sn of wb.SheetNames) {
    const s = wb.Sheets[sn];
    if (!s || !s['!ref']) continue;
    let snText = sn;
    if (s['!data']) {
      const top5 = s['!data'].slice(0, 5);
      const textParts: string[] = [];
      for (const r of top5) {
        if (!r) continue;
        for (const cell of r) {
          if (cell && cell.w) textParts.push(cell.w);
          else if (cell && cell.v !== undefined) textParts.push(String(cell.v));
        }
      }
      snText += ' ' + textParts.join(' ');
    } else {
      const sampleRows = XLSX.utils
        .sheet_to_json<unknown[]>(s, { header: 1, raw: false, defval: '', blankrows: false })
        .slice(0, 5);
      snText += ' ' + sampleRows.map((r) => (Array.isArray(r) ? r.join(' ') : '')).join(' ');
    }
    const detected = detectScaleAndCurrency(snText);
    if (detected.scaleName !== 'units' || detected.isExplicitCurrency) {
      workbookScale = detected;
      break;
    }
  }

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    // Skip sheets that are strictly raw database dumps or empty working tabs
    if (/^(?:working|dump|details|audit|unearned|tb\s|trial\s*balance)/i.test(sheetName)) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });

    if (rows.length < 2) {
      sheetLayouts.set(sheetName, 'empty');
      continue;
    }

    sheetsAnalyzed.push(sheetName);

    // Detect sheet-level scale and currency
    const sheetText = `${sheetName} ${rows.slice(0, 8).map((r) => (Array.isArray(r) ? r.join(' ') : '')).join(' ')}`;
    const detectedSheetScale = detectScaleAndCurrency(sheetText);
    const sheetScale: ScaleAndCurrency = {
      scaleMultiplier:
        detectedSheetScale.scaleName !== 'units'
          ? detectedSheetScale.scaleMultiplier
          : workbookScale.scaleMultiplier,
      scaleName:
        detectedSheetScale.scaleName !== 'units'
          ? detectedSheetScale.scaleName
          : workbookScale.scaleName,
      currency: detectedSheetScale.isExplicitCurrency
        ? detectedSheetScale.currency
        : workbookScale.currency,
      isExplicitCurrency:
        detectedSheetScale.isExplicitCurrency || workbookScale.isExplicitCurrency,
    };

    // Check if sheetName or sheetText has explicit year
    let sheetYear = yearFromFilename;
    const sheetYearMatch = sheetText.match(/\b(?:till|to|fy|ended)?\s*([a-zA-Z]{3,9})?\s*'?((?:20)?2[0-9])\b/i);
    if (sheetYearMatch && sheetYearMatch[2]) {
      let y = parseInt(sheetYearMatch[2], 10);
      if (y < 100) y += 2000;
      sheetYear = y;
    }

    // --- STRATEGY 1: DUAL-SIDE BALANCE SHEET ---
    const dualSideMetrics = parseDualSideBalanceSheet(sheetName, rows, sheetScale, sheetYear);
    if (dualSideMetrics.length > 0) {
      allMetrics.push(...dualSideMetrics);
      sheetLayouts.set(sheetName, 'dual_side_balance_sheet');
      continue;
    }

    // --- STRATEGY 2: VERTICAL TIME-SERIES DETECTION ---
    let verticalDateInfo: { dateCol: number; headerRow: number } | null = null;
    const maxCols = Math.max(...rows.slice(0, 10).map((r) => (Array.isArray(r) ? r.length : 0)));

    for (let c = 0; c < Math.min(3, maxCols); c++) {
      let dateCount = 0;
      let firstDateRow = -1;
      for (let r = 0; r < Math.min(100, rows.length); r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;
        const cell = row[c];
        if (parseReportingPeriodInfo(cell, sheetYear)) {
          dateCount++;
          if (firstDateRow < 0) firstDateRow = r;
        }
      }

      if (dateCount >= 2 && firstDateRow > 0) {
        // Find header row above firstDateRow
        let headerRow = -1;
        for (let hr = firstDateRow - 1; hr >= 0; hr--) {
          const row = rows[hr];
          if (!Array.isArray(row)) continue;
          const textCount = row.filter((val) => typeof val === 'string' && val.trim().length > 0).length;
          if (textCount >= 2) {
            headerRow = hr;
            break;
          }
        }
        if (headerRow >= 0) {
          verticalDateInfo = { dateCol: c, headerRow };
          break;
        }
      }
    }

    if (verticalDateInfo) {
      const vMetrics = parseVerticalTimeSeries(
        sheetName,
        rows,
        sheetScale,
        verticalDateInfo.dateCol,
        verticalDateInfo.headerRow,
        sheetYear
      );
      if (vMetrics.length > 0) {
        allMetrics.push(...vMetrics);
        const hasDaily = vMetrics.some((m) => m.granularity === 'daily');
        sheetLayouts.set(sheetName, hasDaily ? 'vertical_daily' : 'vertical_monthly');
        continue;
      }
    }

    // --- STRATEGY 3: SINGLE-PERIOD DIMENSIONAL STATEMENT ---
    let detectedPeriodInfo = parseReportingPeriodInfo(sheetName, sheetYear);
    let dimensionalProvenance: 'source' | 'inferred' = 'inferred';
    if (!detectedPeriodInfo) {
      for (const r of rows.slice(0, 4)) {
        if (!Array.isArray(r)) continue;
        for (const cell of r) {
          const info = parseReportingPeriodInfo(cell, sheetYear);
          if (info) {
            detectedPeriodInfo = info;
            dimensionalProvenance = 'source';
            break;
          }
        }
        if (detectedPeriodInfo) break;
      }
    }
    const sheetCanonicalPeriod =
      detectedPeriodInfo?.reportingPeriod ?? canonicalFilenamePeriod ?? (sheetYear ? `${sheetYear}-03` : null);
    const sheetGranularity =
      detectedPeriodInfo?.granularity ??
      (canonicalFilenamePeriod && /FY/i.test(canonicalFilenamePeriod) ? 'annual' : 'monthly');
    const sheetPeriodDate =
      detectedPeriodInfo?.periodDate ??
      (sheetGranularity === 'annual' && sheetCanonicalPeriod
        ? `${sheetCanonicalPeriod.split('-')[0]}-03-31`
        : undefined);

    if (sheetCanonicalPeriod) {
      // Check if rows match dimensional statement
      const row0 = rows[0];
      const isDimensionalHeader =
        Array.isArray(row0) &&
        (String(row0[1] || '').trim().toLowerCase().includes('unit') ||
          sheetText.toLowerCase().includes('amount (inr)') ||
          sheetText.toLowerCase().includes('consolidated group'));

      if (isDimensionalHeader) {
        const dimMetrics = parseSinglePeriodDimensional(
          sheetName,
          rows,
          sheetScale,
          sheetCanonicalPeriod,
          sheetGranularity,
          sheetPeriodDate,
          dimensionalProvenance
        );
        if (dimMetrics.length > 0) {
          allMetrics.push(...dimMetrics);
          sheetLayouts.set(sheetName, 'single_period_dimensional');
          continue;
        }
      }
    }

    // --- STRATEGY 4: HORIZONTAL METRIC MATRIX (STANDARD) ---
    let activeBlocks: SheetBlock[] = [];
    let currentParentBlockLabel: string | undefined = undefined;
    let currentSectionLabel: string | undefined = undefined;
    let blockIndexCounter = 0;
    let horizontalExtractedCount = 0;

    for (let r = 0; r < rows.length; r++) {
      const row = Array.isArray(rows[r]) ? (rows[r] as unknown[]) : [];
      const isBlank = row.every((c) => c === undefined || c === null || String(c).trim() === '');
      if (isBlank) {
        activeBlocks = [];
        currentSectionLabel = undefined;
        continue;
      }

      const col0 = String(row[0] || '').trim();

      // Scan candidate periods across the row
      const candidatePeriods: Array<{ colIndex: number; periodInfo: ParsedPeriodInfo }> = [];
      for (let c = 0; c < row.length; c++) {
        const pInfo = parseReportingPeriodInfo(row[c], sheetYear);
        if (pInfo) {
          candidatePeriods.push({ colIndex: c, periodInfo: pInfo });
        }
      }

      // If candidates are derived from bare months and wrap across calendar years, adjust years backwards
      const hasBareMonths = candidatePeriods.some((c) => /^[a-zA-Z]{3,9}$/.test(c.periodInfo.rawLabel));
      if (hasBareMonths && candidatePeriods.length >= 2) {
        let currentY = sheetYear ?? yearFromFilename ?? 2026;
        for (let i = candidatePeriods.length - 1; i >= 0; i--) {
          const curr = candidatePeriods[i]!;
          const prev = i > 0 ? candidatePeriods[i - 1] : null;
          const currMonth = parseInt(curr.periodInfo.reportingPeriod.split('-')[1]!, 10);
          candidatePeriods[i]!.periodInfo.reportingPeriod = `${currentY}-${String(currMonth).padStart(2, '0')}`;
          if (prev) {
            const prevMonth = parseInt(prev.periodInfo.reportingPeriod.split('-')[1]!, 10);
            if (prevMonth > currMonth) {
              currentY--;
            }
          }
        }
      }

      // Check if this row is a 2-tier date header row where next row has end dates (e.g. Unbox Robotics)
      if (candidatePeriods.length >= 2) {
        const rText = row.map(String).join(' ').toLowerCase();
        if (rText.includes('start')) {
          const nextRow = Array.isArray(rows[r + 1]) ? (rows[r + 1] as unknown[]) : [];
          const nextCandidates: Array<{ colIndex: number; periodInfo: ParsedPeriodInfo }> = [];
          for (let c = 0; c < nextRow.length; c++) {
            const nextP = parseReportingPeriodInfo(nextRow[c], sheetYear);
            if (nextP) nextCandidates.push({ colIndex: c, periodInfo: nextP });
          }
          if (nextCandidates.length >= 2) {
            continue; // Skip 'start' row; next row will serve as the header
          }
        }
      }

      // Pattern B: Single date in row r followed by Actuals/Budget row (e.g. Fragaria)
      if (candidatePeriods.length === 1) {
        const singleCand = candidatePeriods[0]!;
        let foundActuals = false;
        for (let nextR = r + 1; nextR < Math.min(rows.length, r + 4); nextR++) {
          const nextRow = Array.isArray(rows[nextR]) ? (rows[nextR] as unknown[]) : [];
          for (let c = 0; c < nextRow.length; c++) {
            const cellVal = String(nextRow[c] || '').toLowerCase().trim();
            if (cellVal === 'actuals' || cellVal === 'actual') {
              activeBlocks = [
                {
                  labelCol: 0,
                  blockLabel: undefined,
                  blockIndex: blockIndexCounter++,
                  periods: [{ colIndex: c, periodInfo: singleCand.periodInfo }],
                },
              ];
              foundActuals = true;
              r = nextR;
              break;
            }
          }
          if (foundActuals) break;
        }
        if (foundActuals) continue;

        // If no actuals row, check if row r+1 has numeric data at singleCand.colIndex (e.g. Masterchow June 2026)
        const nextRow = Array.isArray(rows[r + 1]) ? (rows[r + 1] as unknown[]) : [];
        const nextCellVal = String(nextRow[singleCand.colIndex] || '').trim();
        if (nextCellVal && !isNaN(Number(nextCellVal.replace(/,/g, '')))) {
          activeBlocks = [
            {
              labelCol: 0,
              blockLabel: isGenericTableHeader(col0) ? undefined : col0,
              blockIndex: blockIndexCounter++,
              periods: [singleCand],
            },
          ];
          continue;
        }
      }

      // Pattern A / Block Header Row with >= 2 dates
      if (candidatePeriods.length >= 2) {
        activeBlocks = [];
        let cur: SheetBlock | null = null;

        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          const pInfo = parseReportingPeriodInfo(cell, sheetYear);
          const text = String(cell || '').trim();

          if (pInfo) {
            if (cur) {
              cur.periods.push({ colIndex: c, periodInfo: pInfo });
            }
          } else if (text && text.toLowerCase() !== 'grand total' && text.toLowerCase() !== 'total') {
            if (cur && cur.periods.length >= 2) {
              activeBlocks.push(cur);
              cur = {
                labelCol: c,
                blockLabel: isGenericTableHeader(text) ? undefined : text,
                blockIndex: blockIndexCounter++,
                periods: [],
              };
            } else if (!cur) {
              cur = {
                labelCol: c,
                blockLabel: isGenericTableHeader(text) ? undefined : text,
                blockIndex: blockIndexCounter++,
                periods: [],
              };
            }
          }
        }
        if (cur && cur.periods.length >= 2) {
          activeBlocks.push(cur);
        }

        // Fallback: single block across whole row
        if (activeBlocks.length === 0 && candidatePeriods.length >= 2) {
          activeBlocks.push({
            labelCol: 0,
            blockLabel: isGenericTableHeader(col0) ? undefined : col0,
            blockIndex: blockIndexCounter++,
            periods: candidatePeriods,
          });
        }

        // Refine labelCol for active block
        for (const blk of activeBlocks) {
          if (blk.periods.length > 0 && blk.periods[0]!.colIndex > blk.labelCol) {
            let bestLabelCol = blk.labelCol;
            let maxTextCount = -1;
            for (let c = blk.labelCol; c < blk.periods[0]!.colIndex; c++) {
              const textCount = rows
                .slice(r + 1, Math.min(rows.length, r + 25))
                .filter(
                  (rowItem) =>
                    Array.isArray(rowItem) &&
                    rowItem[c] &&
                    /[a-zA-Z]/.test(String(rowItem[c]))
                ).length;
              if (textCount > maxTextCount) {
                maxTextCount = textCount;
                bestLabelCol = c;
              }
            }
            blk.labelCol = bestLabelCol;
          }
        }

        currentSectionLabel = undefined;
        continue;
      }

      // Hierarchy header row (e.g. "Blinkit", "Zepto" in Masterchow)
      const restHasData = row
        .slice(1)
        .some((c) => c !== undefined && c !== null && String(c).trim() !== '');
      if (col0 && !restHasData && !isGenericTableHeader(col0)) {
        let nextHasDateHeader = false;
        for (let nextR = r + 1; nextR < Math.min(rows.length, r + 4); nextR++) {
          const nr = Array.isArray(rows[nextR]) ? (rows[nextR] as unknown[]) : [];
          const cand = nr
            .map((c) => parseReportingPeriodInfo(c, sheetYear))
            .filter(Boolean);
          if (cand.length >= 2) {
            nextHasDateHeader = true;
            break;
          }
        }

        if (nextHasDateHeader) {
          currentParentBlockLabel = col0;
          activeBlocks = [];
          currentSectionLabel = undefined;
          continue;
        }
      }

      // Process metric rows for active horizontal blocks
      if (activeBlocks.length > 0) {
        for (const blk of activeBlocks) {
          const rawLabel = String(row[blk.labelCol] || '').trim();
          if (!rawLabel) continue;

          const hasAnyData = blk.periods.some((p) => {
            const val = row[p.colIndex];
            return val !== undefined && val !== null && String(val).trim() !== '';
          });

          if (!hasAnyData) {
            currentSectionLabel = rawLabel;
            continue;
          }

          const rowScale = detectScaleAndCurrency(rawLabel);
          const activeScale = rowScale.isExplicitCurrency ? rowScale : sheetScale;
          const metricKind = inferMetricKindAndUnit(rawLabel, activeScale);
          const standardKey = matchStandardKpi(rawLabel);

          for (const p of blk.periods) {
            const cellRaw = row[p.colIndex];
            const parsed = parseRawCellValue(cellRaw);

            const colLetter = String.fromCharCode(65 + (p.colIndex % 26));
            const srcRef = `Sheet '${sheetName}', Row ${r + 1}, Col ${colLetter} '${rawLabel}'`;

            if (parsed.isError) {
              allMetrics.push({
                sheetName,
                rawLabel,
                normalizedLabel: normalizeLabel(rawLabel),
                parentLabel: currentSectionLabel,
                standardMetricKey: standardKey,
                reportingPeriod: p.periodInfo.reportingPeriod,
                periodDate: p.periodInfo.periodDate,
                value: null,
                rawValue: parsed.rawString,
                unit: metricKind.unit,
                currency: metricKind.currency,
                scale: activeScale.scaleName,
                rowIndex: r + 1,
                colIndex: p.colIndex + 1,
                sourceReference: srcRef,
                confidence: 0.5,
                status: 'quarantined',
                validationNotes: `Formula error ${parsed.rawString}`,
                granularity: p.periodInfo.granularity,
                blockLabel: blk.blockLabel,
                blockIndex: blk.blockLabel ? blk.blockIndex : undefined,
                parentBlockLabel: currentParentBlockLabel,
                kind: metricKind.kind,
              });
              horizontalExtractedCount++;
              continue;
            }

            if (parsed.num === null) continue;

            let finalValue = parsed.num;

            if (metricKind.kind === 'percent') {
              if (finalValue > -1 && finalValue < 1 && finalValue !== 0 && !parsed.rawString.includes('%')) {
                finalValue = parseFloat((finalValue * 100).toFixed(4));
              } else {
                finalValue = parseFloat(finalValue.toFixed(4));
              }
            } else if (metricKind.kind === 'currency') {
              if (activeScale.scaleMultiplier > 1 && Math.abs(finalValue) < 100_000) {
                finalValue = parseFloat((finalValue * activeScale.scaleMultiplier).toFixed(2));
              }
            }

            allMetrics.push({
              sheetName,
              rawLabel,
              normalizedLabel: normalizeLabel(rawLabel),
              parentLabel: currentSectionLabel,
              standardMetricKey: standardKey,
              reportingPeriod: p.periodInfo.reportingPeriod,
              periodDate: p.periodInfo.periodDate,
              value: finalValue,
              rawValue: parsed.rawString,
              unit: metricKind.unit,
              currency: metricKind.currency,
              scale: metricKind.kind === 'count' || metricKind.kind === 'percent' ? 'units' : activeScale.scaleName,
              rowIndex: r + 1,
              colIndex: p.colIndex + 1,
              sourceReference: srcRef,
              confidence: 1.0,
              status: 'valid',
              granularity: p.periodInfo.granularity,
              blockLabel: blk.blockLabel,
              blockIndex: blk.blockLabel ? blk.blockIndex : undefined,
              parentBlockLabel: currentParentBlockLabel,
              kind: metricKind.kind,
            });
            horizontalExtractedCount++;
          }
        }
      }
    }

    if (horizontalExtractedCount > 0) {
      sheetLayouts.set(sheetName, 'metric_matrix');
    } else {
      // Check if sheet contains notes / qualitative text
      const nonBlankRows = rows.filter((r) => Array.isArray(r) && r.some((c) => String(c || '').trim().length > 0));
      if (nonBlankRows.length > 0) {
        sheetLayouts.set(sheetName, 'notes_and_metadata');
      } else {
        sheetLayouts.set(sheetName, 'empty');
      }
    }
  }

  const quarantinedCount = allMetrics.filter((m) => m.status === 'quarantined').length;

  return {
    metrics: allMetrics,
    sheetsAnalyzed,
    quarantinedCount,
    sheetLayouts,
  };
}

/**
 * Extract canonical reporting period (YYYY-MM) from document filename if present.
 */
export function extractPeriodFromFilename(filename: string): string | null {
  const clean = filename.replace(/[_\s.]+/g, ' ');
  const myMatch = clean.match(/\b([a-zA-Z]{3,9})\s*'?((?:20)?2[0-9])\b/i);
  if (myMatch && myMatch[1] && myMatch[2]) {
    const m = MONTH_MAP[myMatch[1].toLowerCase()];
    if (m) {
      let y = parseInt(myMatch[2], 10);
      if (y < 100) y += 2000;
      return `${y}-${m}`;
    }
  }
  const qMatch = clean.match(/\bQ([1-4])\s*[-/]?\s*FY\s*'?([0-9]{2,4})\b/i);
  if (qMatch && qMatch[1] && qMatch[2]) {
    const q = parseInt(qMatch[1], 10);
    let y = parseInt(qMatch[2], 10);
    if (y < 100) y += 2000;
    const months = ['06', '09', '12', '03'];
    const retY = q === 4 ? y : y - 1;
    return `${retY}-${months[q - 1]}`;
  }
  const fyMatch = clean.match(/\bFY\s*'?([0-9]{2,4})[-/]?([0-9]{2,4})?\b/i);
  if (fyMatch && fyMatch[1]) {
    let y = parseInt(fyMatch[2] || fyMatch[1], 10);
    if (y < 100) y += 2000;
    return `${y}-03`;
  }
  return null;
}
