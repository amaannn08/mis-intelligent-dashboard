import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export interface ArchiveExtractOptions {
  parentDocumentId?: string;
  maxFileSizeBytes?: number; // Default 50MB
  maxTotalBytes?: number; // Default 200MB
  maxFileCount?: number; // Default 100 files
  maxDepth?: number; // Default 3 levels
}

export interface ExtractedArchiveChild {
  filename: string;
  archiveEntryPath: string; // e.g. '25-26/Dec-MIS.xlsx'
  parentDocumentId?: string;
  buffer: Buffer;
  sizeBytes: number;
  sha256: string;
  mime: string;
  fileType: string;
}

export interface ArchiveExtractResult {
  totalFilesFound: number;
  files: ExtractedArchiveChild[];
}

/**
 * Determine MIME type and normalized fileType from filename.
 */
function inferMimeAndType(filename: string): { mime: string; fileType: string } {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.xlsx':
      return {
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileType: 'xlsx',
      };
    case '.xls':
      return {
        mime: 'application/vnd.ms-excel',
        fileType: 'xls',
      };
    case '.pdf':
      return {
        mime: 'application/pdf',
        fileType: 'pdf',
      };
    case '.csv':
      return {
        mime: 'text/csv',
        fileType: 'csv',
      };
    case '.docx':
      return {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileType: 'docx',
      };
    case '.png':
      return {
        mime: 'image/png',
        fileType: 'png',
      };
    case '.jpg':
    case '.jpeg':
      return {
        mime: 'image/jpeg',
        fileType: 'jpeg',
      };
    default:
      return {
        mime: 'application/octet-stream',
        fileType: ext.replace(/^\./, '') || 'unknown',
      };
  }
}

/**
 * Recursively collect all files under a directory.
 */
function collectFilesRecursively(
  rootDir: string,
  currentDir: string,
  depth: number,
  maxDepth: number
): string[] {
  if (depth > maxDepth) return [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    // Skip macOS metadata and junk
    if (
      entry.name === '.DS_Store' ||
      entry.name === '__MACOSX' ||
      entry.name.startsWith('._') ||
      entry.name.startsWith('~$')
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...collectFilesRecursively(rootDir, fullPath, depth + 1, maxDepth));
    } else {
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        throw new Error(
          `Zip-Slip security error: archive contains forbidden symbolic link "${entry.name}".`
        );
      }
      if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Extract an archive with strict bounds, Zip-Slip prevention,
 * decompression bomb protection, and recursive directory traversal.
 */
export function extractArchiveSecurely(
  zipBuffer: Buffer,
  options: ArchiveExtractOptions = {}
): ArchiveExtractResult {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? 50 * 1024 * 1024; // 50MB
  const maxTotalBytes = options.maxTotalBytes ?? 200 * 1024 * 1024; // 200MB
  const maxFileCount = options.maxFileCount ?? 100;
  const maxDepth = options.maxDepth ?? 5;

  const tmpBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mis_secure_zip_'));
  const zipFilePath = path.join(tmpBaseDir, 'archive.zip');
  const extractTargetDir = path.join(tmpBaseDir, 'extracted');
  fs.mkdirSync(extractTargetDir, { recursive: true });

  try {
    fs.writeFileSync(zipFilePath, zipBuffer);

    // 1. Pre-extraction inspection: verify archive integrity and entry bounds using unzip -l
    let tocOutput = '';
    try {
      tocOutput = execFileSync('unzip', ['-l', zipFilePath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid or corrupt zip archive: ${msg}`);
    }

    // Parse unzip -l output:
    // Header format:
    //   Length      Date    Time    Name
    // ---------  ---------- -----   ----
    //     49409  2026-01-21 00:03   25-26/InfinityBox_MIS_Nov_25 (1).xlsx
    const lines = tocOutput.split('\n');
    let totalUncompressedBytes = 0;
    let fileEntriesCount = 0;
    let inTable = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('---------')) {
        inTable = !inTable;
        continue;
      }
      if (!inTable) continue;

      // Match length date time name (flexible on date separator e.g. - or / or .)
      const match = line.match(/^(\d+)\s+[\d\-\.\/]+\s+[\d:]+\s+(.+)$/);
      if (!match) continue;

      const length = parseInt(match[1]!, 10);
      const entryName = match[2]!.trim();

      // Skip directory entries ending in /
      if (entryName.endsWith('/')) continue;

      fileEntriesCount++;

      // Zip-Slip Security Check: Path Traversal Defense
      const normalizedEntry = path.normalize(entryName);
      if (
        entryName.includes('..') ||
        normalizedEntry.startsWith('..') ||
        path.isAbsolute(entryName) ||
        path.isAbsolute(normalizedEntry) ||
        entryName.includes('\0') ||
        entryName.startsWith('/') ||
        entryName.startsWith('\\') ||
        entryName.split(/[\/\\]/).includes('..')
      ) {
        throw new Error(
          `Zip-Slip security error: archive entry path "${entryName}" contains path traversal sequence.`
        );
      }

      // Check resolved destination path stays strictly inside target directory
      const resolvedEntry = path.resolve(extractTargetDir, entryName);
      if (!resolvedEntry.startsWith(extractTargetDir + path.sep) && resolvedEntry !== extractTargetDir) {
        throw new Error(
          `Zip-Slip security error: archive entry path "${entryName}" resolves outside target directory.`
        );
      }

      // Bounds Checks
      if (length > maxFileSizeBytes) {
        throw new Error(
          `File size limit exceeded: entry "${entryName}" is ${length} bytes (max ${maxFileSizeBytes} bytes).`
        );
      }

      totalUncompressedBytes += length;
      if (totalUncompressedBytes > maxTotalBytes) {
        throw new Error(
          `Total uncompressed size limit exceeded: archive expands to ${totalUncompressedBytes} bytes (max ${maxTotalBytes} bytes).`
        );
      }

      if (fileEntriesCount > maxFileCount) {
        throw new Error(
          `File count limit exceeded: archive contains more than ${maxFileCount} entries.`
        );
      }
    }

    // 2. Perform actual extraction into the target directory
    try {
      execFileSync('unzip', ['-o', zipFilePath, '-d', extractTargetDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to extract archive contents: ${msg}`);
    }

    // 3. Collect extracted files recursively
    const collectedPaths = collectFilesRecursively(
      extractTargetDir,
      extractTargetDir,
      0,
      maxDepth
    );

    const extractedFiles: ExtractedArchiveChild[] = [];
    const seenHashes = new Set<string>();
    let runningExtractedBytes = 0;

    for (const filePath of collectedPaths) {
      // Check for symlinks on extracted path
      const lstat = fs.lstatSync(filePath);
      if (lstat.isSymbolicLink()) {
        throw new Error(
          `Zip-Slip security error: extracted file "${filePath}" is a symbolic link.`
        );
      }

      // Re-verify canonical real path safety
      const resolved = fs.realpathSync(filePath);
      if (!resolved.startsWith(extractTargetDir + path.sep)) {
        throw new Error(
          `Zip-Slip security error: extracted file "${filePath}" is outside target directory.`
        );
      }

      const relativeEntryPath = path.relative(extractTargetDir, filePath);
      const filename = path.basename(filePath);
      const fileBytes = fs.readFileSync(filePath);
      runningExtractedBytes += fileBytes.length;
      if (runningExtractedBytes > maxTotalBytes) {
        throw new Error(
          `Total uncompressed size limit exceeded: archive expands to more than ${maxTotalBytes} bytes.`
        );
      }
      if (extractedFiles.length >= maxFileCount) {
        throw new Error(
          `File count limit exceeded: archive contains more than ${maxFileCount} entries.`
        );
      }
      const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

      // Deduplicate identical content inside archive if present
      const dedupKey = `${relativeEntryPath}:${sha256}`;
      if (seenHashes.has(dedupKey)) continue;
      seenHashes.add(dedupKey);

      const { mime, fileType } = inferMimeAndType(filename);

      extractedFiles.push({
        filename,
        archiveEntryPath: relativeEntryPath,
        parentDocumentId: options.parentDocumentId,
        buffer: fileBytes,
        sizeBytes: fileBytes.length,
        sha256,
        mime,
        fileType,
      });
    }

    return {
      totalFilesFound: extractedFiles.length,
      files: extractedFiles,
    };
  } finally {
    // Clean up temporary workspace directory
    try {
      fs.rmSync(tmpBaseDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
