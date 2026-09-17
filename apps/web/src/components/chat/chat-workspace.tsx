'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { ChatSessionSummary, ChatMessage, CompanyOption } from './chat-types';
import type { Citation } from '@/components/ai/citation-list';
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

export function ChatWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [sessions, setSessions] = React.useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [companies, setCompanies] = React.useState<CompanyOption[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = React.useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = React.useState(false);

  // Active session company scope
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string | null>(null);

  // Streaming state
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamingText, setStreamingText] = React.useState('');
  const [streamingCitations, setStreamingCitations] = React.useState<Citation[]>([]);
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

  // 1. Fetch companies list
  const fetchCompanies = React.useCallback(async () => {
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
        // Sort companies alphabetically
        list.sort((a, b) => a.name.localeCompare(b.name));
        setCompanies(list);
      }
    } catch (err) {
      console.error('Failed to load companies for scope picker:', err);
    }
  }, []);

  // 2. Fetch sessions list
  const fetchSessions = React.useCallback(async (): Promise<ChatSessionSummary[]> => {
    try {
      const res = await fetch('/api/chat/sessions');
      if (res.ok) {
        const data = await res.json();
        const list: ChatSessionSummary[] = data.sessions || [];
        setSessions(list);
        return list;
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
    return [];
  }, []);

  // 3. Load messages for a session
  const loadSessionMessages = React.useCallback(async (sessionId: string) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSelectedCompanyId(data.session.companyId ?? null);
        }
        const loadedMsgs: ChatMessage[] = (data.messages || []).map((m: {
          id: string;
          role: string;
          content: string;
          citations?: unknown;
          createdAt: string;
        }) => ({
          id: m.id,
          role: (m.role as 'user' | 'assistant' | 'system') || 'assistant',
          content: m.content,
          citations: Array.isArray(m.citations) ? (m.citations as Citation[]) : [],
          createdAt: m.createdAt,
        }));
        setMessages(loadedMsgs);
      } else if (res.status === 404) {
        // Session not found
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error(`Failed to load messages for session ${sessionId}:`, err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // 4. Initial Mount: load companies, sessions, and handle ?companyId=
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
            // Clean URL
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
        // Case D: Empty state (no auto-created junk sessions)
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
          companyId: selectedCompanyId || null,
          title: 'New chat',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newSession = data.session;
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to create new chat session:', err);
    }
  };

  // Handle renaming session
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

  // Handle deleting session
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
            loadSessionMessages(remaining[0].id);
          } else {
            setActiveSessionId(null);
            setMessages([]);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to delete session ${sessionId}:`, err);
    }
  };

  // Handle changing scope via Scope Picker
  const handleScopeChange = async (newCompanyId: string | null) => {
    const targetComp = newCompanyId ? companies.find((c) => c.id === newCompanyId) : null;
    const scopeLabel = targetComp ? targetComp.name : 'All portfolio';

    setSelectedCompanyId(newCompanyId);

    // If there is an active session, patch it and add a visible divider
    if (activeSessionId) {
      try {
        const res = await fetch(`/api/chat/sessions/${activeSessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: newCompanyId }),
        });

        if (res.ok) {
          // Update in sessions list
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSessionId
                ? {
                    ...s,
                    companyId: newCompanyId,
                    companyName: targetComp ? targetComp.name : null,
                  }
                : s
            )
          );

          // Add visible system divider into the thread
          const dividerMsg: ChatMessage = {
            id: `scope-divider-${Date.now()}`,
            role: 'system',
            content: `Scope changed to ${scopeLabel}`,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, dividerMsg]);
        }
      } catch (err) {
        console.error('Failed to patch session company scope:', err);
      }
    }
  };

  // Handle stopping the active stream
  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);

    // If there was partial streaming text, commit it as an assistant message
    if (streamingText) {
      const partialMsg: ChatMessage = {
        id: `assistant-partial-${Date.now()}`,
        role: 'assistant',
        content: streamingText,
        citations: streamingCitations,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, partialMsg]);
      setStreamingText('');
      setStreamingCitations([]);
    }
  };

  // Core send message handler
  const handleSendMessage = async (queryText: string) => {
    const text = queryText.trim();
    if (!text || isStreaming) return;

    setLastQuestion(text);

    let currentSessionId = activeSessionId;

    // If on empty state with no active session, create one first
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
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, finalAssistantMsg]);
      setStreamingText('');
      setStreamingCitations([]);

      // Refresh sessions in background to update title and relative time
      fetchSessions();
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        const errorMsg = (err as Error).message || 'An error occurred while streaming response.';
        const errorAssistantMsg: ChatMessage = {
          id: `assistant-err-${Date.now()}`,
          role: 'assistant',
          content: '',
          error: errorMsg,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorAssistantMsg]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Handle Retry
  const handleRetry = () => {
    if (lastQuestion) {
      handleSendMessage(lastQuestion);
    }
  };

  // Save header title inline edit
  const handleSaveHeaderTitle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeSessionId) return;

    const trimmed = titleInput.trim();
    if (trimmed) {
      await handleRenameSession(activeSessionId, trimmed);
    }
    setIsEditingTitle(false);
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-background">
      {/* Left Rail (Conversations sidebar) */}
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
        {/* Center Header */}
        <header className="p-3 sm:px-5 sm:py-3.5 border-b border-border bg-card/70 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile hamburger menu */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="Open conversation history"
              className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop uncollapse button if collapsed */}
            {isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                aria-label="Expand conversations sidebar"
                className="hidden md:flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
                    className="bg-background border border-ring text-sm font-semibold px-2 py-0.5 rounded focus:outline-none max-w-[200px] sm:max-w-xs"
                  />
                  <button
                    type="submit"
                    aria-label="Save title"
                    className="p-1 text-primary hover:bg-muted rounded cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel editing"
                    onClick={() => setIsEditingTitle(false)}
                    className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded cursor-pointer"
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
                  <h1 className="text-sm sm:text-base font-semibold text-foreground truncate max-w-[180px] sm:max-w-md">
                    {activeSession ? activeSession.title : 'New conversation'}
                  </h1>
                  {activeSession && (
                    <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-80 transition-opacity" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Scope Picker & Grounded Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Grounded Documents Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-full border border-border/60">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>
                {activeCompany
                  ? `Grounded in ${activeCompany.documentCount || 0} document${activeCompany.documentCount === 1 ? '' : 's'}`
                  : `Grounded in ${totalDocumentsCount} portfolio documents`}
              </span>
            </div>

            {/* Scope Picker Dropdown */}
            <div className="relative inline-block">
              <div className="relative flex items-center">
                <select
                  value={selectedCompanyId || ''}
                  onChange={(e) => handleScopeChange(e.target.value ? e.target.value : null)}
                  aria-label="Filter scope to all portfolio or a company"
                  className="appearance-none bg-card hover:bg-muted/80 text-foreground border border-border rounded-lg pl-8 pr-7 py-1 text-xs font-medium cursor-pointer shadow-2xs focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                >
                  <option value="">All portfolio</option>
                  {companies.map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.name}
                    </option>
                  ))}
                </select>

                <div className="absolute left-2.5 pointer-events-none text-muted-foreground">
                  {selectedCompanyId ? (
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  )}
                </div>

                <div className="absolute right-2 pointer-events-none text-muted-foreground">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Messages Thread */}
        {isLoadingSessions ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">Loading conversations…</span>
          </div>
        ) : isLoadingMessages ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">Loading conversation history…</span>
          </div>
        ) : (
          <ChatThread
            messages={messages}
            isStreaming={isStreaming}
            streamingText={streamingText}
            streamingCitations={streamingCitations}
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
