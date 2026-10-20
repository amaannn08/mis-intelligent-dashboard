import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@mis/db', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '@mis/db';
import { buildWorkbookMap } from '../packages/core/src/rag/workbook-map.js';

describe('buildWorkbookMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty string when the company has no sheets on file', async () => {
    const mockQuery = vi.mocked(pool.query);
    mockQuery.mockResolvedValueOnce({ rows: [] } as any); // sheets
    mockQuery.mockResolvedValueOnce({ rows: [] } as any); // metrics agg

    const result = await buildWorkbookMap({ companyId: 'comp-1' });
    expect(result).toBe('');
  });

  it('builds a per-sheet inventory with example items, line items, and period range', async () => {
    const mockQuery = vi.mocked(pool.query);
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          filename: 'Masterchow_MIS_April_26.xlsx',
          reporting_period: '2026-04',
          sheet_name: 'Product Net Sales',
          detected_layout: 'metric_matrix',
          semantic_parsed: true,
          semantic_metric_count: 5514,
          row_count: 259,
          col_count: 29,
          document_id: 'doc-1',
        },
        {
          filename: 'Masterchow_MIS_April_26.xlsx',
          reporting_period: '2026-04',
          sheet_name: 'Notes',
          detected_layout: 'notes_and_metadata',
          semantic_parsed: false,
          semantic_metric_count: 0,
          row_count: 20,
          col_count: 3,
          document_id: 'doc-1',
        },
      ],
    } as any);
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          document_id: 'doc-1',
          sheet_name: 'Product Net Sales',
          blocks: ['Masterchow Sichuan Chilli Oil 170 GM', 'Masterchow Whole Wheat Noodles 300 GM'],
          parents: ['Condiments', 'Stick Noodles'],
          min_period: '2024-04',
          max_period: '2026-04',
          distinct_raw_labels: ['NET Revenue'],
        },
      ],
    } as any);

    const result = await buildWorkbookMap({ companyId: 'comp-1' });

    expect(result).toContain('Masterchow_MIS_April_26.xlsx');
    expect(result).toContain('Product Net Sales');
    expect(result).toContain('Masterchow Sichuan Chilli Oil 170 GM');
    expect(result).toContain('periods 2024-04 to 2026-04');
    expect(result).toContain('Notes');
    expect(result).toContain('free-text notes/commentary');
  });
});
