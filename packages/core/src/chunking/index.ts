import type {
  ChunkMetadata,
  ParsedBlock,
  ParsedDocument,
  TextChunk,
} from '../types.js';

export interface ChunkingOptions {
  targetTokens?: number; // default ~800 tokens (~3200 chars)
  overlapTokens?: number; // default ~100 tokens (~400 chars)
}

export interface ChunkingContext {
  company: string;
  companyId: string;
  documentId: string;
  reportingPeriod?: string;
}

/**
 * Estimate token count from text using character heuristic (~4 chars per token).
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Split long block text into overlapping chunks preserving table header context.
 */
function splitBlockText(
  block: ParsedBlock,
  targetChars: number,
  overlapChars: number
): Array<{ text: string; rowStart?: number; rowEnd?: number }> {
  const lines = block.text.split('\n');
  if (lines.length <= 1 || block.text.length <= targetChars) {
    return [{ text: block.text, rowStart: block.rowStart, rowEnd: block.rowEnd }];
  }

  // Find sheet header or column header to prepend
  let headerPrefix = '';
  let headerLineIndex = -1;

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('### Sheet:') || line.includes('|')) {
      headerPrefix += (headerPrefix ? '\n' : '') + line;
      headerLineIndex = i;
    }
  }

  const contentLines = lines.slice(headerLineIndex + 1);
  const chunks: Array<{ text: string; rowStart?: number; rowEnd?: number }> = [];

  let currentLines: string[] = [];
  let currentLen = headerPrefix ? headerPrefix.length + 1 : 0;
  let chunkStartLine = 0;

  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i] ?? '';
    const lineLen = line.length + 1;

    if (currentLen + lineLen > targetChars && currentLines.length > 0) {
      // Package current chunk
      const fullText = headerPrefix
        ? `${headerPrefix}\n${currentLines.join('\n')}`
        : currentLines.join('\n');

      const blockTotalRows =
        block.rowEnd && block.rowStart ? block.rowEnd - block.rowStart + 1 : contentLines.length;
      const subRowStart = block.rowStart
        ? block.rowStart + Math.floor((chunkStartLine / contentLines.length) * blockTotalRows)
        : undefined;
      const subRowEnd = block.rowStart
        ? block.rowStart + Math.floor((i / contentLines.length) * blockTotalRows)
        : undefined;

      chunks.push({
        text: fullText,
        rowStart: subRowStart,
        rowEnd: subRowEnd,
      });

      // Compute overlap lines to retain
      let retainedLen = 0;
      const retainedLines: string[] = [];
      for (let j = currentLines.length - 1; j >= 0; j--) {
        const rLine = currentLines[j]!;
        if (retainedLen + rLine.length + 1 > overlapChars && retainedLines.length > 0) {
          break;
        }
        retainedLines.unshift(rLine);
        retainedLen += rLine.length + 1;
      }

      currentLines = retainedLines;
      currentLen = (headerPrefix ? headerPrefix.length + 1 : 0) + retainedLen;
      chunkStartLine = i - retainedLines.length;
    }

    currentLines.push(line);
    currentLen += lineLen;
  }

  if (currentLines.length > 0) {
    const fullText = headerPrefix
      ? `${headerPrefix}\n${currentLines.join('\n')}`
      : currentLines.join('\n');

    const subRowStart = block.rowStart
      ? block.rowStart + Math.floor((chunkStartLine / contentLines.length) * (block.rowEnd ? block.rowEnd - block.rowStart : 1))
      : undefined;

    chunks.push({
      text: fullText,
      rowStart: subRowStart,
      rowEnd: block.rowEnd,
    });
  }

  return chunks.length > 0
    ? chunks
    : [{ text: block.text, rowStart: block.rowStart, rowEnd: block.rowEnd }];
}

/**
 * Chunk a ParsedDocument into structured ~800 token TextChunks with source metadata.
 */
export function chunkDocument(
  parsed: ParsedDocument,
  context: ChunkingContext,
  options: ChunkingOptions = {}
): TextChunk[] {
  const targetTokens = options.targetTokens ?? 800;
  const overlapTokens = options.overlapTokens ?? 100;

  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  const textChunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const block of parsed.blocks) {
    const subSlices = splitBlockText(block, targetChars, overlapChars);

    for (const slice of subSlices) {
      const content = slice.text.trim();
      if (!content) continue;

      const metadata: ChunkMetadata = {
        company: context.company,
        companyId: context.companyId,
        documentId: context.documentId,
        filename: parsed.filename,
        reportingPeriod: context.reportingPeriod,
        sheetName: block.sheet,
        pageNumber: block.page,
        rowStart: slice.rowStart ?? block.rowStart,
        rowEnd: slice.rowEnd ?? block.rowEnd,
      };

      textChunks.push({
        content,
        chunkIndex,
        tokenCount: estimateTokenCount(content),
        metadata,
      });

      chunkIndex++;
    }
  }

  return textChunks;
}
