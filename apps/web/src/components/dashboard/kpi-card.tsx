'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { ArrowUpRight, ArrowDownRight, Minus, HelpCircle, Calculator } from 'lucide-react';

export interface KpiCardProps {
  label: string;
  value: string | null | undefined;
  delta?: number | null;
  period?: string | null;
  kind?: 'reported' | 'calculated' | 'estimated' | null;
  status?: 'ready' | 'loading' | 'empty';
  tooltip?: string;
  derivation?: string | null;
  directionality?: 'up_is_good' | 'down_is_good';
  className?: string;
  showDelta?: boolean;
}

export const KpiCard = React.memo(function KpiCard({
  label,
  value,
  delta,
  period,
  kind,
  status = 'ready',
  tooltip,
  derivation,
  directionality = 'up_is_good',
  className,
  showDelta,
}: KpiCardProps) {
  const hasDeltaConcept =
    showDelta !== undefined
      ? showDelta
      : delta !== undefined || Boolean(kind);

  if (status === 'loading') {
    return (
      <div
        className={cn(
          'flex flex-col justify-between rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-4 py-3 shadow-xs space-y-3',
          className
        )}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-7 w-28" />
        </div>
        {(hasDeltaConcept || Boolean(period)) && (
          <div className="flex items-center justify-between pt-1 border-t border-[#E8E5DE] dark:border-[#2E2A24]">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
          </div>
        )}
      </div>
    );
  }

  const isAvailable =
    value !== null &&
    value !== undefined &&
    value !== 'Not available' &&
    value !== '—';

  // Delta calculation display
  let deltaPositive = false;
  let deltaNegative = false;
  let isGood = false;

  if (delta !== undefined && delta !== null && !isNaN(delta) && delta !== 0) {
    deltaPositive = delta > 0;
    deltaNegative = delta < 0;
    isGood = directionality === 'down_is_good' ? delta < 0 : delta > 0;
  }

  const defaultUnavailableExplanation =
    tooltip || `No ${label.toLowerCase()} reported in the uploaded MIS filings for this period.`;

  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-4 py-3 text-left shadow-xs transition-all hover:shadow-sm hover:border-[#FFD0AB] dark:hover:border-[#FF7102]/50',
        className
      )}
    >
      <div>
        {/* Top row: Section heading in micro-label style */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono truncate">
            {label}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {kind && isAvailable && (
              <Tooltip
                content={
                  kind === 'calculated' && derivation
                    ? `Calculated metric: ${derivation}`
                    : `Source metric: ${kind}`
                }
              >
                <span className="inline-flex items-center gap-0.5 rounded-[4px] bg-[#EEECE7] dark:bg-[#26231F] px-1.5 py-0.5 text-[9px] font-mono font-medium text-[#5A5650] dark:text-[#9A958E] cursor-help">
                  {kind === 'calculated' && <Calculator className="w-2.5 h-2.5 text-[#3A5F8C]" />}
                  {kind}
                </span>
              </Tooltip>
            )}

            {!isAvailable && (
              <Tooltip content={defaultUnavailableExplanation}>
                <button
                  type="button"
                  aria-label="Metric details"
                  className="text-[#9A958E] hover:text-[#1A1815] transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Main Value in font-mono */}
        <div className="my-2">
          {isAvailable ? (
            <div className="text-2xl font-bold tracking-tight text-[#1A1815] dark:text-[#FAFAF8] font-mono tabular-nums">
              {value}
            </div>
          ) : (
            <Tooltip content={defaultUnavailableExplanation}>
              <div className="text-base font-medium text-[#9A958E] italic cursor-help font-mono">
                —
              </div>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Bottom row: Delta + Reporting Period */}
      {(hasDeltaConcept || Boolean(period)) && (
        <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E8E5DE] dark:border-[#2E2A24]">
          {/* Delta */}
          <div>
            {hasDeltaConcept ? (
              isAvailable && delta !== undefined && delta !== null && !isNaN(delta) ? (
                <div
                  data-testid="kpi-delta"
                  className={cn(
                    'inline-flex items-center gap-0.5 font-medium tabular-nums font-mono text-[11px]',
                    isGood
                      ? 'text-[#3D7A58] dark:text-[#4E9A70]'
                      : deltaNegative || deltaPositive
                      ? 'text-[#B42318] dark:text-[#F87171]'
                      : 'text-[#9A958E]'
                  )}
                >
                  {deltaPositive ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : deltaNegative ? (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  ) : (
                    <Minus className="w-3 h-3" />
                  )}
                  <span>
                    {delta > 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
                  </span>
                  <span className="text-[10px] text-[#9A958E] font-sans ml-0.5">MoM</span>
                </div>
              ) : (
                <span data-testid="kpi-no-prior-period" className="text-[#9A958E] text-[10px] font-mono">
                  No prior period
                </span>
              )
            ) : null}
          </div>

          {/* Period */}
          {period && (
            <span className="text-[10px] text-[#9A958E] font-mono tabular-nums">
              {period}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
