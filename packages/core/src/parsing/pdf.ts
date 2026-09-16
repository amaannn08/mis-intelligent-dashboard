import { extractText } from 'unpdf';
import type { ParsedBlock } from '../types.js';

/**
 * Parse a PDF buffer into per-page structured text blocks using unpdf.
 */
export async function parsePdf(bytes: Buffer | Uint8Array): Promise<ParsedBlock[]> {
  const result = await extractText(bytes, { mergePages: false });
  const blocks: ParsedBlock[] = [];

  const pages = Array.isArray(result.text) ? result.text : [result.text];

  for (let i = 0; i < pages.length; i++) {
    const rawPage = pages[i];
    const pageNumber = i + 1;
    const cleanText = (rawPage ?? '').trim();
    if (!cleanText) {
      continue;
    }

    blocks.push({
      text: `--- Page ${pageNumber} ---\n${cleanText}`,
      page: pageNumber,
    });
  }

  return blocks;
}
