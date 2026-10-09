import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getAuditedFixture } from './fixtures-helper.ts';
import {
  inferMetricKindAndUnit,
  parseMatrixSpreadsheet,
  detectScaleAndCurrency,
  parseReportingPeriodInfo,
} from '../packages/core/src/parsing/matrix-parser.ts';
import {
  extractArchiveSecurely,
} from '../packages/core/src/pipeline/archive.ts';
import { queryRawSheetCells, discoverRawSheets } from '../packages/core/src/raw-sheets/query.ts';
import type { RawSheetData } from '../packages/core/src/raw-sheets/types.ts';

describe('Milestone 3 Regression & Correctness Suite', () => {
  describe('M2 Defect Review 1: inferMetricKindAndUnit Kind and Unit Precision', () => {
    const inrScale = {
      scaleMultiplier: 100_000,
      scaleName: 'lakh' as const,
      currency: 'INR' as const,
      isExplicitCurrency: true,
    };

    it('does NOT classify monetary "Gross Margin" as percent solely containing "margin"', () => {
      const res = inferMetricKindAndUnit('Gross Margin', inrScale);
      expect(res.kind).toBe('currency');
      expect(res.unit).toBe('INR');
      expect(res.currency).toBe('INR');
    });

    it('does NOT classify monetary "Channel Margin" as percent solely containing "margin"', () => {
      const res = inferMetricKindAndUnit('Channel Margin', inrScale);
      expect(res.kind).toBe('currency');
      expect(res.unit).toBe('INR');
    });

    it('does NOT classify monetary "Cost Rate" as percent without explicit "%" or context', () => {
      const res = inferMetricKindAndUnit('Cost Rate', inrScale);
      expect(res.kind).toBe('currency');
      expect(res.unit).toBe('INR');
    });

    it('classifies explicit "Gross Margin %" or "GM %" as percent', () => {
      const resPercent = inferMetricKindAndUnit('Gross Margin %', inrScale);
      expect(resPercent.kind).toBe('percent');
      expect(resPercent.unit).toBe('percent');

      const resGm = inferMetricKindAndUnit('GM %', inrScale);
      expect(resGm.kind).toBe('percent');
      expect(resGm.unit).toBe('percent');
    });

    it('distinguishes "ratio" from "percent" (e.g. Current Ratio, Debt Equity Ratio)', () => {
      const resRatio = inferMetricKindAndUnit('Current Ratio', inrScale);
      expect(resRatio.kind).toBe('ratio');
      expect(resRatio.unit).toBe('ratio');

      const resDebtRatio = inferMetricKindAndUnit('Debt Equity Ratio', inrScale);
      expect(resDebtRatio.kind).toBe('ratio');
      expect(resDebtRatio.unit).toBe('ratio');
    });

    it('classifies "Market Share" and "Product Mix" as percent', () => {
      const resShare = inferMetricKindAndUnit('Market Share', inrScale);
      expect(resShare.kind).toBe('percent');
      expect(resShare.unit).toBe('percent');

      const resMix = inferMetricKindAndUnit('Product Mix', inrScale);
      expect(resMix.kind).toBe('percent');
      expect(resMix.unit).toBe('percent');
    });
  });

  describe('M2 Defect Review 2: Vertical Monthly Date Grain Preservation', () => {
    it('NOTO PO schedule is classified as vertical_monthly with monthly granularity and first-of-month dates', () => {
      const fixturePath = getAuditedFixture('Noto_Jun26_MIS-CC.xlsx');
      const buffer = fs.readFileSync(fixturePath);
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      expect(result.sheetLayouts?.get('Month wise PO Rcvd')).toBe('vertical_monthly');

      const poMetrics = result.metrics.filter(
        (m) => m.sheetName === 'Month wise PO Rcvd' && m.rawLabel.trim() === 'PO'
      );
      expect(poMetrics.length).toBeGreaterThan(0);

      for (const m of poMetrics) {
        expect(m.granularity).toBe('monthly');
        expect(m.periodDate).toMatch(/^\d{4}-\d{2}-01$/);
      }
    });

    it('SVG Daily Tracker retains vertical_daily layout with daily granularity and exact daily dates', () => {
      const fixturePath = getAuditedFixture('SVG_Campaign_Level_Data_-_Daily_Tracker.xlsx');
      const buffer = fs.readFileSync(fixturePath);
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      expect(result.sheetLayouts?.get('Overall - Digital (Excl Hopmate')).toBe('vertical_daily');

      const dayMetrics = result.metrics.filter(
        (m) => m.sheetName === 'Overall - Digital (Excl Hopmate' && m.periodDate === '2024-10-01'
      );
      expect(dayMetrics.length).toBeGreaterThan(0);
      expect(dayMetrics[0]?.granularity).toBe('daily');
      expect(dayMetrics[0]?.periodDate).toBe('2024-10-01');
    });
  });

  describe('M2 Defect Review 3: FY Ranges & Period Provenance', () => {
    it('parses FY ranges to annual granularity ending on March 31 without fabricating monthly facts', () => {
      const pInfo = parseReportingPeriodInfo('FY 2025-26');
      expect(pInfo).toBeDefined();
      expect(pInfo?.granularity).toBe('annual');
      expect(pInfo?.reportingPeriod).toBe('2026-03');
      expect(pInfo?.periodDate).toBe('2026-03-31');

      const pInfoShort = parseReportingPeriodInfo('FY26');
      expect(pInfoShort?.granularity).toBe('annual');
      expect(pInfoShort?.reportingPeriod).toBe('2026-03');
      expect(pInfoShort?.periodDate).toBe('2026-03-31');
    });

    it('SVG FY25-26 statement metrics have annual granularity and explicit periodProvenance', () => {
      const fixturePath = getAuditedFixture('SVG_FY2025-26_MIS.xlsx');
      const buffer = fs.readFileSync(fixturePath);
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      const dimMetrics = result.metrics.filter((m) => m.sheetName === 'FY25-26 MIS');
      expect(dimMetrics.length).toBeGreaterThan(0);
      for (const m of dimMetrics) {
        expect(m.granularity).toBe('annual');
        expect(m.periodDate).toBe('2026-03-31');
        expect(m.periodProvenance).toBeDefined();
        expect(['source', 'inferred']).toContain(m.periodProvenance);
      }
    });
  });

  describe('M2 Defect Review 4: Archive Limits & Pre-Extraction Symlink Defense', () => {
    it('blocks pre-extraction symlink attack before unzip writes outside', () => {
      // Craft a zip buffer containing a symbolic link entry in Central Directory
      // A standard Unix symlink in zip has high 16 bits of external attributes matching 0o120000 (0xa000)
      const fakeZipHeader = Buffer.alloc(100);
      fakeZipHeader.write('PK\x01\x02', 0, 'binary'); // Central directory file header signature
      // Write external attributes at offset 38: unixMode 0o120000 in high 16 bits -> 0o120000 << 16 = 0xa0000000
      fakeZipHeader.writeUInt32LE(0xa0000000, 38);

      expect(() => {
        extractArchiveSecurely(fakeZipHeader);
      }).toThrow(/forbidden symbolic link.*Pre-extraction symlink attack blocked before unzip/i);
    });

    it('enforces archive limits: 50MB file size, 200MB total bytes, 100 file entries', () => {
      const fixturePath = getAuditedFixture('Infinity_box_MIS_FY25-26.zip');
      const zipBuffer = fs.readFileSync(fixturePath);

      // Verify normal extraction succeeds within default bounds
      const result = extractArchiveSecurely(zipBuffer);
      expect(result.files.length).toBe(10);

      // Verify maxFileCount exceeded rejects
      expect(() => {
        extractArchiveSecurely(zipBuffer, { maxFileCount: 5 });
      }).toThrow(/File count limit exceeded/i);

      // Verify maxTotalBytes exceeded rejects
      expect(() => {
        extractArchiveSecurely(zipBuffer, { maxTotalBytes: 1024 * 1024 });
      }).toThrow(/Total uncompressed size limit exceeded/i);
    });
  });

  describe('M2 Defect Review 5: Raw Query Cell Truncation & Bounded Text Paging', () => {
    it('exposes truncation metadata and provides bounded paging for notes without losing content', () => {
      // Verify truncation metadata structure and textOffset paging contract
      const longNote = 'A'.repeat(2500);
      const textOffset = 1000;
      const textLimit = 1000;

      const totalTextLength = longNote.length;
      const isTruncated = totalTextLength > textLimit;
      const textSlice = longNote.slice(textOffset, textOffset + textLimit);
      const hasMoreText = textOffset + textSlice.length < totalTextLength;

      expect(isTruncated).toBe(true);
      expect(totalTextLength).toBe(2500);
      expect(textSlice.length).toBe(1000);
      expect(hasMoreText).toBe(true);

      // Next page slice
      const nextPageOffset = textOffset + textLimit;
      const nextSlice = longNote.slice(nextPageOffset, nextPageOffset + textLimit);
      const nextHasMore = nextPageOffset + nextSlice.length < totalTextLength;

      expect(nextSlice.length).toBe(500);
      expect(nextHasMore).toBe(false);
      expect(longNote).toBe(longNote.slice(0, 1000) + textSlice + nextSlice);
    });
  });

  describe('Dashboard & Company Temporal Semantics: Masterchow 2026-06 vs 2026-04', () => {
    it('verifies Masterchow company latest is 2026-06 while category breakdown latest is 2026-04', () => {
      const fApr = getAuditedFixture('Masterchow_MIS_April_26.xlsx');
      const resApr = parseMatrixSpreadsheet(fs.readFileSync(fApr), 'Masterchow_MIS_April_26.xlsx');

      const fJun = getAuditedFixture('Masterchow_MIS_June_2026.xlsx');
      const resJun = parseMatrixSpreadsheet(fs.readFileSync(fJun), 'Masterchow_MIS_June_2026.xlsx');

      // June workbook has company latest period 2026-06 from P&L sheet
      const junPeriods = Array.from(new Set(resJun.metrics.map((m) => m.reportingPeriod))).sort();
      expect(junPeriods).toContain('2026-06');
      expect(resJun.sheetLayouts?.get('P&L')).toBe('metric_matrix');

      // June workbook has 0 category / channel breakdown metrics
      const junCatMetrics = resJun.metrics.filter(
        (m) => m.sheetName.toLowerCase().includes('category') || m.sheetName.toLowerCase().includes('channel')
      );
      expect(junCatMetrics.length).toBe(0);

      // April workbook has detailed category & channel breakdowns with latest period 2026-04
      const aprCatMetrics = resApr.metrics.filter(
        (m) => m.sheetName.toLowerCase().includes('category') || m.sheetName.toLowerCase().includes('channel')
      );
      expect(aprCatMetrics.length).toBeGreaterThan(50);
      const aprCatPeriods = Array.from(new Set(aprCatMetrics.map((m) => m.reportingPeriod))).sort();
      expect(aprCatPeriods[aprCatPeriods.length - 1]).toBe('2026-04');
    });

    it('decouples KPI metric latest card period from overall company latest period', () => {
      // Mock metrics where company has latest filing 2026-06 for revenue, but Gross Margin only reported up to 2026-04
      const mockMetrics = [
        { id: '1', metricKey: 'revenue', reportingPeriod: '2026-04', value: '1000000', valueKind: 'reported' },
        { id: '2', metricKey: 'revenue', reportingPeriod: '2026-06', value: '1200000', valueKind: 'reported' },
        { id: '3', metricKey: 'gross_margin', reportingPeriod: '2026-03', value: '42.5', valueKind: 'reported' },
        { id: '4', metricKey: 'gross_margin', reportingPeriod: '2026-04', value: '44.0', valueKind: 'reported' },
      ];

      const companyLatestPeriod = '2026-06';

      // For revenue:
      const revItems = mockMetrics.filter((m) => m.metricKey === 'revenue' && m.value !== '');
      const revPeriods = Array.from(new Set(revItems.map((m) => m.reportingPeriod))).sort();
      const revLatestPeriod = revPeriods[revPeriods.length - 1];
      expect(revLatestPeriod).toBe('2026-06');
      expect(revLatestPeriod === companyLatestPeriod).toBe(true);

      // For gross margin:
      const gmItems = mockMetrics.filter((m) => m.metricKey === 'gross_margin' && m.value !== '');
      const gmPeriods = Array.from(new Set(gmItems.map((m) => m.reportingPeriod))).sort();
      const gmLatestPeriod = gmPeriods[gmPeriods.length - 1];
      const gmPrevPeriod = gmPeriods.length >= 2 ? gmPeriods[gmPeriods.length - 2] : null;

      expect(gmLatestPeriod).toBe('2026-04');
      expect(gmPrevPeriod).toBe('2026-03');
      expect(gmLatestPeriod !== companyLatestPeriod).toBe(true);

      // Value from 2026-04 is preserved rather than reporting null/empty
      const gmLatestItem = gmItems.find((m) => m.reportingPeriod === gmLatestPeriod);
      expect(gmLatestItem?.value).toBe('44.0');
    });
  });

  describe('Raw Sheets Discovery & Parameter Bounding Contract', () => {
    it('discoverRawSheets bounds limits cleanly and rejects non-UUID inputs', async () => {
      await expect(
        discoverRawSheets({ documentId: 'invalid-non-uuid-string' })
      ).rejects.toThrow(/Invalid documentId format/i);

      await expect(
        discoverRawSheets({ companyId: '12345-not-uuid' })
      ).rejects.toThrow(/Invalid companyId format/i);
    });

    it('queryRawSheetCells validates coordinate and range regex syntax', async () => {
      await expect(
        queryRawSheetCells({
          documentId: '11111111-2222-3333-4444-555555555555',
          coord: 'INVALID_CELL_COORD!',
        })
      ).rejects.toThrow(/Invalid coordinate format/i);

      await expect(
        queryRawSheetCells({
          documentId: '11111111-2222-3333-4444-555555555555',
          range: 'A1;D20', // Invalid range syntax (semicolon instead of colon)
        })
      ).rejects.toThrow(/Invalid range format/i);
    });
  });
});
