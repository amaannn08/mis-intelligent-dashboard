'use client';

import * as React from 'react';
import Link from 'next/link';
import { UploadDropzone } from './upload-dropzone';
import { DocumentDetailDrawer } from './document-detail-drawer';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
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
      // Add optimistic pending row
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

      setDocuments((prev) => [optimisticDoc, ...prev.filter((d) => d.id !== documentId)]);
      // Immediately refresh from server
      setTimeout(refreshDocuments, 500);
    },
    [company.id, refreshDocuments]
  );

  const handleDeleteConfirm = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documents/${docToDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete document');

      setDocuments((prev) => prev.filter((d) => d.id !== docToDelete.id));
      setDocToDelete(null);
      if (selectedDocId === docToDelete.id) {
        setSelectedDocId(null);
      }
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: ColumnDef<DocumentRow>[] = [
    {
      key: 'filename',
      header: 'File Name',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="truncate min-w-0">
            <span className="font-semibold text-foreground truncate block">
              {row.filename}
            </span>
            {row.error && (
              <span className="text-[11px] text-destructive truncate block font-mono">
                Error: {row.error}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'reportingPeriod',
      header: 'Period',
      render: (row) => (
        <span className="font-mono text-xs text-foreground">
          {row.reportingPeriod ? formatPeriod(row.reportingPeriod) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: 'sizeBytes',
      header: 'File Size',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.sizeBytes ? formatBytes(row.sizeBytes) : '—'}
        </span>
      ),
    },
    {
      key: 'uploadedAt',
      header: 'Uploaded',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(row.uploadedAt).toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDocId(row.id)}
            title="Inspect extracted metrics & job log"
            className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Inspect</span>
          </Button>

          {row.status === 'processed' && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              title="Download file"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <a href={`/api/documents/${row.id}/file`} download={row.filename}>
                <Download className="w-3.5 h-3.5" />
              </a>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDocToDelete(row)}
            title="Delete document"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/companies/${company.slug}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to {company.name} Workspace</span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Document Center — {company.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            Upload monthly MIS spreadsheets & PDFs, track live parsing progress, and inspect extracted data
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isPolling && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Processing live…</span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={refreshDocuments}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Upload Dropzone */}
      <UploadDropzone
        companyId={company.id}
        onUploadAccepted={handleUploadAccepted}
      />

      {/* Documents History Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Uploaded MIS Filings ({documents.length})
          </h2>
          <span className="text-xs text-muted-foreground">
            Click any row to open the document detail drawer
          </span>
        </div>

        <DataTable
          columns={columns}
          data={documents}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => setSelectedDocId(row.id)}
          emptyTitle="No documents uploaded yet"
          emptyDescription={`Drop a financial MIS spreadsheet (.xlsx, .xls, .pdf) above to begin automated extraction for ${company.name}.`}
          renderMobileCard={(row) => (
            <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-xs text-foreground truncate">{row.filename}</div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {row.reportingPeriod ? formatPeriod(row.reportingPeriod) : 'Period pending'} ·{' '}
                    {formatBytes(row.sizeBytes)}
                  </div>
                </div>
                <StatusPill status={row.status} />
              </div>

              {row.error && (
                <div className="p-2 rounded bg-destructive/10 text-destructive text-[11px] font-mono">
                  {row.error}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {new Date(row.uploadedAt).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedDocId(row.id)}
                    className="h-7 text-xs px-2"
                  >
                    Inspect
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDocToDelete(row)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        />
      </div>

      {/* Document Detail Drawer */}
      <DocumentDetailDrawer
        documentId={selectedDocId}
        onClose={() => setSelectedDocId(null)}
        onDeleted={(deletedId) => {
          setDocuments((prev) => prev.filter((d) => d.id !== deletedId));
          setSelectedDocId(null);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(docToDelete)}
        onClose={() => setDocToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete MIS Document"
        description={`Are you sure you want to permanently delete "${docToDelete?.filename}"? All extracted metrics, chunks, and embeddings for this filing will be removed.`}
        confirmLabel="Delete Document"
        variant="destructive"
        isLoading={isDeleting}
      />
    </div>
  );
}
