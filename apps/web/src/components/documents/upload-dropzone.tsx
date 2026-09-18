'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/formatters';
import { UploadCloud, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';

import { upload } from '@vercel/blob/client';
import { UPLOAD_MAX_BYTES_BLOB } from '@/lib/constants';

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

async function checkMagicBytes(file: File): Promise<boolean> {
  try {
    const slice = file.slice(0, 8);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // PDF: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2D) {
      return true;
    }

    // XLSX / ZIP: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return true;
    }

    // XLS (CFB): \xD0\xCF\x11\xE0 (0xD0, 0xCF, 0x11, 0xE0)
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
      return true;
    }

    return false;
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

export function UploadDropzone({
  companyId,
  onUploadAccepted,
  className,
}: UploadDropzoneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [queue, setQueue] = React.useState<FileUploadState[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Maximum allowed size: 50 MB default for Vercel Blob client uploads
  const maxBytes = UPLOAD_MAX_BYTES_BLOB;
  const maxMbLabel = `${Math.round(maxBytes / (1024 * 1024))} MB`;

  const uploadingRef = React.useRef<Set<File>>(new Set());

  const uploadFile = async (file: File) => {
    if (uploadingRef.current.has(file)) return;
    uploadingRef.current.add(file);

    setQueue((prev) =>
      prev.map((item) => (item.file === file ? { ...item, status: 'uploading', progress: 15 } : item))
    );

    try {
      // 1. Magic bytes validation
      const isValidSignature = await checkMagicBytes(file);
      if (!isValidSignature) {
        setQueue((prev) =>
          prev.map((item) =>
            item.file === file
              ? {
                  ...item,
                  status: 'error',
                  progress: 0,
                  errorMessage: 'Invalid file signature (magic bytes mismatch for spreadsheet/PDF)',
                }
              : item
          )
        );
        return;
      }

      // 2. SHA-256 checksum calculation
      setQueue((prev) =>
        prev.map((item) => (item.file === file ? { ...item, progress: 30 } : item))
      );
      const checksum = await computeSha256(file);

      // 3. Direct client-side streaming upload to Vercel Blob
      setQueue((prev) =>
        prev.map((item) => (item.file === file ? { ...item, progress: 50 } : item))
      );

      let blobResult;
      try {
        blobResult = await upload(file.name, file, {
          access: 'private',
          handleUploadUrl: '/api/documents/upload',
          clientPayload: JSON.stringify({ companyId }),
        });
      } catch (blobErr: unknown) {
        const msg = (blobErr as Error).message || 'Failed to upload file to blob storage';
        setQueue((prev) =>
          prev.map((item) =>
            item.file === file
              ? { ...item, status: 'error', progress: 0, errorMessage: msg }
              : item
          )
        );
        return;
      }

      setQueue((prev) =>
        prev.map((item) => (item.file === file ? { ...item, progress: 85 } : item))
      );

      // 4. Server registration handshake
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          filename: file.name,
          blobUrl: blobResult.url,
          blobPathname: blobResult.pathname,
          sizeBytes: file.size,
          checksum,
          mime: file.type || blobResult.contentType || 'application/octet-stream',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data.error?.message || 'Failed to register document';
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
          errorMessage: `Invalid format (${ext}). Supported: .xlsx, .xls, .pdf`,
        });
        return;
      }

      if (file.size > maxBytes) {
        newItems.push({
          file,
          status: 'error',
          progress: 0,
          errorMessage: `File exceeds maximum upload ceiling (${maxMbLabel})`,
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

    setQueue((prev) => [...newItems, ...prev]);

    validFiles.forEach((file) => {
      uploadFile(file);
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndQueueFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndQueueFiles(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop Target Box */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center select-none shadow-xs',
          isDragOver
            ? 'border-[#FF7102] bg-[#FFEFE2]/50 dark:bg-[#2D1F16]/50'
            : 'border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] hover:border-[#FFD0AB] hover:bg-[#FAFAF8] dark:hover:bg-[#26231F]'
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

        <div className="w-10 h-10 rounded-[7px] bg-[#FFEFE2] dark:bg-[#2D1F16] text-[#FF7102] flex items-center justify-center mb-3">
          <UploadCloud className="w-5 h-5" />
        </div>

        <h4 className="text-xs font-semibold text-[#1A1815] dark:text-[#FAFAF8] mb-1">
          Drop MIS spreadsheet or PDF here, or <span className="text-[#FF7102] underline">browse</span>
        </h4>
        <p className="text-[11px] text-[#9A958E] max-w-sm mb-3">
          Supports .xlsx, .xls, and .pdf monthly reports. Extraction starts automatically upon upload.
        </p>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono text-[#5A5650] dark:text-[#9A958E] bg-[#FAFAF8] dark:bg-[#141210] border border-[#E8E5DE] dark:border-[#2E2A24]">
          <span>Max size: <strong className="text-[#1A1815] dark:text-[#FAFAF8]">{maxMbLabel}</strong></span>
          <span>·</span>
          <span>SHA-256 deduplicated</span>
        </div>
      </div>

      {/* Upload Queue Display */}
      {queue.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
            Upload Queue ({queue.length})
          </div>
          <div className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24] rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] overflow-hidden shadow-xs">
            {queue.map((item, index) => (
              <div
                key={`${item.file.name}-${index}`}
                className="p-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-[#9A958E] shrink-0" />
                  <div className="truncate">
                    <div className="font-semibold text-xs text-[#1A1815] dark:text-[#FAFAF8] truncate">{item.file.name}</div>
                    <div className="text-[10px] text-[#9A958E] font-mono">
                      {formatBytes(item.file.size)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {item.status === 'uploading' && (
                    <div className="flex items-center gap-1.5 text-xs text-[#FF7102] font-mono">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading…</span>
                    </div>
                  )}

                  {item.status === 'accepted' && (
                    <div className="flex items-center gap-1.5 text-xs text-[#3D7A58] font-mono font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Accepted</span>
                    </div>
                  )}

                  {item.status === 'error' && (
                    <div className="flex items-center gap-1.5 text-xs text-[#B42318] font-mono">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="max-w-[200px] truncate">{item.errorMessage}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQueue((prev) => prev.filter((_, i) => i !== index));
                    }}
                    className="p-1 rounded text-[#9A958E] hover:text-[#1A1815] hover:bg-[#F5F4F0] transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
