import type { ChatSessionSummary } from './chat-types.js';
import type { Citation } from '@/components/ai/citation-list';

/**
 * Filters a citation list down to only the citations whose [n] marker
 * actually appears in the final answer text. The server sends every
 * candidate citation up-front (before the model has finished answering),
 * so without this the "Sources & Citations" chips on the live/streaming
 * message include sources the answer never referenced — inconsistent with
 * what gets persisted (and re-shown) once the session reloads.
 */
export function filterCitationsByText(citations: Citation[], text: string): Citation[] {
  if (!citations || citations.length === 0 || !text) return citations;

  const citedIndices = new Set<number>();
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    const n = parseInt(match[1]!, 10);
    if (!isNaN(n)) citedIndices.add(n);
  }

  if (citedIndices.size === 0) return citations;

  const filtered = citations.filter((c) => typeof c.index === 'number' && citedIndices.has(c.index));
  // If none of the citations' indices matched (e.g. index missing on some
  // entries), fall back to the original list rather than showing nothing.
  return filtered.length > 0 ? filtered : citations;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export function groupSessions(sessions: ChatSessionSummary[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  const today: ChatSessionSummary[] = [];
  const yesterday: ChatSessionSummary[] = [];
  const earlier: ChatSessionSummary[] = [];

  for (const s of sessions) {
    const time = new Date(s.updatedAt).getTime();
    if (time >= startOfToday) {
      today.push(s);
    } else if (time >= startOfYesterday) {
      yesterday.push(s);
    } else {
      earlier.push(s);
    }
  }

  return { today, yesterday, earlier };
}
