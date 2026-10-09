import Link from 'next/link';
import { db, companies, documents } from '@mis/db';
import { sql, eq, desc, and, inArray } from 'drizzle-orm';
import { AppShell } from '@/components/layout/app-shell';
import { PageShell } from '@/components/layout/page-shell';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { TrendChart, type ChartDataPoint } from '@/components/dashboard/trend-chart';
import { BurnEbitdaChart } from '@/components/dashboard/burn-ebitda-chart';
import {
  PortfolioCompanyFilter,
  type CompanyFilterOption,
} from '@/components/dashboard/portfolio-company-filter';
import {
  PortfolioPeriodSelector,
  type PeriodCoverageOption,
} from '@/components/dashboard/portfolio-period-selector';
import { QueryPanel } from '@/components/ai/query-panel';
import { StatusPill } from '@/components/ui/status-pill';
import { formatBytes, formatIndianCurrency, formatPeriod } from '@/lib/formatters';
import { computeBurnEbitdaSeries, parseCompanySlugs } from '@mis/core';
import {
  FileSpreadsheet,
  ArrowRight,
  Clock,
  Building2,
  AlertCircle,
} from 'lucide-react';

export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{
    companies?: string;
    period?: string;
  }>;
}

interface PeriodCurrencyDbRow {
  period: string | null;
  unit: string | null;
  reporting_companies: number | string | null;
  total_revenue: number | string | null;
}

interface BurnEbitdaMetricDbRow {
  company_id: string;
  reporting_period: string;
  revenue: number | string | null;
  ebitda: number | string | null;
  burn: number | string | null;
}

export default async function PortfolioOverviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const companiesParam = (params.companies || '').trim();

  // 1. Fetch complete portfolio companies inventory with MIS filings existence
  const allCompaniesRes = await db.execute(sql`
    SELECT 
      c.id, c.name, c.slug, c.industry,
      COUNT(d.id)::int as document_count,
      MAX(d.reporting_period) as latest_period
    FROM companies c
    LEFT JOIN documents d ON d.company_id = c.id AND d.status = 'processed'
    WHERE c.archived_at IS NULL
    GROUP BY c.id, c.name, c.slug, c.industry
    ORDER BY c.name ASC
  `);

  const allCompanies: CompanyFilterOption[] = allCompaniesRes.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    industry: r.industry ? String(r.industry) : null,
    documentCount: Number(r.document_count || 0),
    latestPeriod: r.latest_period ? String(r.latest_period) : null,
  }));

  // 2. Resolve selected companies from query parameters (?companies=noto,jar)
  const allKnownSlugs = allCompanies.map((c) => c.slug);
  const selectedSlugs = parseCompanySlugs(companiesParam, allKnownSlugs);

  const selectedCompanies = allCompanies.filter((c) => selectedSlugs.includes(c.slug));
  const selectedCompanyIds = selectedCompanies.map((c) => c.id);
  const isZeroSelected = selectedCompanyIds.length === 0;

  const periodParam = (params.period || '').trim();

  // 3. Batch all dependent aggregations concurrently for selected companies
  const companyIdsList = sql.join(
    selectedCompanyIds.map((id) => sql`${id}::uuid`),
    sql`, `
  );

  const [
    [docCountRow],
    [latestPeriodRow],
    periodCurrencyRes,
    burnEbitdaMetricsRes,
    recentDocs,
  ] = isZeroSelected
    ? [
        [{ count: 0 }],
        [{ period: null }],
        { rows: [] },
        { rows: [] },
        [],
      ]
    : await Promise.all([
        // Documents processed for selected companies
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(documents)
          .where(
            and(
              inArray(documents.companyId, selectedCompanyIds),
              eq(documents.status, 'processed')
            )
          ),

        // Latest reporting period across selected companies
        db
          .select({ period: documents.reportingPeriod })
          .from(documents)
          .where(
            and(
              inArray(documents.companyId, selectedCompanyIds),
              sql`reporting_period IS NOT NULL`,
              eq(documents.status, 'processed')
            )
          )
          .orderBy(desc(documents.reportingPeriod))
          .limit(1),

        // Portfolio revenue by period & currency with CURRENT DOCUMENT PRECEDENCE (no historical duplicate sums)
        db.execute(sql`
          WITH current_metrics AS (
            SELECT DISTINCT ON (m.company_id, m.metric_key, m.reporting_period)
              m.company_id,
              m.metric_key,
              m.reporting_period,
              m.value::numeric as value,
              COALESCE(m.unit, 'INR') as unit
            FROM metrics m
            JOIN documents d ON d.id = m.document_id
            WHERE m.metric_key = 'revenue'
              AND m.reporting_period IS NOT NULL
              AND m.company_id IN (${companyIdsList})
            ORDER BY m.company_id, m.metric_key, m.reporting_period, d.reporting_period DESC NULLS LAST, d.uploaded_at DESC
          )
          SELECT
            reporting_period as period,
            unit,
            COUNT(DISTINCT company_id)::int as reporting_companies,
            SUM(value) as total_revenue
          FROM current_metrics
          GROUP BY reporting_period, unit
          ORDER BY reporting_period ASC, unit ASC
        `),

        // Company-period metric matrix with CURRENT DOCUMENT PRECEDENCE (for ratio-of-sums calculation)
        db.execute(sql`
          WITH current_metrics AS (
            SELECT DISTINCT ON (m.company_id, m.metric_key, m.reporting_period)
              m.company_id,
              m.metric_key,
              m.reporting_period,
              m.value::numeric as value,
              COALESCE(m.unit, 'INR') as unit
            FROM metrics m
            JOIN documents d ON d.id = m.document_id
            WHERE m.metric_key IN ('revenue', 'ebitda', 'burn')
              AND m.reporting_period IS NOT NULL
              AND m.company_id IN (${companyIdsList})
            ORDER BY m.company_id, m.metric_key, m.reporting_period, d.reporting_period DESC NULLS LAST, d.uploaded_at DESC
          )
          SELECT 
            company_id,
            reporting_period,
            MAX(CASE WHEN metric_key = 'revenue' THEN value END) as revenue,
            MAX(CASE WHEN metric_key = 'ebitda' THEN value END) as ebitda,
            MAX(CASE WHEN metric_key = 'burn' THEN value END) as burn
          FROM current_metrics
          GROUP BY company_id, reporting_period
          ORDER BY reporting_period ASC
        `),

        // Recent uploads from selected companies
        db
          .select({
            id: documents.id,
            filename: documents.filename,
            status: documents.status,
            reportingPeriod: documents.reportingPeriod,
            sizeBytes: documents.sizeBytes,
            uploadedAt: documents.uploadedAt,
            companyId: documents.companyId,
            companyName: companies.name,
            companySlug: companies.slug,
          })
          .from(documents)
          .leftJoin(companies, eq(documents.companyId, companies.id))
          .where(
            and(
              inArray(documents.companyId, selectedCompanyIds),
              eq(documents.status, 'processed')
            )
          )
          .orderBy(desc(documents.uploadedAt))
          .limit(6),
      ]);

  const totalCompanies = selectedCompanies.length;
  const totalDocuments = docCountRow?.count || 0;

  // Process period options with separated currencies and company counts
  const periodMap = new Map<string, PeriodCoverageOption>();
  for (const row of (periodCurrencyRes.rows as unknown as PeriodCurrencyDbRow[])) {
    const p = String(row.period);
    if (!periodMap.has(p)) {
      periodMap.set(p, {
        period: p,
        reportingCompanies: 0,
        totalCompanies,
        currencies: [],
      });
    }
    const opt = periodMap.get(p)!;
    opt.currencies.push({
      currency: String(row.unit || 'INR'),
      totalAmount: Number(row.total_revenue || 0),
      companiesCount: Number(row.reporting_companies || 0),
    });
    opt.reportingCompanies = Math.max(opt.reportingCompanies, Number(row.reporting_companies || 0));
  }

  const sortedPeriods = Array.from(periodMap.keys()).sort();
  const latestPeriod = sortedPeriods[sortedPeriods.length - 1] || latestPeriodRow?.period || null;
  const activePeriod =
    periodParam && sortedPeriods.includes(periodParam) ? periodParam : latestPeriod;
  const activeOption = activePeriod ? periodMap.get(activePeriod) : undefined;
  const companiesReportingActive = activeOption?.reportingCompanies || 0;

  // Build primary currency (INR) revenue trend points without synthetic FX
  const revenueTrendPoints: ChartDataPoint[] = [];
  for (const p of sortedPeriods) {
    const opt = periodMap.get(p);
    const inrRev = opt?.currencies.find((c) => c.currency === 'INR')?.totalAmount;
    if (inrRev !== undefined) {
      revenueTrendPoints.push({ period: p, value: inrRev });
    } else if (opt && opt.currencies.length > 0) {
      revenueTrendPoints.push({ period: p, value: opt.currencies[0]!.totalAmount });
    }
  }

  // Active period revenue figures (currency-separated)
  const inrActiveRev = activeOption?.currencies.find((c) => c.currency === 'INR')?.totalAmount;
  const foreignActiveRev = activeOption?.currencies.find((c) => c.currency !== 'INR');
  const primaryRevenue =
    inrActiveRev !== undefined
      ? inrActiveRev
      : foreignActiveRev
      ? foreignActiveRev.totalAmount
      : null;
  const primaryCurrency =
    inrActiveRev !== undefined ? 'INR' : foreignActiveRev ? foreignActiveRev.currency : 'INR';

  // Compute MoM delta for active period in primary currency
  let activeRevenueDelta: number | null = null;
  if (activePeriod && primaryRevenue !== null) {
    const activeIdx = sortedPeriods.indexOf(activePeriod);
    if (activeIdx > 0) {
      const prevPeriod = sortedPeriods[activeIdx - 1];
      const prevOpt = periodMap.get(prevPeriod!);
      const prevRev = prevOpt?.currencies.find((c) => c.currency === primaryCurrency)?.totalAmount;
      if (prevRev !== undefined && prevRev > 0) {
        activeRevenueDelta = ((primaryRevenue - prevRev) / prevRev) * 100;
      }
    }
  }

  // Compute Burn & EBITDA % series using ratio of sums with zero-revenue company exclusion
  const burnEbitdaPoints = computeBurnEbitdaSeries(
    (burnEbitdaMetricsRes.rows as unknown as BurnEbitdaMetricDbRow[]).map((r) => ({
      companyId: String(r.company_id),
      reportingPeriod: String(r.reporting_period),
      revenue: r.revenue !== null ? Number(r.revenue) : null,
      ebitda: r.ebitda !== null ? Number(r.ebitda) : null,
      burn: r.burn !== null ? Number(r.burn) : null,
    }))
  );

  const reportingPeriodStr = activePeriod ? formatPeriod(activePeriod) : 'latest';
  const statChips = [
    {
      label: 'Selected companies',
      value: `${totalCompanies} of ${allCompanies.length}`,
    },
    {
      label: 'Filings indexed',
      value: totalDocuments,
    },
    {
      label: `selected have a ${reportingPeriodStr} MIS`,
      value: `Reporting: ${companiesReportingActive} of ${totalCompanies}`,
    },
    {
      label: `Revenue (${companiesReportingActive} reporting)`,
      value:
        primaryRevenue !== null
          ? primaryCurrency === 'INR'
            ? formatIndianCurrency(primaryRevenue)
            : `${primaryCurrency} ${primaryRevenue.toLocaleString()}`
          : '—',
    },
  ];

  return (
    <AppShell>
      <PageShell
        title="Portfolio Overview"
        subtitle="Aggregate MIS metrics, financial health tracking, and portfolio intelligence"
        statChips={statChips}
        filterSlot={
          <PortfolioCompanyFilter
            companies={allCompanies}
            selectedSlugs={selectedSlugs}
            totalCount={allCompanies.length}
          />
        }
        rightSlot={
          <Link
            href="/companies"
            prefetch
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-3.5 py-1.5 text-xs font-semibold text-[#1A1815] dark:text-[#FAFAF8] shadow-xs hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors"
          >
            <Building2 className="w-3.5 h-3.5 text-[#FF7102]" />
            <span>Company Directory</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#9A958E]" />
          </Link>
        }
      >
        {/* Zero Companies Selected Warning */}
        {isZeroSelected && (
          <div className="flex items-center gap-2.5 p-4 rounded-2xl border border-[#FECDCA] dark:border-[#B42318]/40 bg-[#FEF3F2] dark:bg-[#341618] text-[#B42318] dark:text-[#F87171] text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              No companies selected in the filter. Use the company filter in the header to select portfolio companies.
            </span>
          </div>
        )}

        {/* Explicit Period Selector & Coverage with Currency Separation */}
        {sortedPeriods.length > 0 && (
          <PortfolioPeriodSelector
            periods={Array.from(periodMap.values())}
            activePeriod={activePeriod}
            latestPeriod={latestPeriod}
            totalCompanies={totalCompanies}
          />
        )}

        {/* KPI Strip: 5 standard cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            label="Companies Selected"
            value={totalCompanies ? `${totalCompanies}` : '0'}
            tooltip={`${totalCompanies} of ${allCompanies.length} active portfolio companies selected in the filter`}
            showDelta={false}
          />

          <KpiCard
            label="Documents Processed"
            value={totalDocuments ? `${totalDocuments}` : '0'}
            tooltip="Total verified MIS spreadsheets and PDFs successfully parsed & indexed for selected companies"
            showDelta={false}
          />

          <KpiCard
            label="Active Aggregate Period"
            value={activePeriod ? formatPeriod(activePeriod) : 'Not available'}
            periodBadge={activePeriod === latestPeriod ? 'Latest' : 'Selected'}
            tooltip={`Aggregated reporting period. ${activePeriod === latestPeriod ? 'Latest available filing across portfolio.' : 'Explicitly selected period.'}`}
            showDelta={false}
          />

          <KpiCard
            label="Reporting Rate"
            value={
              totalCompanies > 0 && activePeriod
                ? `${companiesReportingActive} / ${totalCompanies}`
                : 'Not available'
            }
            tooltip={`Companies that have submitted MIS reports for ${activePeriod ? formatPeriod(activePeriod) : 'this period'} out of ${totalCompanies} selected companies`}
            showDelta={false}
          />

          <KpiCard
            label={`Sum of reported revenue (${primaryCurrency}) · ${companiesReportingActive} ${companiesReportingActive === 1 ? 'co.' : 'cos.'} with data`}
            value={
              primaryRevenue !== null
                ? primaryCurrency === 'INR'
                  ? formatIndianCurrency(primaryRevenue)
                  : `${primaryCurrency} ${primaryRevenue.toLocaleString()}`
                : 'Not available'
            }
            delta={activeRevenueDelta}
            period={
              activePeriod
                ? `${formatPeriod(activePeriod)} · ${companiesReportingActive} with data`
                : undefined
            }
            periodBadge={activePeriod === latestPeriod ? 'latest' : undefined}
            tooltip={`Sum of reported revenue in ${primaryCurrency} across the ${companiesReportingActive} companies with filings in ${activePeriod ? formatPeriod(activePeriod) : 'this period'} (out of ${totalCompanies} selected companies). Kept separate without synthetic FX.`}
            showDelta={true}
          />
        </div>

        {/* Charts Section: 2 Columns on Desktop */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Revenue Trend Chart (6 cols on xl) */}
          <div className="xl:col-span-6">
            <TrendChart
              title={`Monthly Revenue Trend (${totalCompanies} ${totalCompanies === 1 ? 'Company' : 'Companies'})`}
              data={revenueTrendPoints}
              metricKey="revenue"
              unit="currency"
              height={260}
            />
          </div>

          {/* Scale-independent Burn & EBITDA Margin % MoM Chart (6 cols on xl) */}
          <div className="xl:col-span-6">
            <BurnEbitdaChart
              data={burnEbitdaPoints}
              title="Burn & EBITDA Margin % (MoM)"
              subtitle={`Ratio of sums (Σ EBITDA ÷ Σ Revenue) · ${totalCompanies} selected`}
              totalSelectedCompanies={totalCompanies}
              selectedCompanyNames={selectedCompanies.map((c) => c.name)}
              height={260}
            />
          </div>
        </div>

        {/* Bottom Row: Recent Filings + AI Query Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Recent Uploads Section (7 cols on lg) */}
          <div className="lg:col-span-7 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-[#E8E5DE] dark:border-[#2E2A24] pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#FF7102]" />
                <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
                  Recent MIS Filings
                </h2>
              </div>
              <Link
                href="/companies"
                prefetch
                className="text-xs font-semibold text-[#FF7102] hover:underline inline-flex items-center gap-1 transition-colors"
              >
                <span>View all companies</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {recentDocs.length === 0 ? (
              <div className="text-xs text-[#9A958E] font-mono italic py-8 text-center border border-dashed border-[#E8E5DE] dark:border-[#2E2A24] rounded-xl">
                No MIS filings found for selected companies.
              </div>
            ) : (
              <div className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24] rounded-xl overflow-hidden">
                {recentDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors text-xs rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-[7px] bg-[#EEECE7] dark:bg-[#26231F] text-[#9A958E] flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <div className="font-semibold text-[#1A1815] dark:text-[#FAFAF8] truncate">
                          {doc.filename}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#9A958E] mt-0.5 font-mono">
                          {doc.companyName && (
                            <Link
                              href={`/companies/${doc.companySlug}`}
                              prefetch
                              className="font-medium hover:text-[#FF7102] text-[#5A5650] dark:text-[#C8C3BB]"
                            >
                              {doc.companyName}
                            </Link>
                          )}
                          {doc.reportingPeriod && (
                            <span>· {formatPeriod(doc.reportingPeriod)}</span>
                          )}
                          <span>· {formatBytes(doc.sizeBytes)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <StatusPill status={doc.status} />
                      <span className="text-[11px] text-[#9A958E] font-mono">
                        {new Date(doc.uploadedAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      {doc.companySlug && (
                        <Link
                          href={`/companies/${doc.companySlug}/documents`}
                          prefetch
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5A5650] dark:text-[#9A958E] hover:text-[#FF7102] px-2 py-1 rounded-md hover:bg-white dark:hover:bg-[#1C1A17] transition-colors"
                        >
                          <span>Inspect</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inline Global AI Query Box (5 cols on lg) */}
          <div className="lg:col-span-5">
            <QueryPanel
              companyId={selectedCompanies.length === 1 ? selectedCompanies[0].id : undefined}
              companyName={selectedCompanies.length === 1 ? selectedCompanies[0].name : undefined}
              multiCompanyFilterActive={selectedCompanies.length > 1 && selectedCompanies.length < allCompanies.length}
              selectedCount={selectedCompanies.length}
              placeholder={
                selectedCompanies.length === 1
                  ? `Ask anything about ${selectedCompanies[0].name}'s financials, revenue, burn, or margins…`
                  : "Ask a portfolio question (e.g. 'Compare EBITDA margin and burn trend across reporting companies')…"
              }
            />
          </div>
        </div>
      </PageShell>
    </AppShell>
  );
}
