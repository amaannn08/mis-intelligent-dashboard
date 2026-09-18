'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Filter,
  Search,
  X,
  Building2,
  FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShortPeriod } from '@/lib/formatters';

export interface CompanyFilterOption {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  documentCount: number;
  latestPeriod: string | null;
}

interface PortfolioCompanyFilterProps {
  companies: CompanyFilterOption[];
  selectedSlugs: string[]; // empty or all slugs = all companies
  totalCount: number;
  className?: string;
}

export function PortfolioCompanyFilter({
  companies,
  selectedSlugs,
  totalCount,
  className,
}: PortfolioCompanyFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const allSlugs = React.useMemo(() => companies.map((c) => c.slug), [companies]);
  const isDefaultAll = selectedSlugs.length === 0 || selectedSlugs.length === totalCount;

  // Working set of selected slugs inside popover
  const [stagedSelected, setStagedSelected] = React.useState<Set<string>>(
    new Set(isDefaultAll ? allSlugs : selectedSlugs)
  );

  // Sync staged state whenever URL or selectedSlugs change externally
  React.useEffect(() => {
    setStagedSelected(new Set(isDefaultAll ? allSlugs : selectedSlugs));
  }, [selectedSlugs, isDefaultAll, allSlugs]);

  // Handle click outside and Escape key to close popover
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when popover opens
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const applySelection = React.useCallback(
    (nextSelection: Set<string>) => {
      const nextArr = Array.from(nextSelection);
      const params = new URLSearchParams(searchParams.toString());

      if (nextArr.length === 0) {
        params.set('companies', 'none');
      } else if (nextArr.length === totalCount || nextArr.length === allSlugs.length) {
        // Clean URL: default is all companies
        params.delete('companies');
      } else {
        params.set('companies', nextArr.sort().join(','));
      }

      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
      setIsOpen(false);
    },
    [allSlugs.length, pathname, router, searchParams, totalCount]
  );

  const handleResetToAll = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const allSet = new Set(allSlugs);
    setStagedSelected(allSet);
    applySelection(allSet);
  };

  const handleSelectAll = () => {
    setStagedSelected(new Set(allSlugs));
  };

  const handleSelectNone = () => {
    setStagedSelected(new Set());
  };

  const handleSelectOnlyWithMis = () => {
    const withMis = companies.filter((c) => c.documentCount > 0).map((c) => c.slug);
    setStagedSelected(new Set(withMis));
  };

  const toggleCompany = (slug: string) => {
    const next = new Set(stagedSelected);
    if (next.has(slug)) {
      next.delete(slug);
    } else {
      next.add(slug);
    }
    setStagedSelected(next);
  };

  // Filter list by search query
  const filteredCompanies = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry && c.industry.toLowerCase().includes(q))
    );
  }, [companies, search]);

  const selectedCount = isDefaultAll ? totalCount : selectedSlugs.length;
  const isFilterActive = !isDefaultAll && selectedSlugs.length > 0 && selectedSlugs[0] !== 'none';
  const companiesWithMisCount = companies.filter((c) => c.documentCount > 0).length;

  return (
    <div className={cn('relative inline-block text-left', className)} ref={popoverRef}>
      {/* Trigger Button Row */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          data-testid="company-filter-trigger"
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-all cursor-pointer select-none border',
            isFilterActive
              ? 'border-[#FFD0AB] bg-[#FFEFE2] dark:bg-[#2D1F16] text-[#FF7102]'
              : 'border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] text-[#1A1815] dark:text-[#FAFAF8] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F]'
          )}
        >
          <Filter className={cn('w-3.5 h-3.5', isFilterActive ? 'text-[#FF7102]' : 'text-[#9A958E]')} />
          <span>
            {isDefaultAll
              ? `All Companies (${totalCount})`
              : selectedSlugs[0] === 'none'
              ? '0 Companies Selected'
              : `${selectedCount} of ${totalCount} Selected`}
          </span>
          <span className="text-[10px] text-[#9A958E] font-mono">▾</span>
        </button>

        {/* Quick Reset Button when active */}
        {isFilterActive && (
          <button
            type="button"
            onClick={handleResetToAll}
            title="Reset to all companies"
            data-testid="company-filter-reset-trigger"
            className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] text-[#9A958E] hover:text-[#B42318] hover:bg-[#FEF3F2] dark:hover:bg-[#341618] transition-colors cursor-pointer shadow-xs"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Popover Dropdown Card */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Filter companies"
          data-testid="company-filter-popover"
          className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-84 sm:w-96 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-3.5 shadow-xl z-50 animate-in fade-in zoom-in-95 space-y-3"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#E8E5DE] dark:border-[#2E2A24] pb-2.5">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#FF7102]" />
              <h3 className="text-xs font-semibold text-[#1A1815] dark:text-[#FAFAF8]">
                Filter Aggregated Companies
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[#9A958E] hover:text-[#1A1815] dark:hover:text-[#FAFAF8] p-1 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9A958E]" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies by name or industry…"
              className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-[#FAFAF8] dark:bg-[#141210] rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] placeholder:text-[#9A958E] focus:outline-none focus:border-[#FF7102] text-[#1A1815] dark:text-[#FAFAF8] font-sans"
            />
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleSelectAll}
              data-testid="company-filter-preset-all"
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-mono font-medium transition-colors cursor-pointer border',
                stagedSelected.size === allSlugs.length
                  ? 'bg-[#FF7102] text-white border-[#FF7102]'
                  : 'border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0]'
              )}
            >
              All ({totalCount})
            </button>

            <button
              type="button"
              onClick={handleSelectOnlyWithMis}
              data-testid="company-filter-preset-mis"
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-mono font-medium transition-colors cursor-pointer border',
                stagedSelected.size === companiesWithMisCount &&
                  companies.filter((c) => c.documentCount > 0).every((c) => stagedSelected.has(c.slug))
                  ? 'bg-[#FF7102] text-white border-[#FF7102]'
                  : 'border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0]'
              )}
            >
              With MIS only ({companiesWithMisCount})
            </button>

            <button
              type="button"
              onClick={handleSelectNone}
              data-testid="company-filter-preset-none"
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-mono font-medium transition-colors cursor-pointer border',
                stagedSelected.size === 0
                  ? 'bg-[#B42318] text-white border-[#B42318]'
                  : 'border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0]'
              )}
            >
              None
            </button>
          </div>

          {/* Checklist of Companies */}
          <div className="max-h-60 overflow-y-auto divide-y divide-[#E8E5DE]/60 dark:divide-[#2E2A24]/60 pr-1 select-none">
            {filteredCompanies.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#9A958E] font-mono">
                No companies match &quot;{search}&quot;
              </div>
            ) : (
              filteredCompanies.map((comp) => {
                const isChecked = stagedSelected.has(comp.slug);
                return (
                  <label
                    key={comp.id}
                    data-testid={`company-filter-item-${comp.slug}`}
                    className="py-2 px-1 flex items-center justify-between gap-2.5 hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] rounded-lg cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCompany(comp.slug)}
                        className="w-4 h-4 rounded border-[#E8E5DE] text-[#FF7102] focus:ring-[#FF7102] focus:ring-offset-0 cursor-pointer accent-[#FF7102]"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8] truncate">
                          {comp.name}
                        </div>
                        {comp.industry && (
                          <div className="text-[10px] text-[#9A958E] font-mono truncate">
                            {comp.industry}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {comp.documentCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#FFEFE2] dark:bg-[#2D1F16] text-[#FF7102]">
                          <FileSpreadsheet className="w-3 h-3" />
                          <span>{comp.latestPeriod ? formatShortPeriod(comp.latestPeriod) : `${comp.documentCount} docs`}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#C8C3BB] font-mono italic">
                          No MIS
                        </span>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-[#E8E5DE] dark:border-[#2E2A24] text-xs">
            <span className="text-[11px] text-[#9A958E] font-mono">
              {stagedSelected.size} of {totalCount} selected
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStagedSelected(new Set(isDefaultAll ? allSlugs : selectedSlugs));
                  setIsOpen(false);
                }}
                className="px-3 py-1.5 rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] font-semibold text-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => applySelection(stagedSelected)}
                data-testid="company-filter-apply"
                className="px-3.5 py-1.5 rounded-xl bg-[#FF7102] hover:bg-[#ff8a3a] text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
              >
                Apply ({stagedSelected.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
