'use client';

import * as React from 'react';
import { Send, Square, Sparkles, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatComposerProps {
  onSendMessage: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  scopeCompanyName?: string | null;
  placeholder?: string;
  className?: string;
}

export function ChatComposer({
  onSendMessage,
  onStop,
  isStreaming,
  scopeCompanyName,
  placeholder,
  className,
}: ChatComposerProps) {
  const [text, setText] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(160, Math.max(44, el.scrollHeight));
    el.style.height = `${newHeight}px`;
  }, []);

  React.useEffect(() => {
    adjustTextareaHeight();
  }, [text, adjustTextareaHeight]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSendMessage(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const defaultPlaceholder = scopeCompanyName
    ? `Ask anything about ${scopeCompanyName} (revenue, burn, runway, filings)…`
    : 'Ask anything across portfolio MIS filings or compare companies…';

  return (
    <div className={cn('p-3 sm:p-4 bg-[#FAFAF8] dark:bg-[#141210] border-t border-[#E8E5DE] dark:border-[#2E2A24] space-y-2', className)}>
      {/* Active Scope Hint Pill */}
      <div className="flex items-center justify-between px-2 text-[10px] font-mono tracking-[0.12em] uppercase text-[#9A958E]">
        <div className="flex items-center gap-2">
          {scopeCompanyName ? (
            <>
              <Building2 className="w-3 h-3 text-[#FF7102]" />
              <span>
                Scope: <strong className="text-[#1A1815] dark:text-[#FAFAF8]">{scopeCompanyName}</strong>
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 text-[#FF7102]" />
              <span>
                Scope: <strong className="text-[#1A1815] dark:text-[#FAFAF8]">All Portfolio</strong>
              </span>
            </>
          )}
        </div>

        <div className="hidden sm:block text-[10px] text-[#C8C3BB] font-mono">
          Enter to send · Shift+Enter newline
        </div>
      </div>

      {/* Input card container */}
      <div className="relative flex items-end gap-2 rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-2.5 shadow-sm focus-within:border-[#FF7102] transition-colors">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          rows={1}
          disabled={isStreaming}
          className="flex-1 max-h-40 resize-none bg-transparent p-1.5 text-xs text-[#1A1815] dark:text-[#FAFAF8] placeholder:text-[#9A958E] focus:outline-none disabled:opacity-50 font-sans leading-relaxed"
          style={{ height: '44px' }}
        />

        <div className="shrink-0 pb-0.5">
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating response"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#B42318] hover:bg-[#912018] px-3 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim() || isStreaming}
              aria-label="Send message"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#FF7102] hover:bg-[#ff8a3a] disabled:opacity-40 disabled:cursor-not-allowed px-3 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(255,113,2,0.25)] transition-all cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Send</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
