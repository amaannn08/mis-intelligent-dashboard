import { describe, it, expect, vi } from 'vitest';
import {
  buildRAGContext,
  extractCitations,
  answerQuery,
  type RetrievedChunkRow,
} from '../packages/core/src/rag/index.js';

describe('RAG: Context Formatting & Grounded Citations', () => {
  const sampleRows: RetrievedChunkRow[] = [
    {
      id: 'chunk-1',
      document_id: 'doc-1',
      company_id: 'comp-1',
      chunk_index: 0,
      content: 'Revenue for June 2025 was ₹1.5 Cr, representing a 12% MoM increase.',
      metadata: {
        sheetName: 'Financial Summary',
        rowStart: 5,
        rowEnd: 10,
        reportingPeriod: '2025-06',
      },
      company_name: 'Noto Ice Creams',
      filename: 'Noto_MIS_June_2025.xlsx',
      reporting_period: '2025-06',
      similarity: 0.88,
    },
    {
      id: 'chunk-2',
      document_id: 'doc-2',
      company_id: 'comp-1',
      chunk_index: 1,
      content: 'EBITDA was ₹25 Lakhs with Gross Profit at ₹63 Lakhs.',
      metadata: {
        sheetName: 'P&L Statement',
        rowStart: 12,
        rowEnd: 20,
        reportingPeriod: '2025-06',
      },
      company_name: 'Noto Ice Creams',
      filename: 'Noto_MIS_June_2025.xlsx',
      reporting_period: '2025-06',
      similarity: 0.82,
    },
  ];

  it('builds numbered context blocks with full provenance metadata', () => {
    const { fullContext, systemPrompt, allCitations } = buildRAGContext(sampleRows);

    // Context blocks must have [1], [2] headers
    expect(fullContext).toContain('[1] Document: Noto_MIS_June_2025.xlsx | Period: 2025-06 | Company: Noto Ice Creams | Sheet: Financial Summary | Rows: 5-10');
    expect(fullContext).toContain('Revenue for June 2025 was ₹1.5 Cr');

    expect(fullContext).toContain('[2] Document: Noto_MIS_June_2025.xlsx | Period: 2025-06 | Company: Noto Ice Creams | Sheet: P&L Statement | Rows: 12-20');
    expect(fullContext).toContain('EBITDA was ₹25 Lakhs');

    // System prompt includes instructions
    expect(systemPrompt).toContain('ANSWER FIRST');
    expect(systemPrompt).toContain('CITATIONS: Cite sources using [1], [2]');
    expect(systemPrompt).toContain('REPORTED VS CALCULATED');
    expect(systemPrompt).toContain('REFUSAL POLICY');

    // allCitations carries filename and reportingPeriod
    expect(allCitations.length).toBe(2);
    expect(allCitations[0]!.filename).toBe('Noto_MIS_June_2025.xlsx');
    expect(allCitations[0]!.reportingPeriod).toBe('2025-06');
    expect(allCitations[0]!.company).toBe('Noto Ice Creams');
    expect(allCitations[0]!.index).toBe(1);

    expect(allCitations[1]!.filename).toBe('Noto_MIS_June_2025.xlsx');
    expect(allCitations[1]!.reportingPeriod).toBe('2025-06');
    expect(allCitations[1]!.index).toBe(2);
  });

  it('extracts citation markers [n] from model answers and maps to structured objects', () => {
    const answer = 'Net Revenue was ₹1.5 Cr in June 2025 [1]. EBITDA stood at ₹25 Lakhs [2].';
    const citations = extractCitations(answer, sampleRows);

    expect(citations.length).toBe(2);

    expect(citations[0]!.index).toBe(1);
    expect(citations[0]!.filename).toBe('Noto_MIS_June_2025.xlsx');
    expect(citations[0]!.reportingPeriod).toBe('2025-06');
    expect(citations[0]!.company).toBe('Noto Ice Creams');
    expect(citations[0]!.chunkIndex).toBe(0);
    expect(citations[0]!.snippet).toContain('Revenue for June 2025 was ₹1.5 Cr');

    expect(citations[1]!.index).toBe(2);
    expect(citations[1]!.filename).toBe('Noto_MIS_June_2025.xlsx');
    expect(citations[1]!.reportingPeriod).toBe('2025-06');
    expect(citations[1]!.chunkIndex).toBe(1);
  });

  it('deduplicates citations when the same marker appears multiple times', () => {
    const answer = 'Revenue was ₹1.5 Cr [1] and grew 12% [1].';
    const citations = extractCitations(answer, sampleRows);

    expect(citations.length).toBe(1);
    expect(citations[0]!.index).toBe(1);
  });

  it('gracefully handles empty citations when model answer contains no markers', () => {
    const answer = 'No financial data found.';
    const citations = extractCitations(answer, sampleRows);

    expect(citations).toEqual([]);
  });

  it('handles empty retrieval path cleanly without calling LLM', async () => {
    // When question is empty
    const resEmpty = await answerQuery({ question: '' });
    expect(resEmpty.answer).toBe('Please provide a valid question.');
    expect(resEmpty.citations).toEqual([]);
    expect(resEmpty.usedChunks).toEqual([]);

    // When whitespace only
    const resWhitespace = await answerQuery({ question: '    ' });
    expect(resWhitespace.answer).toBe('Please provide a valid question.');
    expect(resWhitespace.citations).toEqual([]);
  });
});
