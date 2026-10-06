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
 */
export function inferMetricKindAndUnit(
  label: string,
  activeScale: ScaleAndCurrency
): MetricKindAndUnit {
  const norm = label.trim().toLowerCase();

  // 1. Percentage check: suffixed %, or includes %, mix, margin %, gm %
  if (
    norm.includes('%') ||
    norm.includes('margin %') ||
    norm.includes('gm %') ||
    norm.includes('mix') ||
    /\b(?:percentage|ratio)\b/i.test(norm)
  ) {
    return { kind: 'percent', unit: 'percent' };
  }

  // 2. Count / Quantity check: Qty, Volume, Orders, Counts, Units, Headcount, etc.
  if (
    /^(?:qty|quantity|count|volume|units?|orders?|headcount|skus?|users?|subscribers?|customers?)\b/i.test(norm) ||
    /\b(?:qty|quantity|units?|count|orders?|volume)\b/i.test(norm)
  ) {
    return { kind: 'count', unit: 'count' };
  }

  // 3. Currency / Money check (default for financial ledger lines)
  return {
    kind: 'currency',
    unit: activeScale.currency,
    currency: activeScale.currency,
  };
}

interface SheetBlock {
  labelCol: number;
  blockLabel?: string;
  blockIndex: number;
  periods: Array<{ colIndex: number; period: string; label: string }>;
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

    // Check if sheetName has explicit year (e.g. 'till March 23' -> 2023, 'FY25' -> 2025)
    let sheetYear = yearFromFilename;
    const sheetYearMatch = sheetName.match(/\b(?:till|to|fy|ended)?\s*([a-zA-Z]{3,9})?\s*'?((?:20)?2[0-9])\b/i);
    if (sheetYearMatch && sheetYearMatch[2]) {
      let y = parseInt(sheetYearMatch[2], 10);
      if (y < 100) y += 2000;
      sheetYear = y;
    }

    let activeBlocks: SheetBlock[] = [];
    let currentParentBlockLabel: string | undefined = undefined;
    let currentSectionLabel: string | undefined = undefined;
    let blockIndexCounter = 0;

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
      const candidatePeriods: Array<{ colIndex: number; period: string; label: string }> = [];
      for (let c = 0; c < row.length; c++) {
        const period = parseReportingPeriodCell(row[c], sheetYear);
        if (period) {
          candidatePeriods.push({ colIndex: c, period, label: String(row[c]).trim() });
        }
      }

      // If candidates are derived from bare months and wrap across calendar years, adjust years backwards
      const hasBareMonths = candidatePeriods.some((c) => /^[a-zA-Z]{3,9}$/.test(c.label));
      if (hasBareMonths && candidatePeriods.length >= 2) {
        let currentY = sheetYear ?? yearFromFilename ?? 2026;
        for (let i = candidatePeriods.length - 1; i >= 0; i--) {
          const curr = candidatePeriods[i]!;
          const prev = i > 0 ? candidatePeriods[i - 1] : null;
          const currMonth = parseInt(curr.period.split('-')[1]!, 10);
          candidatePeriods[i]!.period = `${currentY}-${String(currMonth).padStart(2, '0')}`;
          if (prev) {
            const prevMonth = parseInt(prev.period.split('-')[1]!, 10);
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
          const nextCandidates: Array<{ colIndex: number; period: string; label: string }> = [];
          for (let c = 0; c < nextRow.length; c++) {
            const nextPeriod = parseReportingPeriodCell(nextRow[c], sheetYear);
            if (nextPeriod) nextCandidates.push({ colIndex: c, period: nextPeriod, label: String(nextRow[c]).trim() });
          }
          if (nextCandidates.length >= 2) {
            continue; // Skip this 'start' row; next row will serve as the header
          }
        }
      }

      // Check Pattern B: Single date in row r followed by Actuals/Budget row (e.g. Fragaria)
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
                  periods: [{ colIndex: c, period: singleCand.period, label: 'Actuals' }],
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

      // Pattern A / Block Header Row with >= 2 dates (handles vertical and horizontal stacked blocks)
      if (candidatePeriods.length >= 2) {
        activeBlocks = [];
        let cur: SheetBlock | null = null;

        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          const period = parseReportingPeriodCell(cell, sheetYear);
          const text = String(cell || '').trim();

          if (period) {
            if (cur) {
              cur.periods.push({ colIndex: c, period, label: text });
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

        // Fallback: If no horizontal labels found, create a single block for the whole row
        if (activeBlocks.length === 0 && candidatePeriods.length >= 2) {
          activeBlocks.push({
            labelCol: 0,
            blockLabel: isGenericTableHeader(col0) ? undefined : col0,
            blockIndex: blockIndexCounter++,
            periods: candidatePeriods,
          });
        }

        // Refine labelCol for each active block: pick the column before the first period column with most text rows
        for (const blk of activeBlocks) {
          if (blk.periods.length > 0 && blk.periods[0]!.colIndex > blk.labelCol) {
            let bestLabelCol = blk.labelCol;
            let maxTextCount = -1;
            for (let c = blk.labelCol; c < blk.periods[0]!.colIndex; c++) {
              const textCount = rows
                .slice(r + 1, Math.min(rows.length, r + 25))
                .filter((rowItem) => Array.isArray(rowItem) && rowItem[c] && /[a-zA-Z]/.test(String(rowItem[c]))).length;
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

      // Check if this is a hierarchy header row (e.g. "Blinkit", "Zepto" in Category X Channel)
      const restHasData = row.slice(1).some((c) => c !== undefined && c !== null && String(c).trim() !== '');
      if (col0 && !restHasData && !isGenericTableHeader(col0)) {
        // Look ahead in next 1..3 rows to verify a block date header row follows
        let nextHasDateHeader = false;
        for (let nextR = r + 1; nextR < Math.min(rows.length, r + 4); nextR++) {
          const nr = Array.isArray(rows[nextR]) ? (rows[nextR] as unknown[]) : [];
          const cand = nr.map((c) => parseReportingPeriodCell(c, sheetYear)).filter(Boolean);
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

      // Process metric rows for active blocks
      if (activeBlocks.length > 0) {
        for (const blk of activeBlocks) {
          const rawLabel = String(row[blk.labelCol] || '').trim();
          if (!rawLabel) continue;

          // Check if this row has any non-empty cell in the periods for this block
          const hasAnyData = blk.periods.some((p) => {
            const val = row[p.colIndex];
            return val !== undefined && val !== null && String(val).trim() !== '';
          });

          if (!hasAnyData) {
            currentSectionLabel = rawLabel;
            continue;
          }

          // Row-specific scale/currency override
          const rowScale = detectScaleAndCurrency(rawLabel);
          const activeScale = rowScale.scaleName !== 'units' ? rowScale : sheetScale;
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
                reportingPeriod: p.period,
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
                granularity: p.period.includes('-03') && sheetText.toLowerCase().includes('fy') ? 'annual' : 'monthly',
                blockLabel: blk.blockLabel,
                blockIndex: blk.blockLabel ? blk.blockIndex : undefined,
                parentBlockLabel: currentParentBlockLabel,
                kind: metricKind.kind,
              });
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
              reportingPeriod: p.period,
              value: finalValue,
              rawValue: parsed.rawString,
              unit: metricKind.unit,
              currency: metricKind.currency,
              scale: activeScale.scaleName,
              rowIndex: r + 1,
              colIndex: p.colIndex + 1,
              sourceReference: srcRef,
              confidence: 1.0,
              status: 'valid',
              granularity: p.period.includes('-03') && sheetText.toLowerCase().includes('fy') ? 'annual' : 'monthly',
              blockLabel: blk.blockLabel,
              blockIndex: blk.blockLabel ? blk.blockIndex : undefined,
              parentBlockLabel: currentParentBlockLabel,
              kind: metricKind.kind,
            });
          }
        }
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
  return null;
}

