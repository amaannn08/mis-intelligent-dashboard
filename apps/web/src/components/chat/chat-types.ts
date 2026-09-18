import type { Citation } from '@/components/ai/citation-list';
import type { ChartConfig } from '@mis/core';

export interface ChatSessionSummary {
  id: string;
  title: string;
  companyId: string | null;
  companyName: string | null;
  messageCount: number;
  lastMessagePreview: string | null;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  charts?: ChartConfig[];
  createdAt: string;
  isStreaming?: boolean;
  error?: string | null;
}

export interface CompanyOption {
  id: string;
  name: string;
  slug: string;
  industry?: string | null;
  documentCount?: number;
}
