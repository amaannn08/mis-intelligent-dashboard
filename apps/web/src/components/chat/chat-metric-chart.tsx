'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatIndianCurrency, formatPercent } from '@/lib/formatters';
import type { ChartConfig } from '@mis/core';

export interface ChatMetricChartProps {
  charts?: ChartConfig[];
  className?: string;
}

const COMPANY_COLORS = [
  '#FF7102', // WEH Orange
  '#3A5F8C', // WEH Navy / Slate
  '#107569', // Teal
  '#7A5AF8', // Purple
  '#B54708', // Amber
];

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

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    payload: Record<string, unknown>;
  }>;
  label?: string;
  unit: string;
}

function CustomTooltip({ active, payload, unit }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const isCurrency = unit === 'currency';
  const isPercent = unit === 'percent';
  const rawPeriod = String(payload[0]?.payload.period || '');
  const formattedPeriod = formatShortPeriod(rawPeriod) || rawPeriod;

  return (
    <div className="rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-2.5 shadow-md text-xs space-y-1 z-50 pointer-events-none">
      <div className="font-mono text-[10px] text-[#9A958E]">{formattedPeriod}</div>
      {payload.map((item, idx) => {
        const val = typeof item.value === 'number' ? item.value : 0;
        const formatted = isPercent
          ? formatPercent(val)
          : isCurrency
          ? formatIndianCurrency(val)
          : val.toLocaleString('en-IN');

        return (
          <div key={idx} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-[11px] text-[#5A5650] dark:text-[#9A958E] font-medium">
              {item.dataKey}:
            </span>
            <span
              className={cn(
                'font-bold font-mono tabular-nums',
                val < 0 ? 'text-[#B42318]' : 'text-[#FF7102]'
              )}
            >
              {formatted}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SingleMetricChart({ chart }: { chart: ChartConfig }) {
  const isCurrency = chart.unit === 'currency';
  const isPercent = chart.unit === 'percent';

  // Transform Recharts row data: [{ period, formattedPeriod, [companyName]: value }]
  const { chartData, seriesKeys, startPeriod, endPeriod } = React.useMemo(() => {
    const periodMap = new Map<string, Record<string, unknown>>();
    const keys: string[] = [];

    chart.series.forEach((s) => {
      const key = s.companyName || 'Value';
      if (!keys.includes(key)) {
        keys.push(key);
      }

      s.points.forEach((p) => {
        if (!periodMap.has(p.period)) {
          periodMap.set(p.period, {
            period: p.period,
            formattedPeriod: formatShortPeriod(p.period),
          });
        }
        periodMap.get(p.period)![key] = p.value;
      });
    });

    const data = Array.from(periodMap.values()).sort((a, b) =>
      String(a.period).localeCompare(String(b.period))
    );

    const start = data.length > 0 ? formatShortPeriod(String(data[0]?.period)) : '';
    const end = data.length > 0 ? formatShortPeriod(String(data[data.length - 1]?.period)) : '';

    return { chartData: data, seriesKeys: keys, startPeriod: start, endPeriod: end };
  }, [chart]);

  // Zero-baseline domain calculation:
  // Must always include 0 so bars anchor to the 0 baseline and negative bars extend downwards.
  const yDomain = React.useMemo<[number, number]>(() => {
    let minVal = 0;
    let maxVal = 0;
    for (const entry of chartData) {
      for (const key of seriesKeys) {
        const v = entry[key];
        if (typeof v === 'number') {
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
      }
    }

    if (minVal === 0 && maxVal === 0) {
      return [0, 100];
    }

    const domainMin = minVal < 0 ? Math.round(minVal * 1.15) : 0;
    const domainMax = maxVal > 0 ? Math.round(maxVal * 1.15) : 0;
    return [domainMin, domainMax];
  }, [chartData, seriesKeys]);

  const formatYAxisTick = React.useCallback(
    (val: number) => {
      if (val === 0) return '0';
      if (isPercent) return `${val.toFixed(0)}%`;
      if (isCurrency) {
        const abs = Math.abs(val);
        const sign = val < 0 ? '-' : '';
        if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(1)}Cr`;
        if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(0)}L`;
        if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(0)}k`;
        return `${sign}₹${abs}`;
      }
      return val.toLocaleString('en-IN');
    },
    [isCurrency, isPercent]
  );

  const isMultiSeries = seriesKeys.length > 1;
  const companyTitle = !isMultiSeries && chart.series[0]?.companyName
    ? `· ${chart.series[0].companyName}`
    : '';

  const companyLabel = chart.series.map((s) => s.companyName).filter(Boolean).join(', ') || 'portfolio';
  const rangeLabel = startPeriod && endPeriod ? `${startPeriod} to ${endPeriod}` : `${chartData.length} periods`;
  const ariaLabel = `${chart.label} · ${companyLabel} · ${rangeLabel}`;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="w-full rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-3 sm:p-4 shadow-2xs space-y-2 min-w-0 overflow-hidden"
    >
      {/* Micro-label Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-[#9A958E] dark:text-[#A8A39A] truncate">
            {chart.label} {companyTitle}
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#C8C3BB] shrink-0">
          {startPeriod && endPeriod ? `${startPeriod} → ${endPeriod}` : `${chartData.length} periods`}
        </span>
      </div>

      {/* Bar Chart Container */}
      <div className="h-[150px] sm:h-[170px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E5DE" />
            <ReferenceLine y={0} stroke="#E8E5DE" strokeWidth={1} />
            <XAxis
              dataKey="formattedPeriod"
              stroke="#9A958E"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={yDomain}
              stroke="#9A958E"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxisTick}
            />
            <RechartsTooltip content={<CustomTooltip unit={chart.unit} />} />
            {seriesKeys.map((key, seriesIdx) => (
              <Bar
                key={key}
                dataKey={key}
                radius={[2, 2, 2, 2]}
                isAnimationActive={false}
              >
                {chartData.map((entry, entryIdx) => {
                  const val = entry[key];
                  const numVal = typeof val === 'number' ? val : 0;
                  const defaultColor = COMPANY_COLORS[seriesIdx % COMPANY_COLORS.length] || '#FF7102';
                  const fill = numVal < 0 ? '#B42318' : defaultColor;

                  return <Cell key={`cell-${entryIdx}`} fill={fill} />;
                })}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export const ChatMetricChart = React.memo(function ChatMetricChart({
  charts,
  className,
}: ChatMetricChartProps) {
  if (!charts || charts.length === 0) return null;

  const isMultiGrid = charts.length >= 3;

  return (
    <div
      className={cn(
        isMultiGrid
          ? 'grid grid-cols-1 xl:grid-cols-2 gap-3 my-2 w-full min-w-0'
          : 'space-y-3 my-2 w-full min-w-0',
        className
      )}
    >
      {charts.slice(0, 4).map((chart) => (
        <SingleMetricChart key={chart.id || chart.metricKey} chart={chart} />
      ))}
    </div>
  );
});
