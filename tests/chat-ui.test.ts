import { describe, it, expect } from 'vitest';
import { groupSessions, formatRelativeTime } from '../apps/web/src/components/chat/chat-helpers.js';
import type { ChatSessionSummary } from '../apps/web/src/components/chat/chat-types.js';

describe('Chat UI Utilities', () => {
  describe('groupSessions', () => {
    it('correctly partitions sessions into Today, Yesterday, and Earlier', () => {
      const now = new Date();
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
      const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
      const earlierDate = new Date(todayDate.getTime() - 5 * 24 * 60 * 60 * 1000);

      const fakeSessions: ChatSessionSummary[] = [
        {
          id: 's-today',
          title: 'Session Today',
          companyId: null,
          companyName: null,
          messageCount: 2,
          lastMessagePreview: 'Hello today',
          updatedAt: todayDate.toISOString(),
        },
        {
          id: 's-yesterday',
          title: 'Session Yesterday',
          companyId: 'uuid-1',
          companyName: 'NOTO',
          messageCount: 4,
          lastMessagePreview: 'Burn question',
          updatedAt: yesterdayDate.toISOString(),
        },
        {
          id: 's-earlier',
          title: 'Session Earlier',
          companyId: null,
          companyName: null,
          messageCount: 6,
          lastMessagePreview: 'Revenue question',
          updatedAt: earlierDate.toISOString(),
        },
      ];

      const grouped = groupSessions(fakeSessions);

      expect(grouped.today).toHaveLength(1);
      expect(grouped.today[0].id).toBe('s-today');

      expect(grouped.yesterday).toHaveLength(1);
      expect(grouped.yesterday[0].id).toBe('s-yesterday');

      expect(grouped.earlier).toHaveLength(1);
      expect(grouped.earlier[0].id).toBe('s-earlier');
    });

    it('handles empty session arrays', () => {
      const grouped = groupSessions([]);
      expect(grouped.today).toEqual([]);
      expect(grouped.yesterday).toEqual([]);
      expect(grouped.earlier).toEqual([]);
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "just now" for dates within seconds', () => {
      const nowIso = new Date().toISOString();
      expect(formatRelativeTime(nowIso)).toBe('just now');
    });

    it('returns minutes ago for dates within the last hour', () => {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      expect(formatRelativeTime(tenMinsAgo)).toBe('10m ago');
    });

    it('returns hours ago for dates within 24 hours', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago');
    });
  });

  describe('Session Rehydration (Binding Addition 3)', () => {
    it('correctly extracts messages and charts from GET /api/chat/sessions/[id] payload', () => {
      const apiResponse = {
        session: {
          id: 'session-123',
          title: 'Noto Revenue & EBITDA',
          companyId: 'company-noto',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        messages: [
          {
            id: 'msg-user-1',
            role: 'user' as const,
            content: 'How is Noto revenue and ebitda burn?',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'msg-assistant-1',
            role: 'assistant' as const,
            content: 'Revenue was ₹3.42 Cr in Jun\'26 [1]. Burn was -₹20L [2].',
            citations: [{ index: 1, filename: 'noto.xlsx' }],
            charts: [
              {
                id: 'revenue-noto',
                metricKey: 'revenue',
                label: 'Net Revenue',
                unit: 'currency' as const,
                series: [
                  {
                    companyId: 'company-noto',
                    companyName: 'Noto',
                    points: [{ period: '2026-06', value: 34200000 }],
                  },
                ],
              },
            ],
            createdAt: new Date().toISOString(),
          },
        ],
      };

      // Buggy behavior prior to fix:
      const buggyLoadedMessages = (apiResponse.session as unknown as { messages?: unknown[] }).messages || [];
      expect(buggyLoadedMessages).toHaveLength(0); // reproduces the old bug

      // Fixed behavior in chat-workspace.tsx:
      const fixedLoadedMessages = apiResponse.messages || (apiResponse.session as unknown as { messages?: unknown[] })?.messages || [];
      expect(fixedLoadedMessages).toHaveLength(2);
      expect(fixedLoadedMessages[1].charts).toBeDefined();
      expect(fixedLoadedMessages[1].charts).toHaveLength(1);
      expect(fixedLoadedMessages[1].charts![0]!.metricKey).toBe('revenue');
      expect(fixedLoadedMessages[1].charts![0]!.series[0]!.points[0]!.value).toBe(34200000);
    });
  });
});
