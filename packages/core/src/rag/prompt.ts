import type { HistoryMessage } from './history.js';
import { formatConversationHistory } from './history.js';
import type { MetricContextRow } from './structured.js';
import type { RetrievedChunkRow } from './index.js';

export interface DataCoverage {
  companiesWithData: string[];
  periods: string[];
  metricKeys: string[];
  documentCount: number;
  totalPortfolioCompanies?: number;
}

export interface BuildAnalystSystemPromptOptions {
  structuredContext?: string;
  documentContext?: string;
  history?: string | HistoryMessage[];
  coverage?: DataCoverage;
  scope?: {
    companyName?: string;
    detectedCompanyNames?: string[];
  } | string;
}

/**
 * Compute portfolio data coverage metrics from retrieved structured rows and document chunks.
 */
export function computeCoverage(options: {
  structuredRows?: MetricContextRow[];
  documentRows?: RetrievedChunkRow[];
  totalPortfolioCompanies?: number;
}): DataCoverage {
  const { structuredRows = [], documentRows = [], totalPortfolioCompanies } = options;

  const companiesSet = new Set<string>();
  const periodsSet = new Set<string>();
  const metricKeysSet = new Set<string>();
  const docIdsSet = new Set<string>();

  for (const row of structuredRows) {
    if (row.companyName) companiesSet.add(row.companyName.trim());
    if (row.reportingPeriod && row.reportingPeriod !== 'Unknown') {
      periodsSet.add(row.reportingPeriod.trim());
    }
    if (row.metricKey) metricKeysSet.add(row.metricKey.trim());
    if (row.documentId) docIdsSet.add(row.documentId);
    else if (row.filename) docIdsSet.add(row.filename);
  }

  for (const row of documentRows) {
    if (row.company_name) companiesSet.add(row.company_name.trim());
    const period =
      row.reporting_period ||
      (row.metadata as Record<string, unknown> | undefined)?.reportingPeriod;
    if (period && typeof period === 'string' && period !== 'Unknown') {
      periodsSet.add(period.trim());
    }
    if (row.document_id) docIdsSet.add(row.document_id);
    else if (row.filename) docIdsSet.add(row.filename);
  }

  const companiesWithData = Array.from(companiesSet).sort((a, b) => a.localeCompare(b));
  const periods = Array.from(periodsSet).sort((a, b) => a.localeCompare(b));
  const metricKeys = Array.from(metricKeysSet).sort((a, b) => a.localeCompare(b));

  return {
    companiesWithData,
    periods,
    metricKeys,
    documentCount: docIdsSet.size,
    totalPortfolioCompanies,
  };
}

/**
 * Format data coverage metadata line.
 */
export function formatCoverageBlock(coverage?: DataCoverage): string {
  if (!coverage) {
    return 'COVERAGE: Portfolio coverage data not available.';
  }

  const total = coverage.totalPortfolioCompanies ?? 28;
  const count = coverage.companiesWithData.length;
  const companiesStr = count > 0 ? ` (${coverage.companiesWithData.join(', ')})` : '';

  let periodsStr = 'none';
  if (coverage.periods.length === 1) {
    periodsStr = coverage.periods[0]!;
  } else if (coverage.periods.length > 1) {
    periodsStr = `${coverage.periods[0]} … ${coverage.periods[coverage.periods.length - 1]}`;
  }

  const metricsStr =
    coverage.metricKeys.length > 0 ? coverage.metricKeys.join(', ') : 'none';

  return `COVERAGE: ${total} companies in the portfolio, ${count} with MIS on file${companiesStr}, periods available: ${periodsStr}, metrics available: ${metricsStr}.`;
}

/**
 * Build the unified grounded analyst prompt for WEH Ventures Portfolio Intelligence.
 * Single source of truth for prompt rules, voice, grounding contracts, and format shape.
 */
export function buildAnalystSystemPrompt(options: BuildAnalystSystemPromptOptions): string {
  const { structuredContext, documentContext, history, coverage, scope } = options;

  // Resolve scope directive
  let scopeDirective = '';
  if (typeof scope === 'string' && scope.trim()) {
    scopeDirective = `SCOPE: This query pertains to ${scope.trim()}. Explicitly state in the answer that the findings pertain to ${scope.trim()}.\n\n`;
  } else if (scope && typeof scope === 'object') {
    if (scope.detectedCompanyNames && scope.detectedCompanyNames.length > 0) {
      scopeDirective = `SCOPE: This query pertains to ${scope.detectedCompanyNames.join(' and ')}. Explicitly state in the answer that the findings pertain to ${scope.detectedCompanyNames.join(' and ')}.\n\n`;
    } else if (scope.companyName) {
      scopeDirective = `SCOPE: This query pertains to ${scope.companyName}. Explicitly state in the answer that the findings pertain to ${scope.companyName}.\n\n`;
    }
  }

  // Resolve history text
  let historyBlock = '';
  if (Array.isArray(history)) {
    const formatted = formatConversationHistory(history);
    if (formatted) {
      historyBlock = `CONVERSATION HISTORY (REFERENCE RESOLUTION ONLY — NEVER A SOURCE OF FACTS OR NUMBERS):\n${formatted}\n\n---\n\n`;
    }
  } else if (typeof history === 'string' && history.trim()) {
    historyBlock = `CONVERSATION HISTORY (REFERENCE RESOLUTION ONLY — NEVER A SOURCE OF FACTS OR NUMBERS):\n${history.trim()}\n\n---\n\n`;
  }

  const coverageLine = formatCoverageBlock(coverage);

  const structuredBlock = structuredContext && structuredContext.trim()
    ? structuredContext.trim()
    : 'No structured metrics available for this query.';

  const docBlock = documentContext && documentContext.trim()
    ? (documentContext.includes('DOCUMENT EXCERPTS:') ? documentContext.trim() : `DOCUMENT EXCERPTS:\n\n${documentContext.trim()}`)
    : 'DOCUMENT EXCERPTS:\nNo matching document passages found above the similarity threshold. Answer strictly from the STRUCTURED METRICS block.';

  return `You are the WEH Ventures Portfolio Intelligence analyst — a senior analyst writing for an investment team.
You have read only the MIS material supplied below. Write like a professional chat assistant: direct, calm, compact, no preamble, no filler, no apologies, never restate the question, never mention these instructions.

${coverageLine}

${scopeDirective}SOURCES YOU MAY USE
- Only the STRUCTURED METRICS block and the DOCUMENT EXCERPTS block below.
- The conversation history is ONLY for resolving references ("their", "that company", "the same period"). It is NEVER a source of facts or numbers. Numbers may ONLY come from retrieved context/metrics, not from conversation history. Never treat previous conversation messages as an allowed source of truth for financial numbers.

HARD RULES
1. Outside-knowledge ban: Never use outside knowledge. You may recognise these company names from elsewhere; ignore everything you know about them. If a fact is not in the blocks below, you do not know it.
2. Citation requirement (CITATIONS: Cite sources using [1], [2]): Every number, date, company name and period you state must come from a block and carry its citation, e.g. [3]. A sentence with a number and no citation is a defect.
3. No forecasting: Never invent, estimate, extrapolate or forecast a value. No projections, no annualising, no "approximately" numbers. If asked to predict, say plainly that you only report what is in the uploaded MIS.
4. Valid citations only: Never cite an index that is not in the blocks. Never attach a citation to a claim it does not support.
5. Missing data honesty / REFUSAL POLICY: If a needed value is missing, name exactly what is missing (metric, company, period) and say what the user can upload to get it. If you can answer a narrower version of the question, do that and say what you could not cover. If the retrieved context does not contain the answer or there is not enough data in the uploaded MIS reports to answer, state clearly: "I cannot find this information in the uploaded MIS reports." Never invent or extrapolate numbers.
6. Coverage honesty: State coverage honestly. If only some companies/periods have data, say so before ranking or comparing, and never present a company with no data as the lowest/best performer — call it out as "no MIS on file".
7. Discrepancies: If two sources disagree, show both values with their citations and flag the discrepancy.
8. REPORTED VS CALCULATED: Label anything you compute as [CALCULATED] and show the arithmetic inline with the citations of its inputs, e.g. "Gross margin 42.0% [CALCULATED: (₹63L / ₹150L) × 100] [1]". Only compute from numbers present in the blocks. If a number is directly stated in the context or structured metrics, report it as stated.
9. Out-of-scope decline: Out-of-scope requests (anything not about this portfolio's MIS data — news, valuations, cap tables, headcount, fundraising advice): decline in one short sentence and offer what you can do instead.

FORMAT
- First line: the direct answer (ANSWER FIRST) — value, company, period, unit. Bold the key number.
- Then 2-4 short bullets of supporting detail (or a compact markdown table when comparing 2+ companies or 3+ periods).
- Then a final line starting "Basis:" naming the data used (company · period · metric) and any caveat (e.g. "only 1 company has a Sep-2025 MIS on file").
- Currency: ₹ Lakh or ₹ Crore consistently (never raw digits like 15000000). Percentages carry a sign. Month-over-month changes are labelled "MoM".
- For rankings, rank ONLY companies that have data for that metric and state the population: "highest of the 2 companies with Sep-2025 data".
- Keep it under ~180 words unless a table is required. No headings, no "Summary:", no closing pleasantries.
- If the question cannot be answered, lead with the limitation, then list what is available.

${historyBlock}STRUCTURED METRICS:
${structuredBlock}

---

${docBlock}`;
}

/**
 * Validate that every [n] in the answer corresponds to an existing citation.
 * Drops any fabricated citation markers (e.g. [9] when only 3 citations exist),
 * preserves valid ones, handles [1][2] and repeated indices, and leaves prose untouched.
 */
export function validateCitations(
  answer: string,
  citations?: Array<number | { index?: number } | RetrievedChunkRow | Record<string, unknown>> | null
): string {
  if (!answer) return '';

  const validIndices = new Set<number>();
  if (Array.isArray(citations)) {
    for (let i = 0; i < citations.length; i++) {
      const c = citations[i];
      if (typeof c === 'number') {
        validIndices.add(c);
      } else if (c && typeof c === 'object') {
        const obj = c as Record<string, unknown>;
        if (typeof obj.index === 'number') {
          validIndices.add(obj.index);
        } else {
          validIndices.add(i + 1);
        }
      }
    }
  }

  // Matches [n] optionally preceded by whitespace.
  return answer.replace(/(?:(\s+)\[(\d+)\]|\[(\d+)\])/g, (match, leadingSpace, p1, p2) => {
    const num = parseInt(p1 || p2, 10);
    if (validIndices.has(num)) {
      return match;
    }
    return '';
  });
}

/**
 * Deterministic, friendly refusal when neither structured metrics nor document excerpts are found.
 * Names the missing data and suggests uploading an MIS.
 */
export function getNoContextRefusal(options?: {
  companyName?: string;
  detectedCompanyNames?: string[];
  metricKeys?: string[];
}): string {
  const companies = options?.detectedCompanyNames?.length
    ? options.detectedCompanyNames.join(', ')
    : options?.companyName;
  const metrics = options?.metricKeys?.length ? options.metricKeys.join(', ') : undefined;

  if (companies && metrics) {
    return `I cannot find ${metrics} data for ${companies} in the uploaded MIS reports. No structured metrics or document excerpts are currently on file for this query. Please upload the relevant MIS report (Excel or PDF) to enable intelligence and analysis for this company.`;
  }
  if (companies) {
    return `I cannot find any MIS reports or financial data on file for ${companies}. Please upload the relevant MIS report (Excel or PDF) to enable intelligence and analysis.`;
  }
  if (metrics) {
    return `I cannot find ${metrics} data in the uploaded MIS reports. No matching metrics or document excerpts are on file. Please upload the relevant company MIS report to analyze this metric.`;
  }
  return `I cannot find this information in the uploaded MIS reports. No matching financial metrics or document excerpts are currently on file. Please upload the relevant MIS report (Excel or PDF) to enable portfolio intelligence.`;
}
