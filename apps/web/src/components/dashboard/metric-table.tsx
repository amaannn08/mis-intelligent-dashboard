'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatIndianCurrency, formatPercent, formatPeriod } from '@/lib/formatters';
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

export const MetricTable = React.memo(function MetricTable({
  metrics,
  isLoading,
  onSelectDocument,
  className,
}: MetricTableProps) {
  const [selectedSource, setSelectedSource] = React.useState<MetricRowData | null>(null);

  if (isLoading) {
    return (
      <div className={cn('rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-5 space-y-3 shadow-xs', className)}>
        <Skeleton className="h-4 w-36 mb-2" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
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
    if (numVal === null || numVal === undefined || numVal === '') return '—';
    const n = typeof numVal === 'string' ? parseFloat(numVal) : numVal;
    if (isNaN(n)) return '—';
    if (unit === 'percent' || unit === '%') return formatPercent(n);
    if (unit === 'currency' || unit === 'INR' || unit === '₹') return formatIndianCurrency(n);
    return n.toLocaleString('en-IN');
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Desktop Matrix Table */}
      <div className="hidden md:block rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-[#FAFAF8] dark:bg-[#141210] border-b border-[#E8E5DE] dark:border-[#2E2A24] text-[10px] uppercase font-medium text-[#C8C3BB] tracking-[0.22em] font-mono select-none">
              <tr>
                <th scope="col" className="px-5 py-3.5 text-left w-56">
                  Metric
                </th>
                <th scope="col" className="px-3 py-3.5 text-left w-24">
                  Unit
                </th>
                {periods.map((period) => (
                  <th
                    key={period}
                    scope="col"
                    className="px-5 py-3.5 text-right font-mono tabular-nums min-w-[130px]"
                  >
                    {formatPeriod(period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24]">
              {metricKeys.map((key) => {
                const meta = metricMeta.get(key) || { label: key, unit: 'currency' };
                return (
                  <tr key={key} className="hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8]">
                      {meta.label}
                    </td>
                    <td className="px-3 py-3.5 text-xs text-[#9A958E] capitalize font-mono text-[11px]">
                      {meta.unit}
                    </td>
                    {periods.map((period) => {
                      const item = matrix.get(`${key}_${period}`);
                      if (!item) {
                        return (
                          <td
                            key={period}
                            className="px-5 py-3.5 text-right text-xs text-[#C8C3BB] font-mono select-none"
                          >
                            <Tooltip content={`Metric ${meta.label} not reported for ${formatPeriod(period)}`}>
                              <span className="cursor-help">—</span>
                            </Tooltip>
                          </td>
                        );
                      }

                      const isCalculated = item.valueKind === 'calculated';

                      return (
                        <td
                          key={period}
                          className="px-5 py-3.5 text-right font-mono tabular-nums text-xs font-semibold text-[#1A1815] dark:text-[#FAFAF8]"
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
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[9px] font-mono font-medium bg-[#E8EEF7] text-[#3A5F8C] cursor-help">
                                  calc
                                </span>
                              </Tooltip>
                            )}

                            {item.sourceReference ? (
                              <button
                                type="button"
                                onClick={() => setSelectedSource(item)}
                                className="group inline-flex items-center gap-1 hover:text-[#FF7102] transition-colors cursor-pointer text-[#1A1815] dark:text-[#FAFAF8]"
                                title="Click to view extraction source reference"
                              >
                                <span>{formatValue(item.value, meta.unit)}</span>
                                <Info className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity text-[#9A958E]" />
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
      <div className="block md:hidden space-y-3">
        {periods.map((period) => {
          const periodMetrics = metrics.filter((m) => m.reportingPeriod === period);
          return (
            <div
              key={period}
              className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-4 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between border-b border-[#E8E5DE] dark:border-[#2E2A24] pb-2">
                <span className="font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8]">
                  {formatPeriod(period)}
                </span>
                <span className="text-[10px] text-[#9A958E] font-mono">
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
                      className="flex items-center justify-between text-xs py-1 border-b border-[#E8E5DE]/40 dark:border-[#2E2A24]/40 last:border-0"
                    >
                      <span className="text-[#5A5650] dark:text-[#9A958E] text-[11px]">{meta.label}</span>
                      <div className="flex items-center gap-1.5">
                        {item?.valueKind === 'calculated' && (
                          <span className="px-1 py-0.2 rounded-[3px] text-[9px] bg-[#E8EEF7] text-[#3A5F8C] font-mono">
                            calc
                          </span>
                        )}
                        <span className="font-semibold font-mono tabular-nums text-[#1A1815] dark:text-[#FAFAF8] text-xs">
                          {item ? formatValue(item.value, meta.unit) : '—'}
                        </span>
                        {item?.sourceReference && (
                          <button
                            type="button"
                            onClick={() => setSelectedSource(item)}
                            className="text-[#9A958E] hover:text-[#1A1815]"
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
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#FAFAF8] dark:bg-[#141210] border border-[#E8E5DE] dark:border-[#2E2A24]">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono block mb-1">
                  Metric
                </span>
                <span className="font-semibold text-[#1A1815] dark:text-[#FAFAF8] text-xs">
                  {selectedSource.label || selectedSource.metricKey}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono block mb-1">
                  Period
                </span>
                <span className="font-mono text-[#1A1815] dark:text-[#FAFAF8] text-xs font-semibold">
                  {formatPeriod(selectedSource.reportingPeriod)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono block mb-1">
                  Extracted Value
                </span>
                <span className="font-mono font-bold text-[#FF7102] text-sm">
                  {formatValue(selectedSource.value, selectedSource.unit)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono block mb-1">
                  Kind
                </span>
                <span className="inline-flex items-center rounded-[4px] bg-[#EEECE7] dark:bg-[#26231F] px-1.5 py-0.5 text-[10px] font-mono font-medium text-[#5A5650] dark:text-[#9A958E]">
                  {selectedSource.valueKind || 'reported'}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono block mb-1.5">
                Exact Coordinate / Source:
              </span>
              <div className="p-3 rounded-xl bg-[#FAFAF8] dark:bg-[#141210] font-mono text-xs text-[#1A1815] dark:text-[#FAFAF8] whitespace-pre-wrap break-all border border-[#E8E5DE] dark:border-[#2E2A24]">
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
                  className="inline-flex items-center gap-1.5 text-xs text-[#FF7102] font-semibold hover:underline cursor-pointer"
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
});
