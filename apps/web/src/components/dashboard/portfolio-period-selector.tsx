'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Calendar, ChevronDown, Check, ShieldCheck, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPeriod, formatIndianCurrency } from '@/lib/formatters';

export interface CurrencyBreakdown {
  currency: string;
  totalAmount: number;
  companiesCount: number;
}

export interface PeriodCoverageOption {
  period: string; // YYYY-MM
  reportingCompanies: number;
  totalCompanies: number;
  currencies: CurrencyBreakdown[];
}

export interface PortfolioPeriodSelectorProps {
  periods: PeriodCoverageOption[];
  activePeriod: string | null;
  latestPeriod: string | null;
  totalCompanies: number;
  className?: string;
}

export function PortfolioPeriodSelector({
  periods,
  activePeriod,
  latestPeriod,
  totalCompanies,
  className,
}: PortfolioPeriodSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelectPeriod = (period: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!period || period === latestPeriod) {
      params.delete('period');
    } else {
      params.set('period', period);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setIsOpen(false);
  };

  const currentOption = periods.find((p) => p.period === activePeriod);
  const coveragePercent =
    currentOption && totalCompanies > 0
      ? Math.round((currentOption.reportingCompanies / totalCompanies) * 100)
      : 0;

  const isLatestSelected = !activePeriod || activePeriod === latestPeriod;

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs text-xs',
        className
      )}
    >
      {/* Left: Period Selector and Coverage */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-[#5A5650] dark:text-[#9A958E] font-medium">
          <Calendar className="w-3.5 h-3.5 text-[#FF7102]" />
          <span>Aggregate Period:</span>
        </div>

        {/* Dropdown Button */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#F5F4F0] dark:bg-[#26231F] px-3 py-1 font-mono font-semibold text-[#1A1815] dark:text-[#FAFAF8] hover:bg-[#EEECE7] dark:hover:bg-[#2E2A24] transition-colors cursor-pointer"
          >
            <span>
              {activePeriod ? formatPeriod(activePeriod) : 'All Filings'}
            </span>
            {isLatestSelected && activePeriod && (
              <span className="text-[10px] text-[#FF7102] font-sans font-medium">
                (Latest)
              </span>
            )}
            <ChevronDown className={cn('w-3 h-3 text-[#9A958E] transition-transform', isOpen && 'rotate-180')} />
          </button>

          {isOpen && (
            <div className="absolute left-0 mt-1.5 w-64 rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-lg py-1 z-50 max-h-72 overflow-y-auto">
              <div className="px-3 py-1.5 text-[10px] uppercase font-mono tracking-wider text-[#9A958E] border-b border-[#E8E5DE] dark:border-[#2E2A24]">
                Select Reporting Period
              </div>
              {periods.map((opt) => {
                const isSelected = opt.period === activePeriod;
                const isLatest = opt.period === latestPeriod;
                return (
                  <button
                    key={opt.period}
                    type="button"
                    onClick={() => handleSelectPeriod(opt.period)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors cursor-pointer',
                      isSelected && 'bg-[#FF7102]/10 text-[#FF7102] font-medium'
                    )}
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span>{formatPeriod(opt.period)}</span>
                        {isLatest && (
                          <span className="rounded bg-[#FF7102]/15 text-[#FF7102] text-[9px] px-1 py-0.2 font-sans font-semibold">
                            Latest
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#9A958E]">
                        {opt.reportingCompanies} of {totalCompanies} reporting ({Math.round((opt.reportingCompanies / totalCompanies) * 100)}%)
                      </span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#FF7102] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Coverage pill */}
        {currentOption && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#EEECE7] dark:bg-[#26231F] px-2.5 py-0.5 text-[11px] font-mono text-[#5A5650] dark:text-[#9A958E]">
            <Layers className="w-3 h-3 text-[#3A5F8C]" />
            <span>
              Coverage: {currentOption.reportingCompanies} of {totalCompanies} ({coveragePercent}%)
            </span>
          </span>
        )}
      </div>

      {/* Right: Currency Breakdown & Precedence Notice */}
      <div className="flex flex-wrap items-center gap-2">
        {currentOption && currentOption.currencies.length > 0 ? (
          currentOption.currencies.map((c) => (
            <span
              key={c.currency}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 text-[11px] font-mono font-medium"
              title={`Total revenue reported in ${c.currency} across ${c.companiesCount} companies for ${formatPeriod(currentOption.period)}`}
            >
              <span>{c.currency}:</span>
              <span>
                {c.currency === 'INR'
                  ? formatIndianCurrency(c.totalAmount)
                  : `${c.currency} ${c.totalAmount.toLocaleString()}`}
              </span>
              <span className="text-[9px] opacity-75">
                ({c.companiesCount} co.)
              </span>
            </span>
          ))
        ) : (
          <span className="text-[11px] font-mono text-[#9A958E]">
            No currency revenue for selected period
          </span>
        )}

        <span
          className="inline-flex items-center gap-1 text-[10px] font-mono text-[#9A958E] dark:text-[#76716B] shrink-0"
          title="Metrics aggregated using current document precedence (latest uploaded document per company). Currencies kept separate without synthetic FX conversion."
        >
          <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-500" />
          <span>Current Doc Precedence · No Synthetic FX</span>
        </span>
      </div>
    </div>
  );
}
