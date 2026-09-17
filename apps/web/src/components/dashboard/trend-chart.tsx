'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatIndianCurrency, formatPercent, formatPeriod } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { BarChart3, TrendingUp } from 'lucide-react';

export interface ChartDataPoint {
  period: string;
  value: number;
  label?: string;
  valueKind?: string;
  sourceReference?: string | null;
}

interface TrendChartProps {
  data: ChartDataPoint[];
  metricKey: string;
  unit: string;
  directionality?: string;
  title?: string;
  isLoading?: boolean;
  type?: 'area' | 'bar';
  height?: number;
  className?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: ChartDataPoint;
  }>;
  label?: string;
  unit: string;
}

function CustomTooltip({ active, payload, unit }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    const isCurrency = unit === 'currency' || unit === 'INR' || unit === '₹';
    const isPercent = unit === 'percent' || unit === '%';

    const formattedValue = isPercent
      ? formatPercent(item.value)
      : isCurrency
      ? formatIndianCurrency(item.value)
      : item.value.toLocaleString('en-IN');

    return (
      <div className="rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-3 shadow-md text-xs space-y-1">
        <div className="font-mono text-[11px] text-[#9A958E]">{formatPeriod(item.period)}</div>
        <div className="text-sm font-bold font-mono tabular-nums text-[#FF7102]">
          {formattedValue}
        </div>
        {item.valueKind && (
          <div className="text-[10px] text-[#9A958E] capitalize font-mono">
            Kind: {item.valueKind}
          </div>
        )}
        {item.sourceReference && (
          <div className="text-[10px] text-[#9A958E] max-w-[220px] truncate font-mono">
            Source: {item.sourceReference}
          </div>
        )}
      </div>
    );
  }
  return null;
}

export const TrendChart = React.memo(function TrendChart({
  data,
  unit,
  title,
  isLoading,
  type = 'area',
  height = 260,
  className,
}: TrendChartProps) {
  const [mounted, setMounted] = React.useState(false);
  const hasAnimatedRef = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
    hasAnimatedRef.current = true;
  }, []);

  // Performance Fix 6: Memoise derived chart array
  const formattedData = React.useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      ...d,
      formattedPeriod: formatPeriod(d.period),
    }));
  }, [data]);

  if (isLoading || !mounted) {
    return (
      <div
        className={cn(
          'w-full rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-5 space-y-4 shadow-xs',
          className
        )}
      >
        {title && <Skeleton className="h-4 w-36" />}
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
        {title && (
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] mb-4 text-[#1A1815] dark:text-[#FAFAF8] font-mono">
            {title}
          </h3>
        )}
        <EmptyState
          title="No trend data"
          description="Historical reporting periods for this metric have not been extracted yet."
          icon={BarChart3}
        />
      </div>
    );
  }

  const isCurrency = unit === 'currency' || unit === 'INR' || unit === '₹';
  const isPercent = unit === 'percent' || unit === '%';

  // Format ticks for Y axis
  const formatYAxisTick = (val: number) => {
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
  };

  const isAnimationActive = !hasAnimatedRef.current;

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-5 shadow-xs',
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#FF7102]" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1A1815] dark:text-[#FAFAF8] font-mono">
              {title}
            </h3>
          </div>
          <span className="text-[11px] text-[#9A958E] font-mono">
            {data.length} {data.length === 1 ? 'period' : 'periods'}
          </span>
        </div>
      )}

      <div style={{ height: `${height}px`, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E5DE" />
              <XAxis
                dataKey="formattedPeriod"
                stroke="#9A958E"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#9A958E"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxisTick}
              />
              <RechartsTooltip content={<CustomTooltip unit={unit} />} />
              <Bar
                dataKey="value"
                fill="#FF7102"
                radius={[4, 4, 0, 0]}
                isAnimationActive={isAnimationActive}
              />
            </BarChart>
          ) : (
            <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="crmAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFEFE2" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#FFEFE2" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E5DE" />
              <XAxis
                dataKey="formattedPeriod"
                stroke="#9A958E"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#9A958E"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxisTick}
              />
              <RechartsTooltip content={<CustomTooltip unit={unit} />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#FF7102"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#crmAreaGradient)"
                isAnimationActive={isAnimationActive}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
});
