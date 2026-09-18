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
import { formatIndianCurrency } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Percent, TrendingDown } from 'lucide-react';
import type { BurnEbitdaPoint } from '@/lib/burn-ebitda';

export interface BurnEbitdaChartProps {
  data: BurnEbitdaPoint[];
  title?: string;
  subtitle?: string;
  totalSelectedCompanies?: number;
  selectedCompanyNames?: string[];
  isLoading?: boolean;
  height?: number;
  className?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    payload: BurnEbitdaPoint;
  }>;
  totalSelectedCompanies?: number;
}

function CustomTooltip({ active, payload, totalSelectedCompanies }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-3 shadow-md text-xs space-y-2 z-50 pointer-events-none min-w-[240px]">
      <div className="flex items-center justify-between border-b border-[#E8E5DE]/70 dark:border-[#2E2A24]/70 pb-1.5">
        <span className="font-mono font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8]">
          {item.formattedPeriod}
        </span>
        <span className="text-[10px] font-mono text-[#9A958E]">
          {totalSelectedCompanies && totalSelectedCompanies > 1
            ? `${item.contributingCompaniesCount} of ${totalSelectedCompanies} reporting`
            : `${item.contributingCompaniesCount} ${item.contributingCompaniesCount === 1 ? 'company' : 'companies'}`}
        </span>
      </div>

      <div className="space-y-1.5">
        {/* EBITDA Margin % */}
        <div className="flex items-start justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'w-2 h-2 rounded-full inline-block shrink-0',
                item.ebitdaMarginPct < 0 ? 'bg-[#B42318]' : 'bg-[#FF7102]'
              )}
            />
            <span className="text-[#5A5650] dark:text-[#9A958E] font-medium text-[11px]">
              EBITDA Margin:
            </span>
          </div>
          <div className="text-right">
            <div
              className={cn(
                'font-mono font-bold tabular-nums text-xs',
                item.ebitdaMarginPct < 0 ? 'text-[#B42318]' : 'text-[#FF7102]'
              )}
            >
              {item.ebitdaMarginPct > 0 ? '+' : ''}
              {item.ebitdaMarginPct.toFixed(1)}%
            </div>
            <div className="text-[10px] text-[#9A958E] font-mono tabular-nums">
              {formatIndianCurrency(item.sumEbitda)} on {formatIndianCurrency(item.sumRevenue)}
            </div>
          </div>
        </div>

        {/* Burn as % of Revenue */}
        <div className="flex items-start justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block bg-[#3A5F8C] shrink-0" />
            <span className="text-[#5A5650] dark:text-[#9A958E] font-medium text-[11px]">
              Net Burn %:
            </span>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold tabular-nums text-xs text-[#3A5F8C] dark:text-[#7EA0C9]">
              {item.burnPct.toFixed(1)}%
            </div>
            <div className="text-[10px] text-[#9A958E] font-mono tabular-nums">
              {formatIndianCurrency(item.sumBurn)} burn on {formatIndianCurrency(item.sumRevenue)}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-1.5 border-t border-[#E8E5DE]/60 dark:border-[#2E2A24]/60 text-[9.5px] text-[#9A958E] font-mono leading-tight">
        Ratio of sums (Σ EBITDA ÷ Σ Revenue). Companies with zero or missing revenue excluded.
      </div>
    </div>
  );
}

export const BurnEbitdaChart = React.memo(function BurnEbitdaChart({
  data,
  title = 'Burn & EBITDA Margin % (MoM)',
  subtitle,
  totalSelectedCompanies,
  selectedCompanyNames,
  isLoading,
  height = 280,
  className,
}: BurnEbitdaChartProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (isLoading || !mounted) {
    return (
      <div
        className={cn(
          'w-full rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-5 space-y-4 shadow-xs',
          className
        )}
      >
        <Skeleton className="h-4 w-48" />
        <Skeleton style={{ height: `${height}px` }} className="w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          'w-full rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-5 shadow-xs',
          className
        )}
      >
        <div className="flex items-center gap-2 mb-4">
          <Percent className="w-4 h-4 text-[#FF7102]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1A1815] dark:text-[#FAFAF8] font-mono">
            {title}
          </h3>
        </div>
        <EmptyState
          title="No margin or burn data"
          description="None of the selected companies have reported positive revenue filings for calculating scale-independent ratios."
          icon={TrendingDown}
        />
      </div>
    );
  }

  // Calculate balanced Y-axis domain with zero baseline and 18% headroom
  let minVal = 0;
  let maxVal = 0;
  for (const d of data) {
    if (d.ebitdaMarginPct < minVal) minVal = d.ebitdaMarginPct;
    if (d.ebitdaMarginPct > maxVal) maxVal = d.ebitdaMarginPct;
    if (d.burnPct < minVal) minVal = d.burnPct;
    if (d.burnPct > maxVal) maxVal = d.burnPct;
  }

  const domainMin = minVal < 0 ? Math.floor(minVal * 1.18) : -10;
  const domainMax = maxVal > 0 ? Math.ceil(maxVal * 1.18) : 10;
  const yDomain: [number, number] = [domainMin, domainMax];

  // Y-axis tick formatter: formatted as % ticks (<= 4 ticks)
  const formatYAxisTick = (val: number) => {
    if (val === 0) return '0%';
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(0)}%`;
  };

  // Value labels on bars only when <= 8 periods
  const showValueLabels = data.length <= 8;

  const renderEbitdaLabel = (props: LabelProps) => {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const height = Number(props.height ?? 0);
    const val = Number(props.value);
    if (isNaN(val)) return null;

    const isNegative = val < 0;
    const labelY = isNegative ? y + height + 10 : y - 4;

    return (
      <text
        x={x + width / 2}
        y={labelY}
        fill={isNegative ? '#B42318' : '#5A5650'}
        textAnchor="middle"
        fontSize={9.5}
        fontFamily="var(--font-dm-mono), monospace"
        fontWeight={500}
        className={isNegative ? 'fill-[#B42318]' : 'fill-[#5A5650] dark:fill-[#C8C3BB]'}
      >
        {val > 0 ? `+${val.toFixed(0)}%` : `${val.toFixed(0)}%`}
      </text>
    );
  };

  const renderBurnLabel = (props: LabelProps) => {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const height = Number(props.height ?? 0);
    const val = Number(props.value);
    if (isNaN(val)) return null;

    // Burn is negative, sits below zero line
    const labelY = y + height + 10;

    return (
      <text
        x={x + width / 2}
        y={labelY}
        fill="#3A5F8C"
        textAnchor="middle"
        fontSize={9.5}
        fontFamily="var(--font-dm-mono), monospace"
        fontWeight={500}
        className="fill-[#3A5F8C] dark:fill-[#7EA0C9]"
      >
        {val.toFixed(0)}%
      </text>
    );
  };

  // Coverage statistics for honest aggregate labelling (Review item 8)
  const counts = data.map((d) => d.contributingCompaniesCount);
  const minCount = counts.length > 0 ? Math.min(...counts) : 0;
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
  const hasCountVariation = minCount !== maxCount;
  const isSingleCompanyData = maxCount === 1;

  const coverageBreakdown = data
    .map((d) => `${d.formattedPeriod}: ${d.contributingCompaniesCount} ${d.contributingCompaniesCount === 1 ? 'co.' : 'cos.'}`)
    .join(' · ');

  return (
    <div
      data-testid="burn-ebitda-chart"
      className={cn(
        'w-full rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-5 shadow-xs space-y-3',
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-[#FF7102]" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1A1815] dark:text-[#FAFAF8] font-mono">
              {title}
            </h3>
          </div>
          <p className="text-[11px] text-[#9A958E] font-mono mt-0.5">
            {subtitle || 'Ratio of sums (Σ EBITDA ÷ Σ Revenue) · Scale-independent MoM'}
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-mono select-none">
          <span className="inline-flex items-center gap-1.5 text-[#5A5650] dark:text-[#9A958E]">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#FF7102] inline-block" />
            <span>EBITDA Margin %</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#5A5650] dark:text-[#9A958E]">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#3A5F8C] inline-block" />
            <span>Net Burn %</span>
          </span>
        </div>
      </div>

      {/* Honest Single-Company Note when only 1 company has data */}
      {isSingleCompanyData && (
        <div className="px-3 py-1.5 rounded-lg bg-[#F5F4F0] dark:bg-[#201D19] border border-[#E8E5DE] dark:border-[#2E2A24] text-[#5A5650] dark:text-[#C8C3BB] text-[11px] font-mono flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF7102] shrink-0" />
          <span>
            Single-company reporting: showing{' '}
            {selectedCompanyNames && selectedCompanyNames.length === 1
              ? `${selectedCompanyNames[0]}'s`
              : '1 company’s'}{' '}
            stand-alone margin & burn series across these periods.
          </span>
        </div>
      )}

      {/* Plot Area */}
      <div style={{ height: `${height}px`, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barGap={2}
            barCategoryGap="22%"
            margin={{ top: 16, right: 12, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="2 4"
              vertical={false}
              stroke="#E8E5DE"
              strokeOpacity={0.7}
              className="dark:stroke-[#2E2A24]"
            />

            {/* Emphasized Zero Reference Line */}
            <ReferenceLine y={0} stroke="#9A958E" strokeWidth={1.5} />

            <XAxis
              dataKey="formattedPeriod"
              stroke="#9A958E"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />

            {/* Single Left Y-Axis ONLY */}
            <YAxis
              domain={yDomain}
              tickCount={4}
              stroke="#9A958E"
              fontSize={9.5}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxisTick}
            />

            <RechartsTooltip
              content={<CustomTooltip totalSelectedCompanies={totalSelectedCompanies} />}
            />

            {/* EBITDA Margin Bar Series */}
            <Bar
              dataKey="ebitdaMarginPct"
              name="EBITDA Margin %"
              maxBarSize={28}
              isAnimationActive={false}
              shape={(barProps: BarShapeProps) => {
                const rawVal = barProps.value;
                const val = typeof rawVal === 'number' ? rawVal : Number(rawVal ?? 0);
                const isNegative = val < 0;
                const radius: [number, number, number, number] = isNegative
                  ? [0, 0, 4, 4]
                  : [4, 4, 0, 0];
                return <Rectangle {...barProps} radius={radius} />;
              }}
            >
              {showValueLabels && (
                <LabelList dataKey="ebitdaMarginPct" content={renderEbitdaLabel} />
              )}
              {data.map((entry, idx) => (
                <Cell
                  key={`ebitda-cell-${idx}`}
                  fill={entry.ebitdaMarginPct < 0 ? '#B42318' : '#FF7102'}
                />
              ))}
            </Bar>

            {/* Net Burn % Bar Series */}
            <Bar
              dataKey="burnPct"
              name="Net Burn %"
              maxBarSize={28}
              isAnimationActive={false}
              shape={(barProps: BarShapeProps) => {
                const rawVal = barProps.value;
                const val = typeof rawVal === 'number' ? rawVal : Number(rawVal ?? 0);
                const isNegative = val < 0;
                const radius: [number, number, number, number] = isNegative
                  ? [0, 0, 4, 4]
                  : [4, 4, 0, 0];
                return <Rectangle {...barProps} radius={radius} />;
              }}
            >
              {showValueLabels && (
                <LabelList dataKey="burnPct" content={renderBurnLabel} />
              )}
              {data.map((entry, idx) => (
                <Cell key={`burn-cell-${idx}`} fill="#3A5F8C" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart Coverage & Included Companies Footer (Binding Addition 8) */}
      <div className="pt-2.5 border-t border-[#E8E5DE]/70 dark:border-[#2E2A24]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[10px] font-mono text-[#9A958E]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-[#5A5650] dark:text-[#C8C3BB]">Coverage:</span>
          {hasCountVariation ? (
            <span>{coverageBreakdown}</span>
          ) : (
            <span>
              {maxCount} {maxCount === 1 ? 'company' : 'companies'} reporting across all {data.length} periods
            </span>
          )}
        </div>

        {selectedCompanyNames && selectedCompanyNames.length > 0 && (
          <div
            className="truncate max-w-xs text-right sm:text-right"
            title={selectedCompanyNames.join(', ')}
          >
            Included:{' '}
            {selectedCompanyNames.length <= 3
              ? selectedCompanyNames.join(', ')
              : `${selectedCompanyNames.slice(0, 3).join(', ')} (+${selectedCompanyNames.length - 3} more)`}
          </div>
        )}
      </div>
    </div>
  );
});
