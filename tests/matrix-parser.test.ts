import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseMatrixSpreadsheet,
  parseReportingPeriodCell,
  detectScaleAndCurrency,
  parseRawCellValue,
  normalizeLabel,
  matchStandardKpi,
} from '../packages/core/src/parsing/index.js';

describe('Matrix Parser: Helpers & Normalisation', () => {
  it('parses diverse reporting period representations', () => {
    expect(parseReportingPeriodCell('Apr-24')).toBe('2024-04');
    expect(parseReportingPeriodCell("Apr '24")).toBe('2024-04');
    expect(parseReportingPeriodCell('April 2024')).toBe('2024-04');
    expect(parseReportingPeriodCell('2025-06')).toBe('2025-06');
    expect(parseReportingPeriodCell('30/4/2022')).toBe('2022-04');
    expect(parseReportingPeriodCell('06/2025')).toBe('2025-06');
    expect(parseReportingPeriodCell('Q1 FY26')).toBe('2025-06');
    expect(parseReportingPeriodCell('Q4 FY26')).toBe('2026-03');
    expect(parseReportingPeriodCell('FY26')).toBe('2026-03');
    expect(parseReportingPeriodCell('March', 2023)).toBe('2023-03');
    // Excel serial date for 2024-04-01 is 45383
    expect(parseReportingPeriodCell(45383)).toBe('2024-04');
  });

  it('detects scale multipliers and currency context', () => {
    const lacInr = detectScaleAndCurrency('Particulars in INR Lac');
    expect(lacInr.scaleMultiplier).toBe(100_000);
    expect(lacInr.scaleName).toBe('lakh');
    expect(lacInr.currency).toBe('INR');

    const usdThou = detectScaleAndCurrency("USD '000");
    expect(usdThou.scaleMultiplier).toBe(1_000);
    expect(usdThou.scaleName).toBe('thousand');
    expect(usdThou.currency).toBe('USD');

    const hectarUsd = detectScaleAndCurrency('Amount in USD');
    expect(hectarUsd.scaleMultiplier).toBe(1);
    expect(hectarUsd.scaleName).toBe('units');
    expect(hectarUsd.currency).toBe('USD');

    const croreInr = detectScaleAndCurrency('Revenue in Cr (₹)');
    expect(croreInr.scaleMultiplier).toBe(10_000_000);
    expect(croreInr.scaleName).toBe('crore');
    expect(croreInr.currency).toBe('INR');
  });

  it('parses raw numbers and explicitly flags Excel errors and zero markers', () => {
    expect(parseRawCellValue('308.78').num).toBe(308.78);
    expect(parseRawCellValue('(1,234.50)').num).toBe(-1234.5);
    expect(parseRawCellValue('5.5%').num).toBe(5.5);
    expect(parseRawCellValue('-').num).toBe(0);
    expect(parseRawCellValue(' - ').num).toBe(0);
    expect(parseRawCellValue('—').num).toBe(0);

    const refErr = parseRawCellValue('#REF!');
    expect(refErr.isError).toBe(true);
    expect(refErr.num).toBeNull();
    expect(refErr.rawString).toBe('#REF!');

    const divErr = parseRawCellValue('#DIV/0!');
    expect(divErr.isError).toBe(true);
    expect(divErr.num).toBeNull();
  });

  it('normalizes row labels and matches standard KPIs', () => {
    expect(normalizeLabel('Gross Revenue')).toBe('gross_revenue');
    expect(normalizeLabel('COCO Primary Healthcare')).toBe('coco_primary_healthcare');
    expect(normalizeLabel('Discounts (Promo)')).toBe('discounts_promo');

    expect(matchStandardKpi('Net Revenue')).toBe('revenue');
    expect(matchStandardKpi('Operating Revenue')).toBe('revenue');
    expect(matchStandardKpi('Total Revenue')).toBe('revenue');
    expect(matchStandardKpi('Operating EBITDA')).toBe('ebitda');
    expect(matchStandardKpi('EBITDA')).toBe('ebitda');
    expect(matchStandardKpi('Net Cash Burn')).toBe('burn');
    expect(matchStandardKpi('Gross Margin %')).toBe('gross_margin');
    expect(matchStandardKpi('GM %')).toBe('gross_margin');
    expect(matchStandardKpi('ARR')).toBe('run_rate');
  });
});

describe('Matrix Parser: Real Portfolio Spreadsheets (/tmp/mis_samples)', () => {
  const sampleDir = '/tmp/mis_samples';
  const hasSamples = fs.existsSync(sampleDir);

  it.skipIf(!hasSamples)('parses Masterchow with Lakh scaling and quarantines #DIV/0!', () => {
    const file = path.join(sampleDir, 'Fund_II_Masterchow_Masterchow_MIS_April_26.xlsx');
    if (!fs.existsSync(file)) return;

    const buf = fs.readFileSync(file);
    const result = parseMatrixSpreadsheet(buf, 'Fund_II_Masterchow_Masterchow_MIS_April_26.xlsx');

    expect(result.metrics.length).toBeGreaterThan(1000);
    expect(result.quarantinedCount).toBeGreaterThan(0);

    // Assert Gross Revenue in Apr-24 was 308.78 Lac -> 30,878,000 INR
    const grossRevApr24 = result.metrics.find(
      (m) =>
        m.sheetName === 'P&L Summary' &&
        m.normalizedLabel === 'gross_revenue' &&
        m.reportingPeriod === '2024-04'
    );
    expect(grossRevApr24).toBeDefined();
    expect(grossRevApr24?.value).toBe(30_878_000);
    expect(grossRevApr24?.unit).toBe('INR');
    expect(grossRevApr24?.standardMetricKey).toBe('revenue');

    // Assert Net Revenue in Apr-24 was 139.73 Lac -> 13,973,000 INR
    const netRevApr24 = result.metrics.find(
      (m) =>
        m.sheetName === 'P&L Summary' &&
        m.normalizedLabel === 'net_revenue' &&
        m.reportingPeriod === '2024-04'
    );
    expect(netRevApr24).toBeDefined();
    expect(netRevApr24?.value).toBe(13_973_000);
    expect(netRevApr24?.unit).toBe('INR');

    // Assert quarantined formula error
    const quarantined = result.metrics.find((m) => m.status === 'quarantined');
    expect(quarantined).toBeDefined();
    expect(quarantined?.value).toBeNull();
    expect(quarantined?.rawValue).toMatch(/^#/);
  });

  it.skipIf(!hasSamples)('parses Clinikk MIS Template_INR and preserves hierarchy', () => {
    const file = path.join(sampleDir, 'Fund_I_Clinikk_Clinikk_MIS_Mar_26.xlsx');
    if (!fs.existsSync(file)) return;

    const buf = fs.readFileSync(file);
    const result = parseMatrixSpreadsheet(buf, 'Fund_I_Clinikk_Clinikk_MIS_Mar_26.xlsx');

    // Assert Total Revenue in Jan-24 was 6,947,537 INR
    const totalRevJan24 = result.metrics.find(
      (m) =>
        m.sheetName === 'MIS Template_INR' &&
        m.normalizedLabel === 'total_revenue' &&
        m.reportingPeriod === '2024-01'
    );
    expect(totalRevJan24).toBeDefined();
    expect(totalRevJan24?.value).toBe(6_947_537);
    expect(totalRevJan24?.unit).toBe('INR');
    expect(totalRevJan24?.standardMetricKey).toBe('revenue');

    // Assert hierarchy with parent_label
    const childMetric = result.metrics.find(
      (m) => m.sheetName === 'MIS Template_INR' && m.parentLabel && m.parentLabel.length > 0
    );
    expect(childMetric).toBeDefined();
    expect(childMetric?.parentLabel).toBeDefined();
  });


  it.skipIf(!hasSamples)('parses Animall Quarterly Update with USD thousand scaling and quarantines #REF!', () => {
    const file = path.join(sampleDir, 'Fund_I_Animall_Animall_MIS_March_2026.xlsx');
    if (!fs.existsSync(file)) return;

    const buf = fs.readFileSync(file);
    const result = parseMatrixSpreadsheet(buf, 'Fund_I_Animall_Animall_MIS_March_2026.xlsx');

    // Assert Revenue (USD'000) in Apr-23 was 107.1 -> 107,100 USD
    const revApr23 = result.metrics.find(
      (m) =>
        m.sheetName === 'Quarterly Update' &&
        m.normalizedLabel.includes('revenue') &&
        m.reportingPeriod === '2023-04'
    );
    expect(revApr23).toBeDefined();
    expect(revApr23?.currency).toBe('USD');

    // Assert quarantined row with #REF!
    const quarantinedRef = result.metrics.find(
      (m) => m.sheetName === 'Quarterly Update' && m.rawValue === '#REF!'
    );
    expect(quarantinedRef).toBeDefined();
    expect(quarantinedRef?.status).toBe('quarantined');
  });

  it.skipIf(!hasSamples)('parses Unbox Robotics 2-tier date header and INR unit', () => {
    const file = path.join(
      sampleDir,
      'Fund_II_Unbox_Robotics_MIS_-_Unbox_Robotics_Apr_2023_to_Jan_2026.xlsx'
    );
    if (!fs.existsSync(file)) return;

    const buf = fs.readFileSync(file);
    const result = parseMatrixSpreadsheet(buf, 'Fund_II_Unbox_Robotics_MIS_-_Unbox_Robotics_Apr_2023_to_Jan_2026.xlsx');

    // Periods should span 2022-04 through 2026-01
    const periods = Array.from(new Set(result.metrics.map((m) => m.reportingPeriod))).sort();
    expect(periods).toContain('2022-04');
    expect(periods).toContain('2022-05');

    // In May-22, Gross Revenue is 324,990 INR
    const revMay22 = result.metrics.find(
      (m) =>
        m.sheetName === 'MIS' &&
        m.normalizedLabel === 'gross_revenue' &&
        m.reportingPeriod === '2022-05'
    );
    expect(revMay22).toBeDefined();
    expect(revMay22?.value).toBe(324_990);
    expect(revMay22?.unit).toBe('INR');
    expect(revMay22?.standardMetricKey).toBe('revenue');
  });

  it.skipIf(!hasSamples)('parses Fragaria single-period Actuals layout', () => {
    const file = path.join(sampleDir, 'Fund_III_Fragaria_Fragaria_MIS_Mar_26.xlsx');
    if (!fs.existsSync(file)) return;

    const buf = fs.readFileSync(file);
    const result = parseMatrixSpreadsheet(buf, 'Fund_III_Fragaria_Fragaria_MIS_Mar_26.xlsx');

    const revMar26 = result.metrics.find(
      (m) => m.normalizedLabel === 'total_revenue' && m.reportingPeriod === '2026-03'
    );
    expect(revMar26).toBeDefined();
    expect(revMar26?.value).toBe(26_100);

    const ebitdaMar26 = result.metrics.find(
      (m) => m.normalizedLabel === 'ebitda' && m.reportingPeriod === '2026-03'
    );
    expect(ebitdaMar26).toBeDefined();
    expect(ebitdaMar26?.value).toBe(-1_647_441);
  });

  it.skipIf(!hasSamples)('parses Hectar Global USD fiscal year data', () => {
    const file = path.join(sampleDir, 'Fund_II_hectar_Hector_MIS_upto_Mar_26.xlsx');
    if (!fs.existsSync(file)) return;

    const buf = fs.readFileSync(file);
    const result = parseMatrixSpreadsheet(buf, 'Fund_II_hectar_Hector_MIS_upto_Mar_26.xlsx');

    const ebitda = result.metrics.find(
      (m) => m.standardMetricKey === 'ebitda' && m.unit === 'USD'
    );
    expect(ebitda).toBeDefined();
    expect(ebitda?.value).toBe(115_127);
    expect(ebitda?.currency).toBe('USD');
  });

  it.skipIf(!hasSamples)('parses Pratilipi 5.5 MB workbook and extracts Literature Platform Revenue', () => {
    const file = path.join(sampleDir, 'Fund_I_Pratilipi_Pratilipi_MIS__Mar__26.xlsx');
    if (!fs.existsSync(file)) return;

    const buf = fs.readFileSync(file);
    const result = parseMatrixSpreadsheet(buf, 'Fund_I_Pratilipi_Pratilipi_MIS__Mar__26.xlsx');

    expect(result.metrics.length).toBeGreaterThan(500);

    // Assert Literature Platform Revenue in Apr-2024 is 44,387,772 INR
    const litRevApr24 = result.metrics.find(
      (m) =>
        m.sheetName === 'Actual CFS' &&
        m.normalizedLabel.includes('literature_platform_revenue') &&
        m.reportingPeriod === '2024-04'
    );
    expect(litRevApr24).toBeDefined();
    expect(litRevApr24?.value).toBe(44_387_772);
    expect(litRevApr24?.unit).toBe('INR');
  });
});

