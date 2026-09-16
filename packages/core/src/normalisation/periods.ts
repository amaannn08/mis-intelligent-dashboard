const MONTH_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

/**
 * Extract 4-digit year from text (e.g. filename "Noto_MIS_June_2025.xlsx" -> 2025)
 */
export function extractYearFromContext(text: string): number | undefined {
  const match = text.match(/\b(20[2-3][0-9])\b/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Parse a period string into canonical 'YYYY-MM' format.
 * Examples:
 * - '2025-06' -> '2025-06'
 * - 'Jun-25', "Jun '25", 'June 2025' -> '2025-06'
 * - '06/2025', '6/2025' -> '2025-06'
 * - 'Q1 FY26' -> '2025-06' (Indian FY: Q1 Apr-Jun)
 * - 'Q2 FY26' -> '2025-09'
 * - 'Q3 FY26' -> '2025-12'
 * - 'Q4 FY26' -> '2026-03'
 * - 'FY25' -> '2025-03'
 * - 'June' (with contextYear=2025) -> '2025-06'
 */
export function parseReportingPeriod(
  periodStr: string,
  contextYear?: number
): string | null {
  if (!periodStr) return null;
  const s = periodStr.trim();
  if (s.length > 25) return null; // Period headers are never long banner strings

  // 1. Direct YYYY-MM match (e.g. 2025-06)
  const yyyyMmMatch = s.match(/^(20[2-3][0-9])[-/.](0[1-9]|1[0-2])$/);
  if (yyyyMmMatch && yyyyMmMatch[1] && yyyyMmMatch[2]) {
    return `${yyyyMmMatch[1]}-${yyyyMmMatch[2]}`;
  }

  // 2. MM/YYYY or M/YYYY match (e.g. 06/2025 or 6/2025)
  const mmYyyyMatch = s.match(/^(0?[1-9]|1[0-2])[-/.](20[2-3][0-9])$/);
  if (mmYyyyMatch && mmYyyyMatch[1] && mmYyyyMatch[2]) {
    const month = mmYyyyMatch[1].padStart(2, '0');
    return `${mmYyyyMatch[2]}-${month}`;
  }

  // 3. Indian FY Quarter: Q1 FY26, Q2 FY2026, Q1-FY26, Q1FY26
  const fyQuarterMatch = s.match(
    /\bQ([1-4])\s*[-/]?\s*FY\s*'?([0-9]{2,4})\b/i
  );
  if (fyQuarterMatch && fyQuarterMatch[1] && fyQuarterMatch[2]) {
    const quarter = parseInt(fyQuarterMatch[1], 10);
    let fyYear = parseInt(fyQuarterMatch[2], 10);
    if (fyYear < 100) fyYear += 2000;

    // Indian Financial Year: FY26 ends in Mar 2026, starts Apr 2025
    // Q1 (Apr-Jun): fyYear - 1, month 06
    // Q2 (Jul-Sep): fyYear - 1, month 09
    // Q3 (Oct-Dec): fyYear - 1, month 12
    // Q4 (Jan-Mar): fyYear, month 03
    switch (quarter) {
      case 1:
        return `${fyYear - 1}-06`;
      case 2:
        return `${fyYear - 1}-09`;
      case 3:
        return `${fyYear - 1}-12`;
      case 4:
        return `${fyYear}-03`;
    }
  }

  // 4. Calendar Quarter: Q1 2025, Q2-2025
  const calQuarterMatch = s.match(
    /\bQ([1-4])\s*[-/]?\s*(20[2-3][0-9])\b/i
  );
  if (calQuarterMatch && calQuarterMatch[1] && calQuarterMatch[2]) {
    const quarter = parseInt(calQuarterMatch[1], 10);
    const year = calQuarterMatch[2];
    switch (quarter) {
      case 1:
        return `${year}-03`;
      case 2:
        return `${year}-06`;
      case 3:
        return `${year}-09`;
      case 4:
        return `${year}-12`;
    }
  }

  // 5. Full FY alone: FY25, FY 2025 -> Year-end March
  const fyMatch = s.match(/\bFY\s*'?([0-9]{2,4})\b/i);
  if (fyMatch && fyMatch[1]) {
    let year = parseInt(fyMatch[1], 10);
    if (year < 100) year += 2000;
    return `${year}-03`;
  }

  // 6. Month Name with Year: Jun-25, Jun '25, June 2025, Jun 2025, Jun-2025
  const monthYearMatch = s.match(
    /\b([a-zA-Z]{3,9})[\s'-]+(?:20)?([0-9]{2})\b/
  );
  if (monthYearMatch && monthYearMatch[1] && monthYearMatch[2]) {
    const monthKey = monthYearMatch[1].toLowerCase();
    const monthNum = MONTH_MAP[monthKey];
    if (monthNum) {
      const year = 2000 + parseInt(monthYearMatch[2], 10);
      return `${year}-${monthNum}`;
    }
  }

  const monthFullYearMatch = s.match(
    /\b([a-zA-Z]{3,9})[\s'-]+(20[2-3][0-9])\b/
  );
  if (monthFullYearMatch && monthFullYearMatch[1] && monthFullYearMatch[2]) {
    const monthKey = monthFullYearMatch[1].toLowerCase();
    const monthNum = MONTH_MAP[monthKey];
    if (monthNum) {
      return `${monthFullYearMatch[2]}-${monthNum}`;
    }
  }

  // 7. Month name alone (e.g. 'June') + fallback contextYear
  const singleMonth = s.toLowerCase().trim();
  if (MONTH_MAP[singleMonth] && contextYear) {
    return `${contextYear}-${MONTH_MAP[singleMonth]}`;
  }

  return null;
}
