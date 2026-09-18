/**
 * Pure calculation engine for portfolio-level and company-level Burn & EBITDA-% Month-over-Month metrics.
 *
 * Invariant: At portfolio level, all percentages are computed strictly as the ratio of sums
 * (Σ EBITDA ÷ Σ Revenue × 100), NEVER as an unweighted average of company percentages.
 * Any company with zero or missing revenue in a given month is completely excluded from that
 * month's ratio calculation.
 *
 * Worked counter-example proving why ratio of sums is mandatory:
 * - Company A (Seed testing): ₹10k revenue, ₹8k EBITDA -> +80% margin
 * - Company B (Growth operations): ₹10 Cr revenue, ₹50 L EBITDA -> +5% margin
 * - Unweighted average of percentages: (80% + 5%) / 2 = 42.5% (meaningless & distortive)
 * - Ratio of sums: (₹50.08 L ÷ ₹10.001 Cr) × 100 = 5.007% (true fund-level operational performance).
 *
 * Sign convention: Both series share the same sign convention relative to zero.
 * - EBITDA Margin % is positive when profitable (> 0) and negative when loss-making (< 0).
 * - Burn is an outflow, so Net Burn % is plotted as a negative percentage: −(Σ |Burn| ÷ Σ Revenue × 100).
 * - The zero line (0%) represents the operational break-even baseline. A loss-making burning company
 *   produces two negative values below the zero line.
 */

export interface CompanyPeriodRow {
  companyId: string;
  companyName?: string;
  reportingPeriod: string; // 'YYYY-MM'
  revenue: number | null;
  ebitda: number | null;
  burn: number | null;
}

export interface BurnEbitdaPoint {
  period: string;             // 'YYYY-MM'
  formattedPeriod: string;    // "Jun'25"
  ebitdaMarginPct: number;    // e.g. 14.5
  burnPct: number;            // e.g. -18.2 (strictly negative or 0)
  sumRevenue: number;         // raw ₹ sum for tooltips and verification
  sumEbitda: number;          // raw ₹ sum for tooltips and verification
  sumBurn: number;            // raw ₹ sum for tooltips and verification
  contributingCompaniesCount: number;
}

const MONTH_SHORT_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatShortPeriod(period: string): string {
  if (!period) return '';
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match || !match[1] || !match[2]) return period;

  const yearShort = match[1].slice(-2);
  const monthIdx = parseInt(match[2], 10) - 1;
  const monthName = MONTH_SHORT_NAMES[monthIdx] || match[2];

  return `${monthName}'${yearShort}`;
}

/**
 * Server-side URL search parameter parser for company filters (?companies=noto,jar).
 * - Empty, null, undefined, or 'all' defaults to all known company slugs.
 * - 'none' returns an empty array.
 * - Unknown slugs are safely ignored (validated against allKnownSlugs).
 * - Duplicate slugs are deduped.
 */
export function parseCompanySlugs(
  param: string | null | undefined,
  allKnownSlugs: string[]
): string[] {
  if (!param || param.trim() === '' || param.trim().toLowerCase() === 'all') {
    return allKnownSlugs;
  }
  if (param.trim().toLowerCase() === 'none') {
    return [];
  }

  const knownMap = new Map<string, string>();
  for (const slug of allKnownSlugs) {
    knownMap.set(slug.toLowerCase(), slug);
  }

  const requestedParts = param
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const part of requestedParts) {
    const canonicalSlug = knownMap.get(part);
    if (canonicalSlug && !seen.has(canonicalSlug)) {
      seen.add(canonicalSlug);
      deduped.push(canonicalSlug);
    }
  }

  return deduped;
}

export function computeBurnEbitdaSeries(
  rows: CompanyPeriodRow[],
  selectedCompanyIds?: string[]
): BurnEbitdaPoint[] {
  if (!rows || rows.length === 0) {
    return [];
  }

  // 1. Filter rows by selected company IDs if provided
  let filteredRows = rows;
  if (selectedCompanyIds && selectedCompanyIds.length > 0) {
    const allowed = new Set(selectedCompanyIds);
    filteredRows = rows.filter((r) => allowed.has(r.companyId));
  }

  if (filteredRows.length === 0) {
    return [];
  }

  // 2. Group rows by reporting period
  const periodMap = new Map<string, CompanyPeriodRow[]>();
  for (const row of filteredRows) {
    if (!row.reportingPeriod) continue;
    const list = periodMap.get(row.reportingPeriod);
    if (list) {
      list.push(row);
    } else {
      periodMap.set(row.reportingPeriod, [row]);
    }
  }

  const results: BurnEbitdaPoint[] = [];

  // 3. For each period, compute ratio of sums across revenue-positive companies
  for (const [period, periodRows] of periodMap.entries()) {
    // Exclusion rule: A company with no revenue or revenue <= 0 is excluded from that month's ratio
    const eligibleRows = periodRows.filter(
      (r) => r.revenue !== null && r.revenue !== undefined && !isNaN(r.revenue) && r.revenue > 0
    );

    if (eligibleRows.length === 0) {
      // No companies have positive revenue in this period; cannot compute valid margin
      continue;
    }

    let sumRevenue = 0;
    let sumEbitda = 0;
    let sumBurn = 0;

    for (const r of eligibleRows) {
      sumRevenue += Number(r.revenue);
      if (r.ebitda !== null && r.ebitda !== undefined && !isNaN(Number(r.ebitda))) {
        sumEbitda += Number(r.ebitda);
      }
      if (r.burn !== null && r.burn !== undefined && !isNaN(Number(r.burn))) {
        // Burn is cash outflow; standardize to absolute magnitude of outflow
        sumBurn += Math.abs(Number(r.burn));
      }
    }

    if (sumRevenue <= 0) {
      continue;
    }

    // Ratio of sums: (Σ EBITDA ÷ Σ Revenue × 100)
    const rawEbitdaMargin = (sumEbitda / sumRevenue) * 100;
    // Burn as % of revenue: -(Σ |Burn| ÷ Σ Revenue × 100)
    const rawBurnPct = sumBurn > 0 ? -((sumBurn / sumRevenue) * 100) : 0;

    results.push({
      period,
      formattedPeriod: formatShortPeriod(period),
      ebitdaMarginPct: Math.round(rawEbitdaMargin * 100) / 100,
      burnPct: Math.round(rawBurnPct * 100) / 100,
      sumRevenue,
      sumEbitda,
      sumBurn,
      contributingCompaniesCount: eligibleRows.length,
    });
  }

  // 4. Sort strictly ascending chronologically
  results.sort((a, b) => a.period.localeCompare(b.period));

  return results;
}
