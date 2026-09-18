'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { ChatSessionSummary, ChatMessage, CompanyOption } from './chat-types';
import type { Citation } from '@/components/ai/citation-list';
import type { ChartConfig } from '@mis/core';
import { ChatSidebar } from './chat-sidebar';
import { ChatThread } from './chat-thread';
import { ChatComposer } from './chat-composer';
import { CitationDrawer } from './citation-drawer';
import {
  Menu,
  PanelLeft,
  Edit2,
  Check,
  X,
  ShieldCheck,
  Building2,
  Sparkles,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatWorkspaceProps {
  initialCompanies?: CompanyOption[];
}

export function ChatWorkspace({ initialCompanies }: ChatWorkspaceProps = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [sessions, setSessions] = React.useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [companies, setCompanies] = React.useState<CompanyOption[]>(initialCompanies || []);
  const [isLoadingSessions, setIsLoadingSessions] = React.useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = React.useState(false);

  // Active session company scope
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string | null>(null);

  // Streaming state
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamingText, setStreamingText] = React.useState('');
  const [streamingCitations, setStreamingCitations] = React.useState<Citation[]>([]);
  const [streamingCharts, setStreamingCharts] = React.useState<import('@mis/core').ChartConfig[]>([]);
  const [lastQuestion, setLastQuestion] = React.useState<string | null>(null);

  // Citation inspection drawer
  const [inspectedCitation, setInspectedCitation] = React.useState<Citation | null>(null);

  // Sidebar & responsive state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = React.useState(false);

  // Header Title Inline Editing
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [titleInput, setTitleInput] = React.useState('');

  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Active session object
  const activeSession = React.useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  // Derive active company scope
  const activeCompany = React.useMemo(() => {
    if (!selectedCompanyId) return null;
    return companies.find((c) => c.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  // Sync selectedCompanyId when activeSession changes
  React.useEffect(() => {
    if (activeSession) {
      setSelectedCompanyId(activeSession.companyId);
    }
  }, [activeSession]);

  // Calculate total documents count across known companies
  const totalDocumentsCount = React.useMemo(() => {
    return companies.reduce((acc, c) => acc + (c.documentCount || 0), 0);
  }, [companies]);

  // 1. Fetch companies list if not supplied via server props
  const fetchCompanies = React.useCallback(async () => {
    if (initialCompanies && initialCompanies.length > 0) return;
    try {
      const res = await fetch('/api/companies?limit=100');
      if (res.ok) {
        const data = await res.json();
        const list: CompanyOption[] = (data.companies || []).map((c: {
          id: string;
          name: string;
          slug: string;
          industry?: string | null;
          documentCount?: number;
        }) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          industry: c.industry,
          documentCount: c.documentCount || 0,
        }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setCompanies(list);
      }
    } catch (err) {
      console.error('Failed to fetch companies for chat scope:', err);
    }
  }, [initialCompanies]);

  // 2. Fetch user's session list
  const fetchSessions = React.useCallback(async () => {
    try {
      const res = await fetch('/api/chat/sessions');
      if (res.ok) {
        const data = await res.json();
        const list: ChatSessionSummary[] = data.sessions || [];
        setSessions(list);
        return list;
      }
    } catch (err) {
      console.error('Failed to fetch chat sessions:', err);
    }
    return [];
  }, []);

  // 3. Load messages for a given session (Fix: data.messages from API)
  const loadSessionMessages = React.useCallback(async (sessionId: string) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        const loadedMessages = data.messages || data.session?.messages || [];
        setMessages(loadedMessages);
        setSelectedCompanyId(data.session?.companyId || null);
      } else {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error(`Failed to load messages for session ${sessionId}:`, err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // 4. Initial Mount: load sessions and handle ?companyId=
  React.useEffect(() => {
    let isMounted = true;

    async function init() {
      setIsLoadingSessions(true);
      await fetchCompanies();
      const existingSessions = await fetchSessions();

      if (!isMounted) return;

      const companyIdParam = searchParams.get('companyId');
      const sessionIdParam = searchParams.get('sessionId');

      // Case A: URL has companyId -> create fresh session scoped to that company
      if (companyIdParam) {
        try {
          const res = await fetch('/api/chat/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId: companyIdParam,
              title: 'New chat',
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const newSession = data.session;
            setSessions((prev) => [newSession, ...prev]);
            setActiveSessionId(newSession.id);
            setSelectedCompanyId(newSession.companyId);
            setMessages([]);
            router.replace('/chat');
            setIsLoadingSessions(false);
            return;
          }
        } catch (err) {
          console.error('Failed to create company-scoped session:', err);
        }
      }

      // Case B: URL has sessionId
      if (sessionIdParam && existingSessions.some((s) => s.id === sessionIdParam)) {
        setActiveSessionId(sessionIdParam);
        await loadSessionMessages(sessionIdParam);
        setIsLoadingSessions(false);
        return;
      }

      // Case C: Open most recent session if available
      if (existingSessions.length > 0) {
        const mostRecent = existingSessions[0];
        setActiveSessionId(mostRecent.id);
        setSelectedCompanyId(mostRecent.companyId);
        await loadSessionMessages(mostRecent.id);
      } else {
        setActiveSessionId(null);
        setMessages([]);
      }

      setIsLoadingSessions(false);
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [fetchCompanies, fetchSessions, loadSessionMessages, router, searchParams]);

  // Handle switching active session
  const handleSelectSession = (sessionId: string) => {
    if (sessionId === activeSessionId) return;

    if (isStreaming && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }

    setActiveSessionId(sessionId);
    loadSessionMessages(sessionId);
  };

  // Handle New Chat button click
  const handleNewChat = async () => {
    if (isStreaming && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }

    try {
      const res = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New chat',
          companyId: selectedCompanyId || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newSession = data.session;
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setSelectedCompanyId(newSession.companyId);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to create new chat session:', err);
    }
  };

  // Rename session title
  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });

      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s))
        );
      }
    } catch (err) {
      console.error(`Failed to rename session ${sessionId}:`, err);
    }
  };

  // Delete session
  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        setSessions(remaining);

        if (activeSessionId === sessionId) {
          if (remaining.length > 0) {
            setActiveSessionId(remaining[0].id);
            setSelectedCompanyId(remaining[0].companyId);
            loadSessionMessages(remaining[0].id);
          } else {
            setActiveSessionId(null);
            setSelectedCompanyId(null);
            setMessages([]);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to delete session ${sessionId}:`, err);
    }
  };

  // Save inline edited title in header
  const handleSaveHeaderTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSessionId) return;
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== activeSession?.title) {
      await handleRenameSession(activeSessionId, trimmed);
    }
    setIsEditingTitle(false);
  };

  // Scope switcher
  const handleScopeChange = async (newCompanyId: string | null) => {
    if (newCompanyId === selectedCompanyId) return;

    setSelectedCompanyId(newCompanyId);

    const targetCompany = newCompanyId ? companies.find((c) => c.id === newCompanyId) : null;
    const scopeLabel = targetCompany ? targetCompany.name : 'All portfolio';

    // Insert system message indicating scope changed
    const systemNotice: ChatMessage = {
      id: `sys-${Date.now()}`,
      role: 'system',
      content: `Scope switched to ${scopeLabel}`,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, systemNotice]);

    if (activeSessionId) {
      try {
        await fetch(`/api/chat/sessions/${activeSessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: newCompanyId }),
        });

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  companyId: newCompanyId,
                  companyName: targetCompany?.name || null,
                  companySlug: targetCompany?.slug || null,
                }
              : s
          )
        );
      } catch (err) {
        console.error('Failed to update session scope:', err);
      }
    }
  };

  // Send message
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    setLastQuestion(text);

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      try {
        const createRes = await fetch('/api/chat/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: selectedCompanyId || null,
            title: text.slice(0, 60).trim() || 'New chat',
          }),
        });

        if (createRes.ok) {
          const createData = await createRes.json();
          const createdSession = createData.session;
          setSessions((prev) => [createdSession, ...prev]);
          setActiveSessionId(createdSession.id);
          currentSessionId = createdSession.id;
        } else {
          throw new Error('Failed to create chat session.');
        }
      } catch (err) {
        console.error('Failed to initialize session on send:', err);
        return;
      }
    }

    // Optimistically append user message
    const optimisticUserMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    // Setup stream
    setIsStreaming(true);
    setStreamingText('');
    setStreamingCitations([]);
    setStreamingCharts([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          sessionId: currentSessionId,
          companyId: selectedCompanyId || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = 'Failed to execute query.';
        try {
          const errData = await res.json();
          errMsg = errData.error?.message || errMsg;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      // Parse citations from header
      let parsedCitations: Citation[] = [];
      const citationsHeader = res.headers.get('X-Citations');
      if (citationsHeader) {
        try {
          const raw = JSON.parse(citationsHeader);
          if (Array.isArray(raw)) {
            parsedCitations = raw;
            setStreamingCitations(parsedCitations);
          }
        } catch (e) {
          console.warn('Failed to parse X-Citations header:', e);
        }
      }

      // Parse charts from header
      let parsedCharts: ChartConfig[] = [];
      const chartsHeader = res.headers.get('X-Charts');
      if (chartsHeader) {
        try {
          const rawCharts = JSON.parse(chartsHeader);
          if (Array.isArray(rawCharts)) {
            parsedCharts = rawCharts;
            setStreamingCharts(parsedCharts);
          }
        } catch (e) {
          console.warn('Failed to parse X-Charts header:', e);
        }
      }

      // Stream text body
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response stream available');
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;
        setStreamingText(accumulatedText);
      }

      // Finalize assistant message
      const finalAssistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: accumulatedText,
        citations: parsedCitations,
        charts: parsedCharts,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, finalAssistantMsg]);
      setStreamingText('');
      setStreamingCitations([]);
      setStreamingCharts([]);

      // Auto-update session title if it was "New chat"
      if (currentSessionId && activeSession && activeSession.title === 'New chat') {
        const generatedTitle = text.slice(0, 45).trim() + (text.length > 45 ? '…' : '');
        handleRenameSession(currentSessionId, generatedTitle);
      }
    } catch (err: unknown) {
      const isAbort = (err as { name?: string })?.name === 'AbortError';
      if (isAbort) {
        if (streamingText) {
          const abortedMsg: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: `${streamingText} *(generation stopped)*`,
            citations: streamingCitations,
            charts: streamingCharts,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, abortedMsg]);
        }
      } else {
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: '',
          error: err instanceof Error ? err.message : 'A network error occurred while querying the portfolio database.',
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      setStreamingCitations([]);
      setStreamingCharts([]);
      abortControllerRef.current = null;
    }
  };

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleRetry = () => {
    if (lastQuestion) {
      handleSendMessage(lastQuestion);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#FAFAF8] dark:bg-[#141210]">
      {/* Sessions Sidebar */}
      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        isMobileOpen={isMobileDrawerOpen}
        onCloseMobile={() => setIsMobileDrawerOpen(false)}
      />

      {/* Main Center Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Center Header with CRM styling */}
        <header className="px-4 py-3 sm:px-6 border-b border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8]/95 dark:bg-[#141210]/95 backdrop-blur shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile hamburger menu */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="Open conversation history"
              className="md:hidden p-1.5 rounded-lg text-[#9A958E] hover:text-[#1A1815] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop uncollapse button if collapsed */}
            {isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                aria-label="Expand conversations sidebar"
                className="hidden md:flex p-1.5 rounded-lg text-[#9A958E] hover:text-[#1A1815] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors cursor-pointer"
                title="Expand conversations sidebar"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}

            {/* Session Title (Inline-editable) */}
            <div className="min-w-0">
              {isEditingTitle ? (
                <form onSubmit={handleSaveHeaderTitle} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setIsEditingTitle(false);
                    }}
                    className="bg-white dark:bg-[#1C1A17] border border-[#FF7102] text-xs font-semibold px-2 py-0.5 rounded-lg focus:outline-none max-w-[200px] sm:max-w-xs"
                  />
                  <button
                    type="submit"
                    aria-label="Save title"
                    className="p-1 text-[#FF7102] hover:bg-[#F5F4F0] rounded cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel editing"
                    onClick={() => setIsEditingTitle(false)}
                    className="p-1 text-[#9A958E] hover:text-[#1A1815] hover:bg-[#F5F4F0] rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div
                  onClick={() => {
                    if (activeSession) {
                      setTitleInput(activeSession.title);
                      setIsEditingTitle(true);
                    }
                  }}
                  className="group flex items-center gap-1.5 cursor-pointer select-none"
                  title="Click to rename session"
                >
                  <h1 className="text-sm sm:text-base font-semibold text-[#1A1815] dark:text-[#FAFAF8] truncate max-w-[180px] sm:max-w-md">
                    {activeSession ? activeSession.title : 'New conversation'}
                  </h1>
                  {activeSession && (
                    <Edit2 className="w-3 h-3 text-[#9A958E] opacity-0 group-hover:opacity-80 transition-opacity" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Scope Picker & Grounded Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Grounded Documents Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-[#5A5650] dark:text-[#9A958E] bg-white dark:bg-[#1C1A17] px-3 py-1 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-[#3D7A58]" />
              <span>
                {activeCompany
                  ? `Grounded: ${activeCompany.documentCount || 0} doc${activeCompany.documentCount === 1 ? '' : 's'}`
                  : `Grounded: ${totalDocumentsCount} portfolio docs`}
              </span>
            </div>

            {/* Scope Picker Dropdown in CRM ScopePill style */}
            <div className="relative inline-block">
              <div className="relative flex items-center">
                <select
                  value={selectedCompanyId || ''}
                  onChange={(e) => handleScopeChange(e.target.value ? e.target.value : null)}
                  aria-label="Filter scope to all portfolio or a company"
                  className={cn(
                    'appearance-none rounded-full border pl-8 pr-7 py-1 text-[11px] font-mono font-medium cursor-pointer shadow-xs focus:outline-none transition-colors',
                    selectedCompanyId
                      ? 'border-[#FFD0AB] bg-[#FFEFE2] text-[#FF7102] dark:bg-[#2D1F16] dark:border-[#FF7102]/50'
                      : 'border-[#E8E5DE] bg-white text-[#5A5650] hover:bg-[#F5F4F0] dark:border-[#2E2A24] dark:bg-[#1C1A17] dark:text-[#9A958E]'
                  )}
                >
                  <option value="">All portfolio</option>
                  {companies.map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.name}
                    </option>
                  ))}
                </select>

                <div className="absolute left-2.5 pointer-events-none text-[#FF7102]">
                  {selectedCompanyId ? (
                    <Building2 className="w-3.5 h-3.5" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                </div>

                <div className="absolute right-2 pointer-events-none text-[#9A958E]">
                  <ChevronDown className="w-3 h-3" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Messages Thread */}
        {isLoadingSessions ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#9A958E]">
            <Loader2 className="w-6 h-6 animate-spin text-[#FF7102]" />
            <span className="text-xs font-mono">Loading conversations…</span>
          </div>
        ) : isLoadingMessages ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#9A958E]">
            <Loader2 className="w-6 h-6 animate-spin text-[#FF7102]" />
            <span className="text-xs font-mono">Loading conversation history…</span>
          </div>
        ) : (
          <ChatThread
            messages={messages}
            isStreaming={isStreaming}
            streamingText={streamingText}
            streamingCitations={streamingCitations}
            streamingCharts={streamingCharts}
            scopeCompanyName={activeCompany?.name}
            onSelectSuggestion={handleSendMessage}
            onCitationClick={(citation) => setInspectedCitation(citation)}
            onRetry={handleRetry}
          />
        )}

        {/* Composer Pinned at Bottom */}
        <ChatComposer
          onSendMessage={handleSendMessage}
          onStop={handleStopStream}
          isStreaming={isStreaming}
          scopeCompanyName={activeCompany?.name}
        />
      </div>

      {/* Source Chunk Inspection Drawer */}
      <CitationDrawer
        citation={inspectedCitation}
        onClose={() => setInspectedCitation(null)}
      />
    </div>
  );
}
