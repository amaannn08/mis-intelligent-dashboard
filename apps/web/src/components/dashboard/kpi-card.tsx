'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
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
}

export function KpiCard({
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
}: KpiCardProps) {
  if (status === 'loading') {
    return (
      <div className={cn('p-5 rounded-xl border border-border bg-card shadow-2xs space-y-3', className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-7 w-32" />
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      </div>
    );
  }

  const isAvailable = value !== null && value !== undefined && value !== 'Not available' && value !== '—';

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
        'p-5 rounded-xl border border-border bg-card shadow-2xs flex flex-col justify-between transition-shadow hover:shadow-xs',
        className
      )}
    >
      {/* Top row: Label + badges/tooltips */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
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
              <Badge
                variant={kind === 'calculated' ? 'secondary' : 'outline'}
                className="text-[10px] px-1.5 py-0 h-4.5 gap-1 font-mono cursor-help"
              >
                {kind === 'calculated' && <Calculator className="w-2.5 h-2.5 text-blue-500" />}
                {kind}
              </Badge>
            </Tooltip>
          )}

          {!isAvailable && (
            <Tooltip content={defaultUnavailableExplanation}>
              <button
                type="button"
                aria-label="Metric details"
                className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Main Value */}
      <div className="my-1">
        {isAvailable ? (
          <div className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {value}
          </div>
        ) : (
          <Tooltip content={defaultUnavailableExplanation}>
            <div className="text-lg font-medium text-muted-foreground/70 italic cursor-help">
              Not available
            </div>
          </Tooltip>
        )}
      </div>

      {/* Bottom row: Delta + Reporting Period */}
      <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/60">
        {/* Delta */}
        <div>
          {isAvailable && delta !== undefined && delta !== null ? (
            <div
              className={cn(
                'inline-flex items-center gap-0.5 font-medium tabular-nums font-mono',
                isGood
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : deltaNegative || deltaPositive
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-muted-foreground'
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
              <span className="text-[10px] text-muted-foreground ml-0.5 font-sans">MoM</span>
            </div>
          ) : (
            <span className="text-muted-foreground/60 text-[11px]">No MoM baseline</span>
          )}
        </div>

        {/* Period */}
        {period && (
          <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
            {period}
          </span>
        )}
      </div>
    </div>
  );
}
