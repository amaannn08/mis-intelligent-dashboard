'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatPeriod } from '@/lib/formatters';
import { FileText, ExternalLink } from 'lucide-react';

export interface Citation {
  index?: number;
  documentId?: string;
  filename?: string;
  companyName?: string;
  company?: string;
  reportingPeriod?: string;
  chunkIndex?: number;
  snippet?: string;
  sheetName?: string;
  page?: number;
}

interface CitationListProps {
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
  className?: string;
}

export const CitationList = React.memo(function CitationList({
  citations,
  onCitationClick,
  className,
}: CitationListProps) {
  if (!citations || citations.length === 0) return null;

  return (
    <div className={cn('space-y-2 pt-2 border-t border-[#E8E5DE] dark:border-[#2E2A24]', className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
        Sources & Citations
      </div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c, idx) => {
          const comp = c.companyName || c.company;
          const label = [
            comp,
            c.filename,
            c.reportingPeriod ? formatPeriod(c.reportingPeriod) : null,
            c.chunkIndex !== undefined ? `#${c.chunkIndex}` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <button
              key={`${c.documentId || c.filename || idx}-${c.chunkIndex || idx}`}
              type="button"
              onClick={() => onCitationClick?.(c)}
              className={cn(
                'group inline-flex items-center gap-1.5 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-2.5 py-0.5 text-[11px] font-mono text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] hover:text-[#1A1815] dark:hover:text-[#FAFAF8] shadow-xs transition-colors text-left max-w-full truncate cursor-pointer'
              )}
              title={c.snippet || label}
            >
              <FileText className="w-3 h-3 shrink-0 text-[#9A958E] group-hover:text-[#FF7102] transition-colors" />
              <span className="truncate">{label}</span>
              {onCitationClick && (
                <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
