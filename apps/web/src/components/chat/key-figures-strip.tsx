'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatCompactMetricValue } from '@/lib/formatters';
import type { ChartConfig } from '@mis/core';

export interface KeyFigureChip {
  id: string;
  metricLabel: string;
  period: string;
  formattedPeriod: string;
  value: number;
  formattedValue: string;
  isPrimary: boolean;
  isNegative: boolean;
}

function formatShortPeriod(period: string): string {
  if (!period) return '';
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match || !match[1] || !match[2]) return period;

  const yearShort = match[1].slice(-2);
  const monthIdx = parseInt(match[2], 10) - 1;
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  return `${monthNames[monthIdx] || match[2]}'${yearShort}`;
}

export function extractKeyFigures(charts?: ChartConfig[]): KeyFigureChip[] {
  if (!charts || charts.length === 0) return [];

  const chips: KeyFigureChip[] = [];

  for (const chart of charts) {
    if (!chart.series || chart.series.length === 0) continue;

    for (const s of chart.series) {
      if (!s.points || s.points.length === 0) continue;

      const sorted = [...s.points].sort((a, b) => a.period.localeCompare(b.period));
      const latest = sorted[sorted.length - 1];
      if (!latest || typeof latest.value !== 'number' || isNaN(latest.value)) continue;

      const isNegative = latest.value < 0;
      const formattedValue = formatCompactMetricValue(latest.value, chart.unit, { space: true });
      const companyPrefix = chart.series.length > 1 && s.companyName ? `${s.companyName} ` : '';
      const metricLabel = `${companyPrefix}${chart.label}`;
      const formattedPeriod = formatShortPeriod(latest.period);

      chips.push({
        id: `${chart.metricKey}-${s.companyName || 'all'}-${latest.period}`,
        metricLabel,
        period: latest.period,
        formattedPeriod,
        value: latest.value,
        formattedValue,
        isPrimary: chips.length === 0,
        isNegative,
      });

      if (chips.length >= 4) break;
    }
    if (chips.length >= 4) break;
  }

  // Max 4 chips; drop strip entirely if fewer than 2 meaningful figures
  if (chips.length < 2) return [];
  return chips.slice(0, 4);
}

export interface KeyFiguresStripProps {
  charts?: ChartConfig[];
  className?: string;
}

export function KeyFiguresStrip({ charts, className }: KeyFiguresStripProps) {
  const figures = React.useMemo(() => extractKeyFigures(charts), [charts]);
  if (figures.length < 2) return null;

  return (
    <div
      data-testid="key-figures-strip"
      className={cn(
        'flex flex-wrap items-center gap-2 mb-3 pt-0.5 select-none',
        className
      )}
    >
      {figures.map((fig) => (
        <div
          key={fig.id}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAFAF8] dark:bg-[#141210] border border-[#E8E5DE] dark:border-[#2E2A24] text-[11px] font-mono shadow-2xs"
        >
          <span
            className={cn(
              'font-semibold tabular-nums',
              fig.isNegative
                ? 'text-[#B42318]'
                : fig.isPrimary
                ? 'text-[#FF7102]'
                : 'text-[#1A1815] dark:text-[#FAFAF8]'
            )}
          >
            {fig.formattedValue}
          </span>
          <span className="text-[#5A5650] dark:text-[#9A958E]">
            {fig.metricLabel}
          </span>
          {fig.formattedPeriod && (
            <span className="text-[#9A958E] dark:text-[#7A7670] text-[10px]">
              ({fig.formattedPeriod})
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
