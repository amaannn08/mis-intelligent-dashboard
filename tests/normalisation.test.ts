import { describe, it, expect } from 'vitest';
import {
  matchMetricLabel,
  type MetricDefinitionLike,
} from '../packages/core/src/normalisation/aliases.js';
import {
  parseRawNumber,
  detectScale,
  normalizeNumericValue,
} from '../packages/core/src/normalisation/numbers.js';
import {
  parseReportingPeriod,
  extractYearFromContext,
} from '../packages/core/src/normalisation/periods.js';

describe('Normalisation: Metric Label & Alias Matching', () => {
  const definitions: MetricDefinitionLike[] = [
    {
      key: 'revenue',
      label: 'Revenue',
      unit: 'currency',
      aliases: ['Revenue', 'Net Revenue', 'Sales', 'Total Sales', 'Operating Revenue', 'Total Income', 'Turnover'],
    },
    {
      key: 'ebitda',
      label: 'EBITDA',
      unit: 'currency',
      aliases: ['EBITDA', 'Operating EBITDA', 'Earnings Before Interest Tax Depreciation'],
    },
    {
      key: 'gross_margin',
      label: 'Gross Margin',
      unit: 'percent',
      aliases: ['Gross Margin', 'Gross Margin %', 'GM %', 'GM Percentage', 'Gross Profit Margin %'],
    },
    {
      key: 'burn',
      label: 'Net Burn',
      unit: 'currency',
      aliases: ['Burn', 'Monthly Burn', 'Net Burn', 'Net Cash Burn', 'Cash Burn', 'Monthly Cash Burn'],
    },
    {
      key: 'run_rate',
      label: 'Run Rate',
      unit: 'currency',
      aliases: ['Run Rate', 'Annual Run Rate', 'ARR', 'Annualized Revenue'],
    },
  ];

  it('resolves standard labels to canonical metric keys', () => {
    expect(matchMetricLabel('Net Revenue', definitions)?.metricKey).toBe('revenue');
    expect(matchMetricLabel('Operating Revenue', definitions)?.metricKey).toBe('revenue');
    expect(matchMetricLabel('Total Sales', definitions)?.metricKey).toBe('revenue');
    expect(matchMetricLabel('Operating EBITDA', definitions)?.metricKey).toBe('ebitda');
    expect(matchMetricLabel('Net Cash Burn', definitions)?.metricKey).toBe('burn');
    expect(matchMetricLabel('Annual Run Rate', definitions)?.metricKey).toBe('run_rate');
    expect(matchMetricLabel('ARR', definitions)?.metricKey).toBe('run_rate');
  });

  it('strictly isolates percent metrics from absolute currency metrics', () => {
    // EBITDA % or EBITDA Margin must NOT match currency 'ebitda'
    expect(matchMetricLabel('EBITDA %', definitions)).toBeNull();
    expect(matchMetricLabel('EBITDA Margin', definitions)).toBeNull();
    expect(matchMetricLabel('EBITDA Margin %', definitions)).toBeNull();

    // Gross Profit (currency) must NOT match percent 'gross_margin'
    expect(matchMetricLabel('Gross Profit', definitions)).toBeNull();

    // Gross Margin % or GM % must match 'gross_margin'
    expect(matchMetricLabel('Gross Margin %', definitions)?.metricKey).toBe('gross_margin');
    expect(matchMetricLabel('GM %', definitions)?.metricKey).toBe('gross_margin');
    expect(matchMetricLabel('Gross Margin', definitions)?.metricKey).toBe('gross_margin');
  });

  it('returns null for unknown or unrelated labels', () => {
    expect(matchMetricLabel('Headcount', definitions)).toBeNull();
    expect(matchMetricLabel('Marketing Expenses', definitions)).toBeNull();
    expect(matchMetricLabel('', definitions)).toBeNull();
  });
});

describe('Normalisation: Number Parsing & Scale Detection', () => {
  it('parses parenthesised accounting negatives', () => {
    const res1 = parseRawNumber('(1,234.50)');
    expect(res1).not.toBeNull();
    expect(res1?.value).toBe(-1234.5);
    expect(res1?.isNegative).toBe(true);

    const res2 = parseRawNumber('( 45.0 )');
    expect(res2?.value).toBe(-45.0);
    expect(res2?.isNegative).toBe(true);
  });

  it('parses trailing and leading minus signs', () => {
    const resTrailing = parseRawNumber('1,234-');
    expect(resTrailing?.value).toBe(-1234);
    expect(resTrailing?.isNegative).toBe(true);

    const resLeading = parseRawNumber('-1,234.75');
    expect(resLeading?.value).toBe(-1234.75);
    expect(resLeading?.isNegative).toBe(true);
  });

  it('parses positive numbers with comma formats and currency symbols', () => {
    const res1 = parseRawNumber('₹1,23,456.78');
    expect(res1?.value).toBe(123456.78);
    expect(res1?.isNegative).toBe(false);

    const res2 = parseRawNumber('Rs. 50,000');
    expect(res2?.value).toBe(50000);

    const res3 = parseRawNumber('$ 1,500,000');
    expect(res3?.value).toBe(1500000);
  });

  it('detects scale multipliers: lakh, crore, million, thousand', () => {
    expect(detectScale('Revenue (in ₹ Lakhs)')).toEqual({
      multiplier: 100_000,
      scaleName: 'lakh',
    });
    expect(detectScale('Revenue (in Lacs)')).toEqual({
      multiplier: 100_000,
      scaleName: 'lakh',
    });
    expect(detectScale('(in L)')).toEqual({
      multiplier: 100_000,
      scaleName: 'lakh',
    });

    expect(detectScale('EBITDA (in ₹ Crores)')).toEqual({
      multiplier: 10_000_000,
      scaleName: 'crore',
    });
    expect(detectScale('in Cr')).toEqual({
      multiplier: 10_000_000,
      scaleName: 'crore',
    });

    expect(detectScale('Sales (in Millions)')).toEqual({
      multiplier: 1_000_000,
      scaleName: 'million',
    });
    expect(detectScale('(in Mn)')).toEqual({
      multiplier: 1_000_000,
      scaleName: 'million',
    });

    expect(detectScale('Expenses (in Thousands)')).toEqual({
      multiplier: 1_000,
      scaleName: 'thousand',
    });
    expect(detectScale('(in K)')).toEqual({
      multiplier: 1_000,
      scaleName: 'thousand',
    });

    expect(detectScale('Plain Numbers')).toEqual({
      multiplier: 1,
      scaleName: 'units',
    });
  });

  it('normalises numeric values according to target unit and scale context', () => {
    // Currency scaling from Lakhs
    const parsedLakh = parseRawNumber('150')!;
    const scaledLakh = normalizeNumericValue(parsedLakh, 'currency', 'in Lakhs');
    expect(scaledLakh).toBe(15000000);

    // Negative currency scaling from Lakhs
    const parsedNeg = parseRawNumber('(45.5)')!;
    const scaledNeg = normalizeNumericValue(parsedNeg, 'currency', 'in Lakhs');
    expect(scaledNeg).toBe(-4550000);

    // Currency scaling from Crores
    const parsedCr = parseRawNumber('2.5')!;
    const scaledCr = normalizeNumericValue(parsedCr, 'currency', 'in Crores');
    expect(scaledCr).toBe(25000000);

    // Percent normalization: decimal 0.425 -> 42.5
    const parsedDecimalPercent = parseRawNumber('0.425')!;
    expect(normalizeNumericValue(parsedDecimalPercent, 'percent')).toBe(42.5);

    // Explicit percent 42.5% -> 42.5
    const parsedExplicitPercent = parseRawNumber('42.5%')!;
    expect(normalizeNumericValue(parsedExplicitPercent, 'percent')).toBe(42.5);
  });
});

describe('Normalisation: Period Parsing', () => {
  it('parses standard ISO YYYY-MM format', () => {
    expect(parseReportingPeriod('2025-06')).toBe('2025-06');
    expect(parseReportingPeriod('2024-12')).toBe('2024-12');
  });

  it('parses month name variations with 2-digit and 4-digit years', () => {
    expect(parseReportingPeriod('Jun-25')).toBe('2025-06');
    expect(parseReportingPeriod("Jun '25")).toBe('2025-06');
    expect(parseReportingPeriod('June 2025')).toBe('2025-06');
    expect(parseReportingPeriod('Jun 2025')).toBe('2025-06');
    expect(parseReportingPeriod('Oct-24')).toBe('2024-10');
    expect(parseReportingPeriod('January 2025')).toBe('2025-01');
  });

  it('parses MM/YYYY or M/YYYY', () => {
    expect(parseReportingPeriod('06/2025')).toBe('2025-06');
    expect(parseReportingPeriod('6/2025')).toBe('2025-06');
    expect(parseReportingPeriod('12/2024')).toBe('2024-12');
  });

  it('parses Indian Financial Year Quarters (Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar)', () => {
    // Q1 FY26 ends in June 2025
    expect(parseReportingPeriod('Q1 FY26')).toBe('2025-06');
    expect(parseReportingPeriod('Q1-FY26')).toBe('2025-06');
    expect(parseReportingPeriod('Q1 FY2026')).toBe('2025-06');

    // Q2 FY26 ends in September 2025
    expect(parseReportingPeriod('Q2 FY26')).toBe('2025-09');

    // Q3 FY26 ends in December 2025
    expect(parseReportingPeriod('Q3 FY26')).toBe('2025-12');

    // Q4 FY26 ends in March 2026
    expect(parseReportingPeriod('Q4 FY26')).toBe('2026-03');

    // Full FY: FY25 ends in March 2025
    expect(parseReportingPeriod('FY25')).toBe('2025-03');
    expect(parseReportingPeriod('FY 2025')).toBe('2025-03');
  });

  it('parses single month names with context year', () => {
    expect(parseReportingPeriod('June', 2025)).toBe('2025-06');
    expect(parseReportingPeriod('December', 2024)).toBe('2024-12');
    expect(parseReportingPeriod('June')).toBeNull(); // No context year
  });

  it('extracts 4-digit year from context text or filenames', () => {
    expect(extractYearFromContext('Noto_MIS_June_2025.xlsx')).toBe(2025);
    expect(extractYearFromContext('Q3_Report_2024_Final.pdf')).toBe(2024);
    expect(extractYearFromContext('NoYearHere.xlsx')).toBeUndefined();
  });
});
