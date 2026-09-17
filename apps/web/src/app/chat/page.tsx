import * as React from 'react';
import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import { ChatWorkspace } from '@/components/chat/chat-workspace';
import { getCompaniesList } from '@/lib/companies';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Portfolio Chat — WEH Ventures MIS Intelligence',
  description: 'Conversational assistant across all portfolio MIS filings and extracted financial metrics',
};

export const revalidate = 60;

export default async function ChatPage() {
  // Performance Fix 8: Fetch company list server-side instead of pulling on client mount
  let companyOptions: Array<{
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    documentCount: number;
  }> = [];
  try {
    const { companies } = await getCompaniesList({ limit: 100 });
    companyOptions = companies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      industry: c.industry,
      documentCount: c.documentCount || 0,
    }));
    companyOptions.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('Failed to pre-fetch companies for chat:', err);
  }

  return (
    <AppShell noPadding>
      <React.Suspense
        fallback={
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#9A958E] bg-[#FAFAF8] dark:bg-[#141210]">
            <Loader2 className="w-5 h-5 animate-spin text-[#FF7102]" />
            <span className="text-xs font-mono">Initializing conversational workspace…</span>
          </div>
        }
      >
        <ChatWorkspace initialCompanies={companyOptions} />
      </React.Suspense>
    </AppShell>
  );
}
