import type { ChatSessionSummary } from './chat-types.js';

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
