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

export function CitationList({
  citations,
  onCitationClick,
  className,
}: CitationListProps) {
  if (!citations || citations.length === 0) return null;

  return (
    <div className={cn('space-y-2 pt-2 border-t border-border/60', className)}>
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        Grounding Sources & Citations
      </div>
      <div className="flex flex-wrap gap-2">
        {citations.map((c, idx) => {
          const comp = c.companyName || c.company;
          const label = [
            comp,
            c.filename,
            c.reportingPeriod ? formatPeriod(c.reportingPeriod) : null,
            c.chunkIndex !== undefined ? `chunk #${c.chunkIndex}` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <button
              key={`${c.documentId || c.filename || idx}-${c.chunkIndex || idx}`}
              type="button"
              onClick={() => onCitationClick?.(c)}
              className={cn(
                'group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-muted/60 hover:bg-muted text-foreground border border-border/80 transition-colors text-left max-w-full truncate',
                onCitationClick && 'cursor-pointer hover:border-primary/40'
              )}
              title={c.snippet || label}
            >
              <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="truncate">{label}</span>
              {onCitationClick && (
                <ExternalLink className="w-3 h-3 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
