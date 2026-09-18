'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citation } from '@/components/ai/citation-list';

interface ChatMessageRendererProps {
  content: string;
  isStreaming?: boolean;
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
  className?: string;
}

function getChildrenText(children: React.ReactNode): string {
  if (!children) return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getChildrenText).join('');
  if (typeof children === 'object' && children !== null && 'props' in children) {
    const props = (children as { props?: { children?: React.ReactNode } }).props;
    if (props?.children) {
      return getChildrenText(props.children);
    }
  }
  return '';
}

export const ChatMessageRenderer = React.memo(function ChatMessageRenderer({
  content,
  isStreaming = false,
  citations = [],
  onCitationClick,
  className,
}: ChatMessageRendererProps) {
  // Preprocess text:
  // 1. Convert [CALCULATED: ...] to code tags
  // 2. Normalize whitespace around asterisks so CommonMark parses **bold** cleanly
  // 3. Drop fabricated citations
  // 4. Tokenize [n] into clean links [$1](#cite-$1) without broken nested brackets
  const preprocessed = React.useMemo(() => {
    if (!content) return '';
    let res = content.replace(/\[CALCULATED:\s*([^\]]+)\]/g, '`calc: $1`');

    // Drop fabricated citations if citations list is available
    if (citations && citations.length > 0) {
      const validIndices = new Set(citations.map((c) => c.index));
      res = res.replace(/(?:(\s+)\[(\d+)\]|\[(\d+)\])/g, (match, _space, p1, p2) => {
        const num = parseInt(p1 || p2, 10);
        return validIndices.has(num) ? match : '';
      });
    }

    // Convert [n] to clean markdown link [n](#cite-n) — no nested bracket munging
    res = res.replace(/(?<!\[)\[(\d+)\](?!\()/g, '[$1](#cite-$1)');

    return res;
  }, [content, citations]);

  const components: Components = React.useMemo(() => {
    return {
      p: ({ children }) => {
        const rawText = getChildrenText(children).trim();
        const lower = rawText.toLowerCase();

        // 1. Editorial Callout: "So the trend to watch:"
        if (lower.startsWith('so the trend to watch:') || lower.startsWith('trend to watch:')) {
          return (
            <div
              data-testid="trend-callout"
              className="border-l-2 border-[#FF7102] bg-[#FAFAF8] dark:bg-[#1A1815] px-3.5 py-2.5 my-3 rounded-r-lg text-[13.5px] italic text-[#1A1815] dark:text-[#FAFAF8] leading-[1.55] shadow-2xs"
            >
              {children}
            </div>
          );
        }

        // 2. Provenance Meta Row: "Basis:"
        if (lower.startsWith('basis:')) {
          return (
            <div
              data-testid="basis-meta-row"
              className="pt-2.5 mt-3 border-t border-[#E8E5DE]/70 dark:border-[#2E2A24] text-[11px] font-mono text-[#9A958E] dark:text-[#7A7670] leading-normal"
            >
              {children}
            </div>
          );
        }

        // Standard narrative prose: 14.5px, line-height 1.60, mb-3.5
        return (
          <p className="text-[14.5px] leading-[1.60] [&:not(:last-child)]:mb-3.5 text-[#1A1815] dark:text-[#FAFAF8]">
            {children}
          </p>
        );
      },
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
        <ul className="my-2 list-disc list-inside space-y-1 text-[14px] leading-[1.60] text-[#1A1815] dark:text-[#FAFAF8]">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="my-2 list-decimal list-inside space-y-1 text-[14px] leading-[1.60] text-[#1A1815] dark:text-[#FAFAF8]">
          {children}
        </ol>
      ),
      li: ({ children }) => (
        <li className="text-[14px] leading-[1.60] text-[#1A1815] dark:text-[#FAFAF8]">
          {children}
        </li>
      ),
      blockquote: ({ children }) => (
        <blockquote className="my-2 border-l-2 border-[#FF7102] pl-3 text-[13.5px] italic text-[#5A5650] dark:text-[#9A958E]">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-3 border-[#E8E5DE] dark:border-[#2E2A24]" />,
      // High-contrast strong tags for bold figures
      strong: ({ children }) => (
        <strong className="font-semibold text-[#1A1815] dark:text-[#FAFAF8] tracking-tight">
          {children}
        </strong>
      ),
      em: ({ children }) => <em className="italic">{children}</em>,
      // Quiet, subordinate footnote citations: [1]
      a: ({ href, children }) => {
        if (href && href.startsWith('#cite-')) {
          const num = parseInt(href.replace('#cite-', ''), 10);
          const matchedCitation =
            citations.find((c) => c.index === num) || citations[num - 1];

          return (
            <button
              type="button"
              data-testid="inline-citation"
              onClick={() => {
                if (matchedCitation && onCitationClick) {
                  onCitationClick(matchedCitation);
                }
              }}
              className="inline-flex items-center justify-center font-mono text-[9.5px] px-1 py-0 mx-0.5 rounded text-[#9A958E] dark:text-[#87867F] hover:text-[#FF7102] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors cursor-pointer align-baseline select-none"
              title={
                matchedCitation
                  ? `${matchedCitation.filename || 'MIS filing'} · chunk #${matchedCitation.chunkIndex}`
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
    <div
      data-testid="chat-message-prose"
      className={`max-w-[680px] space-y-1 font-sans text-[14.5px] leading-[1.60] ${className || ''}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {preprocessed}
      </ReactMarkdown>
      {isStreaming && (
        <span
          className="inline-block w-1.5 h-4 ml-1 align-middle bg-[#FF7102] animate-pulse rounded-xs"
          aria-hidden="true"
        />
      )}
    </div>
  );
});
