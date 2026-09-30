import type { ParsedDocument } from '../types.js';
import { parseXlsx } from './xlsx.js';
import { parsePdf } from './pdf.js';

export { parseXlsx } from './xlsx.js';
export { parsePdf } from './pdf.js';
export {
  parseMatrixSpreadsheet,
  parseReportingPeriodCell,
  detectScaleAndCurrency,
  parseRawCellValue,
  normalizeLabel,
  matchStandardKpi,
} from './matrix-parser.js';

/**
 * Parse a file (.xlsx, .xls, or .pdf) into a structured ParsedDocument with blocks.
 */
export async function parseFile(
  bytes: Buffer | Uint8Array,
  filename: string
): Promise<ParsedDocument> {
  const lowerName = filename.toLowerCase();

  let fileType: 'xlsx' | 'xls' | 'pdf';
  if (lowerName.endsWith('.xlsx')) {
    fileType = 'xlsx';
  } else if (lowerName.endsWith('.xls')) {
    fileType = 'xls';
  } else if (lowerName.endsWith('.pdf')) {
    fileType = 'pdf';
  } else {
    throw new Error(
      `Unsupported file type for '${filename}'. Only .xlsx, .xls, and .pdf are supported.`
    );
  }

  const blocks =
    fileType === 'pdf'
      ? await parsePdf(bytes)
      : parseXlsx(bytes);

  const rawText = blocks.map((b) => b.text).join('\n\n');

  return {
    filename,
    fileType,
    blocks,
    rawText,
  };
}
