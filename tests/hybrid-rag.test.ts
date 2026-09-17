import { describe, it, expect } from 'vitest';
import {
  routeQuestion,
  buildStructuredMetricsContext,
  formatConversationHistory,
  buildHybridRAGPrompt,
  calculateMoM,
  formatIndianCurrency,
  formatPercent,
  type KnownCompany,
  type MetricContextRow,
} from '../packages/core/src/index.js';

describe('RAG Router: Intent, Company Scope & Metric Extraction', () => {
  const knownCompanies: KnownCompany[] = [
    { id: 'noto-id-1234', name: 'NOTO', slug: 'noto' },
    { id: 'jar-id-5678', name: 'Jar', slug: 'jar' },
    { id: 'flent-id-9012', name: 'Flent (Slaash)', slug: 'flent' },
  ];

  describe('Company detection', () => {
    it('detects a single company by name or slug', () => {
      const res = routeQuestion('What was NOTO revenue in June 2025?', { knownCompanies });
      expect(res.companyId).toBe('noto-id-1234');
      expect(res.detectedCompanyNames).toEqual(['NOTO']);
    });

    it('detects multiple companies for comparison query and sets companyId to null', () => {
      const res = routeQuestion('compare NOTO and Jar revenue', { knownCompanies });
      expect(res.companyId).toBeNull();
      expect(res.detectedCompanyNames).toContain('NOTO');
      expect(res.detectedCompanyNames).toContain('Jar');
    });

    it('handles query with no company mention', () => {
      const res = routeQuestion('which company has the highest burn?', { knownCompanies });
      expect(res.companyId).toBeNull();
      expect(res.detectedCompanyNames).toEqual([]);
    });

    it('uses session scope when no company is explicitly mentioned in question', () => {
      const res = routeQuestion('what is the burn rate?', {
        sessionCompanyId: 'noto-id-1234',
        knownCompanies,
      });
      expect(res.companyId).toBe('noto-id-1234');
      expect(res.detectedCompanyNames).toEqual([]);
    });

    it('explicit mention in question wins over session scope', () => {
      const res = routeQuestion('what is Jar EBITDA?', {
        sessionCompanyId: 'noto-id-1234',
        knownCompanies,
      });
      expect(res.companyId).toBe('jar-id-5678');
      expect(res.detectedCompanyNames).toEqual(['Jar']);
    });

    it('detects company by parenthetical alias (e.g. Flent (Slaash) -> Slaash)', () => {
      const res = routeQuestion("what is Slaash's burn rate?", { knownCompanies });
      expect(res.companyId).toBe('flent-id-9012');
      expect(res.detectedCompanyNames).toEqual(['Flent (Slaash)']);
    });
  });

  describe('Intent detection', () => {
    it('detects "metrics" intent for ranking and quantitative questions', () => {
      const res = routeQuestion('which company has the highest burn?', { knownCompanies });
      expect(res.intent).toBe('metrics');
      expect(res.metricKeys).toContain('burn');
    });

    it('detects "documents" intent for qualitative and narrative inquiries', () => {
      const res = routeQuestion("summarise NOTO's commentary", { knownCompanies });
      expect(res.intent).toBe('documents');
      expect(res.detectedCompanyNames).toContain('NOTO');
    });

    it('detects "mixed" intent when explanatory words and metrics coexist', () => {
      const res = routeQuestion("why did revenue grow and what's the burn?", { knownCompanies });
      expect(res.intent).toBe('mixed');
      expect(res.metricKeys).toContain('revenue');
      expect(res.metricKeys).toContain('burn');
    });
  });

  describe('Metric key extraction', () => {
    it('extracts multiple metric keys correctly', () => {
      const res = routeQuestion('Show me ARR, gross margin %, and EBITDA for Flent', {
        knownCompanies,
      });
      expect(res.metricKeys).toContain('run_rate');
      expect(res.metricKeys).toContain('gross_margin');
      expect(res.metricKeys).toContain('ebitda');
      expect(res.companyId).toBe('flent-id-9012');
    });
  });
});

describe('Structured Context Builder & Math', () => {
  it('calculates MoM change accurately for positive and negative values', () => {
    // Standard growth: 100 -> 120 (+20%)
    expect(calculateMoM(120, 100).formatted).toBe('+20.0%');
    expect(calculateMoM(80, 100).formatted).toBe('-20.0%');

    // Negative value case: Loss/burn reduces from -100 to -80 (+20% improvement)
    expect(calculateMoM(-80, -100).formatted).toBe('+20.0%');
    // Negative value case: Loss/burn widens from -100 to -150 (-50% deterioration)
    expect(calculateMoM(-150, -100).formatted).toBe('-50.0%');

    // N/A when no prior period
    expect(calculateMoM(100, null).formatted).toBe('N/A');
    expect(calculateMoM(100, 0).formatted).toBe('N/A');
  });

  it('formats Indian currency and percentages cleanly', () => {
    expect(formatIndianCurrency(15000000)).toBe('₹1.5 Cr');
    expect(formatIndianCurrency(2180000)).toBe('₹21.8 L');
    expect(formatIndianCurrency(-2180000)).toBe('-₹21.8 L');
    expect(formatPercent(42.5)).toBe('42.5%');
    expect(formatPercent(-15.2)).toBe('-15.2%');
  });

  it('builds structured metrics block with right periods, values, MoM % and negative case', () => {
    const fakeRows: MetricContextRow[] = [
      {
        companyId: 'comp-1',
        companyName: 'NOTO',
        documentId: 'doc-1',
        filename: 'Noto_MIS_June_2025.xlsx',
        metricKey: 'revenue',
        value: 13500000,
        unit: 'currency',
        reportingPeriod: '2025-05',
        sourceReference: "Sheet 'P&L', Row 5",
      },
      {
        companyId: 'comp-1',
        companyName: 'NOTO',
        documentId: 'doc-2',
        filename: 'Noto_MIS_June_2025.xlsx',
        metricKey: 'revenue',
        value: 15000000,
        unit: 'currency',
        reportingPeriod: '2025-06',
        sourceReference: "Sheet 'P&L', Row 5",
      },
      {
        companyId: 'comp-1',
        companyName: 'NOTO',
        documentId: 'doc-1',
        filename: 'Noto_MIS_June_2025.xlsx',
        metricKey: 'burn',
        value: -2500000,
        unit: 'currency',
        reportingPeriod: '2025-05',
        sourceReference: "Sheet 'Cash Flow', Row 12",
      },
      {
        companyId: 'comp-1',
        companyName: 'NOTO',
        documentId: 'doc-2',
        filename: 'Noto_MIS_June_2025.xlsx',
        metricKey: 'burn',
        value: -2000000, // Negative burn improved from -25L to -20L (+20.0% MoM)
        unit: 'currency',
        reportingPeriod: '2025-06',
        sourceReference: "Sheet 'Cash Flow', Row 12",
      },
    ];

    const context = buildStructuredMetricsContext({
      rows: fakeRows,
      singleCompany: true,
    });

    expect(context).toContain('STRUCTURED METRICS:');
    expect(context).toContain('Company: NOTO');

    // Periods
    expect(context).toContain('2025-06');
    expect(context).toContain('2025-05');

    // Values formatted in INR
    expect(context).toContain('₹1.5 Cr');
    expect(context).toContain('₹1.35 Cr');

    // Revenue MoM change: (150L - 135L) / 135L * 100 = +11.1%
    expect(context).toContain('+11.1%');

    // Negative burn value case: -20L vs -25L
    expect(context).toContain('-₹20 L');
    expect(context).toContain('-₹25 L');
    // MoM change: (-20 - (-25)) / |-25| = +5 / 25 = +20.0%
    expect(context).toContain('+20.0%');

    // Source reference
    expect(context).toContain("Sheet 'P&L', Row 5");
    expect(context).toContain("Sheet 'Cash Flow', Row 12");
  });

  it('builds portfolio ranking block across multiple companies', () => {
    const fakeRows: MetricContextRow[] = [
      {
        companyId: 'comp-1',
        companyName: 'NOTO',
        metricKey: 'burn',
        value: -2000000,
        unit: 'currency',
        reportingPeriod: '2025-06',
        sourceReference: "Sheet 'Cash Flow', Row 10",
      },
      {
        companyId: 'comp-2',
        companyName: 'Jar',
        metricKey: 'burn',
        value: -5000000,
        unit: 'currency',
        reportingPeriod: '2025-06',
        sourceReference: "Sheet 'Summary', Row 8",
      },
    ];

    const rankingContext = buildStructuredMetricsContext({
      rows: fakeRows,
      isRanking: true,
    });

    expect(rankingContext).toContain('STRUCTURED METRICS:');
    expect(rankingContext).toContain('Portfolio Ranking for Metric: burn');
    expect(rankingContext).toContain('Jar');
    expect(rankingContext).toContain('NOTO');
    expect(rankingContext).toContain('-₹50 L');
    expect(rankingContext).toContain('-₹20 L');
  });
});

describe('Conversation History & Prompt Source Invariants', () => {
  it('enforces 6-message window and truncates long assistant responses', () => {
    const longMessage = 'A'.repeat(1600);
    const messages = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Answer 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Answer 2' },
      { role: 'user', content: 'Message 3' },
      { role: 'assistant', content: 'Answer 3' },
      { role: 'user', content: 'Message 4' },
      { role: 'assistant', content: longMessage },
    ];

    const formatted = formatConversationHistory(messages);

    // Only last 6 messages should be present
    expect(formatted).not.toContain('Message 1');
    expect(formatted).not.toContain('Answer 1');
    expect(formatted).toContain('Message 2');
    expect(formatted).toContain('Message 3');
    expect(formatted).toContain('Message 4');

    // Assistant message truncated to ~1200 chars
    expect(formatted).toContain('... [truncated]');
    expect(formatted).not.toContain('A'.repeat(1500));
  });

  it('guarantees that conversation history is explicitly forbidden as a source of numbers in the prompt', () => {
    const { systemPrompt } = buildHybridRAGPrompt({
      historyMessages: [
        { role: 'user', content: 'What was the burn?' },
        { role: 'assistant', content: 'Burn was ₹25 Lakhs.' },
      ],
      structuredContext: 'STRUCTURED METRICS:\nCompany: NOTO\n- Latest: ₹20 L',
    });

    // History block exists
    expect(systemPrompt).toContain('Conversation so far:');
    expect(systemPrompt).toContain('What was the burn?');

    // Allowed source invariant: numbers may ONLY come from retrieved context/metrics, NOT from conversation history
    expect(systemPrompt).toContain(
      'Numbers may ONLY come from retrieved context/metrics, not from conversation history'
    );
    expect(systemPrompt).toContain(
      'Never treat previous conversation messages as an allowed source of truth for financial numbers'
    );
  });
});
