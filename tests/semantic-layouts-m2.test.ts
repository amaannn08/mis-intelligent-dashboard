import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getAuditedFixture } from './fixtures-helper.js';
import { parseMatrixSpreadsheet } from '../packages/core/src/parsing/matrix-parser.js';
import { queryRawSheetCells } from '../packages/core/src/raw-sheets/query.js';

describe('Milestone 2: Universal Semantic Layouts Regression Suite', () => {
  const loadedFixtures: string[] = [];

  function loadFixtureBuffer(name: string): { buffer: Buffer; fixturePath: string } {
    const fixturePath = getAuditedFixture(name);
    expect(fs.existsSync(fixturePath), `Fixture "${name}" must exist on disk`).toBe(true);
    loadedFixtures.push(path.basename(fixturePath));
    return { buffer: fs.readFileSync(fixturePath), fixturePath };
  }

  it('records all loaded fixtures without silent absences', () => {
    // Assert helper doesn't swallow missing files
    expect(() => getAuditedFixture('completely_nonexistent_workbook_12345.xlsx')).toThrow(
      /was not found/i
    );
  });

  describe('Layout 1: Vertical Daily & Periodic Time-Series (SVG, Hopmate, NOTO)', () => {
    it('parses SVG Daily Tracker retaining exact daily dates, daily granularity, and unscaled counts/%', () => {
      const { buffer, fixturePath } = loadFixtureBuffer(
        'SVG_Campaign_Level_Data_-_Daily_Tracker.xlsx'
      );
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      expect(result.metrics.length).toBeGreaterThan(1000);
      expect(result.sheetLayouts?.get('Overall - Digital (Excl Hopmate')).toBe('vertical_daily');

      // Verify exact daily date retention (2024-10-01)
      const dayMetric = result.metrics.find(
        (m) =>
          m.sheetName === 'Overall - Digital (Excl Hopmate' &&
          m.periodDate === '2024-10-01' &&
          m.rawLabel === 'Impressions'
      );
      expect(dayMetric).toBeDefined();
      expect(dayMetric?.granularity).toBe('daily');
      expect(dayMetric?.reportingPeriod).toBe('2024-10');
      expect(dayMetric?.periodDate).toBe('2024-10-01');
      expect(dayMetric?.kind).toBe('count');
      expect(dayMetric?.unit).toBe('count');
      expect(dayMetric?.scale).toBe('units');
      expect(dayMetric?.value).toBe(100645);
      expect(dayMetric?.sourceReference).toContain("Sheet 'Overall - Digital (Excl Hopmate'");

      // Verify CTR percentage is not scaled by currency
      const ctrMetric = result.metrics.find(
        (m) =>
          m.sheetName === 'Overall - Digital (Excl Hopmate' &&
          m.periodDate === '2024-10-01' &&
          m.rawLabel === 'CTR'
      );
      expect(ctrMetric).toBeDefined();
      expect(ctrMetric?.kind).toBe('percent');
      expect(ctrMetric?.unit).toBe('percent');
      expect(ctrMetric?.scale).toBe('units');
      expect(ctrMetric?.value).toBe(4.79);

      // Verify Cost is currency
      const costMetric = result.metrics.find(
        (m) =>
          m.sheetName === 'Overall - Digital (Excl Hopmate' &&
          m.periodDate === '2024-10-01' &&
          m.rawLabel === 'Cost'
      );
      expect(costMetric).toBeDefined();
      expect(costMetric?.kind).toBe('currency');
      expect(costMetric?.value).toBe(2306);
    });

    it('parses Hopmate cohort daily series retaining exact daily dates and provenance', () => {
      const { buffer, fixturePath } = loadFixtureBuffer(
        'ROAS___ARPU___LTV___CAC_-_Hopmate.xlsx'
      );
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      expect(result.metrics.length).toBeGreaterThan(500);
      expect(result.sheetLayouts?.get('Master')).toBe('vertical_daily');

      const d0Revenue = result.metrics.find(
        (m) =>
          m.sheetName === 'Master' &&
          m.periodDate === '2025-08-21' &&
          m.rawLabel === 'Day Revenue'
      );
      expect(d0Revenue).toBeDefined();
      expect(d0Revenue?.granularity).toBe('daily');
      expect(d0Revenue?.reportingPeriod).toBe('2025-08');
      expect(d0Revenue?.periodDate).toBe('2025-08-21');
      expect(d0Revenue?.value).toBe(2775);
      expect(d0Revenue?.unit).toBe('INR');
      expect(d0Revenue?.sourceReference).toBe("Sheet 'Master', Row 4, Col G 'Day Revenue'");

      // Verify D0 ROAS % is percentage
      const roasMetric = result.metrics.find(
        (m) =>
          m.sheetName === 'Master' &&
          m.periodDate === '2025-08-21' &&
          m.rawLabel.includes('ROAS %')
      );
      expect(roasMetric).toBeDefined();
      expect(roasMetric?.kind).toBe('percent');
    });

    it('parses NOTO vertical monthly PO sheet alongside horizontal matrix sheet', () => {
      const { buffer, fixturePath } = loadFixtureBuffer('Noto_Jun26_MIS-CC.xlsx');
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      // Sheet 1 is horizontal matrix
      expect(result.sheetLayouts?.get('Month-wise ')).toBe('metric_matrix');
      // Sheet 2 is vertical date table
      expect(result.sheetLayouts?.get('Month wise PO Rcvd')).toBe('vertical_daily');

      const poMetric = result.metrics.find(
        (m) =>
          m.sheetName === 'Month wise PO Rcvd' &&
          m.reportingPeriod === '2025-04' &&
          m.rawLabel.trim() === 'PO'
      );
      expect(poMetric).toBeDefined();
      expect(poMetric?.value).toBe(45283150);
      expect(poMetric?.sourceReference).toContain("Sheet 'Month wise PO Rcvd'");
    });
  });

  describe('Layout 2: Single-Period Dimensional Columns (Magma, SVG)', () => {
    it('parses Magma Dec25 single-period dimensional columns across all sheets', () => {
      const { buffer, fixturePath } = loadFixtureBuffer('Dec25_-_MIS___CF.xlsx');
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      expect(result.metrics.length).toBeGreaterThan(50);
      expect(result.sheetLayouts?.get('MIS-Consolidated Group')).toBe('single_period_dimensional');
      expect(result.sheetLayouts?.get('MIS-Vertical Wise')).toBe('single_period_dimensional');

      // Consolidated Group GMV Invoiced
      const gmvConsolidated = result.metrics.find(
        (m) =>
          m.sheetName === 'MIS-Consolidated Group' &&
          m.blockLabel === 'Consolidated Group' &&
          m.rawLabel.includes('GMV Invoiced')
      );
      expect(gmvConsolidated).toBeDefined();
      expect(gmvConsolidated?.reportingPeriod).toBe('2025-12');
      expect(gmvConsolidated?.value).toBe(305044312.87);
      expect(gmvConsolidated?.unit).toBe('INR');

      // Vertical Wise: Magma Green GMV Invoiced
      const gmvMagmaGreen = result.metrics.find(
        (m) =>
          m.sheetName === 'MIS-Vertical Wise' &&
          m.blockLabel === 'Magma Green' &&
          m.rawLabel.includes('GMV Invoiced')
      );
      expect(gmvMagmaGreen).toBeDefined();
      expect(gmvMagmaGreen?.reportingPeriod).toBe('2025-12');
      expect(gmvMagmaGreen?.value).toBe(235084691.87);
    });

    it('parses SVG FY25-26 annual statement with Revenue and Expense breakdowns', () => {
      const { buffer, fixturePath } = loadFixtureBuffer('SVG_FY2025-26_MIS.xlsx');
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      expect(result.metrics.length).toBeGreaterThanOrEqual(20);
      expect(result.sheetLayouts?.get('FY25-26 MIS')).toBe('single_period_dimensional');

      const subRevenue = result.metrics.find(
        (m) =>
          m.rawLabel === 'Subscription revenue (payment gateway)' &&
          m.kind === 'currency'
      );
      expect(subRevenue).toBeDefined();
      expect(subRevenue?.reportingPeriod).toBe('2026-03');
      expect(subRevenue?.granularity).toBe('annual');
      expect(subRevenue?.value).toBe(22460705);
      expect(subRevenue?.unit).toBe('INR');

      const subShare = result.metrics.find(
        (m) =>
          m.rawLabel === 'Subscription revenue (payment gateway) (Share)' &&
          m.kind === 'percent'
      );
      expect(subShare).toBeDefined();
      expect(subShare?.value).toBe(63.8);
      expect(subShare?.unit).toBe('percent');
    });
  });

  describe('Layout 3: Dual-Side Balance Sheets & Statutory Comparative Statements', () => {
    it('parses Segmind provisional balance sheet with Liabilities and Assets blocks', () => {
      const { buffer, fixturePath } = loadFixtureBuffer(
        'Segmind_31st_March_2026_Provisional_Bsheet.xlsx'
      );
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      expect(result.metrics.length).toBe(22);
      expect(result.sheetLayouts?.get('Balance Sheet')).toBe('dual_side_balance_sheet');

      // Liabilities side
      const loansLiability = result.metrics.find(
        (m) => m.blockLabel === 'Liabilities' && m.rawLabel === 'Loans (Liability)'
      );
      expect(loansLiability).toBeDefined();
      expect(loansLiability?.value).toBe(19911043);
      expect(loansLiability?.granularity).toBe('snapshot');
      expect(loansLiability?.reportingPeriod).toBe('2026-03');

      // Assets side
      const bankAc = result.metrics.find(
        (m) => m.blockLabel === 'Assets' && m.rawLabel === 'Bank A/c'
      );
      expect(bankAc).toBeDefined();
      expect(bankAc?.value).toBe(1031358.86);
      expect(bankAc?.granularity).toBe('snapshot');
      expect(bankAc?.reportingPeriod).toBe('2026-03');

      // Balance sheet total
      const totalLiab = result.metrics.find(
        (m) => m.blockLabel === 'Liabilities' && m.rawLabel === 'Total'
      );
      expect(totalLiab?.value).toBe(28962381.3);
    });

    it('parses Taozen Magma comparative statutory statements (BSD, P&LD, Cash Flow D)', () => {
      const { buffer, fixturePath } = loadFixtureBuffer(
        'Financials_CFS_Taozen_Magma_March_2026_excel_share.xlsx'
      );
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      expect(result.metrics.length).toBeGreaterThan(50);
      expect(result.sheetLayouts?.get('BSD')).toBe('metric_matrix');
      expect(result.sheetLayouts?.get('P& LD')).toBe('metric_matrix');
      expect(result.sheetLayouts?.get('Cash Flow D')).toBe('metric_matrix');

      // Revenue from operations in P& LD for 2026-03
      const revOps = result.metrics.find(
        (m) =>
          m.sheetName === 'P& LD' &&
          m.rawLabel.includes('Revenue from operations') &&
          m.reportingPeriod === '2026-03'
      );
      expect(revOps).toBeDefined();
      expect(revOps?.value).toBe(25459098.99);
      expect(revOps?.sourceReference).toContain("Sheet 'P& LD'");
    });
  });

  describe('Layout 4: Text / Notes & Qualitative Sheets (Unbox)', () => {
    it('classifies Unbox Notes tab as notes_and_metadata while extracting MIS, IND, and EXP', () => {
      const { buffer, fixturePath } = loadFixtureBuffer(
        'MIS_-_Unbox_Robotics_Apr_2023_to_Jan_2026.xlsx'
      );
      const result = parseMatrixSpreadsheet(buffer, path.basename(fixturePath));

      expect(result.metrics.length).toBeGreaterThan(10000);
      expect(result.sheetLayouts?.get('Notes')).toBe('notes_and_metadata');
      expect(result.sheetLayouts?.get('MIS')).toBe('metric_matrix');
      expect(result.sheetLayouts?.get('IND')).toBe('metric_matrix');
      expect(result.sheetLayouts?.get('EXP')).toBe('metric_matrix');
    });
  });

  describe('Raw-Cell Tool: Parameter Bounding & Prompt Injection Container Defense', () => {
    it('rejects invalid minRow/maxRow bounds cleanly', async () => {
      await expect(
        queryRawSheetCells({
          documentId: '11111111-2222-3333-4444-555555555555',
          minRow: 10,
          maxRow: 5,
        })
      ).rejects.toThrow(/minRow cannot be greater than maxRow/i);

      await expect(
        queryRawSheetCells({
          documentId: '11111111-2222-3333-4444-555555555555',
          minRow: 0,
        })
      ).rejects.toThrow(/minRow must be greater than or equal to 1/i);
    });

    it('rejects invalid minCol/maxCol bounds cleanly', async () => {
      await expect(
        queryRawSheetCells({
          documentId: '11111111-2222-3333-4444-555555555555',
          minCol: 20,
          maxCol: 10,
        })
      ).rejects.toThrow(/minCol cannot be greater than maxCol/i);
    });
  });
});
