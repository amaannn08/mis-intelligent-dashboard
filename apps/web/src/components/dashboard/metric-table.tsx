'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatIndianCurrency, formatPercent, formatPeriod } from '@/lib/formatters';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { FileText, Info } from 'lucide-react';

export interface MetricRowData {
  id?: string;
  metricKey: string;
  label: string;
  unit: string;
  value: number | string | null;
  reportingPeriod: string;
  valueKind?: 'reported' | 'calculated' | 'estimated' | string;
  sourceReference?: string | null;
  confidence?: number | null;
  documentId?: string | null;
}

interface MetricTableProps {
  metrics: MetricRowData[];
  isLoading?: boolean;
  onSelectDocument?: (docId: string) => void;
  className?: string;
}

export function MetricTable({
  metrics,
  isLoading,
  onSelectDocument,
  className,
}: MetricTableProps) {
  const [selectedSource, setSelectedSource] = React.useState<MetricRowData | null>(null);

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-4 space-y-3', className)}>
        <Skeleton className="h-6 w-36 mb-2" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <EmptyState
        title="No extracted metrics"
        description="No financial metrics have been extracted from uploaded MIS documents yet."
        icon={FileText}
      />
    );
  }

  // Get unique periods sorted chronologically
  const periods = Array.from(new Set(metrics.map((m) => m.reportingPeriod))).sort();
  // Get unique metric keys
  const metricKeys = Array.from(new Set(metrics.map((m) => m.metricKey)));

  // Map metric keys to their label and unit
  const metricMeta = new Map<string, { label: string; unit: string }>();
  metrics.forEach((m) => {
    if (!metricMeta.has(m.metricKey)) {
      metricMeta.set(m.metricKey, {
        label: m.label || m.metricKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        unit: m.unit,
      });
    }
  });

  // Map: `${metricKey}_${period}` -> MetricRowData
  const matrix = new Map<string, MetricRowData>();
  metrics.forEach((m) => {
    matrix.set(`${m.metricKey}_${m.reportingPeriod}`, m);
  });

  const formatValue = (numVal: number | string | null, unit: string) => {
    if (numVal === null || numVal === undefined || numVal === '') return 'Not available';
    const n = typeof numVal === 'string' ? parseFloat(numVal) : numVal;
    if (isNaN(n)) return 'Not available';
    if (unit === 'percent' || unit === '%') return formatPercent(n);
    if (unit === 'currency' || unit === 'INR' || unit === '₹') return formatIndianCurrency(n);
    return n.toLocaleString('en-IN');
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Desktop Matrix Table */}
      <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted/40 border-b border-border text-xs uppercase font-medium text-muted-foreground tracking-wider select-none">
              <tr>
                <th scope="col" className="px-4 py-3.5 text-left w-56">
                  Metric
                </th>
                <th scope="col" className="px-3 py-3.5 text-left w-24">
                  Unit
                </th>
                {periods.map((period) => (
                  <th
                    key={period}
                    scope="col"
                    className="px-4 py-3.5 text-right font-mono tabular-nums min-w-[130px]"
                  >
                    {formatPeriod(period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {metricKeys.map((key) => {
                const meta = metricMeta.get(key) || { label: key, unit: 'currency' };
                return (
                  <tr key={key} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      {meta.label}
                    </td>
                    <td className="px-3 py-3.5 text-xs text-muted-foreground capitalize">
                      {meta.unit}
                    </td>
                    {periods.map((period) => {
                      const item = matrix.get(`${key}_${period}`);
                      if (!item) {
                        return (
                          <td
                            key={period}
                            className="px-4 py-3.5 text-right text-xs text-muted-foreground/50 italic select-none"
                          >
                            <Tooltip content={`Metric ${meta.label} not reported for ${formatPeriod(period)}`}>
                              <span className="cursor-help">Not available</span>
                            </Tooltip>
                          </td>
                        );
                      }

                      const isCalculated = item.valueKind === 'calculated';

                      return (
                        <td
                          key={period}
                          className="px-4 py-3.5 text-right font-mono tabular-nums text-sm font-medium"
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            {isCalculated && (
                              <Tooltip
                                content={
                                  item.sourceReference
                                    ? `Calculated: ${item.sourceReference}`
                                    : 'Calculated metric from reported values'
                                }
                              >
                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-sans font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 cursor-help">
                                  calc
                                </span>
                              </Tooltip>
                            )}

                            {item.sourceReference ? (
                              <button
                                type="button"
                                onClick={() => setSelectedSource(item)}
                                className="group inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer text-foreground"
                                title="Click to view extraction source reference"
                              >
                                <span>{formatValue(item.value, meta.unit)}</span>
                                <Info className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity text-muted-foreground" />
                              </button>
                            ) : (
                              <span>{formatValue(item.value, meta.unit)}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Matrix / Cards */}
      <div className="block md:hidden space-y-4">
        {periods.map((period) => {
          const periodMetrics = metrics.filter((m) => m.reportingPeriod === period);
          return (
            <div
              key={period}
              className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="font-semibold text-sm text-foreground">
                  {formatPeriod(period)}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {periodMetrics.length} metrics
                </span>
              </div>
              <div className="space-y-2">
                {metricKeys.map((key) => {
                  const meta = metricMeta.get(key) || { label: key, unit: 'currency' };
                  const item = matrix.get(`${key}_${period}`);
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0"
                    >
                      <span className="text-muted-foreground">{meta.label}</span>
                      <div className="flex items-center gap-1.5">
                        {item?.valueKind === 'calculated' && (
                          <span className="px-1 py-0.2 rounded text-[10px] bg-blue-500/10 text-blue-600 font-sans">
                            calc
                          </span>
                        )}
                        <span className="font-medium font-mono tabular-nums text-foreground">
                          {item ? formatValue(item.value, meta.unit) : 'Not available'}
                        </span>
                        {item?.sourceReference && (
                          <button
                            type="button"
                            onClick={() => setSelectedSource(item)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="View source reference"
                          >
                            <Info className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Source Reference Modal */}
      <Modal
        isOpen={Boolean(selectedSource)}
        onClose={() => setSelectedSource(null)}
        title="Metric Extraction Source"
        maxWidth="md"
      >
        {selectedSource && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border border-border">
              <div>
                <span className="text-muted-foreground block mb-0.5">Metric</span>
                <span className="font-semibold text-foreground text-sm">
                  {selectedSource.label || selectedSource.metricKey}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Reporting Period</span>
                <span className="font-mono text-foreground text-sm">
                  {formatPeriod(selectedSource.reportingPeriod)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Extracted Value</span>
                <span className="font-mono font-bold text-foreground text-sm">
                  {formatValue(selectedSource.value, selectedSource.unit)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Kind</span>
                <Badge variant={selectedSource.valueKind === 'calculated' ? 'secondary' : 'outline'}>
                  {selectedSource.valueKind || 'reported'}
                </Badge>
              </div>
            </div>

            <div>
              <span className="text-muted-foreground font-medium block mb-1.5">
                Exact Spreadsheet / Document Coordinate:
              </span>
              <div className="p-3 rounded-md bg-muted font-mono text-xs text-foreground whitespace-pre-wrap break-all border border-border/60">
                {selectedSource.sourceReference || 'Direct extraction from MIS report'}
              </div>
            </div>

            {selectedSource.documentId && onSelectDocument && (
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const docId = selectedSource.documentId!;
                    setSelectedSource(null);
                    onSelectDocument(docId);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>View Source Document Details</span>
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
