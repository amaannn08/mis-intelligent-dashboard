'use client';

import * as React from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { UploadDropzone } from './upload-dropzone';
import { DocumentDetailDrawer } from './document-detail-drawer';
import { StatusPill } from '@/components/ui/status-pill';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatBytes, formatPeriod } from '@/lib/formatters';
import {
  FileSpreadsheet,
  Download,
  Trash2,
  Eye,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';

interface CompanyInfo {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
}

export interface DocumentRow {
  id: string;
  filename: string;
  companyId: string;
  reportingPeriod: string | null;
  fileType: string;
  sizeBytes: number;
  status: string;
  error: string | null;
  uploadedAt: string;
  processedAt: string | null;
}

interface CompanyDocumentsViewProps {
  company: CompanyInfo;
  initialDocuments: DocumentRow[];
}

export function CompanyDocumentsView({
  company,
  initialDocuments,
}: CompanyDocumentsViewProps) {
  const [documents, setDocuments] = React.useState<DocumentRow[]>(initialDocuments);
  const [selectedDocId, setSelectedDocId] = React.useState<string | null>(null);
  const [isPolling, setIsPolling] = React.useState(false);

  // Delete state
  const [docToDelete, setDocToDelete] = React.useState<DocumentRow | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Function to refresh documents list
  const refreshDocuments = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/documents?companyId=${company.id}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      // ignore
    }
  }, [company.id]);

  // Check if any document is in a transitional status
  const hasTransitionalDocs = documents.some((doc) =>
    ['pending', 'parsing', 'extracting', 'embedding'].includes(doc.status.toLowerCase())
  );

  // Auto-polling effect while documents are actively processing
  React.useEffect(() => {
    if (!hasTransitionalDocs) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    const interval = setInterval(async () => {
      await refreshDocuments();
    }, 1800);

    return () => clearInterval(interval);
  }, [hasTransitionalDocs, refreshDocuments]);

  // Handle document accepted from UploadDropzone
  const handleUploadAccepted = React.useCallback(
    (documentId: string, filename: string) => {
      const optimisticDoc: DocumentRow = {
        id: documentId,
        filename,
        companyId: company.id,
        reportingPeriod: null,
        fileType: filename.split('.').pop() || 'xlsx',
        sizeBytes: 0,
        status: 'pending',
        error: null,
        uploadedAt: new Date().toISOString(),
        processedAt: null,
      };

      setDocuments((prev) => [optimisticDoc, ...prev]);
    },
    [company.id]
  );

  // Handle delete document confirm
  const handleConfirmDelete = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/documents/${docToDelete.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docToDelete.id));
        setDocToDelete(null);
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const processedCount = documents.filter((d) => d.status === 'processed').length;
  const inFlightCount = documents.filter((d) =>
    ['pending', 'parsing', 'extracting', 'embedding'].includes(d.status.toLowerCase())
  ).length;

  const statChips = [
    { label: 'Total Filings', value: documents.length },
    { label: 'Processed', value: processedCount },
    ...(inFlightCount > 0 ? [{ label: 'Processing Live', value: inFlightCount }] : []),
  ];

  return (
    <PageShell
      title={`Document Center — ${company.name}`}
      subtitle="Upload monthly MIS spreadsheets & PDFs, track live parsing progress, and inspect extracted data"
      statChips={statChips}
      rightSlot={
        <div className="flex items-center gap-2">
          {isPolling && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-[#FFEFE2] dark:bg-[#2D1F16] text-[#FF7102] border border-[#FFD0AB] dark:border-[#FF7102]/40 shadow-xs">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Processing live…</span>
            </div>
          )}

          <Link
            href={`/companies/${company.slug}`}
            prefetch
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-3.5 py-1.5 text-xs font-semibold text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Workspace</span>
          </Link>

          <button
            type="button"
            onClick={refreshDocuments}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-3 py-1.5 text-xs font-semibold text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#FF7102]" />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      {/* Upload Dropzone */}
      <UploadDropzone
        companyId={company.id}
        onUploadAccepted={handleUploadAccepted}
      />

      {/* Documents History Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#FF7102]" />
            <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
              Uploaded Filings ({documents.length})
            </h2>
          </div>
          <span className="text-[11px] text-[#9A958E] font-mono">
            Click any row to inspect extracted cell coordinates
          </span>
        </div>

        {/* Desktop Table with CRM styling */}
        <div className="hidden md:block rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] overflow-hidden shadow-xs">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-[#FAFAF8] dark:bg-[#141210] border-b border-[#E8E5DE] dark:border-[#2E2A24] text-[10px] uppercase font-medium text-[#C8C3BB] tracking-[0.22em] font-mono select-none">
              <tr>
                <th scope="col" className="px-5 py-3.5 text-left w-72">
                  Filename
                </th>
                <th scope="col" className="px-4 py-3.5 text-left w-36">
                  Period
                </th>
                <th scope="col" className="px-3 py-3.5 text-left w-28">
                  Format
                </th>
                <th scope="col" className="px-4 py-3.5 text-left w-28">
                  Size
                </th>
                <th scope="col" className="px-4 py-3.5 text-left w-32">
                  Status
                </th>
                <th scope="col" className="px-4 py-3.5 text-left w-36">
                  Uploaded
                </th>
                <th scope="col" className="px-5 py-3.5 text-right w-36"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24]">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-xs text-[#9A958E] font-mono">
                    No filings uploaded yet for {company.name}.
                  </td>
                </tr>
              ) : (
                documents.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedDocId(row.id)}
                    className="hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors group cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-[7px] bg-[#EEECE7] dark:bg-[#26231F] flex items-center justify-center text-[#9A958E] shrink-0">
                          <FileSpreadsheet className="w-4 h-4" />
                        </div>
                        <div className="font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8] group-hover:text-[#FF7102] transition-colors truncate max-w-xs">
                          {row.filename}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-[#5A5650] dark:text-[#C8C3BB]">
                      {row.reportingPeriod ? formatPeriod(row.reportingPeriod) : <span className="text-[#C8C3BB] italic">—</span>}
                    </td>

                    <td className="px-3 py-3.5 font-mono text-xs uppercase text-[#9A958E]">
                      {row.fileType}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-[#5A5650] dark:text-[#9A958E]">
                      {formatBytes(row.sizeBytes)}
                    </td>

                    <td className="px-4 py-3.5">
                      <StatusPill status={row.status} />
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-[#9A958E]">
                      {new Date(row.uploadedAt).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedDocId(row.id)}
                          title="Inspect document extraction"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5A5650] dark:text-[#9A958E] hover:text-[#FF7102] px-2 py-1 rounded-md hover:bg-white dark:hover:bg-[#1C1A17] transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>

                        {row.status === 'processed' && (
                          <a
                            href={`/api/documents/${row.id}/file`}
                            download={row.filename}
                            title="Download filing"
                            className="p-1 text-[#9A958E] hover:text-[#1A1815] transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => setDocToDelete(row)}
                          title="Delete filing"
                          className="p-1 text-[#9A958E] hover:text-[#B42318] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="block md:hidden space-y-3">
          {documents.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#9A958E] font-mono border border-dashed border-[#E8E5DE] rounded-2xl">
              No filings uploaded yet for {company.name}.
            </div>
          ) : (
            documents.map((row) => (
              <div
                key={row.id}
                onClick={() => setSelectedDocId(row.id)}
                className="p-4 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs space-y-3 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-[#9A958E] shrink-0" />
                    <div className="font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8] truncate">
                      {row.filename}
                    </div>
                  </div>
                  <StatusPill status={row.status} />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E8E5DE] dark:border-[#2E2A24] text-xs font-mono">
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#C8C3BB] block">Period</span>
                    <span className="text-[#1A1815] dark:text-[#FAFAF8]">
                      {row.reportingPeriod ? formatPeriod(row.reportingPeriod) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#C8C3BB] block">Size</span>
                    <span className="text-[#9A958E]">{formatBytes(row.sizeBytes)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Document Detail Drawer */}
      <DocumentDetailDrawer
        documentId={selectedDocId}
        onClose={() => setSelectedDocId(null)}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(docToDelete)}
        onClose={() => setDocToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete MIS Filing"
        description={`Are you sure you want to delete "${docToDelete?.filename}"? All extracted metrics and embeddings for this filing will be permanently erased.`}
        confirmLabel="Delete Filing"
        variant="destructive"
        isLoading={isDeleting}
      />
    </PageShell>
  );
}
