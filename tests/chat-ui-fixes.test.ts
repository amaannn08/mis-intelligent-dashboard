import { describe, it, expect } from 'vitest';
import { formatPeriod, formatShortPeriod } from '@/lib/formatters';
import { filterCitationsByText } from '@/components/chat/chat-helpers';
import type { Citation } from '@/components/ai/citation-list';

describe('formatters: period labels (regression for "26\'25" FY mislabel bug)', () => {
  it('formatShortPeriod renders a valid calendar month normally', () => {
    expect(formatShortPeriod('2025-08')).toBe("Aug'25");
  });

  it('formatShortPeriod renders a fiscal-year range as FYxx-yy, not as a bogus month', () => {
    expect(formatShortPeriod('2025-26')).toBe('FY25-26');
    expect(formatShortPeriod('2025-26')).not.toBe("26'25");
  });

  it('formatPeriod mirrors the same fix', () => {
    expect(formatPeriod('2025-08')).toBe('Aug 2025');
    expect(formatPeriod('2025-26')).toBe('FY2025-26');
  });
});

describe('filterCitationsByText: only shows sources the answer actually cited', () => {
  const citations: Citation[] = [
    { index: 1, documentId: 'doc-1', filename: 'SVG_MIS.xlsx' },
    { index: 2, documentId: 'doc-1', filename: 'SVG_MIS.xlsx' },
    { index: 3, documentId: 'doc-2', filename: 'Other_MIS.xlsx' },
  ];

  it('drops citations whose [n] marker never appears in the final answer text', () => {
    const text = 'Revenue was ₹13.2L in Aug 2025 [1].';
    const filtered = filterCitationsByText(citations, text);
    expect(filtered.map((c) => c.index)).toEqual([1]);
  });

  it('keeps all citations whose markers do appear, in any order', () => {
    const text = 'Figures from [3] and [1] agree.';
    const filtered = filterCitationsByText(citations, text);
    expect(filtered.map((c) => c.index).sort()).toEqual([1, 3]);
  });

  it('falls back to the original list when the text has no [n] markers at all', () => {
    const text = 'I cannot find this information in the uploaded MIS reports.';
    const filtered = filterCitationsByText(citations, text);
    expect(filtered).toEqual(citations);
  });
});
