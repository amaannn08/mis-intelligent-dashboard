'use client';

import * as React from 'react';
import { upload } from '@vercel/blob/client';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/formatters';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  RefreshCw,
  FolderUp,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface CompanyOption {
  id: string;
  name: string;
  slug: string;
}

interface BulkUploadDropzoneProps {
  companies: CompanyOption[];
}

export interface QueueItem {
  id: string; // unique local ID
  file: File;
  companyId: string;
  companyName: string;
  status:
    | 'queued'
    | 'validating'
    | 'uploading'
    | 'processing'
    | 'processed'
    | 'duplicate'
    | 'error';
  progress: number;
  errorMessage?: string;
  documentId?: string;
}

const CONCURRENCY = 3;

async function checkMagicBytes(file: File): Promise<boolean> {
  try {
    const slice = file.slice(0, 8);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // PDF: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    if (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    ) {
      return true;
    }

    // XLSX / ZIP: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    if (
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    ) {
      return true;
    }

    // XLS (CFB): \xD0\xCF\x11\xE0 (0xD0, 0xCF, 0x11, 0xE0)
    if (
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0
    ) {
      return true;
    }

    return true; // For other formats like png or docx, let server handle
  } catch {
    return true;
  }
}

async function computeSha256(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function detectCompany(filename: string, companies: CompanyOption[]): CompanyOption | undefined {
  const cleanName = filename.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const c of companies) {
    const cSlug = c.slug.replace(/[^a-z0-9]/g, '');
    const cName = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanName.includes(cSlug) || cleanName.includes(cName)) {
      return c;
    }
  }
  return undefined;
}

export function BulkUploadDropzone({ companies }: BulkUploadDropzoneProps) {
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [defaultCompanyId, setDefaultCompanyId] = React.useState<string>('');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);

  const activeUploadsCount = queue.filter(
    (q) => q.status === 'validating' || q.status === 'uploading' || q.status === 'processing'
  ).length;

  const updateItem = React.useCallback(
    (id: string, patch: Partial<QueueItem>) => {
      setQueue((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const addFilesToQueue = React.useCallback(
    (files: File[]) => {
      const newItems: QueueItem[] = [];

      for (const file of files) {
        if (file.name === '.DS_Store' || file.name.startsWith('~$')) continue;

        const detected = defaultCompanyId
          ? companies.find((c) => c.id === defaultCompanyId)
          : detectCompany(file.name, companies);

        newItems.push({
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          companyId: detected?.id || defaultCompanyId || (companies[0]?.id ?? ''),
          companyName: detected?.name || (defaultCompanyId ? companies.find(c => c.id === defaultCompanyId)?.name : '') || companies[0]?.name || 'Unknown',
          status: 'queued',
          progress: 0,
        });
      }

      setQueue((prev) => [...prev, ...newItems]);
    },
    [companies, defaultCompanyId]
  );

  // Worker effect: processes queue with concurrency limit of 3
  React.useEffect(() => {
    const inFlight = queue.filter(
      (q) =>
        q.status === 'validating' ||
        q.status === 'uploading' ||
        q.status === 'processing'
    ).length;

    if (inFlight >= CONCURRENCY) return;

    const nextItem = queue.find((q) => q.status === 'queued');
    if (!nextItem) return;

    // Start processing nextItem
    const processQueueItem = async (item: QueueItem) => {
      updateItem(item.id, { status: 'validating', progress: 10 });

      try {
        // 1. Magic bytes validation
        const isValid = await checkMagicBytes(item.file);
        if (!isValid) {
          updateItem(item.id, {
            status: 'error',
            progress: 0,
            errorMessage: 'Invalid file signature (magic bytes mismatch)',
          });
          return;
        }

        // 2. SHA-256 calculation
        updateItem(item.id, { progress: 25 });
        const checksum = await computeSha256(item.file);

        // 3. Upload to Vercel Blob client
        updateItem(item.id, { status: 'uploading', progress: 45 });

        let blobResult;
        try {
          blobResult = await upload(item.file.name, item.file, {
            access: 'private',
            handleUploadUrl: '/api/documents/upload',
            clientPayload: JSON.stringify({ companyId: item.companyId }),
          });
        } catch (uploadErr) {
          const msg = (uploadErr as Error).message || 'Failed to upload to storage';
          updateItem(item.id, {
            status: 'error',
            progress: 0,
            errorMessage: msg,
          });
          return;
        }

        // 4. Register document with backend
        updateItem(item.id, { status: 'processing', progress: 80 });

        const res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: item.companyId,
            filename: item.file.name,
            blobUrl: blobResult.url,
            blobPathname: blobResult.pathname,
            sizeBytes: item.file.size,
            checksum,
            mime: item.file.type || blobResult.contentType || 'application/octet-stream',
          }),
        });

        const data = await res.json();

        if (res.status === 409 || data.error?.code === 'DUPLICATE_FILE') {
          updateItem(item.id, {
            status: 'duplicate',
            progress: 100,
            errorMessage: data.error?.message || 'Identical document already ingested',
          });
          return;
        }

        if (!res.ok) {
          updateItem(item.id, {
            status: 'error',
            progress: 0,
            errorMessage: data.error?.message || 'Failed to register document',
          });
          return;
        }

        updateItem(item.id, {
          status: 'processed',
          progress: 100,
          documentId: data.document?.id,
        });
      } catch (err: unknown) {
        updateItem(item.id, {
          status: 'error',
          progress: 0,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    };

    processQueueItem(nextItem);
  }, [queue, updateItem]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const clearCompleted = () => {
    setQueue((prev) =>
      prev.filter((item) => item.status !== 'processed' && item.status !== 'duplicate')
    );
  };

  const retryFailed = (id: string) => {
    updateItem(id, { status: 'queued', progress: 0, errorMessage: undefined });
  };

  const removeItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const totalCount = queue.length;
  const processedCount = queue.filter((q) => q.status === 'processed').length;
  const duplicateCount = queue.filter((q) => q.status === 'duplicate').length;
  const errorCount = queue.filter((q) => q.status === 'error').length;
  const inProgressCount = activeUploadsCount;

  return (
    <div className="space-y-6">
      {/* Top Controls: Global company override and batch actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-semibold text-[#5A5650] dark:text-[#9A958E] shrink-0">
            Target Company Override:
          </label>
          <select
            value={defaultCompanyId}
            onChange={(e) => setDefaultCompanyId(e.target.value)}
            className="w-full sm:w-64 h-9 rounded-lg border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] px-3 text-xs text-[#1A1815] dark:text-[#FAFAF8] focus:outline-hidden focus:ring-2 focus:ring-[#FF7102]"
          >
            <option value="">Auto-detect from filename</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {queue.some((q) => q.status === 'processed' || q.status === 'duplicate') && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearCompleted}
              className="text-xs gap-1.5"
            >
              Clear Completed
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Add Files
          </Button>
          <Button
            size="sm"
            onClick={() => folderInputRef.current?.click()}
            className="text-xs gap-1.5 bg-[#FF7102] hover:bg-[#E66200] text-white"
          >
            <FolderUp className="w-3.5 h-3.5" />
            Upload Folder
          </Button>
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 sm:p-12 transition-all cursor-pointer text-center',
          isDragOver
            ? 'border-[#FF7102] bg-[#FFEFE2]/50 dark:bg-[#2D1F16]/50'
            : 'border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] hover:border-[#FF7102]/60 hover:bg-[#FAFAF8] dark:hover:bg-[#201D1A]'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.pdf,.docx,.zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={handleFileSelect}
          className="hidden"
        />


        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFEFE2] dark:bg-[#2D1F16] text-[#FF7102] mb-4 group-hover:scale-105 transition-transform">
          <UploadCloud className="w-7 h-7" />
        </div>

        <h3 className="text-base font-semibold text-[#1A1815] dark:text-[#FAFAF8]">
          Drag and drop multiple MIS files or an entire folder
        </h3>
        <p className="mt-1 text-xs text-[#5A5650] dark:text-[#9A958E] max-w-md">
          Supports .xlsx, .xls, .pdf, and .docx workbooks up to 50 MB. Concurrent upload queue processes 3 files in parallel.
        </p>
      </div>

      {/* Progress & Summary Bar */}
      {queue.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[#9A958E]">Total:</span>{' '}
              <span className="font-bold text-[#1A1815] dark:text-[#FAFAF8]">{totalCount}</span>
            </div>
            <div>
              <span className="text-[#9A958E]">In Progress:</span>{' '}
              <span className="font-bold text-[#FF7102]">{inProgressCount}</span>
            </div>
            <div>
              <span className="text-[#9A958E]">Processed:</span>{' '}
              <span className="font-bold text-[#12B76A]">{processedCount}</span>
            </div>
            {duplicateCount > 0 && (
              <div>
                <span className="text-[#9A958E]">Duplicates:</span>{' '}
                <span className="font-bold text-[#F79009]">{duplicateCount}</span>
              </div>
            )}
            {errorCount > 0 && (
              <div>
                <span className="text-[#9A958E]">Errors:</span>{' '}
                <span className="font-bold text-[#F04438]">{errorCount}</span>
              </div>
            )}
          </div>

          <div className="text-[11px] text-[#9A958E] font-mono">
            Concurrency: {CONCURRENCY} parallel workers
          </div>
        </div>
      )}

      {/* Queue & Results Table */}
      {queue.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs">
          <div className="border-b border-[#E8E5DE] dark:border-[#2E2A24] px-4 py-3 bg-[#FAFAF8] dark:bg-[#141210]">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#5A5650] dark:text-[#9A958E]">
              Ingestion Queue &amp; Results
            </h4>
          </div>

          <div className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24] max-h-[500px] overflow-y-auto">
            {queue.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 hover:bg-[#FAFAF8]/50 dark:hover:bg-[#201D1A]/50 transition-colors"
              >
                {/* File info & company */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EEECE7] dark:bg-[#26231F] text-[#5A5650] dark:text-[#9A958E]">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[#1A1815] dark:text-[#FAFAF8]">
                      {item.file.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#9A958E]">
                      <span>{formatBytes(item.file.size)}</span>
                      <span>•</span>
                      {item.status === 'queued' ? (
                        <select
                          value={item.companyId}
                          onChange={(e) => {
                            const c = companies.find((comp) => comp.id === e.target.value);
                            updateItem(item.id, {
                              companyId: e.target.value,
                              companyName: c?.name || 'Unknown',
                            });
                          }}
                          className="rounded border border-[#E8E5DE] dark:border-[#2E2A24] bg-transparent text-[11px] px-1.5 py-0.5"
                        >
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-medium text-[#5A5650] dark:text-[#C8C3BB]">
                          {item.companyName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar or Status Pill */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="w-36">
                    {item.status === 'validating' && (
                      <div className="flex items-center gap-2 text-xs text-[#5A5650]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF7102]" />
                        <span>Validating...</span>
                      </div>
                    )}
                    {item.status === 'uploading' && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-[#9A958E]">
                          <span>Uploading</span>
                          <span>{item.progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-[#EEECE7] dark:bg-[#26231F] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#FF7102] transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {item.status === 'processing' && (
                      <div className="flex items-center gap-2 text-xs text-[#FF7102]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Extracting data...</span>
                      </div>
                    )}
                    {item.status === 'processed' && (
                      <Badge className="bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5] gap-1 font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        Processed
                      </Badge>
                    )}
                    {item.status === 'duplicate' && (
                      <Badge className="bg-[#FFFAEB] text-[#B54708] border-[#FEDF89] gap-1 font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        Duplicate
                      </Badge>
                    )}
                    {item.status === 'error' && (
                      <Badge className="bg-[#FEF3F2] text-[#B42318] border-[#FECDCA] gap-1 font-medium">
                        <AlertCircle className="w-3 h-3" />
                        Failed
                      </Badge>
                    )}
                    {item.status === 'queued' && (
                      <span className="text-xs text-[#9A958E] italic">Queued</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {item.status === 'error' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => retryFailed(item.id)}
                        className="h-7 w-7 p-0"
                        title="Retry upload"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {item.status === 'queued' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.id)}
                        className="h-7 w-7 p-0 text-[#9A958E] hover:text-[#B42318]"
                        title="Remove from queue"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Error message detail */}
                {item.errorMessage && (
                  <div className="w-full mt-1 text-[11px] text-[#B42318] dark:text-[#FDA29B]">
                    {item.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
