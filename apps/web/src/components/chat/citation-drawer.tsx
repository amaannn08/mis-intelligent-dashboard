'use client';

import * as React from 'react';
import type { Citation } from '@/components/ai/citation-list';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatPeriod } from '@/lib/formatters';
import { X, FileText, Download, Building2, Calendar, FileSpreadsheet } from 'lucide-react';

interface CitationDrawerProps {
  citation: Citation | null;
  onClose: () => void;
}

export function CitationDrawer({ citation, onClose }: CitationDrawerProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && citation) {
        onClose();
      }
    };
    if (citation) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [citation, onClose]);

  if (!citation) return null;

  const companyName = citation.companyName || citation.company;
  const citationIndex = citation.index;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md sm:max-w-lg bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-5 border-b border-border flex items-start justify-between gap-3 bg-muted/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="truncate">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {citationIndex ? `Source Citation [${citationIndex}]` : 'Source Grounding Chunk'}
                  </h3>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {citation.filename || 'Verified MIS Filing'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close source chunk drawer"
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Metadata Badges */}
            <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Document Metadata
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {companyName && (
                  <div>
                    <span className="text-muted-foreground block text-[10px] flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> Company
                    </span>
                    <span className="font-medium text-foreground">{companyName}</span>
                  </div>
                )}

                {citation.reportingPeriod && (
                  <div>
                    <span className="text-muted-foreground block text-[10px] flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Reporting Period
                    </span>
                    <span className="font-mono font-medium text-foreground">
                      {formatPeriod(citation.reportingPeriod)}
                    </span>
                  </div>
                )}

                {citation.chunkIndex !== undefined && (
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Chunk Index</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      #{citation.chunkIndex}
                    </Badge>
                  </div>
                )}

                {(citation.sheetName || citation.page) && (
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Location</span>
                    <span className="text-xs text-foreground font-mono">
                      {citation.sheetName ? `Sheet: ${citation.sheetName}` : `Page ${citation.page}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Extracted Chunk Content */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span>Grounding Text Excerpt</span>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Verified DB Record
                </Badge>
              </div>

              <div className="p-4 rounded-xl border border-border bg-card text-xs leading-relaxed text-foreground font-sans whitespace-pre-wrap select-text max-h-[380px] overflow-y-auto">
                {citation.snippet || 'No text snippet available for this citation.'}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Close
            </Button>

            {citation.documentId && (
              <Button asChild size="sm" variant="default" className="gap-1.5 text-xs">
                <a
                  href={`/api/documents/${citation.documentId}/file`}
                  download={citation.filename || 'mis-filing.xlsx'}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Filing</span>
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
