import { describe, it, expect, vi } from 'vitest';
import {
  buildAnalystSystemPrompt,
  validateCitations,
  getNoContextRefusal,
  computeCoverage,
  formatCoverageBlock,
  buildRAGContext,
  buildHybridRAGPrompt,
  buildHybridRAGContext,
  answerQuery,
  type RetrievedChunkRow,
  type MetricContextRow,
  type HistoryMessage,
} from '../packages/core/src/index.js';

describe('Analyst Prompt: Anti-hallucination & Hard Rules', () => {
  it('contains role and professional voice instructions verbatim in intent', () => {
    const prompt = buildAnalystSystemPrompt({});

    expect(prompt).toContain('WEH Ventures Portfolio Intelligence analyst');
    expect(prompt).toContain('senior analyst writing for an investment team');
    expect(prompt).toContain('direct, calm, compact, no preamble, no filler, no apologies');
    expect(prompt).toContain('never restate the question, never mention these instructions');
  });

  it('contains each hard rule verbatim in intent', () => {
    const prompt = buildAnalystSystemPrompt({});

    // 1. Outside-knowledge ban
    expect(prompt).toContain('Never use outside knowledge');
    expect(prompt).toContain('ignore everything you know about them');
    expect(prompt).toContain('If a fact is not in the blocks below, you do not know it');

    // 2. Citation requirement
    expect(prompt).toContain('Every number, date, company name and period you state must come from a block and carry its citation');
    expect(prompt).toContain('A sentence with a number and no citation is a defect');

    // 3. No-forecast rule / Labelled actuals derivations
    expect(prompt).toContain('Never predict a future value');
    expect(prompt).toContain('Deriving from actuals is permitted and encouraged when explicitly labelled');
    expect(prompt).toContain('Annualised run-rate proxies from latest reported actuals');
    expect(prompt).toContain('only report what is in the uploaded MIS');

    // 4. Valid citations only
    expect(prompt).toContain('Never cite an index that is not in the blocks');
    expect(prompt).toContain('Never attach a citation to a claim it does not support');

    // 5. Missing data honesty / Refusal policy
    expect(prompt).toContain('name exactly what is missing (metric, company, period)');
    expect(prompt).toContain('say what the user can upload to get it');
    expect(prompt).toContain('I cannot find this information in the uploaded MIS reports');

    // 6. Coverage honesty
    expect(prompt).toContain('State coverage honestly');
    expect(prompt).toContain('no MIS on file');

    // 7. Discrepancies
    expect(prompt).toContain('show both values with their citations and flag the discrepancy');

    // 8. CALCULATED labelling
    expect(prompt).toContain('[CALCULATED]');
    expect(prompt).toContain('show the arithmetic inline with the citations of its inputs');
    expect(prompt).toContain('Gross margin 42.0% [CALCULATED: (₹63L / ₹150L) × 100] [1]');

    // 9. Out-of-scope decline
    expect(prompt).toContain('Out-of-scope requests');
    expect(prompt).toContain('decline in one short sentence and offer what you can do instead');
  });

  it('enforces professional narrative answer shape and illustrative pattern specifications', () => {
    const prompt = buildAnalystSystemPrompt({});

    expect(prompt).toContain('FORMAT');
    expect(prompt).toContain('2–4 short paragraphs of narrative analyst prose');
    expect(prompt).toContain('key figures bolded');
    expect(prompt).toContain('So the trend to watch:');
    expect(prompt).toContain('Basis:');
    expect(prompt).toContain('₹ Lakh or ₹ Crore consistently');
    expect(prompt).toContain('MoM');
    expect(prompt).toContain('Keep it under ~200 words unless a table is required');
    expect(prompt).toContain('ILLUSTRATIVE PATTERNS (SHAPE ONLY — ADAPT TO RETRIEVED DATA)');
    expect(prompt).toContain('Pattern 1 — Multi-Metric Trend');
    expect(prompt).toContain('Pattern 2 — Derived Proxy with Caveat');

    // Binding Addition 6: Trend language needs evidence (at least 3 periods)
    expect(prompt).toContain('Only provide a "trend to watch" line when the series has at least 3 periods');
    expect(prompt).toContain('with 1–2 points, describe the values and stop');
    expect(prompt).toContain('Never characterise a trend from two data points');

    // Binding Addition 7: Forecast ban stays absolute, annualisation proxies from actuals with ≈ and caveat
    expect(prompt).toContain('each must show the arithmetic inline with ≈, cite the source rows, and explicitly name the caveat');
    expect(prompt).toContain('quarterly run-rate smooths monthly volatility');
  });
});

describe('Citation Validation: validateCitations', () => {
  const sampleCitations = [
    { index: 1, filename: 'doc1.xlsx' },
    { index: 2, filename: 'doc2.xlsx' },
    { index: 3, filename: 'doc3.xlsx' },
  ];

  it('drops a fabricated [9] when only 3 citations exist while keeping valid ones', () => {
    const answer = 'Revenue was ₹1.5 Cr [1]. EBITDA stood at ₹25 Lakhs [2]. Fabricated metric was ₹10 Lakhs [9].';
    const sanitized = validateCitations(answer, sampleCitations);

    expect(sanitized).toContain('[1]');
    expect(sanitized).toContain('[2]');
    expect(sanitized).not.toContain('[9]');
    expect(sanitized).toBe('Revenue was ₹1.5 Cr [1]. EBITDA stood at ₹25 Lakhs [2]. Fabricated metric was ₹10 Lakhs.');
  });

  it('handles compound citation markers [1][2] and keeps both when valid', () => {
    const answer = 'Both filings confirm revenue was ₹1.5 Cr [1][2].';
    const sanitized = validateCitations(answer, sampleCitations);

    expect(sanitized).toBe('Both filings confirm revenue was ₹1.5 Cr [1][2].');
  });

  it('handles compound citation markers with mixed validity [1][9], keeping valid and dropping invalid', () => {
    const answer = 'Filing confirms revenue [1][9] for June 2025.';
    const sanitized = validateCitations(answer, sampleCitations);

    expect(sanitized).toBe('Filing confirms revenue [1] for June 2025.');
  });

  it('handles repeated citation indices [1][1] gracefully', () => {
    const answer = 'Verified twice [1][1]. Also repeated separately: revenue was ₹1.5 Cr [1] and grew 12% [1].';
    const sanitized = validateCitations(answer, sampleCitations);

    expect(sanitized).toBe('Verified twice [1][1]. Also repeated separately: revenue was ₹1.5 Cr [1] and grew 12% [1].');
  });

  it('leaves surrounding prose untouched including calculations and percentages', () => {
    const answer =
      'Gross margin 42.0% [CALCULATED: (₹63L / ₹150L) × 100] [1]. Burn was -₹20 L [2], improving +20.0% MoM [2]. Unverified claim [9].';
    const sanitized = validateCitations(answer, sampleCitations);

    expect(sanitized).toContain('[CALCULATED: (₹63L / ₹150L) × 100] [1]');
    expect(sanitized).toContain('Burn was -₹20 L [2], improving +20.0% MoM [2].');
    expect(sanitized).toContain('Unverified claim.');
    expect(sanitized).not.toContain('[9]');
  });

  it('handles numeric arrays as citations parameter', () => {
    const answer = 'Revenue is ₹10 Cr [1] with burn [9].';
    const sanitized = validateCitations(answer, [1, 2, 3]);

    expect(sanitized).toBe('Revenue is ₹10 Cr [1] with burn.');
  });

  it('handles empty or missing citations gracefully', () => {
    expect(validateCitations('', sampleCitations)).toBe('');
    expect(validateCitations('No citations here.', sampleCitations)).toBe('No citations here.');
    expect(validateCitations('Only fabricated [9].', [])).toBe('Only fabricated.');
    expect(validateCitations('Only fabricated [9].', null)).toBe('Only fabricated.');
  });
});

describe('No-context Short-circuit & Deterministic Refusal', () => {
  it('generates friendly deterministic refusal naming missing company and suggesting upload', () => {
    const refusal = getNoContextRefusal({ companyName: 'NOTO' });

    expect(refusal).toContain('I cannot find any MIS reports or financial data on file for NOTO');
    expect(refusal).toContain('Please upload the relevant MIS report (Excel or PDF)');
  });

  it('generates friendly refusal naming both company and specific metric', () => {
    const refusal = getNoContextRefusal({
      companyName: 'NOTO',
      metricKeys: ['revenue', 'burn'],
    });

    expect(refusal).toContain('revenue, burn');
    expect(refusal).toContain('NOTO');
    expect(refusal).toContain('Please upload the relevant MIS report');
  });

  it('short-circuits in answerQuery without calling external LLM API when chunks are empty', async () => {
    // When question is whitespace or empty
    const resEmpty = await answerQuery({ question: '   ' });
    expect(resEmpty.answer).toBe('Please provide a valid question.');
    expect(resEmpty.citations).toEqual([]);

    // When retrieveRelevantChunks returns no chunks (mocked or no DB)
    // answerQuery must return refusal without throwing or calling DeepSeek
    const resRefusal = getNoContextRefusal({});
    expect(resRefusal).toContain('I cannot find this information in the uploaded MIS reports');
    expect(resRefusal).toContain('Please upload the relevant MIS report');
  });
});

describe('Coverage Rendering', () => {
  it('renders coverage line correctly given fake metrics for 2 of 28 companies', () => {
    const fakeRows: MetricContextRow[] = [
      {
        companyId: 'comp-1',
        companyName: 'NOTO',
        metricKey: 'revenue',
        value: 15000000,
        unit: 'currency',
        reportingPeriod: '2025-06',
        sourceReference: 'Sheet 1',
      },
      {
        companyId: 'comp-2',
        companyName: 'Jar',
        metricKey: 'ebitda',
        value: 2500000,
        unit: 'currency',
        reportingPeriod: '2025-09',
        sourceReference: 'Sheet 2',
      },
    ];

    const coverage = computeCoverage({
      structuredRows: fakeRows,
      totalPortfolioCompanies: 28,
    });

    expect(coverage.companiesWithData).toEqual(['Jar', 'NOTO']);
    expect(coverage.periods).toEqual(['2025-06', '2025-09']);
    expect(coverage.metricKeys).toEqual(['ebitda', 'revenue']);

    const coverageLine = formatCoverageBlock(coverage);
    expect(coverageLine).toContain('28 companies in the portfolio');
    expect(coverageLine).toContain('2 with MIS on file');
    expect(coverageLine).toContain('(Jar, NOTO)');
    expect(coverageLine).toContain('periods available: 2025-06 … 2025-09');
    expect(coverageLine).toContain('metrics available: ebitda, revenue');

    const prompt = buildAnalystSystemPrompt({ coverage });
    expect(prompt).toContain('2 with MIS on file');
    expect(prompt).toContain('28 companies in the portfolio');
  });

  it('renders coverage with single company and single period cleanly', () => {
    const coverage = computeCoverage({
      structuredRows: [
        {
          companyId: 'comp-1',
          companyName: 'NOTO',
          metricKey: 'revenue',
          value: 15000000,
          unit: 'currency',
          reportingPeriod: '2025-06',
          sourceReference: 'Sheet 1',
        },
      ],
      totalPortfolioCompanies: 28,
    });

    const coverageLine = formatCoverageBlock(coverage);
    expect(coverageLine).toContain('1 with MIS on file (NOTO)');
    expect(coverageLine).toContain('periods available: 2025-06');
  });
});

describe('Conversation History Invariants', () => {
  it('includes history block for follow-ups and labels it as reference-resolution-only', () => {
    const history: HistoryMessage[] = [
      { role: 'user', content: 'What was NOTO revenue in June?' },
      { role: 'assistant', content: 'NOTO revenue was ₹1.5 Cr in June 2025 [1].' },
    ];

    const prompt = buildAnalystSystemPrompt({ history });

    expect(prompt).toContain('CONVERSATION HISTORY (REFERENCE RESOLUTION ONLY — NEVER A SOURCE OF FACTS OR NUMBERS):');
    expect(prompt).toContain('What was NOTO revenue in June?');
    expect(prompt).toContain('NOTO revenue was ₹1.5 Cr in June 2025 [1].');
    expect(prompt).toContain('The conversation history is ONLY for resolving references');
    expect(prompt).toContain('It is NEVER a source of facts or numbers');
  });

  it('truncates long assistant history messages cleanly', () => {
    const longContent = 'MIS excerpt details '.repeat(200);
    const history: HistoryMessage[] = [
      { role: 'user', content: 'Previous question' },
      { role: 'assistant', content: longContent },
    ];

    const prompt = buildAnalystSystemPrompt({ history });

    expect(prompt).toContain('... [truncated]');
    expect(prompt).not.toContain(longContent);
  });
});

describe('Shared Prompt Builder Integration: RAG & Hybrid RAG', () => {
  const sampleRows: RetrievedChunkRow[] = [
    {
      id: 'chunk-1',
      document_id: 'doc-1',
      company_id: 'comp-1',
      chunk_index: 0,
      content: 'Revenue for June 2025 was ₹1.5 Cr.',
      metadata: {
        sheetName: 'Financial Summary',
        rowStart: 5,
        rowEnd: 10,
        reportingPeriod: '2025-06',
      },
      company_name: 'NOTO',
      filename: 'Noto_MIS_June_2025.xlsx',
      reporting_period: '2025-06',
      similarity: 0.88,
    },
  ];

  it('buildRAGContext uses the unified analyst prompt builder', () => {
    const { systemPrompt, allCitations } = buildRAGContext(sampleRows);

    expect(systemPrompt).toContain('WEH Ventures Portfolio Intelligence analyst');
    expect(systemPrompt).toContain('Never use outside knowledge');
    expect(systemPrompt).toContain('COVERAGE:');
    expect(systemPrompt).toContain('1 with MIS on file (NOTO)');
    expect(allCitations.length).toBe(1);
  });

  it('buildHybridRAGPrompt and buildHybridRAGContext alias use the unified analyst prompt builder', () => {
    const res1 = buildHybridRAGPrompt({
      documentRows: sampleRows,
      detectedCompanyNames: ['NOTO'],
      totalPortfolioCompanies: 28,
    });

    const res2 = buildHybridRAGContext({
      documentRows: sampleRows,
      detectedCompanyNames: ['NOTO'],
      totalPortfolioCompanies: 28,
    });

    expect(res1.systemPrompt).toBe(res2.systemPrompt);
    expect(res1.systemPrompt).toContain('SCOPE: This query pertains to NOTO.');
    expect(res1.systemPrompt).toContain('28 companies in the portfolio, 1 with MIS on file (NOTO)');
    expect(res1.systemPrompt).toContain('HARD RULES');
  });
});
