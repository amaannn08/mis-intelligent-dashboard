import Link from 'next/link';
import { db, companies, documents } from '@mis/db';
import { sql, eq, and, desc } from 'drizzle-orm';
import { AppShell } from '@/components/layout/app-shell';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { TrendChart, type ChartDataPoint } from '@/components/dashboard/trend-chart';
import { QueryPanel } from '@/components/ai/query-panel';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { formatBytes, formatIndianCurrency, formatPeriod } from '@/lib/formatters';
import {
  FileSpreadsheet,
  ArrowRight,
  Clock,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PortfolioOverviewPage() {
  // 1. Total companies tracked
  const [compCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companies)
    .where(sql`archived_at IS NULL`);
  const totalCompanies = compCount?.count || 0;

  // 2. Documents processed
  const [docCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(eq(documents.status, 'processed'));
  const totalDocuments = docCount?.count || 0;

  // 3. Latest reporting period across documents
  const [latestPeriodRow] = await db
    .select({ period: documents.reportingPeriod })
    .from(documents)
    .where(sql`reporting_period IS NOT NULL`)
    .orderBy(desc(documents.reportingPeriod))
    .limit(1);
  const latestPeriod = latestPeriodRow?.period || null;

  // 4. Companies reporting in latest period
  let companiesReportingLatest = 0;
  if (latestPeriod) {
    const [c] = await db
      .select({ count: sql<number>`count(DISTINCT company_id)::int` })
      .from(documents)
      .where(and(eq(documents.reportingPeriod, latestPeriod), eq(documents.status, 'processed')));
    companiesReportingLatest = c?.count || 0;
  }

  // 5. Portfolio-wide revenue trend across periods
  const revenueTrendRes = await db.execute(sql`
    SELECT reporting_period as period, SUM(value::numeric) as total_revenue
    FROM metrics
    WHERE metric_key = 'revenue' AND reporting_period IS NOT NULL
    GROUP BY reporting_period
    ORDER BY reporting_period ASC
  `);

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

  // 6. Recent uploads list
  const recentDocs = await db
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
    .limit(6);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Portfolio Overview
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aggregate MIS metrics, financial health tracking, and portfolio intelligence
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/companies">
                <span>View Directory</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>

        {/* KPI Strip: 5 standard cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <KpiCard
            label="Companies Tracked"
            value={totalCompanies ? `${totalCompanies}` : '0'}
            tooltip="Active portfolio companies currently registered in the MIS directory"
          />

          <KpiCard
            label="Documents Processed"
            value={totalDocuments ? `${totalDocuments}` : '0'}
            tooltip="Total verified MIS spreadsheets and PDFs successfully parsed & indexed"
          />

          <KpiCard
            label="Latest Reporting Month"
            value={latestPeriod ? formatPeriod(latestPeriod) : 'Not available'}
            tooltip="Most recent reporting month across received portfolio MIS filings"
          />

          <KpiCard
            label="Reporting Rate"
            value={
              totalCompanies > 0 && latestPeriod
                ? `${companiesReportingLatest} / ${totalCompanies}`
                : 'Not available'
            }
            tooltip="Companies that have submitted MIS reports for the latest reporting month"
          />

          <KpiCard
            label="Total Latest Revenue"
            value={totalLatestRevenue !== null ? formatIndianCurrency(totalLatestRevenue) : 'Not available'}
            delta={revenueDelta}
            period={latestPeriod ? formatPeriod(latestPeriod) : undefined}
            tooltip="Aggregate monthly revenue summed across companies reporting in the latest period"
          />
        </div>

        {/* Middle Section: Portfolio Revenue Trend + Inline AI Query Box */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
              placeholder="Ask a portfolio-wide question across all companies (e.g. 'Summarize Q3 revenue performance')…"
            />
          </div>
        </div>

        {/* Recent Uploads List */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Recent MIS Uploads</h2>
            </div>
            <Link
              href="/companies"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              <span>View companies</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentDocs.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-8 text-center border border-dashed border-border rounded-lg">
              No MIS documents have been uploaded yet. Navigate to any company to upload filings.
            </div>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="font-medium text-foreground truncate">
                        {doc.filename}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        {doc.companyName && (
                          <Link
                            href={`/companies/${doc.companySlug}`}
                            className="font-medium hover:underline text-foreground"
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
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {new Date(doc.uploadedAt).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    {doc.companySlug && (
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs px-2">
                        <Link href={`/companies/${doc.companySlug}/documents`}>
                          <span>Inspect</span>
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
