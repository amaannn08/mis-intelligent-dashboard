import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export type DocumentStatus =
  | 'pending'
  | 'parsing'
  | 'extracting'
  | 'embedding'
  | 'processed'
  | 'failed';

interface StatusPillProps {
  status: DocumentStatus | string;
  className?: string;
  showIcon?: boolean;
}

export function StatusPill({ status, className, showIcon = true }: StatusPillProps) {
  const normStatus = status.toLowerCase();

  switch (normStatus) {
    case 'processed':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20',
            className
          )}
        >
          {showIcon && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
          <span className="capitalize">Processed</span>
        </span>
      );

    case 'failed':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20',
            className
          )}
        >
          {showIcon && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
          <span className="capitalize">Failed</span>
        </span>
      );

    case 'parsing':
    case 'extracting':
    case 'embedding':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 animate-pulse',
            className
          )}
        >
          {showIcon && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />}
          <span className="capitalize">{normStatus}…</span>
        </span>
      );

    case 'pending':
    default:
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20',
            className
          )}
        >
          {showIcon && <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
          <span className="capitalize">{normStatus}</span>
        </span>
      );
  }
}
