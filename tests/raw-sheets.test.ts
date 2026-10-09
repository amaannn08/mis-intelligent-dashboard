import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { getAuditedFixture } from './fixtures-helper.js';

// Mock @mis/db for database queries in raw-sheet-query tests
vi.mock('@mis/db', () => {
  return {
    pool: {
      query: vi.fn(),
    },
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    },
    documentSheets: {
      documentId: 'document_id',
      sheetName: 'sheet_name',
    },
    documents: {
      id: 'id',
    },
  };
});

import { pool } from '@mis/db';
import {
  extractRawWorkbookData,
  queryRawSheetCells,
  type RawWorkbookExtraction,
} from '../packages/core/src/raw-sheets/index.js';

describe('Raw Sheets Preservation: Full Fidelity & Count Reconciliation', () => {
  it('extracts and reconciles every cell in Masterchow June 2026 (3 rows, 6 cells)', () => {
    const fixturePath = getAuditedFixture('Masterchow_MIS_June_2026');
    expect(fs.existsSync(fixturePath)).toBe(true);

    const buf = fs.readFileSync(fixturePath);
    const result: RawWorkbookExtraction = extractRawWorkbookData(buf, 'Masterchow_MIS_June_2026.xlsx');

    expect(result.totalSheets).toBe(1);
    expect(result.nonEmptySheets).toBe(1);
    expect(result.sheets[0]?.sheetName).toBe('P&L');
    expect(result.nonEmptyCellsCount).toBe(6);
    expect(result.countsReconciled).toBe(true);

    const sheet = result.sheets[0]!;
    // Semantic parsed status must remain explicitly false before any semantic parser runs
    expect(sheet.semanticParsed).toBe(false);
    expect(sheet.semanticMetricCount).toBe(0);

    // Verify cell coordinates and values
    const cellMap = new Map(sheet.cells.map((c) => [c.coord, c]));
    expect(cellMap.has('A1')).toBe(true);
    expect(cellMap.get('A1')?.w).toBe('Metric');
    expect(cellMap.get('B1')?.w).toBe('Jun 26');

    expect(cellMap.get('A2')?.w).toBe('Revenue');
    expect(cellMap.get('B2')?.v).toBe(45000000);

    expect(cellMap.get('A3')?.w).toBe('GMV');
    expect(cellMap.get('B3')?.v).toBe(80000000);
  });

  it('preserves zero-metric non-empty sheets in Praan (Main Page)', () => {
    const fixturePath = getAuditedFixture('Draft_MIS_-Praan-Standalone_March_26');
    expect(fs.existsSync(fixturePath)).toBe(true);

    const buf = fs.readFileSync(fixturePath);
    const result = extractRawWorkbookData(buf, 'Draft_MIS_-Praan.xlsx');

    expect(result.totalSheets).toBe(17);
    expect(result.countsReconciled).toBe(true);

    // "Main Page" has only 2 header text cells and zero financial metrics
    const mainPage = result.sheets.find((s) => s.sheetName === 'Main Page');
    expect(mainPage).toBeDefined();
    expect(mainPage?.nonEmptyCells).toBe(2);
    expect(mainPage?.numericCells).toBe(0);
    expect(mainPage?.textCells).toBe(2);
    expect(mainPage?.semanticParsed).toBe(false);

    // Verify verbatim header preservation
    const mainPageText = mainPage?.cells.map((c) => c.w).join(' ');
    expect(mainPageText).toContain('Praan Health Tech Private Limited');
  });

  it('preserves formulas, cached calculated values, and Excel error codes explicitly', () => {
    // Construct synthetic workbook with formulas, cached values, errors, merges
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Item', 'Amount', 'Tax (18%)', 'Total', 'Notes'],
      ['Server Host', 1000, null, null, 'Active'],
      ['Domain', 50, null, null, 'Auto-renew'],
      ['Invalid Ref', null, null, null, 'Error Row'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Add formulas & errors directly to sheet cells
    ws['C2'] = { t: 'n', v: 180, w: '180.00', f: 'B2*0.18' };
    ws['D2'] = { t: 'n', v: 1180, w: '1180.00', f: 'B2+C2' };
    ws['C3'] = { t: 'n', v: 9, w: '9.00', f: 'B3*0.18' };
    ws['D3'] = { t: 'n', v: 59, w: '59.00', f: 'B3+C3' };
    ws['B4'] = { t: 'e', v: 0x17, w: '#REF!', f: 'SUM(#REF!)' };
    ws['C4'] = { t: 'e', v: 0x07, w: '#DIV/0!' };
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]; // A1:B1 merged
    ws['!ref'] = 'A1:E4';

    XLSX.utils.book_append_sheet(wb, ws, 'FormulasAndErrors');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = extractRawWorkbookData(buf, 'test_formulas.xlsx');
    expect(result.totalSheets).toBe(1);
    const sheet = result.sheets[0]!;

    expect(sheet.formulaCells).toBe(5);
    expect(sheet.errorCells).toBe(2);
    expect(sheet.merges).toContain('A1:B1');

    const cellC2 = sheet.cells.find((c) => c.coord === 'C2');
    expect(cellC2).toBeDefined();
    expect(cellC2?.f).toBe('B2*0.18');
    expect(cellC2?.v).toBe(180);
    expect(cellC2?.w).toBe('180');

    const cellB4 = sheet.cells.find((c) => c.coord === 'B4');
    expect(cellB4).toBeDefined();
    expect(cellB4?.t).toBe('e');
    expect(cellB4?.err).toBe('#REF!');

    const cellC4 = sheet.cells.find((c) => c.coord === 'C4');
    expect(cellC4?.err).toBe('#DIV/0!');
  });
});

describe('queryRawSheetCells: Bounded Exact Cell Read API & Security Negatives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries exact coordinate with bounded output and security untrusted tagging', async () => {
    const mockQuery = vi.mocked(pool.query);

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'sheet-1',
          document_id: '11111111-1111-1111-1111-111111111111',
          sheet_name: 'P&L',
          sheet_index: 0,
          dimensions: 'A1:B3',
          row_count: 3,
          col_count: 2,
          non_empty_cells: 6,
          merges: [],
          detected_layout: 'matrix',
          semantic_parsed: false,
          semantic_metric_count: 0,
          cells: [
            { r: 1, c: 1, coord: 'A1', v: 'Metric', w: 'Metric', t: 's' },
            { r: 1, c: 2, coord: 'B1', v: 'Jun 26', w: 'Jun 26', t: 's' },
            { r: 2, c: 1, coord: 'A2', v: 'Revenue', w: 'Revenue', t: 's' },
            { r: 2, c: 2, coord: 'B2', v: 45000000, w: '45000000', t: 'n' },
            { r: 3, c: 1, coord: 'A3', v: 'GMV', w: 'GMV', t: 's' },
            { r: 3, c: 2, coord: 'B3', v: 80000000, w: '80000000', t: 'n' },
          ],
        },
      ],
    } as any);

    const result = await queryRawSheetCells({
      documentId: '11111111-1111-1111-1111-111111111111',
      sheetName: 'P&L',
      coord: 'B2',
    });

    expect(result.cells.length).toBe(1);
    expect(result.cells[0]?.coord).toBe('B2');
    expect(result.cells[0]?.rawValue).toBe(45000000);
    expect(result.isUntrustedData).toBe(true);
    expect(result.securityNotice).toContain('untrusted');
  });

  it('queries range A1:B2 with bounding box and paging limits', async () => {
    const mockQuery = vi.mocked(pool.query);

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'sheet-1',
          document_id: '11111111-1111-1111-1111-111111111111',
          sheet_name: 'P&L',
          sheet_index: 0,
          dimensions: 'A1:B3',
          row_count: 3,
          col_count: 2,
          non_empty_cells: 6,
          merges: [],
          detected_layout: 'matrix',
          semantic_parsed: false,
          semantic_metric_count: 0,
          cells: [
            { r: 1, c: 1, coord: 'A1', v: 'Metric', w: 'Metric', t: 's' },
            { r: 1, c: 2, coord: 'B1', v: 'Jun 26', w: 'Jun 26', t: 's' },
            { r: 2, c: 1, coord: 'A2', v: 'Revenue', w: 'Revenue', t: 's' },
            { r: 2, c: 2, coord: 'B2', v: 45000000, w: '45000000', t: 'n' },
            { r: 3, c: 1, coord: 'A3', v: 'GMV', w: 'GMV', t: 's' },
            { r: 3, c: 2, coord: 'B3', v: 80000000, w: '80000000', t: 'n' },
          ],
        },
      ],
    } as any);

    const result = await queryRawSheetCells({
      documentId: '11111111-1111-1111-1111-111111111111',
      sheetName: 'P&L',
      range: 'A1:B2',
      limit: 10,
    });

    expect(result.cells.length).toBe(4);
    expect(result.cells.map((c) => c.coord)).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(result.coverage.returnedCellsCount).toBe(4);
    expect(result.coverage.hasMore).toBe(false);
  });

  it('rejects invalid range and SQL injection attempts with strict validation', async () => {
    await expect(
      queryRawSheetCells({
        documentId: 'not-a-uuid',
      })
    ).rejects.toThrow(/invalid.*documentid/i);

    await expect(
      queryRawSheetCells({
        documentId: '11111111-1111-1111-1111-111111111111',
        range: "A1'; DROP TABLE document_sheets; --",
      })
    ).rejects.toThrow(/invalid.*range/i);

    await expect(
      queryRawSheetCells({
        documentId: '11111111-1111-1111-1111-111111111111',
        coord: 'INVALID_COORD_123',
      })
    ).rejects.toThrow(/invalid.*coord/i);
  });
});
