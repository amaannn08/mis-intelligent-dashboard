import * as XLSX from 'xlsx';
import type { MatrixParseResult, ParsedMatrixMetric } from '../types.js';

const MONTH_MAP: Record<string, string> = {
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

/**
 * Robust cell-level period parser handling serial dates, Indian fiscal quarters,
 * calendar dates, and month-year strings.
 */
export function parseReportingPeriodCell(val: unknown, contextYear?: number): string | null {
  if (val === null || val === undefined) return null;

  if (typeof val === 'number') {
    const d = excelSerialToDate(val);
    if (d) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    }
  }

  if (val instanceof Date) {
    const year = val.getUTCFullYear();
    const month = String(val.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  const s = String(val).trim();
  if (!s || s.length > 35) return null;

  // Direct YYYY-MM
  const yyyyMm = s.match(/^(20[2-3][0-9])[-/.](0[1-9]|1[0-2])$/);
  if (yyyyMm && yyyyMm[1] && yyyyMm[2]) return `${yyyyMm[1]}-${yyyyMm[2]}`;

  // DD/MM/YYYY or D/M/YYYY
  const dmyMatch = s.match(/^([0-3]?[0-9])[-/.](0?[1-9]|1[0-2])[-/.](20[2-3][0-9])$/);
  if (dmyMatch && dmyMatch[2] && dmyMatch[3]) {
    const month = dmyMatch[2].padStart(2, '0');
    return `${dmyMatch[3]}-${month}`;
  }

  // MM/YYYY
  const mmyMatch = s.match(/^(0?[1-9]|1[0-2])[-/.](20[2-3][0-9])$/);
  if (mmyMatch && mmyMatch[1] && mmyMatch[2]) {
    const month = mmyMatch[1].padStart(2, '0');
    return `${mmyMatch[2]}-${month}`;
  }

  // Month-YY or Month 'YY or Month YYYY (e.g. Apr-24, Apr '24, April 2024, Apr-2024)
  const myMatch = s.match(/^([a-zA-Z]{3,9})[\s'-]+(?:20)?([0-9]{2})$/);
  if (myMatch && myMatch[1] && myMatch[2]) {
    const m = MONTH_MAP[myMatch[1].toLowerCase()];
    if (m) {
      const y = 2000 + parseInt(myMatch[2], 10);
      return `${y}-${m}`;
    }
  }

  const mFullYMatch = s.match(/^([a-zA-Z]{3,9})[\s'-]+(20[2-3][0-9])$/);
  if (mFullYMatch && mFullYMatch[1] && mFullYMatch[2]) {
    const m = MONTH_MAP[mFullYMatch[1].toLowerCase()];
    if (m) {
      return `${mFullYMatch[2]}-${m}`;
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
    return `${retY}-${months[q - 1]}`;
  }

  // FY alone: FY26 -> 2026-03
  const fyMatch = s.match(/\bFY\s*'?([0-9]{2,4})\b/i);
  if (fyMatch && fyMatch[1]) {
    let y = parseInt(fyMatch[1], 10);
    if (y < 100) y += 2000;
    return `${y}-03`;
  }

  // Single month alone (e.g. 'March') with contextYear
  const sm = s.toLowerCase();
  if (MONTH_MAP[sm] && contextYear) {
    return `${contextYear}-${MONTH_MAP[sm]}`;
  }

  return null;
}

export interface ScaleAndCurrency {
  scaleMultiplier: number;
  scaleName: 'lakh' | 'crore' | 'million' | 'thousand' | 'units';
  currency: 'INR' | 'USD';
}

/**
 * Detect scale multiplier and currency context from string (cell A1, sheet title, or row label).
 */
export function detectScaleAndCurrency(text: string): ScaleAndCurrency {
  const lower = text.toLowerCase();
  let currency: 'INR' | 'USD' = 'INR';

  if (/\b(?:usd|dollars?)\b|us\$/i.test(lower) || (lower.includes('$') && !lower.includes('rs'))) {
    currency = 'USD';
  }

  if (/\b(?:crores?|crs?)\b/i.test(lower) || /in\s+(?:₹|rs\.?|inr)?\s*(?:cr|crores?)/i.test(lower)) {
    return { scaleMultiplier: 10_000_000, scaleName: 'crore', currency };
  }
  if (/\b(?:lakhs?|lacs?)\b/i.test(lower) || /in\s+(?:₹|rs\.?|inr)?\s*(?:l|lakhs?|lacs?)/i.test(lower)) {
    return { scaleMultiplier: 100_000, scaleName: 'lakh', currency };
  }
  if (/\b(?:millions?|mn)\b/i.test(lower) || /in\s*(?:m|millions?)/i.test(lower)) {
    return { scaleMultiplier: 1_000_000, scaleName: 'million', currency };
  }
  if (/(?:\b(?:thousands?|in\s*k)\b|['"]000\b|\b000['"]|\(000\)|['"]000s?\b)/i.test(lower)) {
    return { scaleMultiplier: 1_000, scaleName: 'thousand', currency };
  }

  return { scaleMultiplier: 1, scaleName: 'units', currency };
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
    .replace(/(?:^|\b)(?:Rs\.?|INR|USD|EUR)(?:\b|\s*)/gi, '')
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

/**
 * Parse an Excel workbook buffer into normalized matrix metrics.
 */
export function parseMatrixSpreadsheet(
  buf: Buffer | Uint8Array,
  filename: string
): MatrixParseResult {
  const nodeBuf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const wb = XLSX.read(nodeBuf, { type: 'buffer' });

  const allMetrics: ParsedMatrixMetric[] = [];
  const sheetsAnalyzed: string[] = [];

  const yearMatch = filename.match(/(?:20[2-3][0-9])/);
  const yearFromFilename = yearMatch ? parseInt(yearMatch[0], 10) : undefined;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    // Skip sheets that are strictly raw dumps, working notes, or balance trials
    if (/^(?:working|dump|details|audit|unearned|tb\s|trial\s*balance)/i.test(sheetName)) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });

    if (rows.length < 2) continue;

    sheetsAnalyzed.push(sheetName);

    // Detect sheet-level scale and currency context
    const sheetText = `${sheetName} ${rows.slice(0, 5).map((r) => (Array.isArray(r) ? r.join(' ') : '')).join(' ')}`;
    const sheetScale = detectScaleAndCurrency(sheetText);

    let dateRowIndex = -1;
    let periodColumns: Array<{ colIndex: number; period: string; label: string }> = [];

    // Scan first 12 rows for date headers
    for (let r = 0; r < Math.min(rows.length, 12); r++) {
      const row = Array.isArray(rows[r]) ? (rows[r] as unknown[]) : [];
      const candidates: Array<{ colIndex: number; period: string; label: string }> = [];

      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        const period = parseReportingPeriodCell(cell, yearFromFilename);
        if (period) {
          candidates.push({ colIndex: c, period, label: String(cell).trim() });
        }
      }

      // Pattern A: 2 or more date columns
      if (candidates.length >= 2) {
        // Check if next row is End Date row (e.g. Unbox Robotics row 0=Start Date, row 1=End Date)
        const nextRow = Array.isArray(rows[r + 1]) ? (rows[r + 1] as unknown[]) : [];
        const nextCandidates: Array<{ colIndex: number; period: string; label: string }> = [];
        for (let c = 0; c < nextRow.length; c++) {
          const nextPeriod = parseReportingPeriodCell(nextRow[c], yearFromFilename);
          if (nextPeriod) nextCandidates.push({ colIndex: c, period: nextPeriod, label: String(nextRow[c]).trim() });
        }

        if (nextCandidates.length >= 2) {
          const rText = row.map(String).join(' ').toLowerCase();
          if (rText.includes('start')) {
            dateRowIndex = r + 1;
            periodColumns = nextCandidates;
            break;
          }
        }

        dateRowIndex = r;
        periodColumns = candidates;
        break;
      }

      // Pattern B: Single date in row r (e.g. Fragaria row 0 has 'Mar-26'), followed by Actuals/Budget row
      if (candidates.length === 1) {
        const singleCand = candidates[0]!;
        for (let nextR = r + 1; nextR < Math.min(rows.length, r + 4); nextR++) {
          const nextRow = Array.isArray(rows[nextR]) ? (rows[nextR] as unknown[]) : [];
          for (let c = 0; c < nextRow.length; c++) {
            const cellVal = String(nextRow[c] || '').toLowerCase().trim();
            if (cellVal === 'actuals' || cellVal === 'actual') {
              dateRowIndex = nextR;
              periodColumns = [{ colIndex: c, period: singleCand.period, label: 'Actuals' }];
              break;
            }
          }
          if (periodColumns.length > 0) break;
        }
        if (periodColumns.length > 0) break;
      }
    }

    if (periodColumns.length === 0 || dateRowIndex === -1) {
      continue;
    }

    // Determine label column: pick column 0..(firstPeriodCol - 1) with highest text density
    const firstPeriodCol = periodColumns[0]!.colIndex;
    let labelCol = 0;
    let maxTextCount = -1;

    for (let c = 0; c < firstPeriodCol; c++) {
      const textCount = rows
        .slice(dateRowIndex + 1, dateRowIndex + 25)
        .filter((r) => Array.isArray(r) && r[c] && /[a-zA-Z]/.test(String(r[c]))).length;
      if (textCount > maxTextCount) {
        maxTextCount = textCount;
        labelCol = c;
      }
    }

    let currentParentLabel: string | undefined = undefined;

    // Scan data rows below header
    for (let r = dateRowIndex + 1; r < rows.length; r++) {
      const row = Array.isArray(rows[r]) ? (rows[r] as unknown[]) : [];
      const rawLabel = String(row[labelCol] || '').trim();
      if (!rawLabel) continue;

      // Section header test: if row has label but all period cells are blank
      const hasAnyData = periodColumns.some((p) => {
        const val = row[p.colIndex];
        return val !== undefined && val !== null && String(val).trim() !== '';
      });

      if (!hasAnyData) {
        currentParentLabel = rawLabel;
        continue;
      }

      // Row-specific scale/currency override
      const rowScale = detectScaleAndCurrency(rawLabel);
      const activeScale = rowScale.scaleName !== 'units' ? rowScale : sheetScale;
      const isPercentRow =
        rawLabel.includes('%') ||
        rawLabel.toLowerCase().includes('mix') ||
        rawLabel.toLowerCase().includes('margin %');
      const standardKey = matchStandardKpi(rawLabel);

      for (const p of periodColumns) {
        const cellRaw = row[p.colIndex];
        const parsed = parseRawCellValue(cellRaw);

        const colLetter = String.fromCharCode(65 + (p.colIndex % 26));
        const srcRef = `Sheet '${sheetName}', Row ${r + 1}, Col ${colLetter} '${rawLabel}'`;

        if (parsed.isError) {
          allMetrics.push({
            sheetName,
            rawLabel,
            normalizedLabel: normalizeLabel(rawLabel),
            parentLabel: currentParentLabel,
            standardMetricKey: standardKey,
            reportingPeriod: p.period,
            value: null,
            rawValue: parsed.rawString,
            unit: isPercentRow ? 'percent' : activeScale.currency,
            currency: isPercentRow ? undefined : activeScale.currency,
            scale: activeScale.scaleName,
            rowIndex: r + 1,
            colIndex: p.colIndex + 1,
            sourceReference: srcRef,
            confidence: 0.5,
            status: 'quarantined',
            validationNotes: `Formula error ${parsed.rawString}`,
            granularity: p.period.includes('-03') && sheetText.toLowerCase().includes('fy') ? 'annual' : 'monthly',
          });
          continue;
        }

        if (parsed.num === null) continue;

        let finalValue = parsed.num;
        let finalUnit: string = activeScale.currency;

        if (parsed.isPercentage || isPercentRow) {
          finalUnit = 'percent';
          if (finalValue > -1 && finalValue < 1 && finalValue !== 0 && !parsed.rawString.includes('%')) {
            finalValue = parseFloat((finalValue * 100).toFixed(4));
          } else {
            finalValue = parseFloat(finalValue.toFixed(4));
          }
        } else if (activeScale.scaleMultiplier > 1 && Math.abs(finalValue) < 100_000) {
          finalValue = parseFloat((finalValue * activeScale.scaleMultiplier).toFixed(2));
        }

        allMetrics.push({
          sheetName,
          rawLabel,
          normalizedLabel: normalizeLabel(rawLabel),
          parentLabel: currentParentLabel,
          standardMetricKey: standardKey,
          reportingPeriod: p.period,
          value: finalValue,
          rawValue: parsed.rawString,
          unit: finalUnit,
          currency: isPercentRow ? undefined : activeScale.currency,
          scale: activeScale.scaleName,
          rowIndex: r + 1,
          colIndex: p.colIndex + 1,
          sourceReference: srcRef,
          confidence: 1.0,
          status: 'valid',
          granularity: p.period.includes('-03') && sheetText.toLowerCase().includes('fy') ? 'annual' : 'monthly',
        });
      }
    }
  }

  const quarantinedCount = allMetrics.filter((m) => m.status === 'quarantined').length;

  return {
    metrics: allMetrics,
    sheetsAnalyzed,
    quarantinedCount,
  };
}
