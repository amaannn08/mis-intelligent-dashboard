import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { getAuditedFixture } from './fixtures-helper.js';

// Mock @mis/db
vi.mock('@mis/db', () => {
  return {
    pool: {
      query: vi.fn(),
    },
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'mock-job-id' }]),
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'mock-job-id' }]),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      transaction: vi.fn(async (cb) => {
        const tx = {
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue([]),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
        return await cb(tx);
      }),
    },
    documents: {
      id: 'id',
      companyId: 'company_id',
      isPortfolioTracker: 'is_portfolio_tracker',
      status: 'status',
    },
    documentSheets: {
      id: 'id',
      documentId: 'document_id',
    },
    misMetrics: {
      documentId: 'document_id',
    },
    metrics: {
      documentId: 'document_id',
    },
    documentChunks: {
      documentId: 'document_id',
    },
    processingJobs: {
      id: 'id',
    },
    metricDefinitions: {
      key: 'key',
    },
  };
});

import {
  extractRawWorkbookData,
  queryRawSheetCells,
} from '../packages/core/src/raw-sheets/index.js';
import { pool } from '@mis/db';

describe('Root Portfolio Tracker: Inclusion & KPI Non-Contamination', () => {
  it('extracts audited MIS Tracker workbook with 100% cell fidelity and count reconciliation', () => {
    const fixturePath = getAuditedFixture('MIS_Tracker');
    expect(fs.existsSync(fixturePath)).toBe(true);

    const buf = fs.readFileSync(fixturePath);
    const result = extractRawWorkbookData(buf, 'MIS_Tracker.xlsx');

    expect(result.totalSheets).toBeGreaterThanOrEqual(1);
    expect(result.nonEmptyCellsCount).toBeGreaterThan(0);
    expect(result.countsReconciled).toBe(true);

    // Look for portfolio tracking content across sheets
    const allCells = result.sheets.flatMap((s) => s.cells);
    const allText = allCells.map((c) => c.w).join(' ');

    // The tracker contains fund labels, POCs, and portfolio compliance terms
    expect(allText).toMatch(/Fund\s+I|Fund\s+II|Fund\s+III|Compliance|Status|POC/i);
  });

  it('queryRawSheetCells queries portfolio tracker cells without inventing company KPIs', async () => {
    const mockQuery = vi.mocked(pool.query);

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'sheet-tracker-1',
          document_id: '99999999-9999-9999-9999-999999999999',
          sheet_name: 'MIS Tracker',
          sheet_index: 0,
          dimensions: 'A1:F35',
          row_count: 35,
          col_count: 6,
          non_empty_cells: 120,
          merges: [],
          detected_layout: 'notes_and_metadata',
          semantic_parsed: false,
          semantic_metric_count: 0,
          cells: [
            { r: 1, c: 1, coord: 'A1', v: 'Company', w: 'Company', t: 's' },
            { r: 1, c: 2, coord: 'B1', v: 'Fund', w: 'Fund', t: 's' },
            { r: 1, c: 3, coord: 'C1', v: 'POC', w: 'POC', t: 's' },
            { r: 2, c: 1, coord: 'A2', v: 'Animall', w: 'Animall', t: 's' },
            { r: 2, c: 2, coord: 'B2', v: 'Fund I', w: 'Fund I', t: 's' },
            { r: 2, c: 3, coord: 'C2', v: 'Deepak', w: 'Deepak', t: 's' },
          ],
        },
      ],
    } as any);

    const result = await queryRawSheetCells({
      documentId: '99999999-9999-9999-9999-999999999999',
      searchQuery: 'Deepak',
    });

    expect(result.cells.length).toBe(1);
    expect(result.cells[0]?.coord).toBe('C2');
    expect(result.cells[0]?.formattedText).toBe('Deepak');
    expect(result.sheetMetadata.semanticParsed).toBe(false);
    expect(result.sheetMetadata.semanticMetricCount).toBe(0);
  });
});
