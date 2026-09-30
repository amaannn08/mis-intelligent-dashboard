import { extractText } from 'unpdf';
import type { ParsedBlock } from '../types.js';

/**
 * Parse a PDF buffer into per-page structured text blocks using unpdf.
 */
export async function parsePdf(bytes: Buffer | Uint8Array): Promise<ParsedBlock[]> {
  const data =
    bytes instanceof Uint8Array && !(bytes instanceof Buffer)
      ? bytes
      : new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const result = await extractText(data, { mergePages: false });
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
