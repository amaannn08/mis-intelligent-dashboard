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
  queryRawSheetCells,
  discoverRawSheets,
  resolveCompanyByName,
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
});

interface StructuredMetricRow {
  company_name: string;
  metric_key: string;
  raw_label: string;
  reporting_period: string;
  period_date: Date | string | null;
  granularity: string;
  value: string | number | null;
  unit: string | null;
  currency: string | null;
  scale: string | null;
  kind: string | null;
  sheet_name: string | null;
  source_reference: string | null;
  filename: string;
}

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

  // Resolves a company name (as supplied by the LLM via a tool call, or detected
  // in the question) against the known-companies list using normalized matching
  // (handles spacing/punctuation/typo variants like "master chow" -> "Masterchow").
  // An explicitly named company always takes precedence over the session scope.
  function resolveToolCompany(
    companyName: string | undefined,
    fallbackCompanyId: string | null
  ): { companyId: string | undefined; companyName: string | undefined } {
    if (companyName) {
      const match = resolveCompanyByName(companyName, knownCompanies);
      if (match) {
        return { companyId: match.id, companyName: match.name };
      }
    }
    return { companyId: fallbackCompanyId || undefined, companyName };
  }

  // 2b. Portfolio-wide coverage: which companies have ANY MIS data on file,
  // independent of what gets retrieved/scoped for this specific question.
  // This prevents the model from claiming "only company X has MIS on file"
  // just because the question was routed/scoped to company X.
  let portfolioCompaniesWithData: string[] = [];
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT c.name FROM companies c
       WHERE c.id IN (
         SELECT company_id FROM mis_metrics
         UNION SELECT company_id FROM metrics
         UNION SELECT company_id FROM document_chunks
       );`
    );
    portfolioCompaniesWithData = rows.map((r: { name: string }) => r.name);
  } catch (err) {
    console.error('Failed to load portfolio-wide coverage:', err);
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

  // When a product/category/channel breakdown is found, the company-level
  // revenue trend chart is the wrong visual for the question (it answers
  // "how much revenue" instead of "which product/category") and juxtaposing
  // monthly and cumulative/annual figures on one axis is misleading. Suppress
  // the generic metric chart below once a breakdown table is rendered instead.
  let foundCategoryBreakdown = false;

  if (isBreakdownQuestion && (targetCompanyId || detectedCompanyNames.length > 0)) {
    try {
      const targetMetric = metricKeys[0] === 'gross_revenue' ? 'gross_revenue' : 'net_revenue';
      const breakdownCompany = resolveToolCompany(detectedCompanyNames[0], targetCompanyId);
      const misRes = await queryMisMetrics({
        companyId: breakdownCompany.companyId,
        companyName: breakdownCompany.companyName,
        metric: targetMetric,
        limit: 25,
      });

      if (misRes.rankedCategories.length > 0) {
        foundCategoryBreakdown = true;
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

  // 8. Build deterministic chart payload from retrieved structured metric rows.
  // Skip it when a category/product breakdown table is already rendered above —
  // a company-level revenue trend chart doesn't answer a "which product" question.
  const chartPayload = foundCategoryBreakdown
    ? { charts: [] }
    : buildChartPayload({
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
    portfolioCompaniesWithData,
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
    discover_raw_sheets: tool({
      description:
        'Discover all spreadsheet sheets, tabs, notes, and unparsed statements across documents for a company or specific document. Returns sheet names, row/col counts, detected layouts, and metric counts, even when 0 semantic metrics were extracted. Use this first when you need to know which sheets exist in a workbook or where notes/commentary/schedules are located.',
      inputSchema: z.object({
        companyName: z.string().optional().describe('Company name e.g. "Masterchow", "Unbox"'),
        documentId: z.string().uuid().optional().describe('Specific document UUID'),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
      execute: async ({ companyName, documentId, limit, offset }) => {
        const resolved = resolveToolCompany(companyName, targetCompanyId);
        try {
          return await discoverRawSheets({
            companyId: resolved.companyId,
            companyName: resolved.companyName,
            documentId,
            limit,
            offset,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isMissingTable = errMsg.includes('document_sheets') || errMsg.includes('relation') || errMsg.includes('does not exist');
          return {
            totalSheets: 0,
            returnedCount: 0,
            hasMore: false,
            sheets: [],
            warning: isMissingTable
              ? 'Raw spreadsheet preservation schema (migration 0006) not yet applied or table empty. Please rely on structured metrics or document chunks.'
              : `Raw sheet discovery failed: ${errMsg}`,
          };
        }
      },
    }),
    query_raw_sheet_cells: tool({
      description:
        'Query verbatim raw spreadsheet cells, notes, tables, and exact coordinates (e.g. range A1:D20, or specific sheet/cell) from the durable raw sheet store. Use this to inspect notes, cap tables, unparsed statements, balance sheet schedules, cash flows, or exact formulas and raw values. Supports paging through large note texts via textOffset and textLimit.',
      inputSchema: z.object({
        companyName: z.string().optional().describe('Company name e.g. "Masterchow"'),
        sheetName: z.string().optional().describe('Sheet name e.g. "P&L", "Notes", "Daily"'),
        range: z.string().optional().describe('Cell range e.g. "A1:D20" or cell coordinate "B5"'),
        coord: z.string().optional().describe('Exact cell coordinate e.g. "B2"'),
        searchQuery: z.string().optional().describe('Text to search in raw cell values'),
        limit: z.number().int().min(1).max(500).default(100).describe('Max cells to return (max 500)'),
        offset: z.number().int().min(0).default(0).describe('Paging offset'),
        textOffset: z.number().int().min(0).default(0).describe('Text character offset for paging large notes'),
        textLimit: z.number().int().min(1).max(5000).default(1000).describe('Max characters per cell to return (max 5000)'),
      }),
      execute: async ({ companyName, sheetName, range, coord, searchQuery, limit, offset, textOffset, textLimit }) => {
        const resolved = resolveToolCompany(companyName, targetCompanyId);
        try {
          return await queryRawSheetCells({
            companyId: resolved.companyId,
            sheetName,
            range,
            coord,
            searchQuery,
            limit,
            offset,
            textOffset,
            textLimit,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isMissingTable = errMsg.includes('document_sheets') || errMsg.includes('relation') || errMsg.includes('does not exist');
          return {
            documentId: '',
            sheetName: sheetName || '',
            sheetIndex: 0,
            dimensions: '',
            totalCellsInSheet: 0,
            isUntrustedData: true,
            securityNotice: 'Raw spreadsheet cell query could not be completed.',
            boundedContainerXml: `<error>${isMissingTable ? 'Raw spreadsheet preservation table (migration 0006) is not yet applied to the database.' : errMsg}</error>`,
            coverage: { totalMatchingCells: 0, returnedCellsCount: 0, offset, limit, hasMore: false },
            sheetMetadata: { rowCount: 0, colCount: 0, nonEmptyCells: 0, merges: [], detectedLayout: 'unknown', semanticParsed: false, semanticMetricCount: 0 },
            cells: [],
            warning: isMissingTable
              ? 'Raw spreadsheet preservation schema (migration 0006) not yet applied. Please rely on structured metrics or document chunks.'
              : `Raw cell query error: ${errMsg}`,
          };
        }
      },
    }),
    query_structured_metrics: tool({
      description:
        'Query validated structured financial metrics and KPIs with parameterized filters (company, metric keys, reporting periods, granularity). Returns exact dates (daily YYYY-MM-DD or monthly YYYY-MM), units (INR, USD, count, percent), sources, and per-metric missing coverage indicators. Never arbitrary SQL.',
      inputSchema: z.object({
        companyName: z.string().optional().describe('Company name e.g. "SVG", "Masterchow"'),
        metricKeys: z.array(z.string()).optional().describe('Metric keys e.g. ["revenue", "ebitda", "gross_margin", "burn", "run_rate"]'),
        period: z.string().optional().describe('Specific period YYYY-MM e.g. "2026-03"'),
        periodStart: z.string().optional().describe('Start period YYYY-MM'),
        periodEnd: z.string().optional().describe('End period YYYY-MM'),
        granularity: z.enum(['daily', 'monthly', 'quarterly', 'annual', 'snapshot']).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      execute: async ({ companyName, metricKeys, period, periodStart, periodEnd, granularity, limit }) => {
        const resolved = resolveToolCompany(companyName, targetCompanyId);
        const compId = resolved.companyId;
        const compName = resolved.companyName;

        const conditions: string[] = [];
        const params: unknown[] = [];

        if (compId) {
          params.push(compId);
          conditions.push(`m.company_id = $${params.length}::uuid`);
        }
        if (metricKeys && metricKeys.length > 0) {
          params.push(metricKeys);
          conditions.push(`(m.standard_metric_key = ANY($${params.length}::text[]) OR m.normalized_label = ANY($${params.length}::text[]))`);
        }
        if (period) {
          params.push(period);
          conditions.push(`m.reporting_period = $${params.length}`);
        }
        if (periodStart) {
          params.push(periodStart);
          conditions.push(`m.reporting_period >= $${params.length}`);
        }
        if (periodEnd) {
          params.push(periodEnd);
          conditions.push(`m.reporting_period <= $${params.length}`);
        }
        if (granularity) {
          params.push(granularity);
          conditions.push(`m.granularity = $${params.length}`);
        }

        const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Query with current document precedence: pick latest document per company, metric, period, block
        const sqlQuery = `
          SELECT DISTINCT ON (m.company_id, COALESCE(m.standard_metric_key, m.normalized_label), m.reporting_period, COALESCE(m.period_date, '1970-01-01'::date), COALESCE(m.block_label, ''))
            c.name as company_name,
            COALESCE(m.standard_metric_key, m.normalized_label) as metric_key,
            m.raw_label,
            m.reporting_period,
            m.period_date,
            m.granularity,
            m.value,
            m.unit,
            m.currency,
            m.scale,
            m.kind,
            m.sheet_name,
            m.source_reference,
            d.filename
          FROM mis_metrics m
          JOIN companies c ON c.id = m.company_id
          JOIN documents d ON d.id = m.document_id
          ${whereSql}
          ORDER BY m.company_id, COALESCE(m.standard_metric_key, m.normalized_label), m.reporting_period, COALESCE(m.period_date, '1970-01-01'::date), COALESCE(m.block_label, ''), d.reporting_period DESC NULLS LAST, d.uploaded_at DESC
          LIMIT ${Math.min(limit, 200)};
        `;

        const { rows } = await pool.query<StructuredMetricRow>(sqlQuery, params);

        return {
          companyName: compName || 'Portfolio',
          totalFound: rows.length,
          metrics: rows.map((r: StructuredMetricRow) => ({
            company: r.company_name,
            metricKey: r.metric_key,
            rawLabel: r.raw_label,
            reportingPeriod: r.reporting_period,
            periodDate: r.period_date ? String(r.period_date).slice(0, 10) : undefined,
            granularity: r.granularity,
            value: r.value !== null ? (typeof r.value === 'number' ? r.value : parseFloat(String(r.value))) : null,
            unit: r.unit,
            currency: r.currency,
            scale: r.scale,
            kind: r.kind,
            sheetName: r.sheet_name,
            sourceReference: r.source_reference,
            filename: r.filename,
          })),
        };
      },
    }),
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
        const resolved = resolveToolCompany(companyName, targetCompanyId);
        return await queryMisMetrics({
          companyName: resolved.companyName,
          companyId: resolved.companyId,
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
      stopWhen: stepCountIs(5),
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

    const validCitations = allCitations.filter(
      (c) => typeof c.index === 'number' && c.index > 0
    );

    // De-duplicate the source list shown in the UI by document: a single
    // document's chunks are retrieved multiple times (e.g. 7+ chunks from
    // the same MIS file), which previously rendered as 7+ near-identical
    // "Sources & Citations" chips. Keep the lowest-index occurrence per
    // document so the chip still points at a real citation marker in the
    // streamed answer.
    const seenDocuments = new Set<string>();
    const sanitizedCitations = validCitations.filter((c) => {
      const docKey = c.documentId || c.filename || String(c.index);
      if (seenDocuments.has(docKey)) return false;
      seenDocuments.add(docKey);
      return true;
    });

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
