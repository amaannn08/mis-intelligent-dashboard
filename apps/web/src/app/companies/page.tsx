import * as React from 'react';
import Link from 'next/link';
import { db } from '@mis/db';
import { sql } from 'drizzle-orm';
import { getCompaniesList } from '@/lib/companies';
import { AppShell } from '@/components/layout/app-shell';
import { PageShell } from '@/components/layout/page-shell';
import { CompaniesFilterBar } from '@/components/company/companies-filter-bar';
import { AddCompanyModal } from '@/components/company/add-company-modal';
import { formatIndianCurrency, formatPeriod } from '@/lib/formatters';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{
    search?: string;
    industry?: string;
    sort?: string;
    page?: string;
  }>;
}

export default async function CompaniesDirectoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search || '';
  const industry = params.industry || '';
  const sort = (params.sort as 'name' | 'revenue' | 'period' | 'updated') || 'updated';
  const page = parseInt(params.page || '1', 10) || 1;
  const limit = 15;

  // Performance Fix 3: Direct server-side data loading driven by searchParams
  const [listResult, industriesResult] = await Promise.all([
    getCompaniesList({
      search,
      industry,
      sort,
      page,
      limit,
    }),
    db.execute(sql`
      SELECT DISTINCT industry
      FROM companies
      WHERE industry IS NOT NULL AND archived_at IS NULL
      ORDER BY industry ASC
    `),
  ]);

  const { companies, total } = listResult;
  const availableIndustries = industriesResult.rows
    .map((r) => String(r.industry))
    .filter(Boolean);

  const totalPages = Math.ceil(total / limit) || 1;

  // Compute stat chips
  const totalRevenue = companies.reduce(
    (acc, c) => acc + (c.latestRevenue ? Number(c.latestRevenue) : 0),
    0
  );
  const activeReporting = companies.filter((c) => Boolean(c.latestPeriod)).length;

  const statChips = [
    { label: 'Total Companies', value: total },
    { label: 'Reporting Filings', value: activeReporting },
    { label: 'Combined Latest Revenue', value: totalRevenue > 0 ? formatIndianCurrency(totalRevenue) : '—' },
  ];

  // Helper to generate pagination link
  const makePageUrl = (p: number) => {
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    if (industry) q.set('industry', industry);
    if (sort && sort !== 'updated') q.set('sort', sort);
    if (p > 1) q.set('page', String(p));
    const str = q.toString();
    return str ? `/companies?${str}` : '/companies';
  };

  return (
    <AppShell>
      <PageShell
        title="Portfolio Companies"
        subtitle="Directory of all investments, reporting schedules, and extracted MIS metrics"
        statChips={statChips}
        rightSlot={<AddCompanyModal />}
      >
        {/* Filter Bar (Client Island) */}
        <CompaniesFilterBar
          availableIndustries={availableIndustries}
          initialSearch={search}
          initialIndustry={industry}
          initialSort={sort}
        />

        {/* Companies Table / Desktop */}
        <div className="hidden md:block rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] overflow-hidden shadow-xs">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-[#FAFAF8] dark:bg-[#141210] border-b border-[#E8E5DE] dark:border-[#2E2A24] text-[10px] uppercase font-medium text-[#C8C3BB] tracking-[0.22em] font-mono select-none">
              <tr>
                <th scope="col" className="px-5 py-3.5 text-left w-72">
                  Company
                </th>
                <th scope="col" className="px-3 py-3.5 text-left w-36">
                  Industry
                </th>
                <th scope="col" className="px-4 py-3.5 text-left w-36">
                  Latest Period
                </th>
                <th scope="col" className="px-4 py-3.5 text-right w-36">
                  Latest Revenue
                </th>
                <th scope="col" className="px-4 py-3.5 text-right w-36">
                  EBITDA
                </th>
                <th scope="col" className="px-3 py-3.5 text-center w-28">
                  Filings
                </th>
                <th scope="col" className="px-4 py-3.5 text-right w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24]">
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-xs text-[#9A958E] font-mono">
                    No companies match your filters.
                  </td>
                </tr>
              ) : (
                companies.map((comp) => (
                  <tr
                    key={comp.id}
                    className="hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors group cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <Link href={`/companies/${comp.slug}`} prefetch className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-[7px] bg-[#EEECE7] dark:bg-[#26231F] flex items-center justify-center font-bold text-xs shrink-0 text-[#5A5650] dark:text-[#9A958E] font-mono uppercase">
                          {comp.name.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8] group-hover:text-[#FF7102] transition-colors truncate">
                            {comp.name}
                          </div>
                          {comp.description && (
                            <div className="text-[11px] text-[#9A958E] truncate max-w-xs">
                              {comp.description}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>

                    <td className="px-3 py-3.5">
                      {comp.industry ? (
                        <span className="inline-flex items-center rounded-full bg-white dark:bg-[#26231F] px-2.5 py-0.5 text-[10px] font-medium text-[#5A5650] dark:text-[#9A958E] border border-[#E8E5DE] dark:border-[#2E2A24] font-mono">
                          {comp.industry}
                        </span>
                      ) : (
                        <span className="text-[#C8C3BB] text-xs font-mono">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-[#5A5650] dark:text-[#C8C3BB]">
                      {comp.latestPeriod ? formatPeriod(comp.latestPeriod) : <span className="text-[#C8C3BB] italic">No filings</span>}
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-xs tabular-nums text-[#1A1815] dark:text-[#FAFAF8]">
                      {comp.latestRevenue !== null ? formatIndianCurrency(comp.latestRevenue) : <span className="text-[#C8C3BB] font-normal">—</span>}
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-xs tabular-nums text-[#1A1815] dark:text-[#FAFAF8]">
                      {comp.latestEbitda !== null ? formatIndianCurrency(comp.latestEbitda) : <span className="text-[#C8C3BB] font-normal">—</span>}
                    </td>

                    <td className="px-3 py-3.5 text-center font-mono text-[11px] text-[#9A958E]">
                      {comp.documentCount} {comp.documentCount === 1 ? 'doc' : 'docs'}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/companies/${comp.slug}`}
                        prefetch
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF7102] hover:underline"
                      >
                        <span>Workspace</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View / Cards */}
        <div className="block md:hidden space-y-3">
          {companies.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#9A958E] font-mono border border-dashed border-[#E8E5DE] rounded-2xl">
              No companies match your filters.
            </div>
          ) : (
            companies.map((comp) => (
              <div
                key={comp.id}
                className="p-4 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[7px] bg-[#EEECE7] dark:bg-[#26231F] flex items-center justify-center font-bold text-xs shrink-0 text-[#5A5650] dark:text-[#9A958E] font-mono uppercase">
                      {comp.name.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8]">
                        {comp.name}
                      </div>
                      {comp.industry && (
                        <span className="text-[10px] text-[#9A958E] font-mono">
                          {comp.industry}
                        </span>
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/companies/${comp.slug}`}
                    prefetch
                    className="inline-flex items-center gap-1 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] px-2.5 py-1 text-[10px] font-semibold text-[#FF7102] hover:bg-[#FFEFE2]"
                  >
                    <span>Workspace</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E8E5DE] dark:border-[#2E2A24] text-xs font-mono">
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#C8C3BB] block">Latest Revenue</span>
                    <span className="font-semibold text-[#1A1815] dark:text-[#FAFAF8]">
                      {comp.latestRevenue !== null ? formatIndianCurrency(comp.latestRevenue) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#C8C3BB] block">Period</span>
                    <span className="text-[#5A5650] dark:text-[#9A958E]">
                      {comp.latestPeriod ? formatPeriod(comp.latestPeriod) : 'None'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#C8C3BB] block">EBITDA</span>
                    <span className="font-semibold text-[#1A1815] dark:text-[#FAFAF8]">
                      {comp.latestEbitda !== null ? formatIndianCurrency(comp.latestEbitda) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#C8C3BB] block">Filings</span>
                    <span className="text-[#5A5650] dark:text-[#9A958E]">
                      {comp.documentCount} {comp.documentCount === 1 ? 'doc' : 'docs'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 px-1 text-xs">
            <span className="text-[11px] text-[#9A958E] font-mono">
              Page {page} of {totalPages} ({total} companies)
            </span>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  href={makePageUrl(page - 1)}
                  prefetch
                  className="inline-flex items-center gap-1 rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-3 py-1.5 text-xs font-semibold text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F]"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-xl border border-[#E8E5DE]/40 bg-[#FAFAF8] px-3 py-1.5 text-xs text-[#C8C3BB] cursor-not-allowed">
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </span>
              )}

              {page < totalPages ? (
                <Link
                  href={makePageUrl(page + 1)}
                  prefetch
                  className="inline-flex items-center gap-1 rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-3 py-1.5 text-xs font-semibold text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F]"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-xl border border-[#E8E5DE]/40 bg-[#FAFAF8] px-3 py-1.5 text-xs text-[#C8C3BB] cursor-not-allowed">
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
          </div>
        )}
      </PageShell>
    </AppShell>
  );
}
