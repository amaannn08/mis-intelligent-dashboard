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

export function StatusPill({ status, className, showIcon = false }: StatusPillProps) {
  const normStatus = (status || 'pending').toLowerCase();

  switch (normStatus) {
    case 'processed':
    case 'ready':
    case 'portfolio':
    case 'success':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[4px] bg-[#E8F5EE] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3D7A58] font-mono select-none dark:bg-[#1C2E24] dark:text-[#52B788]',
            className
          )}
        >
          {showIcon && <CheckCircle2 className="w-3 h-3 text-current" />}
          <span>Processed</span>
        </span>
      );

    case 'failed':
    case 'error':
    case 'pass':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[4px] bg-[#FEF3F2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#B42318] font-mono select-none dark:bg-[#341618] dark:text-[#F87171]',
            className
          )}
        >
          {showIcon && <AlertCircle className="w-3 h-3 text-current" />}
          <span>Failed</span>
        </span>
      );

    case 'parsing':
    case 'extracting':
    case 'embedding':
    case 'active':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[4px] bg-[#FFEFE2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#FF7102] font-mono select-none dark:bg-[#362215] dark:text-[#FFA057]',
            className
          )}
        >
          {showIcon && <Loader2 className="w-3 h-3 animate-spin text-current" />}
          <span>{normStatus}…</span>
        </span>
      );

    case 'pending':
    case 'uploaded':
    default:
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[4px] bg-[#E8EEF7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3A5F8C] font-mono select-none dark:bg-[#1A2636] dark:text-[#7EA5D9]',
            className
          )}
        >
          {showIcon && <Clock className="w-3 h-3 text-current" />}
          <span>{normStatus}</span>
        </span>
      );
  }
}
