'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/formatters';
import { UploadCloud, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';

interface FileUploadState {
  file: File;
  id?: string;
  status: 'pending' | 'uploading' | 'accepted' | 'error';
  progress: number;
  errorMessage?: string;
}

interface UploadDropzoneProps {
  companyId: string;
  onUploadAccepted?: (documentId: string, filename: string) => void;
  className?: string;
}

export function UploadDropzone({
  companyId,
  onUploadAccepted,
  className,
}: UploadDropzoneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [queue, setQueue] = React.useState<FileUploadState[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Maximum allowed size: 4.5 MB in production (15 MB in development)
  const isDev = process.env.NODE_ENV === 'development';
  const maxBytes = isDev ? 15 * 1024 * 1024 : 4.5 * 1024 * 1024;
  const maxMbLabel = isDev ? '15 MB (Dev)' : '4.5 MB';

  const uploadingRef = React.useRef<Set<File>>(new Set());

  const uploadFile = async (file: File) => {
    if (uploadingRef.current.has(file)) return;
    uploadingRef.current.add(file);

    setQueue((prev) =>
      prev.map((item) => (item.file === file ? { ...item, status: 'uploading', progress: 20 } : item))
    );

    const formData = new FormData();
    formData.append('companyId', companyId);
    formData.append('file', file);

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data.error?.message || 'Failed to upload document';
        setQueue((prev) =>
          prev.map((item) =>
            item.file === file ? { ...item, status: 'error', progress: 0, errorMessage: message } : item
          )
        );
        return;
      }

      const docId = data.document?.id;
      setQueue((prev) =>
        prev.map((item) =>
          item.file === file ? { ...item, status: 'accepted', progress: 100, id: docId } : item
        )
      );

      if (docId && onUploadAccepted) {
        onUploadAccepted(docId, file.name);
      }
    } catch (err: unknown) {
      setQueue((prev) =>
        prev.map((item) =>
          item.file === file
            ? {
                ...item,
                status: 'error',
                progress: 0,
                errorMessage: (err as Error).message || 'Network error during upload',
              }
            : item
        )
      );
    } finally {
      uploadingRef.current.delete(file);
    }
  };

  const allowedExtensions = ['.xlsx', '.xls', '.pdf'];

  const validateAndQueueFiles = (files: FileList | File[]) => {
    const newItems: FileUploadState[] = [];
    const validFiles: File[] = [];

    Array.from(files).forEach((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        newItems.push({
          file,
          status: 'error',
          progress: 0,
          errorMessage: `Unsupported file type (${ext}). Only .xlsx, .xls, and .pdf are accepted.`,
        });
        return;
      }

      if (file.size > maxBytes) {
        newItems.push({
          file,
          status: 'error',
          progress: 0,
          errorMessage: `File exceeds the ${maxMbLabel} upload limit (${formatBytes(file.size)}).`,
        });
        return;
      }

      newItems.push({
        file,
        status: 'pending',
        progress: 0,
      });
      validFiles.push(file);
    });

    setQueue((prev) => [...prev, ...newItems]);

    // Start upload immediately for valid files
    for (const f of validFiles) {
      uploadFile(f);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndQueueFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndQueueFiles(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeQueueItem = (index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Dropzone Container */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center p-8 sm:p-10 rounded-xl border-2 border-dashed transition-all cursor-pointer select-none text-center',
          isDragOver
            ? 'border-primary bg-primary/5 scale-[1.005]'
            : 'border-border bg-card hover:bg-muted/20 hover:border-muted-foreground/40'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.pdf"
          onChange={handleFileInputChange}
          className="hidden"
          aria-label="Upload MIS files"
        />

        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
          <UploadCloud className="w-6 h-6" />
        </div>

        <h4 className="text-sm font-semibold text-foreground mb-1">
          Drop MIS spreadsheet or PDF here, or <span className="text-primary underline">browse</span>
        </h4>
        <p className="text-xs text-muted-foreground max-w-sm mb-3">
          Supports .xlsx, .xls, and .pdf monthly reports. Extraction starts asynchronously upon upload.
        </p>

        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border/60">
          <span>Max file size: <strong className="text-foreground">{maxMbLabel}</strong></span>
          <span>·</span>
          <span>Automatic SHA-256 deduplication</span>
        </div>
      </div>

      {/* Upload Queue Display */}
      {queue.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Upload Queue ({queue.length})
          </div>
          <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {queue.map((item, index) => (
              <div
                key={`${item.file.name}-${index}`}
                className="p-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="truncate">
                    <div className="font-medium text-foreground truncate">{item.file.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatBytes(item.file.size)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {item.status === 'uploading' && (
                    <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading…</span>
                    </div>
                  )}

                  {item.status === 'accepted' && (
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Accepted for processing (202)</span>
                    </div>
                  )}

                  {item.status === 'error' && (
                    <div className="flex items-center gap-1.5 text-destructive max-w-xs truncate" title={item.errorMessage}>
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{item.errorMessage}</span>
                    </div>
                  )}

                  {item.status !== 'uploading' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeQueueItem(index);
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      aria-label="Remove item"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
