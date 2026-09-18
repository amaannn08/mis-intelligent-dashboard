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
  LabelList,
  Rectangle,
  type BarShapeProps,
  type LabelProps,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatIndianCurrency, formatPercent, formatCompactCurrency } from '@/lib/formatters';
import type { ChartConfig } from '@mis/core';

export interface ChatMetricChartProps {
  charts?: ChartConfig[];
  className?: string;
}

const COMPANY_COLORS = [
  '#FF7102', // WEH Terracotta / Orange
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

function formatValueLabel(val: number, isPercent: boolean, isCurrency: boolean): string {
  if (typeof val !== 'number' || isNaN(val)) return '';
  if (val === 0) return '0';
  if (isPercent) {
    const sign = val < 0 ? '-' : '';
    return `${sign}${Math.abs(val).toFixed(0)}%`;
  }
  if (isCurrency) {
    return formatCompactCurrency(val, { space: false });
  }
  return val.toLocaleString('en-IN');
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

  // Zero-baseline domain calculation with 18% domain headroom padding
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

    const domainMin = minVal < 0 ? Math.floor(minVal * 1.18) : 0;
    const domainMax = maxVal > 0 ? Math.ceil(maxVal * 1.18) : 0;
    return [domainMin, domainMax];
  }, [chartData, seriesKeys]);

  const formatYAxisTick = React.useCallback(
    (val: number) => {
      if (val === 0) return '0';
      if (isPercent) return `${val.toFixed(0)}%`;
      if (isCurrency) {
        return formatCompactCurrency(val, { space: false });
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

  // Suppress value labels if chart has more than 8 bars (crowding prevention)
  const showValueLabels = chartData.length <= 8;

  const renderBarLabel = React.useCallback(
    (props: LabelProps) => {
      const x = Number(props.x ?? 0);
      const y = Number(props.y ?? 0);
      const width = Number(props.width ?? 0);
      const height = Number(props.height ?? 0);
      const value = props.value;

      if (value === undefined || value === null) return null;
      const num = Number(value);
      if (isNaN(num)) return null;

      const formatted = formatValueLabel(num, isPercent, isCurrency);
      const isNegative = num < 0;
      // In Recharts Bar with negative value, y is at zero line, height is positive downwards
      const labelY = isNegative ? y + height + 11 : y - 4;

      return (
        <text
          x={x + width / 2}
          y={labelY}
          fill={isNegative ? '#B42318' : '#5A5650'}
          textAnchor="middle"
          fontSize={9.5}
          fontFamily="var(--font-dm-mono), monospace"
          fontWeight={500}
          className={isNegative ? 'fill-[#B42318]' : 'fill-[#5A5650] dark:fill-[#A8A39A]'}
        >
          {formatted}
        </text>
      );
    },
    [isPercent, isCurrency]
  );

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="w-full rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-2.5 sm:p-3.5 shadow-2xs space-y-1.5 min-w-0 overflow-hidden"
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

      {/* Editorial Compact Bar Chart Container: 160 px Desktop / 140 px Mobile */}
      <div className="h-[140px] sm:h-[160px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            barCategoryGap="24%"
            margin={{ top: 18, right: 12, left: -6, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="2 4"
              vertical={false}
              stroke="#E8E5DE"
              strokeOpacity={0.7}
              className="dark:stroke-[#2E2A24]"
            />
            {/* Emphasized Zero Baseline */}
            <ReferenceLine y={0} stroke="#9A958E" strokeWidth={1.5} />
            <XAxis
              dataKey="formattedPeriod"
              stroke="#9A958E"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            {/* Single Left Axis ONLY (<= 4 ticks) */}
            <YAxis
              domain={yDomain}
              tickCount={4}
              stroke="#9A958E"
              fontSize={9.5}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxisTick}
            />
            <RechartsTooltip content={<CustomTooltip unit={chart.unit} />} />
            {seriesKeys.map((key, seriesIdx) => (
              <Bar
                key={key}
                dataKey={key}
                maxBarSize={36}
                isAnimationActive={false}
                shape={(barProps: BarShapeProps) => {
                  const rawVal = barProps.value;
                  const val =
                    typeof rawVal === 'number'
                      ? rawVal
                      : Array.isArray(rawVal)
                        ? Number(rawVal[1] ?? 0)
                        : Number(rawVal ?? 0);
                  const isNegative = val < 0;
                  const radius: [number, number, number, number] = isNegative
                    ? [0, 0, 4, 4]
                    : [4, 4, 0, 0];
                  return <Rectangle {...barProps} radius={radius} />;
                }}
              >
                {/* Value labels on bars */}
                {showValueLabels && (
                  <LabelList
                    dataKey={key}
                    content={renderBarLabel}
                  />
                )}
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

  // 2-Column Grid for >= 2 charts at >= 1280 px (xl:grid-cols-2)
  const isMultiGrid = charts.length >= 2;

  return (
    <div
      data-testid="chat-metric-charts"
      className={cn(
        isMultiGrid
          ? 'grid grid-cols-1 xl:grid-cols-2 gap-3.5 my-2 w-full min-w-0'
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
