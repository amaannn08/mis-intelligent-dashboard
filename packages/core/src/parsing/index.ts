import type { ParsedDocument } from '../types.js';
import { parseXlsx } from './xlsx.js';
import { parsePdf } from './pdf.js';
import { parseDocx } from './docx.js';

export { parseXlsx } from './xlsx.js';
export { parsePdf } from './pdf.js';
export { parseDocx } from './docx.js';
export {
  parseMatrixSpreadsheet,
  parseReportingPeriodCell,
  detectScaleAndCurrency,
  parseRawCellValue,
  normalizeLabel,
  matchStandardKpi,
  extractPeriodFromFilename,
} from './matrix-parser.js';

/**
 * Parse a file (.xlsx, .xls, .pdf, or .docx) into a structured ParsedDocument with blocks.
 */
export async function parseFile(
  bytes: Buffer | Uint8Array,
  filename: string
): Promise<ParsedDocument> {
  const lowerName = filename.toLowerCase();

  let fileType: 'xlsx' | 'xls' | 'pdf' | 'docx';
  if (lowerName.endsWith('.xlsx')) {
    fileType = 'xlsx';
  } else if (lowerName.endsWith('.xls')) {
    fileType = 'xls';
  } else if (lowerName.endsWith('.pdf')) {
    fileType = 'pdf';
  } else if (lowerName.endsWith('.docx')) {
    fileType = 'docx';
  } else {
    throw new Error(
      `Unsupported file type for '${filename}'. Only .xlsx, .xls, .pdf, and .docx are supported.`
    );
  }

  const blocks =
    fileType === 'pdf'
      ? await parsePdf(bytes)
      : fileType === 'docx'
      ? parseDocx(bytes)
      : parseXlsx(bytes);

  const rawText = blocks.map((b) => b.text).join('\n\n');

  return {
    filename,
    fileType,
    blocks,
    rawText,
  };
}
