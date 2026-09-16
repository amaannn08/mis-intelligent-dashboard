'use client';

import * as React from 'react';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatBytes, formatIndianCurrency, formatPercent, formatPeriod } from '@/lib/formatters';
import {
  X,
  Download,
  Trash2,
  FileSpreadsheet,
  Layers,
  AlertCircle,
  Loader2,
  FileCode,
} from 'lucide-react';

export interface DocumentDetailData {
  document: {
    id: string;
    filename: string;
    companyId: string;
    reportingPeriod: string | null;
    sizeBytes: number;
    status: string;
    error: string | null;
    uploadedAt: string;
    processedAt: string | null;
    originalRetained?: boolean;
  };
  jobs: Array<{
    id: string;
    step: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
    log?: unknown;
  }>;
  metrics: Array<{
    id: string;
    metricKey: string;
    value: string | number;
    unit: string;
    reportingPeriod: string;
    valueKind: string;
    sourceReference: string | null;
    confidence: number | null;
  }>;
  blobRetained: boolean;
}

interface DocumentDetailDrawerProps {
  documentId: string | null;
  onClose: () => void;
  onDeleted?: (documentId: string) => void;
}

export function DocumentDetailDrawer({
  documentId,
  onClose,
  onDeleted,
}: DocumentDetailDrawerProps) {
  const [data, setData] = React.useState<DocumentDetailData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Fetch document details when documentId changes
  React.useEffect(() => {
    if (!documentId) {
      setData(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}`);
        if (!res.ok) {
          throw new Error(`Failed to load document (${res.status})`);
        }
        const json = await res.json();
        if (isMounted) {
          setData(json);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError((err as Error).message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchDetail();

    return () => {
      isMounted = false;
    };
  }, [documentId]);

  // Keyboard escape listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && documentId && !showDeleteConfirm) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [documentId, onClose, showDeleteConfirm]);

  const handleDelete = async () => {
    if (!documentId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete document');
      setShowDeleteConfirm(false);
      onClose();
      onDeleted?.(documentId);
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!documentId) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-background/70 backdrop-blur-xs transition-opacity animate-in fade-in"
          onClick={onClose}
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
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {data?.document.filename || 'Document Details'}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {data?.document.reportingPeriod && (
                      <span className="font-mono">
                        {formatPeriod(data.document.reportingPeriod)}
                      </span>
                    )}
                    {data?.document.sizeBytes && (
                      <span>· {formatBytes(data.document.sizeBytes)}</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {isLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <span className="text-xs">Loading document inspection…</span>
                </div>
              )}

              {error && (
                <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    <span>Error loading details</span>
                  </div>
                  <div>{error}</div>
                </div>
              )}

              {data && (
                <>
                  {/* Status Banner */}
                  <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                        Processing Status
                      </span>
                      <StatusPill status={data.document.status} />
                    </div>

                    {data.document.error && (
                      <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
                        <div className="font-semibold mb-0.5">Pipeline Failure Reason:</div>
                        <div className="font-mono text-[11px] whitespace-pre-wrap">
                          {data.document.error}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/50">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Uploaded At</span>
                        <span className="font-mono">
                          {new Date(data.document.uploadedAt).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Processed At</span>
                        <span className="font-mono">
                          {data.document.processedAt
                            ? new Date(data.document.processedAt).toLocaleString('en-IN', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : 'In progress…'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Processing Jobs Timeline */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Layers className="w-4 h-4 text-muted-foreground" />
                      <span>Pipeline Execution Jobs ({data.jobs.length})</span>
                    </div>

                    {data.jobs.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic p-3 rounded-lg border border-border bg-muted/20">
                        No processing jobs recorded yet.
                      </div>
                    ) : (
                      <div className="border border-border rounded-xl divide-y divide-border bg-card overflow-hidden">
                        {data.jobs.map((job) => (
                          <div key={job.id} className="p-3 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold font-mono uppercase text-foreground">
                                {job.step}
                              </span>
                              <Badge
                                variant={
                                  job.status === 'completed'
                                    ? 'success'
                                    : job.status === 'failed'
                                    ? 'destructive'
                                    : 'secondary'
                                }
                                className="text-[10px]"
                              >
                                {job.status}
                              </Badge>
                            </div>
                            {job.error && (
                              <div className="text-destructive font-mono text-[11px] pt-1">
                                {job.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Extracted Metrics */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <FileCode className="w-4 h-4 text-muted-foreground" />
                      <span>Extracted Metrics ({data.metrics.length})</span>
                    </div>

                    {data.metrics.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic p-4 rounded-xl border border-border bg-muted/20 text-center">
                        No structured metrics extracted from this file.
                      </div>
                    ) : (
                      <div className="border border-border rounded-xl divide-y divide-border bg-card overflow-hidden">
                        {data.metrics.map((m) => {
                          const num = typeof m.value === 'string' ? parseFloat(m.value) : m.value;
                          const valStr =
                            m.unit === 'percent'
                              ? formatPercent(num)
                              : m.unit === 'currency'
                              ? formatIndianCurrency(num)
                              : num.toLocaleString('en-IN');

                          return (
                            <div key={m.id} className="p-3 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-foreground capitalize">
                                  {m.metricKey.replace(/_/g, ' ')}
                                </span>
                                <span className="font-mono font-bold text-foreground">
                                  {valStr}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>Period: {formatPeriod(m.reportingPeriod)}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {m.valueKind}
                                </Badge>
                              </div>
                              {m.sourceReference && (
                                <div className="text-[10px] text-muted-foreground/80 font-mono bg-muted/50 p-1.5 rounded border border-border/50 break-all mt-1">
                                  {m.sourceReference}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer Actions */}
            {data && (
              <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="gap-1.5 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </Button>

                <div className="flex items-center gap-2">
                  {data.blobRetained ? (
                    <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
                      <a
                        href={`/api/documents/${data.document.id}/file`}
                        download={data.document.filename}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Raw File</span>
                      </a>
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">
                      Raw file &gt;4MB not retained
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Document"
        description={`Are you sure you want to permanently delete "${data?.document.filename}"? This will cascade and delete all associated embeddings, chunks, jobs, and extracted metrics.`}
        confirmLabel="Delete Document"
        variant="destructive"
        isLoading={isDeleting}
      />
    </>
  );
}
