import { describe, it, expect } from 'vitest';
import {
  buildChartPayload,
  type MetricContextRow,
} from '../packages/core/src/index.js';

describe('Chart Builder: buildChartPayload', () => {
  const sampleRevenueRows: MetricContextRow[] = [
    { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 10000000, unit: 'currency', reportingPeriod: '2025-01', sourceReference: 'P&L' },
    { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 12000000, unit: 'currency', reportingPeriod: '2025-02', sourceReference: 'P&L' },
    { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 14000000, unit: 'currency', reportingPeriod: '2025-03', sourceReference: 'P&L' },
    { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 16000000, unit: 'currency', reportingPeriod: '2025-04', sourceReference: 'P&L' },
    { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 18000000, unit: 'currency', reportingPeriod: '2025-05', sourceReference: 'P&L' },
    { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 20000000, unit: 'currency', reportingPeriod: '2025-06', sourceReference: 'P&L' },
    { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 22000000, unit: 'currency', reportingPeriod: '2025-07', sourceReference: 'P&L' },
    { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 24000000, unit: 'currency', reportingPeriod: '2025-08', sourceReference: 'P&L' },
    { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 26000000, unit: 'currency', reportingPeriod: '2025-09', sourceReference: 'P&L' },
    { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 28000000, unit: 'currency', reportingPeriod: '2025-10', sourceReference: 'P&L' },
  ];

  it('defaults to the most recent 6 periods in ascending chronological order', () => {
    const payload = buildChartPayload({
      structuredRows: sampleRevenueRows,
      targetCompanyId: 'c1',
      question: 'How is Noto revenue?',
    });

    expect(payload.charts.length).toBe(1);
    const revChart = payload.charts[0]!;
    expect(revChart.metricKey).toBe('revenue');
    expect(revChart.label).toBe('Net Revenue');
    expect(revChart.unit).toBe('currency');
    expect(revChart.series.length).toBe(1);

    const points = revChart.series[0]!.points;
    expect(points.length).toBe(6);
    expect(points[0]!.period).toBe('2025-05');
    expect(points[0]!.value).toBe(18000000);
    expect(points[5]!.period).toBe('2025-10');
    expect(points[5]!.value).toBe(28000000);
  });

  it('detects explicit full-history requests ("all", "entire history") and returns all periods', () => {
    const payload = buildChartPayload({
      structuredRows: sampleRevenueRows,
      targetCompanyId: 'c1',
      question: 'Show all periods for Noto revenue',
    });

    expect(payload.charts.length).toBe(1);
    const points = payload.charts[0]!.series[0]!.points;
    expect(points.length).toBe(10);
    expect(points[0]!.period).toBe('2025-01');
    expect(points[9]!.period).toBe('2025-10');
  });

  it('detects explicit period counts like "past 4 months"', () => {
    const payload = buildChartPayload({
      structuredRows: sampleRevenueRows,
      targetCompanyId: 'c1',
      question: 'Show revenue for the past 4 months',
    });

    const points = payload.charts[0]!.series[0]!.points;
    expect(points.length).toBe(4);
    expect(points[0]!.period).toBe('2025-07');
    expect(points[3]!.period).toBe('2025-10');
  });

  it('builds separately scaled charts for company queries with multiple metrics', () => {
    const multiMetricRows: MetricContextRow[] = [
      ...sampleRevenueRows.slice(-3), // 2025-08, 09, 10
      { companyId: 'c1', companyName: 'Noto', metricKey: 'ebitda', value: -4000000, unit: 'currency', reportingPeriod: '2025-08', sourceReference: 'P&L' },
      { companyId: 'c1', companyName: 'Noto', metricKey: 'ebitda', value: -1500000, unit: 'currency', reportingPeriod: '2025-09', sourceReference: 'P&L' },
      { companyId: 'c1', companyName: 'Noto', metricKey: 'ebitda', value: 800000, unit: 'currency', reportingPeriod: '2025-10', sourceReference: 'P&L' },
    ];

    const payload = buildChartPayload({
      structuredRows: multiMetricRows,
      metricKeys: ['revenue', 'ebitda'],
      targetCompanyId: 'c1',
      question: 'How is the monthly revenue and ebitda burn?',
    });

    expect(payload.charts.length).toBe(2);

    const [revChart, ebitdaChart] = payload.charts;
    expect(revChart!.metricKey).toBe('revenue');
    expect(ebitdaChart!.metricKey).toBe('ebitda');

    // Revenue chart values in tens of millions
    expect(revChart!.series[0]!.points[0]!.value).toBe(24000000);

    // EBITDA chart values preserving negative burn
    const ebitdaPoints = ebitdaChart!.series[0]!.points;
    expect(ebitdaPoints[0]!.value).toBe(-4000000);
    expect(ebitdaPoints[1]!.value).toBe(-1500000);
    expect(ebitdaPoints[2]!.value).toBe(800000);
  });

  it('groups portfolio comparison queries into 1 chart per metric, capped at 5 companies', () => {
    const portfolioRows: MetricContextRow[] = [];
    const compNames = ['Noto', 'Epigamia', 'Jar', 'DrinkPrime', 'AppsForBharat', 'Klub', 'BiteSpeed'];

    compNames.forEach((name, i) => {
      portfolioRows.push({
        companyId: `c-${i}`,
        companyName: name,
        metricKey: 'revenue',
        value: (i + 1) * 1000000,
        unit: 'currency',
        reportingPeriod: '2025-06',
        sourceReference: 'Filing',
      });
    });

    const payload = buildChartPayload({
      structuredRows: portfolioRows,
      metricKeys: ['revenue'],
      targetCompanyId: null,
      detectedCompanyNames: [],
      question: 'Compare revenue across the portfolio',
    });

    expect(payload.charts.length).toBe(1);
    const chart = payload.charts[0]!;
    expect(chart.metricKey).toBe('revenue');
    // Capped at 5 companies
    expect(chart.series.length).toBe(5);

    // Top company should be BiteSpeed with highest value
    expect(chart.series[0]!.companyName).toBe('BiteSpeed');
    expect(chart.series[0]!.points[0]!.value).toBe(7000000);
    expect(chart.series[4]!.companyName).toBe('Jar');
  });

  it('omits metrics that have 0 rows and returns empty charts if no data exists', () => {
    const payloadEmpty = buildChartPayload({
      structuredRows: [],
      question: 'Revenue for unknown company',
    });
    expect(payloadEmpty.charts).toEqual([]);

    const payloadMissingMetric = buildChartPayload({
      structuredRows: sampleRevenueRows,
      metricKeys: ['gross_margin'], // not present in sampleRevenueRows
      question: 'What is gross margin?',
    });
    expect(payloadMissingMetric.charts).toEqual([]);
  });

  it('anti-hallucination invariant: strictly guarantees no chart point exists that is not in input rows', () => {
    const payload = buildChartPayload({
      structuredRows: sampleRevenueRows,
      targetCompanyId: 'c1',
      question: 'Show all revenue',
    });

    const inputPointsSet = new Set(
      sampleRevenueRows.map((r) => `${r.reportingPeriod}::${r.value}`)
    );

    for (const chart of payload.charts) {
      for (const series of chart.series) {
        for (const pt of series.points) {
          expect(inputPointsSet.has(`${pt.period}::${pt.value}`)).toBe(true);
        }
      }
    }
  });

  it('scope resolution (Binding Addition 4): never attaches a chart for a company not in scope', () => {
    const multiCompanyRows: MetricContextRow[] = [
      ...sampleRevenueRows,
      { companyId: 'c2', companyName: 'OtherCo', metricKey: 'revenue', value: 99999999, unit: 'currency', reportingPeriod: '2025-10', sourceReference: 'P&L' },
      { companyId: 'c3', companyName: 'ThirdCo', metricKey: 'ebitda', value: 5000000, unit: 'currency', reportingPeriod: '2025-10', sourceReference: 'P&L' },
    ];

    // Scoped to Noto via targetCompanyId
    const payloadTarget = buildChartPayload({
      structuredRows: multiCompanyRows,
      targetCompanyId: 'c1',
      metricKeys: ['revenue', 'ebitda'],
      question: 'Revenue and EBITDA for Noto',
    });

    // EBITDA has no rows for c1, so only revenue chart should exist
    expect(payloadTarget.charts.length).toBe(1);
    expect(payloadTarget.charts[0]!.metricKey).toBe('revenue');
    expect(payloadTarget.charts[0]!.series[0]!.companyName).toBe('Noto');
    expect(payloadTarget.charts[0]!.series[0]!.companyId).toBe('c1');

    // Scoped via detectedCompanyNames: ['Noto']
    const payloadDetected = buildChartPayload({
      structuredRows: multiCompanyRows,
      detectedCompanyNames: ['Noto'],
      metricKeys: ['revenue'],
      question: 'Noto revenue',
    });
    expect(payloadDetected.charts.length).toBe(1);
    expect(payloadDetected.charts[0]!.series[0]!.companyName).toBe('Noto');

    // Scope with no matching company returns empty charts
    const payloadUnknown = buildChartPayload({
      structuredRows: multiCompanyRows,
      targetCompanyId: 'non-existent-company-id',
      question: 'UnknownCo revenue',
    });
    expect(payloadUnknown.charts).toEqual([]);
  });

  it('numeric consistency guard (Binding Addition 5): last point strictly equals last input row value with no drift', () => {
    const mixedRows: MetricContextRow[] = [
      { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 12345678.91, unit: 'currency', reportingPeriod: '2025-01', sourceReference: 'P&L' },
      { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 23456789.12, unit: 'currency', reportingPeriod: '2025-02', sourceReference: 'P&L' },
      { companyId: 'c1', companyName: 'Noto', metricKey: 'revenue', value: 34567890.55, unit: 'currency', reportingPeriod: '2025-03', sourceReference: 'P&L' },
    ];

    const payload = buildChartPayload({
      structuredRows: mixedRows,
      targetCompanyId: 'c1',
      metricKeys: ['revenue'],
      question: 'Noto revenue',
    });

    expect(payload.charts.length).toBe(1);
    const series = payload.charts[0]!.series[0]!;
    const lastPoint = series.points[series.points.length - 1]!;

    // Last input row for this metric and company
    const expectedLastRow = mixedRows[mixedRows.length - 1]!;
    expect(lastPoint.period).toBe(expectedLastRow.reportingPeriod);
    expect(lastPoint.value).toBe(expectedLastRow.value);
    expect(lastPoint.value).toBe(34567890.55); // exact floating-point precision, no rounding drift
  });
});
