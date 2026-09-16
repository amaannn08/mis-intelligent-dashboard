import { describe, it, expect } from 'vitest';
import {
  chunkDocument,
  estimateTokenCount,
  type ChunkingContext,
} from '../packages/core/src/chunking/index.js';
import type { ParsedDocument, ParsedBlock } from '../packages/core/src/types.js';

describe('Chunking: Document Chunking & Source Metadata', () => {
  const context: ChunkingContext = {
    company: 'Noto Ice Creams',
    companyId: '11111111-1111-1111-1111-111111111111',
    documentId: '22222222-2222-2222-2222-222222222222',
    reportingPeriod: '2025-06',
  };

  it('estimates token count reasonably (~4 chars per token)', () => {
    expect(estimateTokenCount('')).toBe(0);
    expect(estimateTokenCount('Hello')).toBe(2);
    expect(estimateTokenCount('a'.repeat(400))).toBe(100);
  });

  it('attaches comprehensive source metadata to every chunk', () => {
    const parsedDoc: ParsedDocument = {
      filename: 'Noto_MIS_June_2025.xlsx',
      fileType: 'xlsx',
      rawText: 'Revenue: 15000000\nEBITDA: 2500000',
      blocks: [
        {
          sheet: 'P&L Statement',
          text: 'Revenue: 15000000\nEBITDA: 2500000',
          rowStart: 1,
          rowEnd: 2,
        },
      ],
    };

    const chunks = chunkDocument(parsedDoc, context);
    expect(chunks.length).toBe(1);

    const chunk = chunks[0]!;
    expect(chunk.chunkIndex).toBe(0);
    expect(chunk.content).toContain('Revenue: 15000000');
    expect(chunk.tokenCount).toBeGreaterThan(0);

    // Verify all metadata keys
    expect(chunk.metadata.company).toBe('Noto Ice Creams');
    expect(chunk.metadata.companyId).toBe(context.companyId);
    expect(chunk.metadata.documentId).toBe(context.documentId);
    expect(chunk.metadata.filename).toBe('Noto_MIS_June_2025.xlsx');
    expect(chunk.metadata.reportingPeriod).toBe('2025-06');
    expect(chunk.metadata.sheetName).toBe('P&L Statement');
    expect(chunk.metadata.rowStart).toBe(1);
    expect(chunk.metadata.rowEnd).toBe(2);
  });

  it('preserves overlap between consecutive chunks when content exceeds target size', () => {
    // Generate a long structured block of 60 lines
    const lines = Array.from({ length: 60 }, (_, i) => `Row ${i + 1}: Line item financial data value ${i * 1000}`);
    const fullText = lines.join('\n');

    const parsedDoc: ParsedDocument = {
      filename: 'Large_MIS_Report.xlsx',
      fileType: 'xlsx',
      rawText: fullText,
      blocks: [
        {
          sheet: 'MIS Monthly',
          text: fullText,
          rowStart: 1,
          rowEnd: 60,
        },
      ],
    };

    // Use smaller target to enforce multiple chunks with overlap
    // targetTokens = 50 (~200 chars), overlapTokens = 15 (~60 chars)
    const chunks = chunkDocument(parsedDoc, context, {
      targetTokens: 50,
      overlapTokens: 15,
    });

    expect(chunks.length).toBeGreaterThan(1);

    // Sequential index continuity
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.chunkIndex).toBe(i);
    }

    // Verify overlap: The beginning of chunk[i+1] must share text with the end of chunk[i]
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentChunk = chunks[i]!;
      const nextChunk = chunks[i + 1]!;

      const currentLines = currentChunk.content.split('\n');
      const nextLines = nextChunk.content.split('\n');

      // The last line of currentChunk should appear in nextChunk
      const lastLineOfCurrent = currentLines[currentLines.length - 1]!;
      const foundOverlap = nextLines.includes(lastLineOfCurrent);
      expect(foundOverlap).toBe(true);
    }
  });

  it('ensures no text is lost across chunk splits', () => {
    const rawLines = Array.from({ length: 40 }, (_, i) => `Metric_Item_${i + 1} = ${i * 500}`);
    const parsedDoc: ParsedDocument = {
      filename: 'Verification_MIS.xlsx',
      fileType: 'xlsx',
      rawText: rawLines.join('\n'),
      blocks: [
        {
          sheet: 'Summary',
          text: rawLines.join('\n'),
          rowStart: 1,
          rowEnd: 40,
        },
      ],
    };

    const chunks = chunkDocument(parsedDoc, context, {
      targetTokens: 40,
      overlapTokens: 10,
    });

    // Verify every single original line appears in at least one chunk
    for (const line of rawLines) {
      const existsInSomeChunk = chunks.some((chunk) => chunk.content.includes(line));
      expect(existsInSomeChunk).toBe(true);
    }
  });

  it('preserves PDF page numbers in metadata when parsing PDF blocks', () => {
    const parsedDoc: ParsedDocument = {
      filename: 'Board_Deck_Q2.pdf',
      fileType: 'pdf',
      rawText: 'Page 1 summary\nPage 2 details',
      blocks: [
        {
          page: 1,
          text: 'Executive Summary: Net Revenue ₹15 Cr',
        },
        {
          page: 2,
          text: 'Detailed Financials: EBITDA ₹2.5 Cr',
        },
      ],
    };

    const chunks = chunkDocument(parsedDoc, context);
    expect(chunks.length).toBe(2);

    expect(chunks[0]!.metadata.pageNumber).toBe(1);
    expect(chunks[0]!.metadata.sheetName).toBeUndefined();

    expect(chunks[1]!.metadata.pageNumber).toBe(2);
    expect(chunks[1]!.metadata.sheetName).toBeUndefined();
  });
});
