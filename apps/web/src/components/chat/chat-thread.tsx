'use client';

import * as React from 'react';
import type { ChatMessage } from './chat-types';
import { CitationList, type Citation } from '@/components/ai/citation-list';
import { ChatMessageRenderer } from './chat-message-renderer';
import { Button } from '@/components/ui/button';
import { Sparkles, AlertCircle, RotateCcw } from 'lucide-react';

interface ChatThreadProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  streamingCitations: Citation[];
  scopeCompanyName?: string | null;
  onSelectSuggestion: (suggestion: string) => void;
  onCitationClick: (citation: Citation) => void;
  onRetry: () => void;
}

const PORTFOLIO_SUGGESTIONS = [
  'Which company has the highest burn?',
  'Compare revenue across the portfolio',
  'Who is growing fastest month over month?',
];

const COMPANY_SUGGESTIONS = [
  'What was the revenue in the latest MIS?',
  "Summarise this company's commentary",
  'How has EBITDA moved over the last 6 months?',
];

export function ChatThread({
  messages,
  isStreaming,
  streamingText,
  streamingCitations,
  scopeCompanyName,
  onSelectSuggestion,
  onCitationClick,
  onRetry,
}: ChatThreadProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const bottomSentinelRef = React.useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = React.useState(false);

  // Track scroll position to prevent forced scrolling if user manually scrolled up
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsUserScrolledUp(distanceToBottom > 100);
  };

  React.useEffect(() => {
    if (!isUserScrolledUp && bottomSentinelRef.current) {
      bottomSentinelRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText, isStreaming, isUserScrolledUp]);

  const nonSystemMessages = messages.filter((m) => m.role !== 'system');
  const isEmpty = nonSystemMessages.length === 0 && !isStreaming;

  const currentSuggestions = scopeCompanyName ? COMPANY_SUGGESTIONS : PORTFOLIO_SUGGESTIONS;

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6"
    >
      {/* Empty State / Quick Suggestions */}
      {isEmpty && (
        <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6 animate-in fade-in duration-300">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-2xs">
            <Sparkles className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {scopeCompanyName ? `${scopeCompanyName} Intelligence` : 'Portfolio MIS Intelligence'}
            </h2>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Ask anything in natural language. The assistant analyzes every verified MIS filing,
              extracts structured metrics, and grounds every claim with citations.
            </p>
          </div>

          {/* Quick-Suggestion Chips */}
          <div className="pt-2 space-y-2">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Suggested queries
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {currentSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectSuggestion(suggestion)}
                  className="text-xs px-3.5 py-2 rounded-xl bg-card hover:bg-muted text-foreground border border-border shadow-2xs transition-all hover:border-primary/40 text-left cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Messages List */}
      <div className="space-y-6 max-w-4xl mx-auto">
        {messages.map((message) => {
          // 1. System Divider: Scope changed
          if (message.role === 'system') {
            return (
              <div key={message.id} className="flex items-center gap-3 my-4">
                <div className="h-px bg-border flex-1" />
                <span className="text-[11px] text-muted-foreground font-medium px-2.5 py-0.5 rounded-full bg-muted/60 border border-border/60">
                  {message.content}
                </span>
                <div className="h-px bg-border flex-1" />
              </div>
            );
          }

          // 2. User Bubble
          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs bg-primary text-primary-foreground px-4 py-2.5 text-sm shadow-2xs font-sans leading-relaxed break-words">
                  {message.content}
                </div>
              </div>
            );
          }

          // 3. Assistant Answer
          if (message.role === 'assistant') {
            return (
              <div key={message.id} className="flex items-start gap-3 text-sm">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                  MIS
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                  {/* Inline Error State with Retry Button */}
                  {message.error ? (
                    <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-xs space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{message.error}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        className="text-xs h-7 gap-1 border-destructive/30 hover:bg-destructive/10"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry Query</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-3">
                      <ChatMessageRenderer
                        content={message.content}
                        citations={message.citations}
                        onCitationClick={onCitationClick}
                      />

                      {/* Citations List */}
                      {message.citations && message.citations.length > 0 && (
                        <CitationList
                          citations={message.citations}
                          onCitationClick={onCitationClick}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return null;
        })}

        {/* Streaming In-Progress Message */}
        {isStreaming && (
          <div
            className="flex items-start gap-3 text-sm animate-in fade-in"
            aria-live="polite"
            aria-atomic="false"
          >
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
              MIS
            </div>

            <div className="flex-1 min-w-0">
              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-3">
                {!streamingText ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                    <span>Analyzing MIS database and synthesizing verified answer…</span>
                  </div>
                ) : (
                  <>
                    <ChatMessageRenderer
                      content={streamingText}
                      isStreaming={true}
                      citations={streamingCitations}
                      onCitationClick={onCitationClick}
                    />

                    {streamingCitations && streamingCitations.length > 0 && (
                      <CitationList
                        citations={streamingCitations}
                        onCitationClick={onCitationClick}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Scroll Anchor */}
        <div ref={bottomSentinelRef} className="h-1" />
      </div>
    </div>
  );
}
