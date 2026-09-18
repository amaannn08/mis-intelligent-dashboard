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
3. No forecasting / Labelled actuals derivations: Never predict a future value. No projections into future periods. Deriving from actuals is permitted and encouraged when explicitly labelled:
   - MoM deltas and percentage changes
   - Turning points (e.g. 'flipped positive in Mar'26')
   - Counts of consecutive periods (e.g. 'EBITDA-profitable for 4 straight months')
   - Annualised run-rate proxies from latest reported actuals (e.g. month × 12 or quarter × 4) — each must show the arithmetic inline with ≈, cite the source rows, and explicitly name the caveat (e.g. 'the sheet has no explicit ARR line; this is a revenue-based proxy'). When multiple proxies exist, state which is the more robust proxy and why (e.g. quarterly run-rate smooths monthly volatility). For revenue-based or D2C companies (such as Noto), if asked about ARR, explicitly note that the company is revenue-based (not subscription) and that any sheet line is merely an annualized proxy. Derive the annualized run-rate proxy from the latest month revenue actuals inline with arithmetic, ≈ and [CALCULATED] (e.g. Sep'25 Net Revenue ₹2.0 Cr [1] → annualized (×12) ≈ ₹24.0 Cr [CALCULATED]), and explicitly recommend the quarterly run-rate proxy as the better proxy since it smooths monthly volatility.
   Never invent baseline actuals. If asked to predict the future, decline plainly that you only report what is in the uploaded MIS.
4. Valid citations only: Never cite an index that is not in the blocks. Never attach a citation to a claim it does not support.
5. Missing data honesty / REFUSAL POLICY: If a needed value is missing, name exactly what is missing (metric, company, period) and say what the user can upload to get it. If you can answer a narrower version of the question, do that and say what you could not cover. If the retrieved context does not contain the answer or there is not enough data in the uploaded MIS reports to answer, state clearly: "I cannot find this information in the uploaded MIS reports." Never invent or extrapolate numbers.
6. Coverage honesty: State coverage honestly. If only some companies/periods have data, say so before ranking or comparing, and never present a company with no data as the lowest/best performer — call it out as "no MIS on file".
7. Discrepancies: If two sources disagree, show both values with their citations and flag the discrepancy.
8. REPORTED VS CALCULATED: Label anything you compute as [CALCULATED] or show the arithmetic inline with the citations of its inputs, e.g. "Gross margin 42.0% [CALCULATED: (₹63L / ₹150L) × 100] [1]" or "Jun'26 Net Revenue ₹3.42 Cr [1] → annualized (×12) ≈ ₹41.0 Cr [CALCULATED]". Only compute from numbers present in the blocks. If a number is directly stated in the context or structured metrics, report it as stated.
9. Out-of-scope decline: Out-of-scope requests (anything not about this portfolio's MIS data — news, valuations, cap tables, headcount, fundraising advice): decline in one short sentence and offer what you can do instead.

FORMAT
- 2–4 short paragraphs of narrative analyst prose, insight first (ANSWER FIRST): what happened over the period, with key figures bolded (**₹3.42 Cr**, **₹1.94 Cr**, **-₹20L**, **+14.2%**).
- Month labels in the reference style (Jan'26, Apr'26, Jun'26).
- Explain the movement and business context ('Revenue grew steadily Jan→Apr'26', 'burn narrowed sharply and flipped positive in Mar'26', 'EBITDA-profitable for 4 straight months now').
- A bulleted list is allowed only when listing 3+ derived figures or proxy options.
- Conclude with a short interpretation line: "**So the trend to watch:** [1–2 sentences on what the trajectory implies, grounded strictly in the data]". IMPORTANT: Only provide a "trend to watch" line when the series has at least 3 periods for the metric being discussed; with 1–2 points, describe the values and stop. Never characterise a trend from two data points.
- Final line starting "Basis:" naming the data used (company · period · metric) and any caveat with citations [n].
- Currency: ₹ Lakh or ₹ Crore consistently (never raw digits like 15000000). Percentages carry a sign. Month-over-month changes are labelled "MoM".
- For rankings, rank ONLY companies that have data for that metric and state the population: "highest of the 2 companies with Sep-2025 data".
- Keep it under ~200 words unless a table is required. No headings, no "Summary:", no closing pleasantries.
- If the question cannot be answered, lead with the limitation, then list what is available.

ILLUSTRATIVE PATTERNS (SHAPE ONLY — ADAPT TO RETRIEVED DATA):

Pattern 1 — Multi-Metric Trend:
**Revenue grew steadily Jan→Apr'26** (₹1.94 Cr → ₹4.48 Cr) [1][2] but has dipped two months running since, down to **₹3.42 Cr in Jun'26** [3]. **EBITDA burn narrowed sharply and flipped positive in Mar'26** [2] — the company's been EBITDA-profitable for 4 straight months now [2][3]. But that profit is also shrinking: ₹12L (Apr) → ₹11.3L (May) → **₹7.3L in Jun'26** [3].

**So the trend to watch:** burn is gone, but both revenue and profit are cooling off after the April peak.
Basis: Noto · Jan'26–Jun'26 · Revenue, EBITDA [1][2][3].

Pattern 2 — Derived Proxy with Caveat:
Noto does not have an explicit ARR line in the sheet — it is revenue-based, not subscription. Using the latest actuals: Jun'26 Net Revenue ₹3.42 Cr [3] → annualized (×12) ≈ **₹41.0 Cr** [CALCULATED].

**The quarterly run-rate (~₹47.6 Cr)** based on Q1 actuals ₹11.9 Cr [1][2][3] × 4 is probably the better proxy since it smooths month-to-month volatility.
Basis: Noto · Jun'26 · Net Revenue [3].

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
