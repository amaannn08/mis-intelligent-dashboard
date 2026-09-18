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
  }>;
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

  // 3. Batch all dependent aggregations concurrently for selected companies
  const companyIdsList = sql.join(
    selectedCompanyIds.map((id) => sql`${id}::uuid`),
    sql`, `
  );

  const [
    [docCountRow],
    [latestPeriodRow],
    revenueTrendRes,
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

        // Portfolio revenue trend across periods for selected companies
        db.execute(sql`
          SELECT reporting_period as period, SUM(value::numeric) as total_revenue
          FROM metrics
          WHERE metric_key = 'revenue' 
            AND reporting_period IS NOT NULL
            AND company_id IN (${companyIdsList})
          GROUP BY reporting_period
          ORDER BY reporting_period ASC
        `),

        // Company-period metric matrix (for scale-independent ratio-of-sums calculation)
        db.execute(sql`
          SELECT 
            company_id,
            reporting_period,
            MAX(CASE WHEN metric_key = 'revenue' THEN value::numeric END) as revenue,
            MAX(CASE WHEN metric_key = 'ebitda' THEN value::numeric END) as ebitda,
            MAX(CASE WHEN metric_key = 'burn' THEN value::numeric END) as burn
          FROM metrics
          WHERE metric_key IN ('revenue', 'ebitda', 'burn')
            AND reporting_period IS NOT NULL
            AND company_id IN (${companyIdsList})
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
  const latestPeriod = latestPeriodRow?.period || null;

  const revenueTrendPoints: ChartDataPoint[] = revenueTrendRes.rows.map((row) => ({
    period: String(row.period),
    value: Number(row.total_revenue),
  }));

  // Count companies reporting in latestPeriod with positive revenue
  const latestReportingRows = latestPeriod
    ? burnEbitdaMetricsRes.rows.filter(
        (r) => r.reporting_period === latestPeriod && r.revenue !== null && Number(r.revenue) > 0
      )
    : [];
  const companiesReportingLatest = latestReportingRows.length;

  // Calculate latest portfolio revenue & MoM delta
  let totalLatestRevenue: number | null = null;
  let revenueDelta: number | null = null;
  if (revenueTrendPoints.length > 0) {
    totalLatestRevenue = revenueTrendPoints[revenueTrendPoints.length - 1].value;
    if (revenueTrendPoints.length >= 2) {
      const prevRevenue = revenueTrendPoints[revenueTrendPoints.length - 2].value;
      if (prevRevenue > 0) {
        revenueDelta = ((totalLatestRevenue - prevRevenue) / prevRevenue) * 100;
      }
    }
  }

  // Compute Burn & EBITDA % series using ratio of sums with zero-revenue company exclusion
  const burnEbitdaPoints = computeBurnEbitdaSeries(
    burnEbitdaMetricsRes.rows.map((r) => ({
      companyId: String(r.company_id),
      reportingPeriod: String(r.reporting_period),
      revenue: r.revenue !== null ? Number(r.revenue) : null,
      ebitda: r.ebitda !== null ? Number(r.ebitda) : null,
      burn: r.burn !== null ? Number(r.burn) : null,
    }))
  );

  const reportingPeriodStr = latestPeriod ? formatPeriod(latestPeriod) : 'latest';
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
      value: `Reporting: ${companiesReportingLatest} of ${totalCompanies}`,
    },
    {
      label: `Revenue (${companiesReportingLatest} reporting)`,
      value: totalLatestRevenue !== null ? formatIndianCurrency(totalLatestRevenue) : '—',
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
            label="Latest Reporting Month"
            value={latestPeriod ? formatPeriod(latestPeriod) : 'Not available'}
            tooltip="Most recent reporting month across received filings for selected companies"
            showDelta={false}
          />

          <KpiCard
            label="Reporting Rate"
            value={
              totalCompanies > 0 && latestPeriod
                ? `${companiesReportingLatest} / ${totalCompanies}`
                : 'Not available'
            }
            tooltip={`Companies that have submitted MIS reports for ${latestPeriod ? formatPeriod(latestPeriod) : 'latest period'} out of ${totalCompanies} selected companies`}
            showDelta={false}
          />

          <KpiCard
            label={`Sum of latest reported revenue · ${companiesReportingLatest} ${companiesReportingLatest === 1 ? 'company' : 'companies'} with data`}
            value={totalLatestRevenue !== null ? formatIndianCurrency(totalLatestRevenue) : 'Not available'}
            delta={revenueDelta}
            period={
              latestPeriod
                ? `${formatPeriod(latestPeriod)} · ${companiesReportingLatest} with data`
                : undefined
            }
            tooltip={`Sum of reported revenue across the ${companiesReportingLatest} companies with filings in ${latestPeriod ? formatPeriod(latestPeriod) : 'the latest period'} (out of ${totalCompanies} selected companies). Not portfolio-wide.`}
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
