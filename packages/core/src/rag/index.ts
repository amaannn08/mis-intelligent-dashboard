import { pool } from '@mis/db';
import type { Citation, RagAnswer } from '../types.js';
import { embedQuery, type EmbedOptions } from '../embeddings/index.js';
import { formatConversationHistory, type HistoryMessage } from './history.js';

import type { MetricContextRow } from './structured.js';
import {
  buildAnalystSystemPrompt,
  computeCoverage,
  validateCitations,
  getNoContextRefusal,
} from './prompt.js';

export * from './router.js';
export * from './structured.js';
export * from './history.js';
export * from './prompt.js';
export * from './charts.js';
export * from './metrics-query.js';

export interface AnswerQueryOptions {
  question: string;
  companyId?: string;
  topK?: number;
  minSimilarity?: number; // e.g. 0.65
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
  embedOptions?: EmbedOptions;
}

export interface RetrieveChunksOptions {
  question: string;
  companyId?: string;
  topK?: number;
  minSimilarity?: number;
  embedOptions?: EmbedOptions;
}

export interface RetrievedChunkRow {
  id: string;
  document_id: string;
  company_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  company_name: string;
  filename: string;
  reporting_period: string | null;
  similarity: string | number;
}

/**
 * Retrieve most relevant document chunks via pgvector cosine distance.
 */
export async function retrieveRelevantChunks(
  options: RetrieveChunksOptions
): Promise<RetrievedChunkRow[]> {
  const {
    question,
    companyId,
    topK = 8,
    minSimilarity = 0.60,
    embedOptions = {},
  } = options;

  if (!question.trim()) {
    return [];
  }

  // 1. Embed query with Gemini (1536 dims)
  const queryEmbedding = await embedQuery(question, embedOptions);
  const vectorStr = JSON.stringify(queryEmbedding);

  // 2. Similarity search via pgvector cosine distance
  const querySql = `
    SELECT 
      dc.id,
      dc.document_id,
      dc.company_id,
      dc.chunk_index,
      dc.content,
      dc.metadata,
      c.name AS company_name,
      d.filename,
      d.reporting_period,
      1 - (dc.embedding <=> $1::vector) AS similarity
    FROM document_chunks dc
    JOIN companies c ON c.id = dc.company_id
    JOIN documents d ON d.id = dc.document_id
    WHERE ($2::uuid IS NULL OR dc.company_id = $2::uuid)
      AND (1 - (dc.embedding <=> $1::vector)) >= $3
    ORDER BY dc.embedding <=> $1::vector ASC
    LIMIT $4;
  `;

  const queryResult = await pool.query(querySql, [
    vectorStr,
    companyId || null,
    minSimilarity,
    topK,
  ]);

  return (queryResult as unknown as { rows: RetrievedChunkRow[] }).rows;
}

/**
 * Build context blocks, citations map, and grounded system prompt from retrieved chunk rows.
 */
export function buildRAGContext(rows: RetrievedChunkRow[]): {
  fullContext: string;
  systemPrompt: string;
  allCitations: Citation[];
} {
  const contextBlocks = rows.map((row: RetrievedChunkRow, i: number) => {
    const idx = i + 1;
    const meta = row.metadata || {};
    const sheetOrPage =
      meta.sheetName ? `Sheet: ${meta.sheetName}` : meta.pageNumber ? `Page: ${meta.pageNumber}` : 'Document';
    const rowRef =
      meta.rowStart && meta.rowEnd ? ` | Rows: ${meta.rowStart}-${meta.rowEnd}` : '';
    const periodStr = row.reporting_period || meta.reportingPeriod || 'Unknown';

    return `[${idx}] Document: ${row.filename} | Period: ${periodStr} | Company: ${row.company_name} | ${sheetOrPage}${rowRef}\n${row.content}`;
  });

  const fullContext = contextBlocks.join('\n\n');

  const allCitations: Citation[] = rows.map((row, i) => {
    const meta = row.metadata || {};
    return {
      index: i + 1,
      documentId: row.document_id,
      filename: row.filename,
      reportingPeriod: row.reporting_period || String(meta.reportingPeriod || ''),
      company: row.company_name,
      chunkIndex: row.chunk_index,
      snippet: row.content.slice(0, 200).replace(/\s+/g, ' ').trim(),
    };
  });

  const coverage = computeCoverage({ documentRows: rows });
  const systemPrompt = buildAnalystSystemPrompt({
    documentContext: fullContext,
    coverage,
  });

  return { fullContext, systemPrompt, allCitations };
}

export interface HybridRAGContextOptions {
  structuredContext?: string;
  structuredRows?: MetricContextRow[];
  documentRows?: RetrievedChunkRow[];
  historyMessages?: HistoryMessage[];
  detectedCompanyNames?: string[];
  scopeCompanyName?: string;
  totalPortfolioCompanies?: number;
}

/**
 * Build document context blocks grouped by company, preserving sequential [1], [2] citation indices.
 */
export function buildGroupedDocumentContext(rows: RetrievedChunkRow[]): {
  groupedText: string;
  allCitations: Citation[];
} {
  if (!rows || rows.length === 0) {
    return { groupedText: '', allCitations: [] };
  }

  // Group rows by company_name preserving sequential index
  const byCompany = new Map<string, Array<{ row: RetrievedChunkRow; index: number }>>();

  rows.forEach((row, i) => {
    const company = row.company_name || 'Portfolio';
    if (!byCompany.has(company)) {
      byCompany.set(company, []);
    }
    byCompany.get(company)!.push({ row, index: i + 1 });
  });

  const sections: string[] = [];

  for (const [company, items] of byCompany.entries()) {
    const companyBlocks = items.map(({ row, index }) => {
      const meta = row.metadata || {};
      const sheetOrPage = meta.sheetName
        ? `Sheet: ${meta.sheetName}`
        : meta.pageNumber
          ? `Page: ${meta.pageNumber}`
          : 'Document';
      const rowRef =
        meta.rowStart && meta.rowEnd ? ` | Rows: ${meta.rowStart}-${meta.rowEnd}` : '';
      const periodStr = row.reporting_period || meta.reportingPeriod || 'Unknown';

      return `[${index}] Document: ${row.filename} | Period: ${periodStr} | ${sheetOrPage}${rowRef}\n${row.content}`;
    });

    sections.push(`### Company: ${company}\n${companyBlocks.join('\n\n')}`);
  }

  const groupedText = sections.join('\n\n');

  const allCitations: Citation[] = rows.map((row, i) => {
    const meta = row.metadata || {};
    return {
      index: i + 1,
      documentId: row.document_id,
      filename: row.filename,
      reportingPeriod: row.reporting_period || String(meta.reportingPeriod || ''),
      company: row.company_name,
      chunkIndex: row.chunk_index,
      snippet: row.content.slice(0, 200).replace(/\s+/g, ' ').trim(),
    };
  });

  return { groupedText, allCitations };
}

/**
 * Build hybrid RAG system prompt with structured metrics, grouped document excerpts, and conversation history.
 */
export function buildHybridRAGPrompt(options: HybridRAGContextOptions): {
  systemPrompt: string;
  allCitations: Citation[];
} {
  const {
    structuredContext = '',
    structuredRows = [],
    documentRows = [],
    historyMessages = [],
    detectedCompanyNames = [],
    scopeCompanyName,
    totalPortfolioCompanies,
  } = options;

  const historyBlock = formatConversationHistory(historyMessages);
  const { groupedText: docBlock, allCitations } = buildGroupedDocumentContext(documentRows);

  const coverage = computeCoverage({
    structuredRows,
    documentRows,
    totalPortfolioCompanies,
  });

  const systemPrompt = buildAnalystSystemPrompt({
    structuredContext,
    documentContext: docBlock,
    history: historyBlock,
    coverage,
    scope: detectedCompanyNames.length > 0
      ? { detectedCompanyNames }
      : scopeCompanyName
        ? { companyName: scopeCompanyName }
        : undefined,
  });

  return { systemPrompt, allCitations };
}

export const buildHybridRAGContext = buildHybridRAGPrompt;


/**
 * Extract citation markers [1], [2] from the LLM answer and map back to citations.
 */
export function extractCitations(answer: string, rows: RetrievedChunkRow[]): Citation[] {
  const citationMatches = Array.from(answer.matchAll(/\[(\d+)\]/g));
  const citedIndices = Array.from(
    new Set(citationMatches.map((m) => parseInt(m[1]!, 10)))
  ).sort((a, b) => a - b);

  const citations: Citation[] = [];
  for (const idx of citedIndices) {
    const chunkRow = rows[idx - 1];
    if (chunkRow) {
      const meta = chunkRow.metadata || {};
      const snippet = chunkRow.content.slice(0, 200).replace(/\s+/g, ' ').trim();
      citations.push({
        index: idx,
        documentId: chunkRow.document_id,
        filename: chunkRow.filename,
        reportingPeriod: chunkRow.reporting_period || String(meta.reportingPeriod || ''),
        company: chunkRow.company_name,
        chunkIndex: chunkRow.chunk_index,
        snippet,
      });
    }
  }
  return citations;
}

/**
 * Answer a financial question using grounded RAG with pgvector cosine similarity,
 * structured source citations, and DeepSeek reasoning.
 */
export async function answerQuery(
  options: AnswerQueryOptions
): Promise<RagAnswer> {
  const {
    question,
    companyId,
    topK = 8,
    minSimilarity = 0.60,
    deepseekApiKey = process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    embedOptions = {},
  } = options;

  if (!question.trim()) {
    return {
      answer: 'Please provide a valid question.',
      citations: [],
      usedChunks: [],
    };
  }

  const rows = await retrieveRelevantChunks({
    question,
    companyId,
    topK,
    minSimilarity,
    embedOptions,
  });

  if (rows.length === 0) {
    return {
      answer: getNoContextRefusal({
        companyName: companyId ? 'the selected company' : undefined,
      }),
      citations: [],
      usedChunks: [],
    };
  }

  const { systemPrompt } = buildRAGContext(rows);

  if (!deepseekApiKey) {
    throw new Error('Missing DEEPSEEK_API_KEY in environment.');
  }

  const cleanBaseUrl = deepseekBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${cleanBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekApiKey}`,
    },
    body: JSON.stringify({
      model: deepseekModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API error (${response.status}): ${errText}`);
  }

  const completionData = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const rawAnswer = completionData.choices?.[0]?.message?.content?.trim() || '';
  const answer = validateCitations(rawAnswer, rows);
  const citations = extractCitations(answer, rows);

  const usedChunks = rows.map((row: RetrievedChunkRow) => ({
    id: row.id,
    chunkIndex: row.chunk_index,
    similarity: typeof row.similarity === 'string' ? parseFloat(row.similarity) : row.similarity,
    metadata: row.metadata,
  }));

  return {
    answer,
    citations,
    usedChunks,
  };
}
