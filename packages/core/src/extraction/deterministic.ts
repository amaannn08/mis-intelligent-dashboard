import type { ExtractedMetric, ParsedDocument } from '../types.js';
import type { MetricDefinitionLike } from '../normalisation/aliases.js';
import { matchMetricLabel } from '../normalisation/aliases.js';
import { normalizeNumericValue, parseRawNumber, detectScale } from '../normalisation/numbers.js';
import { extractYearFromContext, parseReportingPeriod } from '../normalisation/periods.js';

interface PeriodColumn {
  colIndex: number;
  period: string; // 'YYYY-MM'
  headerLabel: string;
}

/**
 * Deterministic pass for extracting financial metrics from parsed spreadsheet/table blocks.
 * Uses alias lists from metric_definitions, detects period columns and scale,
 * and handles reported vs calculated values.
 */
export function extractMetricsDeterministic(
  parsedDoc: ParsedDocument,
  metricDefinitions: MetricDefinitionLike[],
  preferredPeriod?: string
): ExtractedMetric[] {
  const extractedMap = new Map<string, ExtractedMetric>();

  // Extract year from document filename or text context as fallback
  const contextYear =
    (preferredPeriod ? parseInt(preferredPeriod.split('-')[0] ?? '', 10) : undefined) ||
    extractYearFromContext(parsedDoc.filename) ||
    extractYearFromContext(parsedDoc.rawText);

  for (const block of parsedDoc.blocks) {
    const lines = block.text.split('\n');
    const tableLines: Array<{ lineIndex: number; cells: string[] }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (!line.includes('|')) continue;

      const rawCells = line.split('|');
      // Drop leading and trailing empty split items from '| col1 | col2 |'
      const cells = rawCells.slice(1, -1).map((c) => c.trim());
      if (cells.length > 0) {
        tableLines.push({ lineIndex: i, cells });
      }
    }

    if (tableLines.length === 0) continue;

    // Detect scale context from block text
    const scale = detectScale(block.text);

    // Locate header row containing period columns
    let periodColumns: PeriodColumn[] = [];
    let headerTableLineIndex = -1;
    let labelColIndex = 0;

    for (let i = 0; i < Math.min(tableLines.length, 15); i++) {
      const { cells } = tableLines[i]!;
      const candidates: PeriodColumn[] = [];

      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c]!;
        const period = parseReportingPeriod(cell, contextYear);
        if (period) {
          candidates.push({ colIndex: c, period, headerLabel: cell });
        }
      }

      if (candidates.length >= 1) {
        periodColumns = candidates;
        headerTableLineIndex = i;
        // Label column is usually col 0 or the column before the first period column
        const firstCol = candidates[0]!.colIndex;
        labelColIndex = firstCol > 0 ? 0 : 0;
        break;
      }
    }

    if (periodColumns.length === 0 || headerTableLineIndex === -1) {
      continue;
    }

    // Map to track intermediate values for calculations (e.g. gross profit, revenue, cogs)
    // key: `${period}_gross_profit` -> { value, rowIndex, raw }
    const intermediateValues = new Map<
      string,
      { value: number; rowIndex: number; raw: string }
    >();

    // Scan data rows below header
    for (let i = headerTableLineIndex + 1; i < tableLines.length; i++) {
      const { cells, lineIndex } = tableLines[i]!;
      const rowLabel = cells[labelColIndex];
      if (!rowLabel) continue;

      const currentRowNumber = (block.rowStart ?? 1) + lineIndex;

      // Check if row matches any metric definition
      const match = matchMetricLabel(rowLabel, metricDefinitions);

      // Check for Gross Profit / COGS for derived Gross Margin calculation
      const lowerLabel = rowLabel.toLowerCase();
      const isGrossProfit =
        lowerLabel.includes('gross profit') &&
        !lowerLabel.includes('%') &&
        !lowerLabel.includes('margin');

      for (const { colIndex, period } of periodColumns) {
        if (colIndex >= cells.length) continue;
        const rawCell = cells[colIndex];
        if (!rawCell) continue;

        const parsedNum = parseRawNumber(rawCell);
        if (!parsedNum) continue;

        // If row is Gross Profit, save for derived calculation
        if (isGrossProfit) {
          const normGp = normalizeNumericValue(parsedNum, 'currency', block.text);
          intermediateValues.set(`${period}_gross_profit`, {
            value: normGp,
            rowIndex: currentRowNumber,
            raw: rawCell,
          });
        }

        if (!match) continue;

        const normValue = normalizeNumericValue(parsedNum, match.unit, block.text);
        const mapKey = `${match.metricKey}_${period}`;

        // Build precise source reference
        const colLetter = String.fromCharCode(65 + colIndex);
        const sheetRef = block.sheet ? `Sheet '${block.sheet}', ` : '';
        const sourceReference = `${sheetRef}Row ${currentRowNumber}, Col ${colLetter} '${rowLabel}' (Reported: ${rawCell}${scale.scaleName !== 'units' ? ` in ${scale.scaleName}s` : ''})`;

        // Do not overwrite an existing reported metric unless higher confidence
        if (!extractedMap.has(mapKey)) {
          extractedMap.set(mapKey, {
            metricKey: match.metricKey,
            value: normValue,
            unit: match.unit,
            reportingPeriod: period,
            sourceReference,
            valueKind: 'reported',
            confidence: 1.0,
          });
        }
      }
    }

    // Check if Gross Margin can be derived for periods where it was not explicitly reported
    for (const { period } of periodColumns) {
      const gmKey = `gross_margin_${period}`;
      const revKey = `revenue_${period}`;
      const gp = intermediateValues.get(`${period}_gross_profit`);
      const rev = extractedMap.get(revKey);

      if (!extractedMap.has(gmKey) && gp && rev && rev.value > 0) {
        const calculatedMargin = parseFloat(((gp.value / rev.value) * 100).toFixed(2));
        const sheetRef = block.sheet ? `Sheet '${block.sheet}', ` : '';
        const sourceReference = `Calculated: (Gross Profit ${gp.value} / Revenue ${rev.value}) * 100 from ${sheetRef}Row ${gp.rowIndex} & Revenue Row`;

        extractedMap.set(gmKey, {
          metricKey: 'gross_margin',
          value: calculatedMargin,
          unit: 'percent',
          reportingPeriod: period,
          sourceReference,
          valueKind: 'calculated',
          confidence: 0.95,
        });
      }
    }
  }

  return Array.from(extractedMap.values());
}
