'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
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
    const newHeight = Math.min(160, Math.max(42, el.scrollHeight));
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
      textareaRef.current.style.height = '42px';
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
    ? `Ask anything about ${scopeCompanyName} (revenue, margins, burn, filings)…`
    : 'Ask anything across portfolio MIS filings or compare metrics…';

  return (
    <div className={cn('p-3 sm:p-4 bg-card/90 backdrop-blur-md border-t border-border space-y-2', className)}>
      {/* Active Scope Hint Pill */}
      <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 font-medium">
          {scopeCompanyName ? (
            <>
              <Building2 className="w-3 h-3 text-primary" />
              <span>
                Asking about: <strong className="text-foreground">{scopeCompanyName}</strong>
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 text-primary" />
              <span>
                Asking about: <strong className="text-foreground">All portfolio</strong>
              </span>
            </>
          )}
        </div>

        <div className="hidden sm:block text-[10px] text-muted-foreground font-mono">
          Enter to send · Shift+Enter for newline
        </div>
      </div>

      {/* Input container */}
      <div className="relative flex items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-xs focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent transition-all">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          rows={1}
          disabled={isStreaming}
          className="flex-1 max-h-40 resize-none bg-transparent p-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 font-sans leading-relaxed"
          style={{ height: '42px' }}
        />

        <div className="shrink-0 pb-0.5">
          {isStreaming ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onStop}
              aria-label="Stop generating response"
              className="h-8 px-3 text-xs gap-1.5 font-medium shadow-2xs"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={!text.trim() || isStreaming}
              aria-label="Send message to portfolio analyst"
              className="h-8 px-3 text-xs gap-1.5 font-medium shadow-2xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
