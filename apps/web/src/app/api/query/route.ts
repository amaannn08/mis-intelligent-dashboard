import { NextRequest } from 'next/server';
import { z } from 'zod';
import { streamText, tool, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { apiError, handleZodError } from '@/lib/api-response';
import {
  buildHybridRAGPrompt,
  buildStructuredMetricsContext,
  buildChartPayload,
  extractCitations,
  validateCitations,
  getNoContextRefusal,
  retrieveRelevantChunks,
  routeQuestion,
  queryMisMetrics,
  type MetricContextRow,
  type RetrievedChunkRow,
} from '@mis/core';
import { db, pool, chatSessions, chatMessages, companies } from '@mis/db';
import { desc, eq, isNull } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
  sessionId: z.string().uuid().optional(),
  companyId: z.string().uuid().nullable().optional(),
  scope: z.string().optional(),
});

/**
 * Escapes non-ASCII characters to \\uXXXX so JSON can be safely transported in HTTP headers.
 */
function toHeaderSafeJson(obj: unknown): string {
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, (c) => {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body in request', 400);
  }

  const parsed = querySchema.safeParse(body);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  const { question, companyId: explicitCompanyId, sessionId } = parsed.data;

  // 1. If sessionId is provided, fetch or initialize session and load prior conversation history
  let sessionCompanyId: string | null = explicitCompanyId || null;
  let historyMessages: Array<{ role: string; content: string }> = [];

  if (sessionId) {
    try {
      const [existingSession] = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, sessionId));

      if (existingSession) {
        if (!sessionCompanyId && existingSession.companyId) {
          sessionCompanyId = existingSession.companyId;
        }

        // Auto-title: when title is still 'New chat' or 'New Session' (or empty),
        // set it to the first 60 chars of the first user question.
        const currentTitle = (existingSession.title || '').trim();
        if (!currentTitle || currentTitle === 'New chat' || currentTitle === 'New Session') {
          const autoTitle = question.slice(0, 60).trim() || 'New chat';
          await db
            .update(chatSessions)
            .set({ title: autoTitle, updatedAt: new Date() })
            .where(eq(chatSessions.id, sessionId));
        } else {
          await db
            .update(chatSessions)
            .set({ updatedAt: new Date() })
            .where(eq(chatSessions.id, sessionId));
        }
      } else {
        // Create new session with auto-title
        const autoTitle = question.slice(0, 60).trim() || 'New chat';
        await db.insert(chatSessions).values({
          id: sessionId,
          companyId: sessionCompanyId || null,
          title: autoTitle,
        });
      }

      // Load the last 6 messages of that session before the new one
      const rawHistory = await db
        .select({
          role: chatMessages.role,
          content: chatMessages.content,
        })
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(6);

      // Put into chronological order
      historyMessages = rawHistory.reverse();
    } catch (err) {
      console.error('Failed to resolve or update chat session:', err);
    }
  }

  // 2. Fetch known companies for deterministic routing
  let knownCompanies: Array<{ id: string; name: string; slug: string }> = [];
  try {
    knownCompanies = await db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
      })
      .from(companies)
      .where(isNull(companies.archivedAt));
  } catch (err) {
    console.error('Failed to load known companies:', err);
  }

  // 3. Route question deterministically
  const route = routeQuestion(question, {
    sessionCompanyId,
    knownCompanies,
  });

  const targetCompanyId = route.companyId;
  const { intent, detectedCompanyNames, metricKeys } = route;

  // 4. Structured retrieval path: when intent is 'metrics' or 'mixed'
  let structuredRows: MetricContextRow[] = [];
  let structuredContext = '';

  if (intent === 'metrics' || intent === 'mixed') {
    const isRanking = targetCompanyId === null || detectedCompanyNames.length > 1;
    const isSingleCompany = targetCompanyId !== null && detectedCompanyNames.length <= 1;

    try {
      let querySql = `
        SELECT 
          m.id,
          m.company_id AS "companyId",
          c.name AS "companyName",
          m.document_id AS "documentId",
          d.filename,
          m.metric_key AS "metricKey",
          m.value,
          m.unit,
          m.reporting_period AS "reportingPeriod",
          m.source_reference AS "sourceReference"
        FROM metrics m
        JOIN companies c ON c.id = m.company_id
        JOIN documents d ON d.id = m.document_id
        WHERE ($1::uuid IS NULL OR m.company_id = $1::uuid)
      `;
      const params: unknown[] = [targetCompanyId];

      const effectiveMetricKeys = [...metricKeys];
      if (
        (effectiveMetricKeys.includes('run_rate') || /\barr\b/i.test(question)) &&
        !effectiveMetricKeys.includes('revenue')
      ) {
        effectiveMetricKeys.push('revenue');
      }

      if (effectiveMetricKeys.length > 0) {
        querySql += ` AND m.metric_key = ANY($2::text[])`;
        params.push(effectiveMetricKeys);
      }

      querySql += ` ORDER BY c.name ASC, m.metric_key ASC, m.reporting_period ASC;`;

      const { rows } = await pool.query(querySql, params);
      structuredRows = rows;

      structuredContext = buildStructuredMetricsContext({
        rows: structuredRows,
        isRanking,
        singleCompany: isSingleCompany,
      });
    } catch (err) {
      console.error('Failed to query structured metrics:', err);
    }
  }

  // 5. Document vector retrieval path: topK = 8 for company-scoped, 16 for portfolio-wide
  const topK = targetCompanyId ? 8 : 16;
  let vectorRows: RetrievedChunkRow[] = [];
  try {
    vectorRows = await retrieveRelevantChunks({
      question,
      companyId: targetCompanyId || undefined,
      topK,
      minSimilarity: 0.55,
    });
  } catch (err) {
    console.error('Failed to retrieve vector chunks for query:', err);
  }

  // 6. Connect structured metrics with document chunks for verifiable citations
  if (structuredRows.length > 0) {
    const existingDocIds = new Set(vectorRows.map((r) => r.document_id));
    const missingDocIds = Array.from(
      new Set(
        structuredRows
          .map((r) => r.documentId)
          .filter((docId): docId is string => Boolean(docId && !existingDocIds.has(docId)))
      )
    );

    if (missingDocIds.length > 0) {
      try {
        const missingDocsSql = `
          SELECT DISTINCT ON (dc.document_id)
            dc.id,
            dc.document_id,
            dc.company_id,
            dc.chunk_index,
            dc.content,
            dc.metadata,
            c.name AS company_name,
            d.filename,
            d.reporting_period,
            0.70 AS similarity
          FROM document_chunks dc
          JOIN companies c ON c.id = dc.company_id
          JOIN documents d ON d.id = dc.document_id
          WHERE dc.document_id = ANY($1::uuid[])
          ORDER BY dc.document_id, dc.chunk_index ASC;
        `;
        const { rows: additionalChunks } = await pool.query(missingDocsSql, [missingDocIds]);
        vectorRows = [...vectorRows, ...additionalChunks];
      } catch (err) {
        console.error('Failed to retrieve chunks for structured metrics:', err);
      }
    }

    // Attach citation index to structured rows
    const docIdToChunkIndex = new Map<string, number>();
    vectorRows.forEach((r, idx) => {
      if (!docIdToChunkIndex.has(r.document_id)) {
        docIdToChunkIndex.set(r.document_id, idx + 1);
      }
    });

    for (const sRow of structuredRows) {
      if (sRow.documentId && docIdToChunkIndex.has(sRow.documentId)) {
        sRow.citationIndex = docIdToChunkIndex.get(sRow.documentId);
      }
    }

    // Refresh structured context with verified citation tags
    const isRanking = targetCompanyId === null || detectedCompanyNames.length > 1;
    const isSingleCompany = targetCompanyId !== null && detectedCompanyNames.length <= 1;
    structuredContext = buildStructuredMetricsContext({
      rows: structuredRows,
      isRanking,
      singleCompany: isSingleCompany,
    });
  }

  // Check if query is a granular breakdown / category / channel question
  const isBreakdownQuestion =
    /\b(categor|channel|product|sku|segment|breakdown|wise|selling|bestseller|best selling|top selling|popular)\b/i.test(
      question
    );

  if (isBreakdownQuestion && (targetCompanyId || detectedCompanyNames.length > 0)) {
    try {
      const targetMetric = metricKeys[0] === 'gross_revenue' ? 'gross_revenue' : 'net_revenue';
      const misRes = await queryMisMetrics({
        companyId: targetCompanyId || undefined,
        companyName: detectedCompanyNames[0],
        metric: targetMetric,
        limit: 25,
      });

      if (misRes.rankedCategories.length > 0) {
        const topCat = misRes.rankedCategories[0];
        let breakdownSection = `\n### Granular Category / Segment Breakdown from mis_metrics (${misRes.companyName}):\n`;
        breakdownSection += `Source: Sheet '${misRes.authoritativeSheet || 'Category'}' in '${misRes.authoritativeDocument || ''}'. Provenance: ${topCat?.scaleProvenance}.\n`;
        breakdownSection += `| Category | Latest Month (${topCat?.latestPeriod}) | Cumulative (${topCat?.minPeriod} to ${topCat?.maxPeriod}) | Normalized Base Amount (Cumulative) |\n`;
        breakdownSection += `| :--- | :--- | :--- | :--- |\n`;
        for (const cat of misRes.rankedCategories) {
          const normStr = cat.source_currency === 'INR' && cat.scale !== 'units'
            ? `₹${(cat.normalized_amount_cumulative_inr / 10_000_000).toFixed(2)} Cr (₹${cat.normalized_amount_cumulative_inr.toLocaleString('en-IN')})`
            : `${cat.source_currency} ${cat.normalized_amount_cumulative_inr.toLocaleString()}`;
          breakdownSection += `| ${cat.blockLabel} | ${cat.source_value_latest_formatted} | ${cat.source_value_cumulative_formatted} | ${normStr} |\n`;
        }
        breakdownSection += `\n*NOTE ON FIGURES: For segment breakdowns, cite the source amounts in ${topCat?.source_scale} (e.g. "${topCat?.source_value_latest_formatted}" in ${topCat?.latestPeriod}, "${topCat?.source_value_cumulative_formatted}" cumulative) alongside any normalized Crore figures. DO NOT multiply by scale multiplier again!*\n`;
        structuredContext = structuredContext
          ? `${structuredContext}\n\n${breakdownSection}`
          : breakdownSection;
      }
    } catch (err) {
      console.error('Failed to pre-query granular mis_metrics for breakdown:', err);
    }
  }

  // 7. Handle empty retrieval: honest refusal
  if (
    (!vectorRows || vectorRows.length === 0) &&
    (!structuredRows || structuredRows.length === 0) &&
    !structuredContext
  ) {
    let refusalCompanyName: string | undefined;
    if (targetCompanyId) {
      const matched = knownCompanies.find((c) => c.id === targetCompanyId);
      refusalCompanyName = matched?.name;
    }

    const refusalText = getNoContextRefusal({
      companyName: refusalCompanyName,
      detectedCompanyNames,
      metricKeys,
    });

    if (sessionId) {
      try {
        await db.insert(chatMessages).values([
          {
            sessionId,
            role: 'user',
            content: question,
            citations: [],
            charts: [],
          },
          {
            sessionId,
            role: 'assistant',
            content: refusalText,
            citations: [],
            charts: [],
          },
        ]);
        await db
          .update(chatSessions)
          .set({ updatedAt: new Date() })
          .where(eq(chatSessions.id, sessionId));
      } catch (err) {
        console.error('Failed to persist chat session refusal:', err);
      }
    }

    return new Response(refusalText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Citations': '[]',
        'X-Charts': '[]',
      },
    });
  }

  // 8. Build deterministic chart payload from retrieved structured metric rows
  const chartPayload = buildChartPayload({
    structuredRows,
    metricKeys,
    targetCompanyId,
    detectedCompanyNames,
    question,
  });

  // 9. Build hybrid RAG prompt with structured metrics, grouped document excerpts, and conversation history
  let scopeCompanyName: string | undefined;
  if (targetCompanyId) {
    const matched = knownCompanies.find((c) => c.id === targetCompanyId);
    scopeCompanyName = matched?.name;
  }

  const { systemPrompt, allCitations } = buildHybridRAGPrompt({
    structuredContext,
    structuredRows,
    documentRows: vectorRows,
    historyMessages,
    detectedCompanyNames,
    scopeCompanyName,
    totalPortfolioCompanies: knownCompanies.length || 28,
  });

  const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekApiKey) {
    return apiError('AI_FAILURE', 'Missing DEEPSEEK_API_KEY in server environment.', 500);
  }

  const deepseek = createOpenAI({
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: deepseekApiKey,
  });

  const tools = {
    query_mis_metrics: tool({
      description:
        'Query granular MIS metric breakdowns and rankings from the mis_metrics database table (e.g. category-level, channel-level, or product line data). Use this whenever the user asks about categories, channels, best-selling or lowest-selling segments, SKU/category revenue, volumes, or breakdowns for a company.',
      inputSchema: z.object({
        companyName: z.string().describe('Company name e.g. "Masterchow"'),
        metric: z
          .string()
          .default('net_revenue')
          .describe('Metric name: e.g. "net_revenue", "gross_revenue", "qty", or "revenue"'),
        parentBlock: z
          .string()
          .optional()
          .describe('Parent block filter e.g. "Blinkit", "Zepto", or channel name'),
        block: z
          .string()
          .optional()
          .describe('Block / category filter e.g. "Condiments", "Stick Noodles"'),
        period: z.string().optional().describe('Specific period filter YYYY-MM e.g. "2024-04"'),
      }),
      execute: async ({ companyName, metric, parentBlock, block, period }) => {
        return await queryMisMetrics({
          companyName,
          companyId: targetCompanyId || undefined,
          metric,
          parentBlockLabel: parentBlock,
          blockLabel: block,
          period,
        });
      },
    }),
  };

  try {
    const result = streamText({
      model: deepseek(process.env.DEEPSEEK_MODEL || 'deepseek-chat'),
      system: systemPrompt,
      prompt: question,
      tools,
      stopWhen: stepCountIs(3),
      temperature: 0.1,
      onFinish: async (event) => {
        if (sessionId) {
          try {
            const validatedAnswer = validateCitations(event.text, allCitations);
            const cited = extractCitations(validatedAnswer, vectorRows);
            await db.insert(chatMessages).values([
              {
                sessionId,
                role: 'user',
                content: question,
                citations: [],
                charts: [],
              },
              {
                sessionId,
                role: 'assistant',
                content: validatedAnswer,
                citations: cited as unknown as Array<Record<string, unknown>>,
                charts: chartPayload.charts as unknown as Array<Record<string, unknown>>,
              },
            ]);
            await db
              .update(chatSessions)
              .set({ updatedAt: new Date() })
              .where(eq(chatSessions.id, sessionId));
          } catch (err) {
            console.error('Failed to persist chat message exchange:', err);
          }
        }
      },
    });

    const sanitizedCitations = allCitations.filter(
      (c) => typeof c.index === 'number' && c.index > 0
    );

    return result.toTextStreamResponse({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Citations': toHeaderSafeJson(sanitizedCitations),
        'X-Charts': toHeaderSafeJson(chartPayload.charts),
      },
    });
  } catch (err: unknown) {
    console.error('Query streaming failed:', err);
    return apiError('AI_FAILURE', 'Failed to generate query stream.', 500);
  }
}
