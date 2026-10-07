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
            total_value: '303487000.00',
            avg_value: '12139480.00',
            latest_period: '2026-04',
            latest_value: '32631000.00',
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
      const topCat = res.rankedCategories[0];
      expect(topCat.blockLabel).toBe('Condiments');
      // Assert source-scale fields (exact unscaled values)
      expect(topCat.source_value_cumulative).toBe(3034.87);
      expect(topCat.source_value_cumulative_formatted).toBe('3034.87 Lakh');
      expect(topCat.source_value_latest).toBe(326.31);
      expect(topCat.source_value_latest_formatted).toBe('326.31 Lakh');
      expect(topCat.source_scale).toBe('lakh');
      expect(topCat.totalValue).toBe(3034.87);
      expect(topCat.latestValue).toBe(326.31);
      expect(topCat.latestPeriod).toBe('2026-04');

      // Assert normalized base INR fields (applied multiplier, do_not_scale_again)
      expect(topCat.normalized_amount_cumulative_inr).toBe(303487000);
      expect(topCat.normalized_amount_latest_inr).toBe(32631000);
      expect(topCat.scale_multiplier_applied).toBe(true);
      expect(topCat.do_not_scale_again).toBe(true);
      expect(topCat.value_unit).toBe('INR');

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
            total_value: '593017000.00',
            avg_value: '23720680.00',
            latest_period: '2026-04',
            latest_value: '60776000.00',
          },
        ],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      const res = await queryMisMetrics({
        companyName: 'Masterchow',
        metric: 'gross_revenue',
      });

      const topGross = res.rankedCategories[0];
      expect(topGross.blockLabel).toBe('Condiments');
      expect(topGross.totalValue).toBe(5930.17);
      expect(topGross.source_value_cumulative).toBe(5930.17);
      expect(topGross.source_value_cumulative_formatted).toBe('5930.17 Lakh');
      expect(topGross.latestValue).toBe(607.76);
      expect(topGross.source_value_latest).toBe(607.76);
      expect(topGross.source_value_latest_formatted).toBe('607.76 Lakh');
      expect(topGross.source_scale).toBe('lakh');
      expect(topGross.normalized_amount_cumulative_inr).toBe(593017000);
      expect(topGross.normalized_amount_latest_inr).toBe(60776000);
      expect(topGross.scale_multiplier_applied).toBe(true);
      expect(topGross.do_not_scale_again).toBe(true);
      expect(topGross.value_unit).toBe('INR');

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

  describe('6. Generic Alternate-Company & Dynamic Scale Handling', () => {
    it('handles alternate company Animall with USD currency and thousand scale without INR assumptions', async () => {
      const mockQuery = vi.mocked(pool.query);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'comp-animall', name: 'Animall' }] } as any);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'doc-animall', filename: 'Animall MIS March 2026.xlsx', reporting_period: '2026-03' }],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            block_label: 'Dairy Operations',
            parent_block_label: null,
            metric_label: 'Net Revenue',
            unit: 'USD',
            currency: 'USD',
            scale: 'thousand',
            sheet_name: 'P&L',
            filename: 'Animall MIS March 2026.xlsx',
            periods_count: '12',
            min_period: '2025-04',
            max_period: '2026-03',
            total_value: '1500500.00',
            avg_value: '125041.67',
            latest_period: '2026-03',
            latest_value: '140250.00',
          },
        ],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      const res = await queryMisMetrics({
        companyName: 'Animall',
        metric: 'net_revenue',
      });

      expect(res.companyName).toBe('Animall');
      expect(res.rankedCategories).toHaveLength(1);
      const topCat = res.rankedCategories[0];
      expect(topCat.blockLabel).toBe('Dairy Operations');
      expect(topCat.source_value_cumulative).toBe(1500.5);
      expect(topCat.source_value_cumulative_formatted).toBe('1500.5 Thousand');
      expect(topCat.source_scale).toBe('thousand');
      expect(topCat.source_currency).toBe('USD');
      expect(topCat.value_unit).toBe('USD');
      expect(topCat.normalized_amount_cumulative_inr).toBe(1500500);
      expect(topCat.scale_multiplier_applied).toBe(true);

      // Verify dynamic scaleProvenance and explanation without hardcoded Masterchow or Lakh
      expect(topCat.scaleProvenance).toContain("Source scale 'thousand' (1000x multiplier, currency: USD)");
      expect(res.explanation).not.toContain('Masterchow');
      expect(res.explanation).not.toContain('Lakh');
      expect(res.explanation).not.toContain('₹');
      expect(res.explanation).toContain('USD 1,500,500');
    });

    it('handles unstated scale gracefully without inventing scale multiplier', async () => {
      const mockQuery = vi.mocked(pool.query);

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'comp-fragaria', name: 'Fragaria' }] } as any);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'doc-fragaria', filename: 'Fragaria MIS Mar 26.xlsx', reporting_period: '2026-03' }],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            block_label: 'Skincare',
            parent_block_label: null,
            metric_label: 'Net Revenue',
            unit: 'INR',
            currency: 'INR',
            scale: 'units',
            sheet_name: 'Sales',
            filename: 'Fragaria MIS Mar 26.xlsx',
            periods_count: '1',
            min_period: '2026-03',
            max_period: '2026-03',
            total_value: '42.00',
            avg_value: '42.00',
            latest_period: '2026-03',
            latest_value: '42.00',
          },
        ],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      const res = await queryMisMetrics({
        companyName: 'Fragaria',
        metric: 'net_revenue',
      });

      const topCat = res.rankedCategories[0];
      expect(topCat.source_scale).toBe('units');
      expect(topCat.source_value_cumulative).toBe(42);
      expect(topCat.normalized_amount_cumulative_inr).toBe(42);
      expect(topCat.scaleProvenance).toContain("Scale unstated in source sheet 'Sales'");
    });
  });
});
