/**
 * Financial & Data Formatting Utilities for MIS Intelligence Dashboard
 * Implements Indian currency numbering system (Crores, Lakhs) and tabular standards.
 */

export function formatIndianCurrency(
  val: number | string | null | undefined,
  options?: { showSign?: boolean; fallback?: string }
): string {
  if (val === null || val === undefined || val === '') {
    return options?.fallback ?? 'Not available';
  }

  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) {
    return options?.fallback ?? 'Not available';
  }

  const isNegative = num < 0;
  const abs = Math.abs(num);
  const sign = isNegative ? '-' : options?.showSign ? '+' : '';

  let formatted = '';
  if (abs >= 10_000_000) {
    // 1 Crore = 10,000,000
    const cr = abs / 10_000_000;
    formatted = `${cr.toFixed(cr >= 10 ? 1 : 2)} Cr`;
  } else if (abs >= 100_000) {
    // 1 Lakh = 100,000
    const lakh = abs / 100_000;
    formatted = `${lakh.toFixed(lakh >= 10 ? 1 : 2)} L`;
  } else if (abs >= 1_000) {
    const k = abs / 1_000;
    formatted = `${k.toFixed(1)} k`;
  } else {
    formatted = abs.toLocaleString('en-IN', { maximumFractionDigits: 1 });
  }

  // Remove trailing .0 if present in e.g. "1.0 Cr" -> "1 Cr" when clean
  formatted = formatted.replace(/\.0\s/, ' ');

  return `${sign}₹${formatted}`;
}

export function formatPercent(
  val: number | string | null | undefined,
  options?: { showSign?: boolean; fallback?: string }
): string {
  if (val === null || val === undefined || val === '') {
    return options?.fallback ?? 'Not available';
  }

  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) {
    return options?.fallback ?? 'Not available';
  }

  const isNegative = num < 0;
  const abs = Math.abs(num);
  const sign = isNegative ? '-' : options?.showSign ? '+' : '';

  return `${sign}${abs.toFixed(1)}%`;
}

export function formatMetricValue(
  value: number | string | null | undefined,
  unit: string | null | undefined,
  fallback = 'Not available'
): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) {
    return fallback;
  }

  if (unit === 'percent' || unit === '%') {
    return formatPercent(num, { fallback });
  }

  if (unit === 'currency' || unit === 'INR' || unit === '₹') {
    return formatIndianCurrency(num, { fallback });
  }

  if (unit === 'ratio' || unit === 'multiple' || unit === 'x') {
    return `${num.toFixed(1)}x`;
  }

  return num.toLocaleString('en-IN');
}

export function formatPeriod(period: string | null | undefined): string {
  if (!period) return '—';
  // Handles 'YYYY-MM'
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) return period;

  const year = match[1];
  const monthIdx = parseInt(match[2], 10) - 1;
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  return `${monthNames[monthIdx] || match[2]} ${year}`;
}

export function calculateDelta(
  current: number | null | undefined,
  previous: number | null | undefined
): {
  deltaPercent: number | null;
  deltaAbsolute: number | null;
  direction: 'up' | 'down' | 'flat' | 'none';
} {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    isNaN(current) ||
    isNaN(previous)
  ) {
    return { deltaPercent: null, deltaAbsolute: null, direction: 'none' };
  }

  const deltaAbsolute = current - previous;
  if (previous === 0) {
    return {
      deltaPercent: null,
      deltaAbsolute,
      direction: deltaAbsolute > 0 ? 'up' : deltaAbsolute < 0 ? 'down' : 'flat',
    };
  }

  const deltaPercent = ((current - previous) / Math.abs(previous)) * 100;
  let direction: 'up' | 'down' | 'flat' = 'flat';
  if (deltaPercent > 0.05) direction = 'up';
  else if (deltaPercent < -0.05) direction = 'down';

  return { deltaPercent, deltaAbsolute, direction };
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
