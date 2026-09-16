export interface ParsedNumber {
  value: number;
  rawString: string;
  isNegative: boolean;
  isPercentage: boolean;
}

export interface ScaleMultiplier {
  multiplier: number;
  scaleName: 'lakh' | 'crore' | 'million' | 'thousand' | 'units';
}

/**
 * Parse raw cell string or number into structured numerical info.
 * Handles parenthesised accounting negatives: (1,234.50) -> -1234.50
 * Handles trailing minus: 1,234- -> -1234
 * Handles Indian and Western comma groupings.
 */
export function parseRawNumber(raw: unknown): ParsedNumber | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw === 'number') {
    if (isNaN(raw)) return null;
    return {
      value: raw,
      rawString: String(raw),
      isNegative: raw < 0,
      isPercentage: false,
    };
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Check if it is a percentage
  const isPercentage = str.includes('%');

  // Check for parenthesized negative: (1,234.50) or ( 45.0 )
  const isParenNegative = /^\s*\(\s*([^()]+)\s*\)\s*$/.test(str);
  // Check for trailing negative: 1,234-
  const isTrailingNegative = /-\s*$/.test(str) && !/^\s*-/.test(str);
  // Check for leading negative: -1,234
  const isLeadingNegative = /^\s*-/.test(str);

  const isNegative = isParenNegative || isTrailingNegative || isLeadingNegative;

  // Strip non-numeric characters except digits, decimal point, and comma
  // Remove currency signs (₹, Rs, Rs., INR, $, USD, etc.), parentheses, %, and spaces
  let cleaned = str
    .replace(/[₹$€£]/g, '')
    .replace(/\b(?:Rs\.?|INR|USD|EUR)\b/gi, '')
    .replace(/[()%]/g, '')
    .replace(/-/g, '')
    .trim();

  // If there are commas, remove them
  cleaned = cleaned.replace(/,/g, '');

  if (!cleaned || isNaN(Number(cleaned))) {
    return null;
  }

  const absNum = parseFloat(cleaned);
  const finalValue = isNegative ? -absNum : absNum;

  return {
    value: finalValue,
    rawString: str,
    isNegative,
    isPercentage,
  };
}

/**
 * Detect scale multiplier from text context (sheet name, header cell, table header, or subtitle).
 */
export function detectScale(text: string): ScaleMultiplier {
  const lower = text.toLowerCase();

  // Crores: 10^7 (10,000,000)
  if (
    /\b(?:crores?|crs?)\b/i.test(lower) ||
    /in\s+(?:₹|rs\.?|inr)?\s*(?:cr|crores?)/i.test(lower) ||
    /\(₹?\s*(?:in\s*)?cr\)/i.test(lower)
  ) {
    return { multiplier: 10_000_000, scaleName: 'crore' };
  }

  // Lakhs: 10^5 (100,000)
  if (
    /\b(?:lakhs?|lacs?)\b/i.test(lower) ||
    /in\s+(?:₹|rs\.?|inr)?\s*(?:l|lakhs?|lacs?)/i.test(lower) ||
    /\(₹?\s*(?:in\s*)?l(?:akhs?)?\)/i.test(lower)
  ) {
    return { multiplier: 100_000, scaleName: 'lakh' };
  }

  // Millions: 10^6 (1,000,000)
  if (
    /\b(?:millions?|mn)\b/i.test(lower) ||
    /in\s+(?:\$|usd)?\s*(?:m|millions?)/i.test(lower) ||
    /\(\$?\s*(?:in\s*)?m\)/i.test(lower)
  ) {
    return { multiplier: 1_000_000, scaleName: 'million' };
  }

  // Thousands: 10^3 (1,000)
  if (
    /\b(?:thousands?)\b/i.test(lower) ||
    /in\s+(?:k|thousands?)/i.test(lower) ||
    /\(in\s*k\)/i.test(lower)
  ) {
    return { multiplier: 1_000, scaleName: 'thousand' };
  }

  return { multiplier: 1, scaleName: 'units' };
}

/**
 * Normalize a parsed numeric value according to target unit and scale context.
 * Currency is normalized to absolute INR (multiplying by scale factor).
 * Percent is normalized to standard 0-100 scale (e.g. 42.5% or 0.425 -> 42.5).
 */
export function normalizeNumericValue(
  parsed: ParsedNumber,
  targetUnit: string,
  scaleContext: string = ''
): number {
  if (targetUnit === 'percent') {
    // If entered as 0.425 and is not marked as % explicitly, convert to 42.5
    if (parsed.value > -1 && parsed.value < 1 && parsed.value !== 0 && !parsed.rawString.includes('%')) {
      return parseFloat((parsed.value * 100).toFixed(4));
    }
    return parseFloat(parsed.value.toFixed(4));
  }

  if (targetUnit === 'currency') {
    const scale = detectScale(scaleContext);
    // If the scale is Lakhs/Crores/Millions and the number is small (e.g. 150), scale it up
    // But if the number already looks absolute (e.g. 15000000), do not multiply
    if (scale.multiplier > 1 && Math.abs(parsed.value) < 100_000) {
      return parseFloat((parsed.value * scale.multiplier).toFixed(2));
    }
    return parseFloat(parsed.value.toFixed(2));
  }

  return parsed.value;
}
