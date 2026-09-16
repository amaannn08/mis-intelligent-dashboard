import * as XLSX from 'xlsx';
import type { ParsedBlock } from '../types.js';

export interface XlsxParseOptions {
  maxRowsPerBlock?: number;
}

/**
 * Format a cell value verbatim without altering numbers or currencies.
 */
function formatCellValue(cell: unknown): string {
  if (cell === null || cell === undefined) {
    return '';
  }
  if (typeof cell === 'number') {
    // Keep number verbatim, no scientific notation for typical financial figures
    return String(cell);
  }
  if (typeof cell === 'string') {
    return cell.trim();
  }
  if (typeof cell === 'boolean') {
    return cell ? 'TRUE' : 'FALSE';
  }
  if (cell instanceof Date) {
    return cell.toISOString().split('T')[0] ?? '';
  }
  return String(cell).trim();
}

/**
 * Parse an Excel workbook (.xlsx / .xls) buffer into structured, pipe-separated blocks.
 */
export function parseXlsx(
  bytes: Buffer | Uint8Array,
  options: XlsxParseOptions = {}
): ParsedBlock[] {
  const maxRowsPerBlock = options.maxRowsPerBlock ?? 35;
  const workbook = XLSX.read(bytes, {
    type: 'buffer',
    raw: true,
    cellDates: false,
  });

  const blocks: ParsedBlock[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) {
      continue;
    }

    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: false,
    });

    if (rawRows.length === 0) {
      continue;
    }

    // Convert rows to array of strings
    const rows = rawRows.map((r) =>
      (Array.isArray(r) ? r : []).map(formatCellValue)
    );

    // Identify max columns across rows to normalize width
    let maxCols = 0;
    for (const r of rows) {
      if (r.length > maxCols) maxCols = r.length;
    }

    if (maxCols === 0) {
      continue;
    }

    // Filter out completely blank rows while keeping original row indices (1-based)
    interface IndexedRow {
      rowIndex: number; // 1-based
      values: string[];
      pipeString: string;
      isHeaderCandidate: boolean;
    }

    const indexedRows: IndexedRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const isBlank = row.every((c) => c === '');
      if (isBlank) continue;

      // Drop trailing empty cells
      let lastNonEmpty = row.length - 1;
      while (lastNonEmpty >= 0 && row[lastNonEmpty] === '') {
        lastNonEmpty--;
      }
      const trimmed = row.slice(0, lastNonEmpty + 1);
      const pipeString = '| ' + trimmed.join(' | ') + ' |';

      // Candidate header if at least 2 non-empty cells contain text/letters
      const textCells = trimmed.filter((c) => /[a-zA-Z]/.test(c)).length;
      indexedRows.push({
        rowIndex: i + 1,
        values: trimmed,
        pipeString,
        isHeaderCandidate: textCells >= 2,
      });
    }

    if (indexedRows.length === 0) {
      continue;
    }

    // Find primary header row (usually first non-empty text row or first candidate)
    const headerRow = indexedRows.find((r) => r.isHeaderCandidate) ?? indexedRows[0];

    // Filter out repeated header rows that appear later in the table
    const deduplicatedRows: IndexedRow[] = [];
    for (let i = 0; i < indexedRows.length; i++) {
      const currentRow = indexedRows[i];
      if (!currentRow) continue;
      if (
        i > 0 &&
        headerRow &&
        currentRow.rowIndex !== headerRow.rowIndex &&
        currentRow.pipeString.toLowerCase() === headerRow.pipeString.toLowerCase()
      ) {
        // Drop repeated header row
        continue;
      }
      deduplicatedRows.push(currentRow);
    }

    // Chunk sheet into blocks of maxRowsPerBlock
    for (let i = 0; i < deduplicatedRows.length; i += maxRowsPerBlock) {
      const slice = deduplicatedRows.slice(i, i + maxRowsPerBlock);
      if (slice.length === 0) continue;

      const firstRow = slice[0]!;
      const lastRow = slice[slice.length - 1]!;
      const rowStart = firstRow.rowIndex;
      const rowEnd = lastRow.rowIndex;

      const lines: string[] = [`### Sheet: ${sheetName}`];

      // If this block is a continuation and doesn't contain the header row, prepend header row
      const containsHeader = slice.some((r) => headerRow && r.rowIndex === headerRow.rowIndex);
      if (!containsHeader && headerRow) {
        lines.push(`(Header context) ${headerRow.pipeString}`);
      }

      for (const r of slice) {
        lines.push(r.pipeString);
      }

      blocks.push({
        text: lines.join('\n'),
        sheet: sheetName,
        rowStart,
        rowEnd,
      });
    }
  }

  return blocks;
}
