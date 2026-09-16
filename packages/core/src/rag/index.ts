import { pool } from '@mis/db';
import type { Citation, RagAnswer } from '../types.js';
import { embedQuery, type EmbedOptions } from '../embeddings/index.js';

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

interface RetrievedChunkRow {
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

  const rows: RetrievedChunkRow[] = (queryResult as unknown as { rows: RetrievedChunkRow[] }).rows;

  // 3. Handle empty retrieval
  if (rows.length === 0) {
    return {
      answer: 'I cannot find this information in the uploaded MIS reports.',
      citations: [],
      usedChunks: [],
    };
  }

  // 4. Build numbered context blocks
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

  // 5. Query DeepSeek with prompt contract
  if (!deepseekApiKey) {
    throw new Error('Missing DEEPSEEK_API_KEY in environment.');
  }

  const systemPrompt = `You are the WEH Ventures Portfolio Intelligence Assistant. You answer questions strictly using the retrieved portfolio MIS document context below.

CONTEXT:
${fullContext}

INSTRUCTIONS:
1. ANSWER FIRST: State the direct numerical answer in the first sentence.
2. CITATIONS: Cite sources using [1], [2] immediately following the facts they support.
3. REPORTED VS CALCULATED:
   - If a number is directly stated in the context, report it as stated.
   - If you compute a metric (e.g. EBITDA margin, MoM growth, burn rate), explicitly label it [CALCULATED] and show the exact arithmetic: e.g. "Gross Margin was 42.0% [CALCULATED: (₹63L / ₹150L) * 100] [1]".
4. REFUSAL POLICY: If the retrieved context does not contain the answer or does not have sufficient data to answer, state clearly: "I cannot find this information in the uploaded MIS reports." Never invent or extrapolate numbers.`;

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

  const answer = completionData.choices?.[0]?.message?.content?.trim() || '';

  // 6. Extract cited markers [1], [2], etc. from answer
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
