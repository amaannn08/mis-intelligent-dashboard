import { describe, it, expect } from 'vitest';
import {
  computeBurnEbitdaSeries,
  formatShortPeriod,
  parseCompanySlugs,
  type CompanyPeriodRow,
} from '../packages/core/src/index.js';

describe('Reconciliation Tests: computeBurnEbitdaSeries', () => {
  // Fixture: 3 companies across 4 reporting periods
  // Noto: Growth company with ramping revenue and turning EBITDA profitable
  // Jar: High revenue company with high burn
  // PreRevCo: Seed stage pre-revenue company (no revenue in 2025-01, starts in 2025-02, ceases in 2025-04)
  const fixtureRows: CompanyPeriodRow[] = [
    // --- 2025-01 ---
    // Noto: Rev = 10,000,000 (1 Cr), EBITDA = 1,000,000 (10L), Burn = 1,500,000 (15L)
    { companyId: 'noto', companyName: 'Noto', reportingPeriod: '2025-01', revenue: 10_000_000, ebitda: 1_000_000, burn: 1_500_000 },
    // Jar: Rev = 20,000,000 (2 Cr), EBITDA = -2,000,000 (-20L), Burn = 3,000,000 (30L)
    { companyId: 'jar', companyName: 'Jar', reportingPeriod: '2025-01', revenue: 20_000_000, ebitda: -2_000_000, burn: 3_000_000 },
    // PreRevCo: Rev = 0 (pre-revenue!), EBITDA = -500,000 (-5L), Burn = 500,000 (5L) -> MUST BE EXCLUDED!
    { companyId: 'prerev', companyName: 'PreRevCo', reportingPeriod: '2025-01', revenue: 0, ebitda: -500_000, burn: 500_000 },

    // --- 2025-02 ---
    // All 3 companies report positive revenue
    { companyId: 'noto', companyName: 'Noto', reportingPeriod: '2025-02', revenue: 12_000_000, ebitda: 1_500_000, burn: 1_200_000 },
    { companyId: 'jar', companyName: 'Jar', reportingPeriod: '2025-02', revenue: 25_000_000, ebitda: -1_000_000, burn: 2_500_000 },
    { companyId: 'prerev', companyName: 'PreRevCo', reportingPeriod: '2025-02', revenue: 5_000_000, ebitda: -1_500_000, burn: 2_000_000 },

    // --- 2025-03 ---
    // Noto and Jar report; PreRevCo has no filing / null revenue
    { companyId: 'noto', companyName: 'Noto', reportingPeriod: '2025-03', revenue: 15_000_000, ebitda: 2_000_000, burn: 1_000_000 },
    { companyId: 'jar', companyName: 'Jar', reportingPeriod: '2025-03', revenue: 30_000_000, ebitda: 500_000, burn: 1_500_000 },
    { companyId: 'prerev', companyName: 'PreRevCo', reportingPeriod: '2025-03', revenue: null, ebitda: -300_000, burn: 300_000 },

    // --- 2025-04 ---
    // All 3 companies report
    { companyId: 'noto', companyName: 'Noto', reportingPeriod: '2025-04', revenue: 18_000_000, ebitda: 3_000_000, burn: 800_000 },
    { companyId: 'jar', companyName: 'Jar', reportingPeriod: '2025-04', revenue: 35_000_000, ebitda: 2_000_000, burn: 1_000_000 },
    { companyId: 'prerev', companyName: 'PreRevCo', reportingPeriod: '2025-04', revenue: 7_000_000, ebitda: -500_000, burn: 1_200_000 },
  ];

  it('reconciles EBITDA margin strictly to the ratio of sums (Σ EBITDA ÷ Σ Revenue × 100)', () => {
    const series = computeBurnEbitdaSeries(fixtureRows);
    expect(series.length).toBe(4);

    // Check Month 1 (2025-01):
    // Eligible companies: Noto (10L ebitda on 100L rev) + Jar (-20L ebitda on 200L rev)
    // PreRevCo has revenue = 0, so it MUST be excluded.
    // Sum Revenue = 10,000,000 + 20,000,000 = 30,000,000
    // Sum EBITDA = 1,000,000 + (-2,000,000) = -1,000,000
    // Expected EBITDA Margin % = (-1,000,000 / 30,000,000) * 100 = -3.3333...% -> -3.33%
    const p1 = series.find((s) => s.period === '2025-01')!;
    expect(p1.sumRevenue).toBe(30_000_000);
    expect(p1.sumEbitda).toBe(-1_000_000);
    expect(p1.ebitdaMarginPct).toBe(-3.33);
    expect(p1.contributingCompaniesCount).toBe(2);

    // Check Month 2 (2025-02):
    // Eligible companies: All 3 (Noto: 120L rev, Jar: 250L rev, PreRevCo: 50L rev)
    // Sum Revenue = 12M + 25M + 5M = 42,000,000
    // Sum EBITDA = 1.5M + (-1.0M) + (-1.5M) = -1,000,000
    // Expected Margin % = (-1,000,000 / 42,000,000) * 100 = -2.3809...% -> -2.38%
    const p2 = series.find((s) => s.period === '2025-02')!;
    expect(p2.sumRevenue).toBe(42_000_000);
    expect(p2.sumEbitda).toBe(-1_000_000);
    expect(p2.ebitdaMarginPct).toBe(-2.38);
    expect(p2.contributingCompaniesCount).toBe(3);

    // Check Month 3 (2025-03):
    // Eligible companies: Noto (15M rev, 2M ebitda) + Jar (30M rev, 0.5M ebitda). PreRevCo revenue is null -> EXCLUDED.
    // Sum Revenue = 15M + 30M = 45,000,000
    // Sum EBITDA = 2M + 0.5M = 2,500,000
    // Expected Margin % = (2,500,000 / 45,000,000) * 100 = 5.5555...% -> 5.56%
    const p3 = series.find((s) => s.period === '2025-03')!;
    expect(p3.sumRevenue).toBe(45_000_000);
    expect(p3.sumEbitda).toBe(2_500_000);
    expect(p3.ebitdaMarginPct).toBe(5.56);
    expect(p3.contributingCompaniesCount).toBe(2);

    // Check Month 4 (2025-04):
    // Sum Revenue = 18M + 35M + 7M = 60,000,000
    // Sum EBITDA = 3M + 2M + (-0.5M) = 4,500,000
    // Expected Margin % = (4,500,000 / 60,000,000) * 100 = 7.5%
    const p4 = series.find((s) => s.period === '2025-04')!;
    expect(p4.sumRevenue).toBe(60_000_000);
    expect(p4.sumEbitda).toBe(4_500_000);
    expect(p4.ebitdaMarginPct).toBe(7.5);
    expect(p4.contributingCompaniesCount).toBe(3);
  });

  it('proves that ratio of sums is NOT equal to the average of company percentages (counter-example)', () => {
    const series = computeBurnEbitdaSeries(fixtureRows);
    const p1 = series.find((s) => s.period === '2025-01')!;

    // Noto individual margin: 1,000,000 / 10,000,000 = +10.0%
    // Jar individual margin: -2,000,000 / 20,000,000 = -10.0%
    // Unweighted average of percentages: (10.0% + (-10.0%)) / 2 = 0.00%
    // Real ratio of sums: -3.33%
    const unweightedAverage = ((1_000_000 / 10_000_000) + (-2_000_000 / 20_000_000)) / 2 * 100;
    expect(unweightedAverage).toBe(0);
    expect(p1.ebitdaMarginPct).not.toBe(unweightedAverage);
    expect(p1.ebitdaMarginPct).toBe(-3.33);

    // Extreme scale counter-example from the approved plan:
    // Company A: ₹10k revenue, ₹8k EBITDA (+80% margin)
    // Company B: ₹10 Cr revenue, ₹50 L EBITDA (+5% margin)
    // Average of percentages: (80 + 5) / 2 = 42.5% (absurdly distorted)
    // Ratio of sums: (50.08L / 10.001Cr) * 100 = 5.007%
    const extremeScaleRows: CompanyPeriodRow[] = [
      { companyId: 'seed', reportingPeriod: '2025-05', revenue: 10_000, ebitda: 8_000, burn: 2_000 },
      { companyId: 'growth', reportingPeriod: '2025-05', revenue: 100_000_000, ebitda: 5_000_000, burn: 10_000_000 },
    ];
    const extremeSeries = computeBurnEbitdaSeries(extremeScaleRows);
    expect(extremeSeries[0]!.ebitdaMarginPct).toBe(5.01);
    const distortedAvg = (80 + 5) / 2;
    expect(extremeSeries[0]!.ebitdaMarginPct).not.toBe(distortedAvg);
  });

  it('reconciles burn as % of revenue (negative) to -(Σ Burn ÷ Σ Revenue × 100)', () => {
    const series = computeBurnEbitdaSeries(fixtureRows);

    // Month 1 (2025-01):
    // Noto burn = 1.5M, Jar burn = 3.0M. PreRevCo excluded.
    // Sum Burn = 4,500,000. Sum Revenue = 30,000,000.
    // Expected Burn % = -(4,500,000 / 30,000,000) * 100 = -15.00%
    const p1 = series.find((s) => s.period === '2025-01')!;
    expect(p1.sumBurn).toBe(4_500_000);
    expect(p1.burnPct).toBe(-15.0);
    expect(p1.burnPct).toBeLessThan(0);

    // Month 2 (2025-02):
    // Noto burn = 1.2M, Jar burn = 2.5M, PreRevCo burn = 2.0M.
    // Sum Burn = 5,700,000. Sum Revenue = 42,000,000.
    // Expected Burn % = -(5,700,000 / 42,000,000) * 100 = -13.5714...% -> -13.57%
    const p2 = series.find((s) => s.period === '2025-02')!;
    expect(p2.sumBurn).toBe(5_700_000);
    expect(p2.burnPct).toBe(-13.57);

    // Month 3 (2025-03):
    // Sum Burn = 1.0M + 1.5M = 2,500,000. Sum Revenue = 45,000,000.
    // Expected Burn % = -(2,500,000 / 45,000,000) * 100 = -5.5555...% -> -5.56%
    const p3 = series.find((s) => s.period === '2025-03')!;
    expect(p3.sumBurn).toBe(2_500_000);
    expect(p3.burnPct).toBe(-5.56);
  });

  it('pins sign convention: fixture where EBITDA is a loss and burn is an outflow must produce two negative values', () => {
    // Binding Addition 6: EBITDA is a loss (-2M on 10M rev) and burn is an outflow (1.5M on 10M rev)
    // Must produce two negative values sharing the same sign convention relative to zero baseline.
    const lossOutflowRows: CompanyPeriodRow[] = [
      { companyId: 'loss_co', reportingPeriod: '2025-01', revenue: 10_000_000, ebitda: -2_000_000, burn: 1_500_000 },
    ];
    const points = computeBurnEbitdaSeries(lossOutflowRows);
    expect(points.length).toBe(1);
    const p = points[0]!;
    expect(p.ebitdaMarginPct).toBe(-20.0);
    expect(p.burnPct).toBe(-15.0);
    expect(p.ebitdaMarginPct).toBeLessThan(0);
    expect(p.burnPct).toBeLessThan(0);
  });

  it('reduces the aggregate exactly to the selected subset when company filtering is applied', () => {
    // Filter to only 'noto'
    const notoSeries = computeBurnEbitdaSeries(fixtureRows, ['noto']);
    expect(notoSeries.length).toBe(4);

    // 2025-01: Noto only
    expect(notoSeries[0]!.sumRevenue).toBe(10_000_000);
    expect(notoSeries[0]!.sumEbitda).toBe(1_000_000);
    expect(notoSeries[0]!.ebitdaMarginPct).toBe(10.0);
    expect(notoSeries[0]!.burnPct).toBe(-15.0);
    expect(notoSeries[0]!.contributingCompaniesCount).toBe(1);

    // 2025-04: Noto only (3M ebitda on 18M rev = 16.67%)
    expect(notoSeries[3]!.sumRevenue).toBe(18_000_000);
    expect(notoSeries[3]!.sumEbitda).toBe(3_000_000);
    expect(notoSeries[3]!.ebitdaMarginPct).toBe(16.67);
    expect(notoSeries[3]!.burnPct).toBe(-4.44); // -(800k / 18M) * 100 = -4.44%

    // Filter to 'jar' and 'prerev'
    const pairSeries = computeBurnEbitdaSeries(fixtureRows, ['jar', 'prerev']);
    // In 2025-01, prerev has revenue 0, so only jar contributes:
    expect(pairSeries[0]!.sumRevenue).toBe(20_000_000);
    expect(pairSeries[0]!.sumEbitda).toBe(-2_000_000);
    expect(pairSeries[0]!.ebitdaMarginPct).toBe(-10.0);
    expect(pairSeries[0]!.contributingCompaniesCount).toBe(1);

    // In 2025-02, both jar (25M rev, -1M ebitda) and prerev (5M rev, -1.5M ebitda) contribute:
    // Sum Rev = 30M, Sum EBITDA = -2.5M -> Margin = -8.33%
    expect(pairSeries[1]!.sumRevenue).toBe(30_000_000);
    expect(pairSeries[1]!.sumEbitda).toBe(-2_500_000);
    expect(pairSeries[1]!.ebitdaMarginPct).toBe(-8.33);
    expect(pairSeries[1]!.contributingCompaniesCount).toBe(2);
  });

  it('handles negative burn representations gracefully without breaking the negative sign', () => {
    // If an MIS enters burn as -1500000 instead of +1500000
    const negativeBurnRows: CompanyPeriodRow[] = [
      { companyId: 'noto', reportingPeriod: '2025-01', revenue: 10_000_000, ebitda: 1_000_000, burn: -1_500_000 },
    ];
    const series = computeBurnEbitdaSeries(negativeBurnRows);
    expect(series[0]!.burnPct).toBe(-15.0);
    expect(series[0]!.sumBurn).toBe(1_500_000);
  });

  it('formats short periods correctly (formatShortPeriod)', () => {
    expect(formatShortPeriod('2025-01')).toBe("Jan'25");
    expect(formatShortPeriod('2025-06')).toBe("Jun'25");
    expect(formatShortPeriod('2025-09')).toBe("Sep'25");
    expect(formatShortPeriod('2025-12')).toBe("Dec'25");
    expect(formatShortPeriod('')).toBe('');
  });

  it('returns empty array when rows are empty or all revenues are zero/null', () => {
    expect(computeBurnEbitdaSeries([])).toEqual([]);
    const allZeroRev: CompanyPeriodRow[] = [
      { companyId: 'c1', reportingPeriod: '2025-01', revenue: 0, ebitda: -100_000, burn: 100_000 },
      { companyId: 'c2', reportingPeriod: '2025-01', revenue: null, ebitda: -50_000, burn: 50_000 },
    ];
    expect(computeBurnEbitdaSeries(allZeroRev)).toEqual([]);
  });

  describe('URL search params parsing: parseCompanySlugs', () => {
    const knownSlugs = ['noto', 'jar', 'blusmart', 'animall'];

    it('returns all known slugs when parameter is empty, null, undefined, whitespace, or "all"', () => {
      expect(parseCompanySlugs('', knownSlugs)).toEqual(knownSlugs);
      expect(parseCompanySlugs(null, knownSlugs)).toEqual(knownSlugs);
      expect(parseCompanySlugs(undefined, knownSlugs)).toEqual(knownSlugs);
      expect(parseCompanySlugs('   ', knownSlugs)).toEqual(knownSlugs);
      expect(parseCompanySlugs('all', knownSlugs)).toEqual(knownSlugs);
      expect(parseCompanySlugs('ALL', knownSlugs)).toEqual(knownSlugs);
    });

    it('returns empty array when parameter is "none"', () => {
      expect(parseCompanySlugs('none', knownSlugs)).toEqual([]);
      expect(parseCompanySlugs('NONE', knownSlugs)).toEqual([]);
    });

    it('safely ignores unknown slugs not in known company list', () => {
      expect(parseCompanySlugs('noto,unknown_corp,fake_startup', knownSlugs)).toEqual(['noto']);
      expect(parseCompanySlugs('fake1,fake2', knownSlugs)).toEqual([]);
    });

    it('deduplicates duplicate slugs', () => {
      expect(parseCompanySlugs('noto,jar,noto,jar,noto', knownSlugs)).toEqual(['noto', 'jar']);
    });

    it('handles case-insensitivity and preserves canonical casing', () => {
      expect(parseCompanySlugs('NOTO,Jar,Blue_Unknown', knownSlugs)).toEqual(['noto', 'jar']);
    });
  });
});
