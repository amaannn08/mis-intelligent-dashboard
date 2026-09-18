import Link from 'next/link';
import { db, companies, documents } from '@mis/db';
import { sql, eq, desc } from 'drizzle-orm';
import { AppShell } from '@/components/layout/app-shell';
import { PageShell } from '@/components/layout/page-shell';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { TrendChart, type ChartDataPoint } from '@/components/dashboard/trend-chart';
import { QueryPanel } from '@/components/ai/query-panel';
import { StatusPill } from '@/components/ui/status-pill';
import { formatBytes, formatIndianCurrency, formatPeriod } from '@/lib/formatters';
import {
  FileSpreadsheet,
  ArrowRight,
  Clock,
  Building2,
} from 'lucide-react';

export const revalidate = 60;

export default async function PortfolioOverviewPage() {
  // Performance Fix 1: Batch all independent queries concurrently with Promise.all
  const [
    [compCount],
    [docCount],
    [latestPeriodRow],
    reportingLatestRes,
    revenueTrendRes,
    recentDocs,
  ] = await Promise.all([
    // 1. Total companies tracked
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(sql`archived_at IS NULL`),

    // 2. Documents processed
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(eq(documents.status, 'processed')),

    // 3. Latest reporting period across documents
    db
      .select({ period: documents.reportingPeriod })
      .from(documents)
      .where(sql`reporting_period IS NOT NULL`)
      .orderBy(desc(documents.reportingPeriod))
      .limit(1),

    // 4. Companies reporting in latest period (subquery run concurrently)
    db.execute(sql`
      SELECT count(DISTINCT company_id)::int as count
      FROM documents
      WHERE reporting_period = (
        SELECT reporting_period
        FROM documents
        WHERE reporting_period IS NOT NULL
        ORDER BY reporting_period DESC
        LIMIT 1
      ) AND status = 'processed'
    `),

    // 5. Portfolio-wide revenue trend across periods
    db.execute(sql`
      SELECT reporting_period as period, SUM(value::numeric) as total_revenue
      FROM metrics
      WHERE metric_key = 'revenue' AND reporting_period IS NOT NULL
      GROUP BY reporting_period
      ORDER BY reporting_period ASC
    `),

    // 6. Recent uploads list
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
      .orderBy(desc(documents.uploadedAt))
      .limit(6),
  ]);

  const totalCompanies = compCount?.count || 0;
  const totalDocuments = docCount?.count || 0;
  const latestPeriod = latestPeriodRow?.period || null;
  const companiesReportingLatest = Number(reportingLatestRes.rows[0]?.count || 0);

  const revenueTrendPoints: ChartDataPoint[] = revenueTrendRes.rows.map((row) => ({
    period: String(row.period),
    value: Number(row.total_revenue),
  }));

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

  const statChips = [
    { label: 'Active companies', value: totalCompanies },
    { label: 'Filings indexed', value: totalDocuments },
    { label: 'Latest reporting', value: latestPeriod ? formatPeriod(latestPeriod) : '—' },
    {
      label: 'Portfolio revenue',
      value: totalLatestRevenue !== null ? formatIndianCurrency(totalLatestRevenue) : '—',
    },
  ];

  return (
    <AppShell>
      <PageShell
        title="Portfolio Overview"
        subtitle="Aggregate MIS metrics, financial health tracking, and portfolio intelligence"
        statChips={statChips}
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
        {/* KPI Strip: 5 standard cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            label="Companies Tracked"
            value={totalCompanies ? `${totalCompanies}` : '0'}
            tooltip="Active portfolio companies currently registered in the MIS directory"
            showDelta={false}
          />

          <KpiCard
            label="Documents Processed"
            value={totalDocuments ? `${totalDocuments}` : '0'}
            tooltip="Total verified MIS spreadsheets and PDFs successfully parsed & indexed"
            showDelta={false}
          />

          <KpiCard
            label="Latest Reporting Month"
            value={latestPeriod ? formatPeriod(latestPeriod) : 'Not available'}
            tooltip="Most recent reporting month across received portfolio MIS filings"
            showDelta={false}
          />

          <KpiCard
            label="Reporting Rate"
            value={
              totalCompanies > 0 && latestPeriod
                ? `${companiesReportingLatest} / ${totalCompanies}`
                : 'Not available'
            }
            tooltip="Companies that have submitted MIS reports for the latest reporting month"
            showDelta={false}
          />

          <KpiCard
            label="Total Latest Revenue"
            value={totalLatestRevenue !== null ? formatIndianCurrency(totalLatestRevenue) : 'Not available'}
            delta={revenueDelta}
            period={latestPeriod ? formatPeriod(latestPeriod) : undefined}
            tooltip="Aggregate monthly revenue summed across companies reporting in the latest period"
            showDelta={true}
          />
        </div>

        {/* Middle Section: Portfolio Revenue Trend + Inline AI Query Box */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Revenue Trend Chart (7 cols on lg) */}
          <div className="lg:col-span-7">
            <TrendChart
              title="Portfolio Monthly Revenue Trend"
              data={revenueTrendPoints}
              metricKey="revenue"
              unit="currency"
              height={280}
            />
          </div>

          {/* Inline Global AI Query Panel (5 cols on lg) */}
          <div className="lg:col-span-5">
            <QueryPanel
              placeholder="Ask a portfolio question (e.g. 'Summarize Q3 revenue performance across companies')…"
            />
          </div>
        </div>

        {/* Recent Uploads Section */}
        <div className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-4 sm:p-5 shadow-xs space-y-3">
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
              No MIS documents uploaded yet. Navigate to any company to upload filings.
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
      </PageShell>
    </AppShell>
  );
}
