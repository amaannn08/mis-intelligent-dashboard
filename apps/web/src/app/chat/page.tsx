import * as React from 'react';
import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import { ChatWorkspace } from '@/components/chat/chat-workspace';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Portfolio Chat — WEH Ventures MIS Intelligence',
  description: 'Conversational assistant across all portfolio MIS filings and extracted financial metrics',
};

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  return (
    <AppShell noPadding>
      <React.Suspense
        fallback={
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-background">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Initializing conversational workspace…</span>
          </div>
        }
      >
        <ChatWorkspace />
      </React.Suspense>
    </AppShell>
  );
}
