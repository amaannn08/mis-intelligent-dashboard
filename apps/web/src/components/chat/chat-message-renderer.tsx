'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { Citation } from '@/components/ai/citation-list';

interface ChatMessageRendererProps {
  content: string;
  isStreaming?: boolean;
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
}

export const ChatMessageRenderer = React.memo(function ChatMessageRenderer({
  content,
  isStreaming = false,
  citations = [],
  onCitationClick,
}: ChatMessageRendererProps) {
  // Preprocess text: turn standalone [n] into markdown links [#cite-n] so ReactMarkdown renders them via custom `a` component
  const preprocessed = React.useMemo(() => {
    if (!content) return '';
    // 1. Replace [CALCULATED: reason] with `CALCULATED: reason`
    let res = content.replace(/\[CALCULATED:\s*([^\]]+)\]/g, '`calc: $1`');

    // 2. Drop fabricated citations if citations list is available
    if (citations && citations.length > 0) {
      const validIndices = new Set(citations.map((c) => c.index));
      res = res.replace(/(?:(\s+)\[(\d+)\]|\[(\d+)\])/g, (match, space, p1, p2) => {
        const num = parseInt(p1 || p2, 10);
        return validIndices.has(num) ? match : '';
      });
    }

    // 3. Replace [n] with [[n]](#cite-n)
    res = res.replace(/(?<!\[)\[(\d+)\](?!\()/g, '[[#cite-$1]](#cite-$1)');

    return res;
  }, [content, citations]);

  const components: Components = React.useMemo(() => {
    return {
      p: ({ children }) => (
        <p className="text-[13px] leading-relaxed [&:not(:last-child)]:mb-2 text-[#1A1815] dark:text-[#FAFAF8]">
          {children}
        </p>
      ),
      h1: ({ children }) => (
        <h1 className="mb-2 mt-3 text-[15px] font-bold text-[#1A1815] dark:text-[#FAFAF8]">
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="mb-1.5 mt-3 text-[14px] font-bold text-[#1A1815] dark:text-[#FAFAF8]">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="mb-1 mt-2 text-[13px] font-semibold text-[#1A1815] dark:text-[#FAFAF8]">
          {children}
        </h3>
      ),
      ul: ({ children }) => (
        <ul className="my-2 list-disc list-inside space-y-1 text-[13px] leading-relaxed text-[#1A1815] dark:text-[#FAFAF8]">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="my-2 list-decimal list-inside space-y-1 text-[13px] leading-relaxed text-[#1A1815] dark:text-[#FAFAF8]">
          {children}
        </ol>
      ),
      li: ({ children }) => (
        <li className="text-[13px] leading-relaxed text-[#1A1815] dark:text-[#FAFAF8]">{children}</li>
      ),
      blockquote: ({ children }) => (
        <blockquote className="my-2 border-l-2 border-[#FF7102] pl-3 text-[13px] italic text-[#5A5650] dark:text-[#9A958E]">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-3 border-[#E8E5DE] dark:border-[#2E2A24]" />,
      strong: ({ children }) => (
        <strong className="font-semibold text-[#1A1815] dark:text-[#FAFAF8]">{children}</strong>
      ),
      em: ({ children }) => <em className="italic">{children}</em>,
      a: ({ href, children }) => {
        if (href && href.startsWith('#cite-')) {
          const num = parseInt(href.replace('#cite-', ''), 10);
          const matchedCitation =
            citations.find((c) => c.index === num) || citations[num - 1];

          return (
            <button
              type="button"
              onClick={() => {
                if (matchedCitation && onCitationClick) {
                  onCitationClick(matchedCitation);
                }
              }}
              className="inline-flex items-center justify-center font-mono text-[10px] px-1.5 py-0.2 mx-0.5 rounded bg-[#FFEFE2] dark:bg-[#362215] text-[#FF7102] dark:text-[#FFA057] hover:bg-[#FFD0AB] border border-[#FFD0AB] dark:border-[#FF7102]/40 transition-colors cursor-pointer font-semibold align-baseline"
              title={
                matchedCitation
                  ? `${matchedCitation.filename || 'MIS filing'} (chunk #${matchedCitation.chunkIndex})`
                  : `Citation [${num}]`
              }
            >
              [{num}]
            </button>
          );
        }

        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FF7102] underline hover:opacity-80 font-medium"
          >
            {children}
          </a>
        );
      },
      code: ({ className, children, ...props }) => {
        const text = String(children);
        if (text.startsWith('calc: ')) {
          return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#E8EEF7] dark:bg-[#1A2636] text-[#3A5F8C] dark:text-[#7EA5D9] border border-[#E8EEF7] dark:border-[#2E2A24] mx-1">
              {text.replace('calc: ', 'CALCULATED: ')}
            </span>
          );
        }

        // Standard inline detection: no newline in text and no language class
        const isBlock = className?.includes('language-') || text.includes('\n');

        return !isBlock ? (
          <code {...props} className="rounded bg-[#F5F4F0] dark:bg-[#26231F] px-1 py-0.5 font-mono text-[11px] text-[#FF7102] border border-[#E8E5DE] dark:border-[#2E2A24]">
            {children}
          </code>
        ) : (
          <code {...props} className="block w-full font-mono text-[11px] text-[#1A1815] dark:text-[#FAFAF8]">
            {children}
          </code>
        );
      },
      pre: ({ children }) => (
        <pre className="my-2 overflow-x-auto rounded-xl bg-[#FAFAF8] dark:bg-[#141210] border border-[#E8E5DE] dark:border-[#2E2A24] px-4 py-3 text-[11px] text-[#1A1815] dark:text-[#FAFAF8] font-mono">
          {children}
        </pre>
      ),
      table: ({ children }) => (
        <div className="my-2.5 overflow-x-auto rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] shadow-xs">
          <table className="min-w-full border-collapse text-[12px]">{children}</table>
        </div>
      ),
      thead: ({ children }) => (
        <thead className="bg-[#FAFAF8] dark:bg-[#141210] text-[10px] uppercase font-mono tracking-[0.22em] text-[#C8C3BB] border-b border-[#E8E5DE] dark:border-[#2E2A24]">
          {children}
        </thead>
      ),
      tbody: ({ children }) => <tbody className="divide-y divide-[#E8E5DE] dark:divide-[#2E2A24]">{children}</tbody>,
      tr: ({ children }) => <tr className="hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors">{children}</tr>,
      th: ({ children }) => <th className="px-3.5 py-2.5 text-left font-semibold">{children}</th>,
      td: ({ children }) => <td className="px-3.5 py-2.5 text-[#5A5650] dark:text-[#C8C3BB] font-mono text-[11px]">{children}</td>,
    };
  }, [citations, onCitationClick]);

  if (!content && !isStreaming) {
    return null;
  }

  return (
    <div className="space-y-1 font-sans text-[13px]">
      <ReactMarkdown components={components}>{preprocessed}</ReactMarkdown>
      {isStreaming && (
        <span
          className="inline-block w-1.5 h-4 ml-1 align-middle bg-[#FF7102] animate-pulse rounded-xs"
          aria-hidden="true"
        />
      )}
    </div>
  );
});
