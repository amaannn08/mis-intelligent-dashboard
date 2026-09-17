'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

interface CompaniesFilterBarProps {
  availableIndustries: string[];
  initialSearch?: string;
  initialIndustry?: string;
  initialSort?: string;
}

export function CompaniesFilterBar({
  availableIndustries,
  initialSearch = '',
  initialIndustry = '',
  initialSort = 'updated',
}: CompaniesFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(initialSearch);
  const [industry, setIndustry] = React.useState(initialIndustry);
  const [sort, setSort] = React.useState(initialSort);

  // Sync state if URL changes externally
  React.useEffect(() => {
    setSearch(searchParams.get('search') || '');
    setIndustry(searchParams.get('industry') || '');
    setSort(searchParams.get('sort') || 'updated');
  }, [searchParams]);

  const updateFilters = React.useCallback(
    (newSearch: string, newIndustry: string, newSort: string) => {
      const params = new URLSearchParams();
      if (newSearch.trim()) params.set('search', newSearch.trim());
      if (newIndustry.trim()) params.set('industry', newIndustry.trim());
      if (newSort && newSort !== 'updated') params.set('sort', newSort);
      params.set('page', '1');

      const queryString = params.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [pathname, router]
  );

  // Debounced search update
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== (searchParams.get('search') || '')) {
        updateFilters(search, industry, sort);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, industry, sort, searchParams, updateFilters]);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2.5 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9A958E]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter companies by name or description…"
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAF8] dark:bg-[#141210] rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] placeholder:text-[#9A958E] focus:outline-none focus:border-[#FF7102] text-[#1A1815] dark:text-[#FAFAF8] font-sans"
        />
      </div>

      {/* Select Dropdowns */}
      <div className="flex items-center gap-2">
        {/* Industry Filter Dropdown */}
        <select
          value={industry}
          onChange={(e) => {
            const nextInd = e.target.value;
            setIndustry(nextInd);
            updateFilters(search, nextInd, sort);
          }}
          aria-label="Filter by industry"
          className="text-xs h-8 px-2.5 rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] text-[#1A1815] dark:text-[#FAFAF8] focus:outline-none focus:border-[#FF7102] cursor-pointer font-sans"
        >
          <option value="">All Industries</option>
          {availableIndustries.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>

        {/* Sort Dropdown */}
        <select
          value={sort}
          onChange={(e) => {
            const nextSort = e.target.value;
            setSort(nextSort);
            updateFilters(search, industry, nextSort);
          }}
          aria-label="Sort companies by"
          className="text-xs h-8 px-2.5 rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] text-[#1A1815] dark:text-[#FAFAF8] focus:outline-none focus:border-[#FF7102] cursor-pointer font-sans"
        >
          <option value="updated">Recently Updated</option>
          <option value="name">Company Name</option>
          <option value="revenue">Latest Revenue</option>
          <option value="period">Latest Period</option>
        </select>
      </div>
    </div>
  );
}
