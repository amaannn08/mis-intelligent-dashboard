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
      <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs space-y-1">
        <div className="font-medium text-foreground">{formatPeriod(item.period)}</div>
        <div className="text-sm font-bold font-mono tabular-nums text-primary">
          {formattedValue}
        </div>
        {item.valueKind && (
          <div className="text-[10px] text-muted-foreground capitalize">
            Kind: {item.valueKind}
          </div>
        )}
        {item.sourceReference && (
          <div className="text-[10px] text-muted-foreground/80 max-w-[200px] truncate">
            Source: {item.sourceReference}
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function TrendChart({
  data,
  unit,
  title,
  isLoading,
  type = 'area',
  height = 260,
  className,
}: TrendChartProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (isLoading || !mounted) {
    return (
      <div className={cn('w-full rounded-xl border border-border bg-card p-5 space-y-4', className)}>
        {title && <Skeleton className="h-5 w-40" />}
        <Skeleton style={{ height: `${height}px` }} className="w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn('w-full rounded-xl border border-border bg-card p-5', className)}>
        {title && <h3 className="text-sm font-semibold mb-4 text-foreground">{title}</h3>}
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

  const formattedData = data.map((d) => ({
    ...d,
    formattedPeriod: formatPeriod(d.period),
  }));

  return (
    <div className={cn('w-full rounded-xl border border-border bg-card p-5 shadow-2xs', className)}>
      {title && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {data.length} {data.length === 1 ? 'period' : 'periods'}
          </span>
        </div>
      )}

      <div style={{ height: `${height}px`, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
              <XAxis
                dataKey="formattedPeriod"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxisTick}
              />
              <RechartsTooltip content={<CustomTooltip unit={unit} />} />
              <Bar
                dataKey="value"
                fill="var(--primary)"
                radius={[4, 4, 0, 0]}
                animationDuration={180}
              />
            </BarChart>
          ) : (
            <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
              <XAxis
                dataKey="formattedPeriod"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxisTick}
              />
              <RechartsTooltip content={<CustomTooltip unit={unit} />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#chartGradient)"
                animationDuration={180}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
