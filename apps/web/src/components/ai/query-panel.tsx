'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CitationList, type Citation } from './citation-list';
import { ChatMetricChart } from '@/components/chat/chat-metric-chart';
import { KeyFiguresStrip } from '@/components/chat/key-figures-strip';
import { ChatMessageRenderer } from '@/components/chat/chat-message-renderer';
import type { ChartConfig } from '@mis/core';
import { Sparkles, Send, Square, AlertCircle, RefreshCw, MessageSquare } from 'lucide-react';

interface QueryPanelProps {
  companyId?: string;
  companyName?: string;
  multiCompanyFilterActive?: boolean;
  selectedCount?: number;
  placeholder?: string;
  onCitationClick?: (citation: Citation) => void;
  className?: string;
}

export function QueryPanel({
  companyId,
  companyName,
  multiCompanyFilterActive,
  selectedCount,
  placeholder,
  onCitationClick,
  className,
}: QueryPanelProps) {
  const [question, setQuestion] = React.useState('');
  const [streamingAnswer, setStreamingAnswer] = React.useState('');
  const [citations, setCitations] = React.useState<Citation[]>([]);
  const [charts, setCharts] = React.useState<ChartConfig[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = React.useState<string | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  const defaultPlaceholder = companyName
    ? `Ask anything about ${companyName}'s financials, revenue, burn, or margins…`
    : 'Ask a portfolio-wide question (e.g. "Which companies grew revenue MoM in Q3?")…';

  const defaultSuggestions = companyName
    ? [
        `What is ${companyName}'s latest revenue and MoM growth?`,
        `How did the gross margin and EBITDA trend over recent months?`,
        `What is the current monthly cash burn?`,
      ]
    : [
        'Which companies reported positive EBITDA recently?',
        'Compare the revenue trends across reporting companies.',
        'What are the key drivers of burn reported in latest MIS?',
      ];

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const handleClear = () => {
    handleStop();
    setQuestion('');
    setStreamingAnswer('');
    setCitations([]);
    setCharts([]);
    setError(null);
    setLastQuestion(null);
  };

  const handleSubmit = async (queryText?: string) => {
    const q = (queryText || question).trim();
    if (!q || isStreaming) return;

    handleStop();
    setError(null);
    setStreamingAnswer('');
    setCitations([]);
    setCharts([]);
    setLastQuestion(q);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          companyId: companyId || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = 'Failed to execute AI query.';
        try {
          const errData = await res.json();
          errMsg = errData.error?.message || errMsg;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      // Parse citations from header
      const citationsHeader = res.headers.get('X-Citations');
      if (citationsHeader) {
        try {
          const parsedCitations = JSON.parse(citationsHeader);
          if (Array.isArray(parsedCitations)) {
            setCitations(parsedCitations);
          }
        } catch (e) {
          console.warn('Failed to parse citations header:', e);
        }
      }

      // Parse charts from header
      const chartsHeader = res.headers.get('X-Charts');
      if (chartsHeader) {
        try {
          const parsedCharts = JSON.parse(chartsHeader);
          if (Array.isArray(parsedCharts)) {
            setCharts(parsedCharts);
          }
        } catch (e) {
          console.warn('Failed to parse charts header:', e);
        }
      }

      // Stream text body
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response stream available');
      }

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamingAnswer(fullText);
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message || 'An error occurred while streaming response.');
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xs space-y-4',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {companyName ? `${companyName} Intelligence Query` : 'Portfolio AI Intelligence'}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Grounded in verified MIS spreadsheet chunks & extracted metrics
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
          {multiCompanyFilterActive && !companyId && (
            <span
              className="text-[10px] text-[#9A958E] font-mono select-none"
              title={`Chat model operates single-company or portfolio-wide. Multi-company filter (${selectedCount ?? 0} selected) cannot be carried into chat.`}
            >
              (Chat opens portfolio-wide)
            </span>
          )}

          <div className="flex items-center gap-1.5">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground"
              title={
                companyId
                  ? `Open full chat scoped to ${companyName}`
                  : multiCompanyFilterActive
                  ? 'Multi-company filter active; opening chat in portfolio scope'
                  : 'Open full portfolio chat'
              }
            >
              <Link href={companyId ? `/chat?companyId=${companyId}` : '/chat'}>
                <MessageSquare className="w-3 h-3" />
                <span>Open in Chat</span>
              </Link>
            </Button>

            {(streamingAnswer || error) && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs h-7 gap-1">
                <RefreshCw className="w-3 h-3" />
                <span>Reset</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Answer Area (if there is an answer, charts, or error) */}
      {(streamingAnswer || isStreaming || error || (charts && charts.length > 0)) && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          {lastQuestion && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground pb-2 border-b border-border/40">
              <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="font-medium text-foreground">{lastQuestion}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Scannable Key-Figures Strip */}
          {charts && charts.length > 0 && (
            <KeyFiguresStrip charts={charts} />
          )}

          {/* Inline Metric Charts */}
          {charts && charts.length > 0 && (
            <ChatMetricChart charts={charts} />
          )}

          {streamingAnswer && (
            <ChatMessageRenderer
              content={streamingAnswer}
              isStreaming={isStreaming}
              citations={citations}
              onCitationClick={onCitationClick}
            />
          )}

          {isStreaming && !streamingAnswer && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
              <span>Analyzing MIS documents and synthesizing verified answer…</span>
            </div>
          )}

          {/* Grounding Citations */}
          {!isStreaming && citations.length > 0 && (
            <CitationList citations={citations} onCitationClick={onCitationClick} />
          )}
        </div>
      )}

      {/* Suggestion Chips (when empty) */}
      {!streamingAnswer && !isStreaming && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-muted-foreground font-medium">Suggested queries:</div>
          <div className="flex flex-wrap gap-1.5">
            {defaultSuggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuestion(s);
                  handleSubmit(s);
                }}
                className="text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 transition-colors text-left"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Box */}
      <div className="relative rounded-lg border border-border bg-card shadow-xs focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          rows={2}
          disabled={isStreaming}
          className="w-full resize-none bg-transparent p-3 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-muted/20 rounded-b-lg">
          <span className="text-[11px] text-muted-foreground">
            Press <kbd className="font-mono bg-muted px-1 py-0.5 rounded border text-[10px]">Enter</kbd> to ask, <kbd className="font-mono bg-muted px-1 py-0.5 rounded border text-[10px]">Shift+Enter</kbd> for newline
          </span>
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleStop}
                className="h-7 text-xs gap-1"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => handleSubmit()}
                disabled={!question.trim() || isStreaming}
                className="h-7 text-xs gap-1"
              >
                <Send className="w-3 h-3" />
                <span>Ask AI</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
