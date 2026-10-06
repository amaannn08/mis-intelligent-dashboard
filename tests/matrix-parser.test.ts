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

function getSampleFile(sub: string): string | null {
  const sampleDir = '/tmp/mis_samples';
  if (fs.existsSync(sampleDir)) {
    const f = fs.readdirSync(sampleDir).find((x) => x.toLowerCase().includes(sub.toLowerCase()));
    if (f) return path.join(sampleDir, f);
  }
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (fs.existsSync(uploadsDir)) {
    const f = fs.readdirSync(uploadsDir).find((x) => x.toLowerCase().includes(sub.toLowerCase()));
    if (f) return path.join(uploadsDir, f);
  }
  return null;
}

describe('Matrix Parser: Real Portfolio Spreadsheets', () => {
  it('parses Masterchow multi-block sheets with channel > category hierarchy and exact metric numbers', () => {
    const file = getSampleFile('Masterchow_MIS_April_26');
    expect(file).toBeTruthy();
    if (!file) return;

    const buf = fs.readFileSync(file);
    const result = parseMatrixSpreadsheet(buf, 'Masterchow_MIS_April_26.xlsx');

    // Assertion 1: Blinkit > Condiments > Gross Revenue for 2024-04 equals 23.92
    const blinkitCondGross = result.metrics.find(
      (m) =>
        m.sheetName === 'Category X Channel' &&
        m.parentBlockLabel === 'Blinkit' &&
        m.blockLabel === 'Condiments' &&
        m.normalizedLabel === 'gross_revenue' &&
        m.reportingPeriod === '2024-04'
    );
    expect(blinkitCondGross).toBeDefined();
    expect(blinkitCondGross?.value).toBe(23.92);
    expect(blinkitCondGross?.kind).toBe('currency');
    expect(blinkitCondGross?.unit).toBe('INR');

    // Assertion 2: Blinkit > Condiments > Qty for 2024-04 equals 11088, unit is 'count', not 'INR'
    const blinkitCondQty = result.metrics.find(
      (m) =>
        m.sheetName === 'Category X Channel' &&
        m.parentBlockLabel === 'Blinkit' &&
        m.blockLabel === 'Condiments' &&
        m.normalizedLabel === 'qty' &&
        m.reportingPeriod === '2024-04'
    );
    expect(blinkitCondQty).toBeDefined();
    expect(blinkitCondQty?.value).toBe(11088);
    expect(blinkitCondQty?.kind).toBe('count');
    expect(blinkitCondQty?.unit).toBe('count');

    // Assertion 3: Blinkit > Condiments > Net Revenue for 2024-04 equals 11.21
    const blinkitCondNet = result.metrics.find(
      (m) =>
        m.sheetName === 'Category X Channel' &&
        m.parentBlockLabel === 'Blinkit' &&
        m.blockLabel === 'Condiments' &&
        m.normalizedLabel === 'net_revenue' &&
        m.reportingPeriod === '2024-04'
    );
    expect(blinkitCondNet).toBeDefined();
    expect(blinkitCondNet?.value).toBe(11.21);
    expect(blinkitCondNet?.kind).toBe('currency');

    // Assertion 4: Zepto > Condiments > Qty for 2024-04 equals 13912
    const zeptoCondQty = result.metrics.find(
      (m) =>
        m.sheetName === 'Category X Channel' &&
        m.parentBlockLabel === 'Zepto' &&
        m.blockLabel === 'Condiments' &&
        m.normalizedLabel === 'qty' &&
        m.reportingPeriod === '2024-04'
    );
    expect(zeptoCondQty).toBeDefined();
    expect(zeptoCondQty?.value).toBe(13912);
    expect(zeptoCondQty?.kind).toBe('count');
    expect(zeptoCondQty?.unit).toBe('count');

    // Assertion 5: Percentage row GM% has kind 'percent' and unit 'percent'
    const gmPercent = result.metrics.find(
      (m) =>
        m.sheetName === 'Category X Channel' &&
        m.parentBlockLabel === 'Blinkit' &&
        m.blockLabel === 'Condiments' &&
        m.rawLabel === 'GM%' &&
        m.reportingPeriod === '2024-04'
    );
    expect(gmPercent).toBeDefined();
    expect(gmPercent?.kind).toBe('percent');
    expect(gmPercent?.unit).toBe('percent');
  });

  it('parses Masterchow with Lakh scaling in P&L Summary and quarantines #DIV/0!', () => {
    const file = getSampleFile('Masterchow_MIS_April_26');
    if (!file) return;

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

  it('parses Clinikk MIS Template_INR and preserves hierarchy', () => {
    const file = getSampleFile('Clinikk_MIS_Mar_26');
    if (!file) return;

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

  it('parses Fragaria single-period Actuals layout', () => {
    const file = getSampleFile('Fragaria_MIS_Mar_26');
    if (!file) return;

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

  it('parses Hectar Global USD fiscal year data', () => {
    const file = getSampleFile('Hector_MIS_upto_Mar_26');
    if (!file) return;

    const buf = fs.readFileSync(file);
    const result = parseMatrixSpreadsheet(buf, 'Fund_II_hectar_Hector_MIS_upto_Mar_26.xlsx');

    const ebitda = result.metrics.find(
      (m) => m.standardMetricKey === 'ebitda' && m.unit === 'USD'
    );
    expect(ebitda).toBeDefined();
    expect(ebitda?.value).toBe(115_127);
    expect(ebitda?.currency).toBe('USD');
  });

  it('parses Pratilipi 5.5 MB workbook and extracts Literature Platform Revenue', () => {
    const file = getSampleFile('Pratilipi_MIS__Mar__26');
    if (!file) return;

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

  it('parses single-date table layout without drop (Masterchow June 2026 pattern)', () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Metric', 'Jun 26'],
      ['Revenue', 45000000],
      ['GMV', 80000000],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'P&L');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = parseMatrixSpreadsheet(buf, 'Masterchow_MIS_June_2026.xlsx');
    expect(result.metrics.length).toBe(2);
    const rev = result.metrics.find((m) => m.normalizedLabel === 'revenue');
    expect(rev).toBeDefined();
    expect(rev?.value).toBe(45000000);
    expect(rev?.reportingPeriod).toBe('2026-06');
    expect(rev?.standardMetricKey).toBe('revenue');

    const gmv = result.metrics.find((m) => m.normalizedLabel === 'gmv');
    expect(gmv).toBeDefined();
    expect(gmv?.value).toBe(80000000);
    expect(gmv?.reportingPeriod).toBe('2026-06');
  });
});

