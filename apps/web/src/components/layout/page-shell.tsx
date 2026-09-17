import * as React from 'react';
import { cn } from '@/lib/utils';

export interface StatChipProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  className?: string;
}

export function StatChip({ label, value, sub, className }: StatChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[#E8E5DE] bg-white px-3 py-1.5 text-[11px] font-medium text-[#5A5650] shadow-xs select-none dark:border-[#2E2A24] dark:bg-[#1C1A17] dark:text-[#9A958E]',
        className
      )}
    >
      <span className="font-semibold text-[#1A1815] dark:text-[#FAFAF8] font-mono tabular-nums">
        {value}
      </span>
      <span>{label}</span>
      {sub && <span className="text-[10px] text-[#9A958E] font-mono">{sub}</span>}
    </span>
  );
}

export interface PageShellProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  statChips?: Array<{ label: string; value: React.ReactNode; sub?: string }>;
  filterSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PageShell({
  title,
  subtitle,
  statChips,
  filterSlot,
  rightSlot,
  children,
  className,
}: PageShellProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-4', className)}>
      {/* Page Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-[#1A1815] dark:text-[#FAFAF8] sm:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-[#5A5650] dark:text-[#9A958E] max-w-2xl leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {filterSlot}
          {rightSlot}
        </div>
      </header>

      {/* Stat Chips Row */}
      {statChips && statChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {statChips.map((chip, idx) => (
            <StatChip
              key={`${chip.label}-${idx}`}
              label={chip.label}
              value={chip.value}
              sub={chip.sub}
            />
          ))}
        </div>
      )}

      {/* Main Section Content */}
      <section className="min-h-0 flex-1 flex flex-col gap-6">
        {children}
      </section>
    </div>
  );
}

export default PageShell;
