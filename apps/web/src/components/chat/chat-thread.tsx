'use client';

import * as React from 'react';
import type { ChatMessage } from './chat-types';
import { CitationList, type Citation } from '@/components/ai/citation-list';
import { ChatMessageRenderer } from './chat-message-renderer';
import { ChatMetricChart } from './chat-metric-chart';
import type { ChartConfig } from '@mis/core';
import { Sparkles, AlertCircle, RotateCcw } from 'lucide-react';

interface ChatThreadProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  streamingCitations: Citation[];
  streamingCharts?: ChartConfig[];
  scopeCompanyName?: string | null;
  onSelectSuggestion: (suggestion: string) => void;
  onCitationClick: (citation: Citation) => void;
  onRetry: () => void;
}

const PORTFOLIO_SUGGESTIONS = [
  'Rank portfolio companies by latest revenue',
  'Which companies show negative EBITDA?',
  'Compare run rate against burn',
  'Which companies are missing their latest MIS?',
];

const COMPANY_SUGGESTIONS = [
  'Summarise the latest MIS in three bullets',
  'Show revenue, EBITDA and burn for the last 4 periods',
  'What changed versus the previous month?',
  'Flag any metric that looks inconsistent',
];

export const ChatThread = React.memo(function ChatThread({
  messages,
  isStreaming,
  streamingText,
  streamingCitations,
  streamingCharts,
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
      className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#FAFAF8] dark:bg-[#141210]"
    >
      {/* Empty State / Quick Suggestions */}
      {isEmpty && (
        <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6 animate-in fade-in duration-300">
          <div className="w-12 h-12 rounded-2xl bg-[#FFEFE2] dark:bg-[#2D1F16] text-[#FF7102] flex items-center justify-center mx-auto shadow-xs border border-[#FFD0AB] dark:border-[#FF7102]/30">
            <Sparkles className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-[#1A1815] dark:text-[#FAFAF8] font-['Syne',sans-serif]">
              {scopeCompanyName ? `${scopeCompanyName} Intelligence` : 'Portfolio MIS Intelligence'}
            </h2>
            <p className="text-xs text-[#5A5650] dark:text-[#9A958E] max-w-md mx-auto leading-relaxed">
              {scopeCompanyName
                ? `Searches every verified MIS filed in the database for ${scopeCompanyName} to deliver grounded, citation-backed intelligence.`
                : 'Searches every verified MIS filed across the portfolio database to deliver grounded, citation-backed intelligence.'}
            </p>
          </div>

          {/* Quick-Suggestion Chips */}
          <div className="pt-2 space-y-2">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
              Suggested queries
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {currentSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectSuggestion(suggestion)}
                  className="text-xs px-3.5 py-2 rounded-xl bg-white dark:bg-[#1C1A17] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] text-[#1A1815] dark:text-[#FAFAF8] border border-[#E8E5DE] dark:border-[#2E2A24] shadow-xs transition-all hover:border-[#FFD0AB] text-left cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Messages List */}
      <div className="space-y-5 max-w-4xl mx-auto">
        {messages.map((message) => {
          // 1. System Divider: Scope changed
          if (message.role === 'system') {
            return (
              <div key={message.id} className="flex items-center gap-3 my-4">
                <div className="h-px bg-[#E8E5DE] dark:bg-[#2E2A24] flex-1" />
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#9A958E] font-medium px-3 py-1 rounded-full bg-white dark:bg-[#1C1A17] border border-[#E8E5DE] dark:border-[#2E2A24] shadow-xs">
                  {message.content}
                </span>
                <div className="h-px bg-[#E8E5DE] dark:bg-[#2E2A24] flex-1" />
              </div>
            );
          }

          // 2. User Bubble: #FFEFE2 / #1A1815
          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex flex-col items-end gap-1">
                <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs bg-[#FFEFE2] dark:bg-[#2D1F16] border border-[#FFD0AB] dark:border-[#FF7102]/40 text-[#1A1815] dark:text-[#FAFAF8] px-4 py-2.5 text-xs font-sans leading-relaxed break-words shadow-xs">
                  {message.content}
                </div>
                {message.createdAt && (
                  <span className="text-[10px] font-mono text-[#C8C3BB] px-1">
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            );
          }

          // 3. Assistant Answer: White card with #E8E5DE border
          if (message.role === 'assistant') {
            return (
              <div key={message.id} className="flex items-start gap-3 text-sm">
                <div className="w-7 h-7 rounded-[7px] bg-[#FFD0AB] dark:bg-[#2D1F16] text-[#FF7102] flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs font-mono shadow-xs">
                  W
                </div>

                <div className="flex-1 space-y-2 min-w-0">
                  {/* Inline Error State with Retry Button */}
                  {message.error ? (
                    <div className="p-3.5 rounded-2xl border border-[#FECDCA] dark:border-[#B42318]/40 bg-[#FEF3F2] dark:bg-[#341618] text-[#B42318] dark:text-[#F87171] text-xs space-y-2 shadow-xs">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{message.error}</span>
                      </div>
                      <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-[#B42318]/30 bg-white dark:bg-[#1C1A17] font-semibold text-[#B42318] hover:bg-[#FEF3F2] transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry Query</span>
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-4 shadow-xs space-y-3">
                      {/* Inline Metric Charts */}
                      {message.charts && message.charts.length > 0 && (
                        <ChatMetricChart charts={message.charts} />
                      )}

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

                      {message.createdAt && (
                        <div className="text-[10px] font-mono text-[#C8C3BB] pt-1">
                          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
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
            <div className="w-7 h-7 rounded-[7px] bg-[#FFD0AB] dark:bg-[#2D1F16] text-[#FF7102] flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs font-mono shadow-xs">
              W
            </div>

            <div className="flex-1 min-w-0">
              <div className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-4 shadow-xs space-y-3">
                {/* Inline Metric Charts (mounts immediately upon X-Charts header) */}
                {streamingCharts && streamingCharts.length > 0 && (
                  <ChatMetricChart charts={streamingCharts} />
                )}

                {!streamingText ? (
                  <div className="flex items-center gap-2 text-xs text-[#9A958E] py-2 font-mono">
                    <div className="w-2 h-2 rounded-full bg-[#FF7102] animate-ping" />
                    <span>Analyzing MIS filings and synthesizing verified response…</span>
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
});
