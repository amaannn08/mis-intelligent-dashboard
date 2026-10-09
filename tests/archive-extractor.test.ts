import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { getAuditedFixture } from './fixtures-helper.js';
import {
  extractArchiveSecurely,
  type ExtractedArchiveChild,
} from '../packages/core/src/pipeline/archive.js';

describe('Archive Extractor: Recursive ZIP & Provenance', () => {
  it('recursively unpacks Infinity Box ZIP and extracts all 10 nested files with provenance', () => {
    const fixturePath = getAuditedFixture('Infinity_box_MIS_FY25-26.zip');
    expect(fs.existsSync(fixturePath)).toBe(true);

    const zipBuffer = fs.readFileSync(fixturePath);
    const parentDocId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    const result = extractArchiveSecurely(zipBuffer, {
      parentDocumentId: parentDocId,
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxTotalBytes: 50 * 1024 * 1024,
      maxFileCount: 50,
    });

    expect(result.totalFilesFound).toBe(10);
    expect(result.files.length).toBe(10);

    const xlsxFiles = result.files.filter((f) => f.fileType === 'xlsx');
    const pdfFiles = result.files.filter((f) => f.fileType === 'pdf');

    expect(xlsxFiles.length).toBe(9);
    expect(pdfFiles.length).toBe(1);

    // Verify PDF child provenance
    const investorDeck = pdfFiles[0]!;
    expect(investorDeck.filename).toBe('Qtrly Investor update deck JAS 25.pdf');
    expect(investorDeck.archiveEntryPath).toBe(
      '25-26/Quarterly update/Qtrly Investor update deck JAS 25.pdf'
    );
    expect(investorDeck.parentDocumentId).toBe(parentDocId);
    expect(investorDeck.mime).toBe('application/pdf');
    expect(investorDeck.buffer.length).toBe(147181);

    // Verify an Excel child provenance
    const decMis = xlsxFiles.find((f) => f.filename === 'Dec-MIS.xlsx');
    expect(decMis).toBeDefined();
    expect(decMis?.archiveEntryPath).toBe('25-26/Dec-MIS.xlsx');
    expect(decMis?.parentDocumentId).toBe(parentDocId);
    expect(decMis?.mime).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(decMis?.sizeBytes).toBe(46952);
  });
});

describe('Archive Extractor: Security Negatives & Bounds', () => {
  it('detects and blocks Zip-Slip path traversal attempts', () => {
    // Generate a test zip containing a directory traversal path "../evil.txt"
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zipslip_test_'));
    const zipPath = path.join(tmpDir, 'slip.zip');

    try {
      execFileSync('python3', [
        '-c',
        `
import zipfile
with zipfile.ZipFile('${zipPath}', 'w') as z:
    z.writestr('../evil.txt', b'malicious payload')
`,
      ]);

      const slipBuffer = fs.readFileSync(zipPath);
      expect(() => {
        extractArchiveSecurely(slipBuffer);
      }).toThrow(/zip-slip|path traversal|outside target/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('enforces total uncompressed size limit to prevent decompression bombs', () => {
    const fixturePath = getAuditedFixture('Infinity_box_MIS_FY25-26.zip');
    const zipBuffer = fs.readFileSync(fixturePath);

    // Set limit lower than the 6.6MB archive uncompressed size
    expect(() => {
      extractArchiveSecurely(zipBuffer, {
        maxTotalBytes: 1024 * 1024, // 1MB limit
      });
    }).toThrow(/uncompressed.*size.*limit/i);
  });

  it('enforces max file count limit', () => {
    const fixturePath = getAuditedFixture('Infinity_box_MIS_FY25-26.zip');
    const zipBuffer = fs.readFileSync(fixturePath);

    // Set max file count to 5 (archive has 10)
    expect(() => {
      extractArchiveSecurely(zipBuffer, {
        maxFileCount: 5,
      });
    }).toThrow(/file.*count.*limit/i);
  });

  it('rejects corrupt or invalid zip buffers cleanly', () => {
    const garbage = Buffer.from('this is not a zip file at all');
    expect(() => {
      extractArchiveSecurely(garbage);
    }).toThrow(/invalid.*zip|corrupt|failed/i);
  });
});
