'use client';

import * as React from 'react';
import type { Citation } from '@/components/ai/citation-list';
import { Button } from '@/components/ui/button';
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
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md sm:max-w-lg bg-white dark:bg-[#1C1A17] border-l border-[#E8E5DE] dark:border-[#2E2A24] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-[#E8E5DE] dark:border-[#2E2A24] flex items-start justify-between gap-3 bg-[#FAFAF8] dark:bg-[#141210]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-[7px] bg-[#FFEFE2] dark:bg-[#2D1F16] text-[#FF7102] flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div className="truncate">
                <h3 className="text-sm font-semibold text-[#1A1815] dark:text-[#FAFAF8]">
                  {citationIndex ? `Source Citation [${citationIndex}]` : 'Source Grounding Chunk'}
                </h3>
                <div className="text-xs text-[#9A958E] truncate mt-0.5 font-mono">
                  {citation.filename || 'Verified MIS Filing'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close source chunk drawer"
              className="rounded-lg p-1.5 text-[#9A958E] hover:text-[#1A1815] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
            {/* Metadata Badges */}
            <div className="p-4 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] space-y-3">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
                Document Metadata
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {companyName && (
                  <div>
                    <span className="text-[#9A958E] block text-[10px] font-mono flex items-center gap-1 mb-0.5">
                      <Building2 className="w-3 h-3 text-[#FF7102]" /> Company
                    </span>
                    <span className="font-semibold text-[#1A1815] dark:text-[#FAFAF8]">{companyName}</span>
                  </div>
                )}

                {citation.reportingPeriod && (
                  <div>
                    <span className="text-[#9A958E] block text-[10px] font-mono flex items-center gap-1 mb-0.5">
                      <Calendar className="w-3 h-3 text-[#FF7102]" /> Period
                    </span>
                    <span className="font-mono font-semibold text-[#1A1815] dark:text-[#FAFAF8]">
                      {formatPeriod(citation.reportingPeriod)}
                    </span>
                  </div>
                )}

                {citation.chunkIndex !== undefined && (
                  <div>
                    <span className="text-[#9A958E] block text-[10px] font-mono mb-0.5">Chunk Index</span>
                    <span className="font-mono text-xs text-[#5A5650] dark:text-[#9A958E] font-medium">
                      #{citation.chunkIndex}
                    </span>
                  </div>
                )}

                {(citation.sheetName || citation.page) && (
                  <div>
                    <span className="text-[#9A958E] block text-[10px] font-mono mb-0.5">Coordinate</span>
                    <span className="text-xs text-[#1A1815] dark:text-[#FAFAF8] font-mono">
                      {citation.sheetName ? `Sheet: ${citation.sheetName}` : `Page ${citation.page}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Extracted Chunk Content */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1A1815] dark:text-[#FAFAF8]">
                  <FileText className="w-3.5 h-3.5 text-[#FF7102]" />
                  <span>Grounding Text Excerpt</span>
                </div>
                <span className="inline-flex items-center rounded-[4px] bg-[#E8F5EE] dark:bg-[#1C2E24] px-1.5 py-0.5 text-[9px] font-mono font-medium text-[#3D7A58] dark:text-[#52B788]">
                  Verified DB Record
                </span>
              </div>

              <div className="p-4 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] text-xs leading-relaxed text-[#1A1815] dark:text-[#FAFAF8] font-mono whitespace-pre-wrap select-text max-h-[380px] overflow-y-auto">
                {citation.snippet || 'No text snippet available for this citation.'}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs rounded-xl border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] hover:bg-[#F5F4F0]"
            >
              Close
            </Button>

            {citation.documentId && (
              <a
                href={`/api/documents/${citation.documentId}/file`}
                download={citation.filename || 'mis-filing.xlsx'}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#FF7102] hover:bg-[#ff8a3a] text-white shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Filing</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
