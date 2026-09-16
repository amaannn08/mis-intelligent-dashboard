'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';
import { EmptyState } from './empty-state';
import { Button } from './button';
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, AlertCircle } from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  onRowClick?: (row: T) => void;
  renderMobileCard?: (row: T) => React.ReactNode;
  pagination?: {
    page: number;
    totalPages: number;
    totalCount?: number;
    onPageChange: (page: number) => void;
  };
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (columnKey: string) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading,
  error,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no entries to display at this time.',
  emptyActionLabel,
  onEmptyAction,
  onRowClick,
  renderMobileCard,
  pagination,
  sortColumn,
  sortDirection,
  onSort,
  className,
}: DataTableProps<T>) {
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <h4 className="text-sm font-semibold text-destructive">Failed to load data</h4>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Desktop Table: hidden on narrow screens (< md) */}
      <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted/40 border-b border-border text-xs uppercase font-medium text-muted-foreground tracking-wider select-none">
              <tr>
                {columns.map((col) => {
                  const isSorted = sortColumn === col.key;
                  const alignClass =
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left';

                  return (
                    <th
                      key={col.key}
                      scope="col"
                      className={cn('px-4 py-3.5', alignClass, col.className)}
                    >
                      {col.sortable && onSort ? (
                        <button
                          type="button"
                          onClick={() => onSort(col.key)}
                          className={cn(
                            'inline-flex items-center gap-1 hover:text-foreground font-semibold cursor-pointer',
                            col.align === 'right' && 'flex-row-reverse'
                          )}
                        >
                          <span>{col.header}</span>
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <span>{col.header}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((row) => {
                const key = keyExtractor(row);
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'hover:bg-muted/30 transition-colors',
                      onRowClick && 'cursor-pointer'
                    )}
                  >
                    {columns.map((col) => {
                      const alignClass =
                        col.align === 'right'
                          ? 'text-right tabular-nums'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left';

                      return (
                        <td
                          key={col.key}
                          className={cn('px-4 py-3 text-sm', alignClass, col.className)}
                        >
                          {col.render
                            ? col.render(row)
                            : (row as Record<string, unknown>)[col.key] != null
                            ? String((row as Record<string, unknown>)[col.key])
                            : '—'}
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

      {/* Mobile Card Grid: visible on narrow screens (< md) */}
      <div className="block md:hidden space-y-3">
        {data.map((row) => {
          const key = keyExtractor(row);
          if (renderMobileCard) {
            return (
              <div
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && 'cursor-pointer')}
              >
                {renderMobileCard(row)}
              </div>
            );
          }

          // Default generic mobile card
          return (
            <div
              key={key}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'p-4 rounded-xl border border-border bg-card shadow-2xs space-y-2',
                onRowClick && 'cursor-pointer active:bg-muted/50'
              )}
            >
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="flex items-center justify-between text-xs py-0.5"
                >
                  <span className="text-muted-foreground">{col.header}</span>
                  <span
                    className={cn(
                      'font-medium text-foreground',
                      col.align === 'right' && 'tabular-nums'
                    )}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground pt-1">
          <div>
            Page {pagination.page} of {pagination.totalPages}
            {pagination.totalCount !== undefined && ` (${pagination.totalCount} items)`}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              <span>Prev</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              aria-label="Next page"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
