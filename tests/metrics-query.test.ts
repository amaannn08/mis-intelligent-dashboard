import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @mis/db pool before importing metrics-query
vi.mock('@mis/db', () => {
  return {
    pool: {
      query: vi.fn(),
    },
  };
});

import { pool } from '@mis/db';
import { queryMisMetrics } from '../packages/core/src/rag/metrics-query.js';

describe('queryMisMetrics: Verification & Regression Guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Exact Net vs Gross Revenue Differentiation', () => {
    it('generates exact Net Revenue matching and excludes Gross Revenue when net_revenue is requested', async () => {
      const mockQuery = vi.mocked(pool.query);

      // 1. Company resolution
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'comp-1', name: 'Masterchow' }],
      } as any);

      // 2. Authoritative document resolution
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'doc-1', filename: 'Masterchow MIS April 26.xlsx', reporting_period: '2026-04' }],
      } as any);

      // 3. Dedicated category sheet check
      mockQuery.mockResolvedValueOnce({
        rows: [{ sheet_name: 'Category' }],
      } as any);

      // 4. Summary query result
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            block_label: 'Condiments',
            parent_block_label: null,
            metric_label: 'Net Revenue',
            unit: 'INR',
            currency: 'INR',
            scale: 'lakh',
            sheet_name: 'Category',
            filename: 'Masterchow MIS April 26.xlsx',
            periods_count: '25',
            min_period: '2024-04',
            max_period: '2026-04',
            total_value: '3034.87',
            avg_value: '121.39',
            latest_period: '2026-04',
            latest_value: '326.31',
          },
        ],
      } as any);

      // 5. Recent rows query result
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            block_label: 'Condiments',
            parent_block_label: null,
            metric_label: 'Net Revenue',
            reporting_period: '2026-04',
            value: '326.31',
            unit: 'INR',
            currency: 'INR',
            scale: 'lakh',
            sheet_name: 'Category',
            source_reference: 'Category!M9',
          },
        ],
      } as any);

      const res = await queryMisMetrics({
        companyName: 'Masterchow',
        metric: 'net_revenue',
      });

      expect(res.companyName).toBe('Masterchow');
      expect(res.authoritativeDocument).toBe('Masterchow MIS April 26.xlsx');
      expect(res.authoritativeSheet).toBe('Category');
      expect(res.rankedCategories).toHaveLength(1);
      expect(res.rankedCategories[0].blockLabel).toBe('Condiments');
      expect(res.rankedCategories[0].totalValue).toBe(3034.87);
      expect(res.rankedCategories[0].latestValue).toBe(326.31);
      expect(res.rankedCategories[0].latestPeriod).toBe('2026-04');

      // Verify exact SQL clauses passed in summary query (call #4)
      const summaryCallSql = mockQuery.mock.calls[3][0] as string;
      expect(summaryCallSql).toContain("raw_label ILIKE '%Net Revenue%'");
      expect(summaryCallSql).not.toContain("raw_label ILIKE '%Gross Revenue%'");
      expect(summaryCallSql).toContain("unit != 'percent'");
      expect(summaryCallSql).toContain("raw_label NOT ILIKE '%margin%'");
      expect(summaryCallSql).toContain("raw_label NOT ILIKE '%gm%'");
    });

    it('generates exact Gross Revenue matching when gross_revenue is requested', async () => {
      const mockQuery = vi.mocked(pool.query);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Masterchow' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-1', filename: 'Masterchow MIS April 26.xlsx', reporting_period: '2026-04' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ sheet_name: 'Category' }] } as any);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            block_label: 'Condiments',
            parent_block_label: null,
            metric_label: 'Gross Revenue',
            unit: 'INR',
            currency: 'INR',
            scale: 'lakh',
            sheet_name: 'Category',
            filename: 'Masterchow MIS April 26.xlsx',
            periods_count: '25',
            min_period: '2024-04',
            max_period: '2026-04',
            total_value: '5930.17',
            avg_value: '237.21',
            latest_period: '2026-04',
            latest_value: '607.76',
          },
        ],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      const res = await queryMisMetrics({
        companyName: 'Masterchow',
        metric: 'gross_revenue',
      });

      expect(res.rankedCategories[0].totalValue).toBe(5930.17);
      const summaryCallSql = mockQuery.mock.calls[3][0] as string;
      expect(summaryCallSql).toContain("raw_label ILIKE '%Gross Revenue%'");
      expect(summaryCallSql).not.toContain("raw_label ILIKE '%Net Revenue%'");
    });
  });

  describe('2. Dedicated Sheet Selection & Non-Duplication', () => {
    it('selects dedicated Category sheet and filters parent_block_label IS NULL to prevent summing Category X Channel', async () => {
      const mockQuery = vi.mocked(pool.query);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Masterchow' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-1', filename: 'Masterchow MIS April 26.xlsx', reporting_period: '2026-04' }] } as any);
      // Dedicated category sheet exists
      mockQuery.mockResolvedValueOnce({ rows: [{ sheet_name: 'Category' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      await queryMisMetrics({
        companyName: 'Masterchow',
        metric: 'net_revenue',
      });

      const summaryCallSql = mockQuery.mock.calls[3][0] as string;
      expect(summaryCallSql).toContain('mm.parent_block_label IS NULL');
      expect(summaryCallSql).toContain('mm.sheet_name ILIKE $');
      expect(mockQuery.mock.calls[3][1]).toContain('%Category%');
    });

    it('switches to channel breakdown sheet when parentBlockLabel is specified', async () => {
      const mockQuery = vi.mocked(pool.query);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Masterchow' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-1', filename: 'Masterchow MIS April 26.xlsx', reporting_period: '2026-04' }] } as any);
      // cxcCheck finds Category X Channel for Blinkit
      mockQuery.mockResolvedValueOnce({ rows: [{ sheet_name: 'Category X Channel' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      await queryMisMetrics({
        companyName: 'Masterchow',
        metric: 'net_revenue',
        parentBlockLabel: 'Blinkit',
      });

      const summaryCallSql = mockQuery.mock.calls[3][0] as string;
      expect(summaryCallSql).not.toContain('mm.parent_block_label IS NULL');
      expect(summaryCallSql).toContain('mm.parent_block_label ILIKE $');
      expect(mockQuery.mock.calls[3][1]).toContain('%Blinkit%');
      expect(mockQuery.mock.calls[3][1]).toContain('%Category X Channel%');
    });
  });

  describe('3. Current-Document Precedence over Overlapping Files', () => {
    it('restricts query to the latest authoritative document with block metrics', async () => {
      const mockQuery = vi.mocked(pool.query);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Masterchow' }] } as any);
      // Doc resolution query selects latest by reporting_period DESC, uploaded_at DESC
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'doc-latest', filename: 'Masterchow MIS April 26.xlsx', reporting_period: '2026-04' }],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ sheet_name: 'Category' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      await queryMisMetrics({
        companyName: 'Masterchow',
        metric: 'net_revenue',
      });

      const docQuerySql = mockQuery.mock.calls[1][0] as string;
      expect(docQuerySql).toContain('ORDER BY d.reporting_period DESC NULLS LAST, d.uploaded_at DESC');
      expect(docQuerySql).toContain('LIMIT 1');

      // The summary query must use mm.document_id = doc-latest
      const summaryCallSql = mockQuery.mock.calls[3][0] as string;
      expect(summaryCallSql).toContain('mm.document_id = $');
      expect(mockQuery.mock.calls[3][1]).toContain('doc-latest');
    });
  });

  describe('4. Count vs Percent vs Currency Segregation', () => {
    it('enforces count kind and unit for quantity queries', async () => {
      const mockQuery = vi.mocked(pool.query);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Masterchow' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-1', filename: 'Masterchow MIS April 26.xlsx', reporting_period: '2026-04' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      await queryMisMetrics({
        companyName: 'Masterchow',
        metric: 'qty',
      });

      const summaryCallSql = mockQuery.mock.calls[3][0] as string;
      expect(summaryCallSql).toContain("(mm.kind IS NULL OR mm.kind = 'count')");
      expect(summaryCallSql).toContain("raw_label ILIKE '%qty%'");
    });

    it('enforces currency kind and excludes percentage metrics for revenue queries', async () => {
      const mockQuery = vi.mocked(pool.query);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Masterchow' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-1', filename: 'Masterchow MIS April 26.xlsx', reporting_period: '2026-04' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      await queryMisMetrics({
        companyName: 'Masterchow',
        metric: 'revenue',
      });

      const summaryCallSql = mockQuery.mock.calls[3][0] as string;
      expect(summaryCallSql).toContain("mm.unit != 'percent'");
      expect(summaryCallSql).toContain("(mm.kind IS NULL OR mm.kind = 'currency')");
      expect(summaryCallSql).toContain("mm.raw_label NOT ILIKE '%margin%'");
      expect(summaryCallSql).toContain("mm.raw_label NOT ILIKE '%gm%'");
    });
  });

  describe('5. Period Filtering & Range Aggregation', () => {
    it('applies exact period filter when specified', async () => {
      const mockQuery = vi.mocked(pool.query);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Masterchow' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-1', filename: 'Masterchow MIS April 26.xlsx', reporting_period: '2026-04' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      await queryMisMetrics({
        companyName: 'Masterchow',
        metric: 'net_revenue',
        period: '2026-04',
      });

      const summaryCallSql = mockQuery.mock.calls[3][0] as string;
      expect(summaryCallSql).toContain('mm.reporting_period = $');
      expect(mockQuery.mock.calls[3][1]).toContain('2026-04');
    });

    it('applies period range filters when periodStart and periodEnd are specified', async () => {
      const mockQuery = vi.mocked(pool.query);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Masterchow' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-1', filename: 'Masterchow MIS April 26.xlsx', reporting_period: '2026-04' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      await queryMisMetrics({
        companyName: 'Masterchow',
        metric: 'net_revenue',
        periodStart: '2025-04',
        periodEnd: '2026-03',
      });

      const summaryCallSql = mockQuery.mock.calls[3][0] as string;
      expect(summaryCallSql).toContain('mm.reporting_period >= $');
      expect(summaryCallSql).toContain('mm.reporting_period <= $');
      expect(mockQuery.mock.calls[3][1]).toContain('2025-04');
      expect(mockQuery.mock.calls[3][1]).toContain('2026-03');
    });
  });
});
