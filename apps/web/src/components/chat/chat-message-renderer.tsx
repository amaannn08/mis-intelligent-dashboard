'use client';

import * as React from 'react';
import type { Citation } from '@/components/ai/citation-list';

interface ChatMessageRendererProps {
  content: string;
  isStreaming?: boolean;
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
}

/**
 * Render inline text formatting (bold, inline code, calculated tags, and clickable citations).
 */
function renderInlineFormatting(
  text: string,
  citations: Citation[] = [],
  onCitationClick?: (citation: Citation) => void
): React.ReactNode[] {
  // Regex to match:
  // 1. Bold: \*\*(.+?)\*\*
  // 2. Inline code: `([^`]+)`
  // 3. Calculated tag: \[CALCULATED:\s*([^\]]+)\]
  // 4. Citation tag: \[(\d+)\]
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\[CALCULATED:[^\]]+\]|\[\d+\])/g;

  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <strong key={idx} className="font-semibold text-foreground">
          {inner}
        </strong>
      );
    }

    // Inline code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <code
          key={idx}
          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted text-foreground border border-border/70"
        >
          {inner}
        </code>
      );
    }

    // Calculated tag: [CALCULATED: ...]
    if (part.startsWith('[CALCULATED:') && part.endsWith(']')) {
      const inner = part.slice(1, -1);
      return (
        <span
          key={idx}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 mx-1"
        >
          {inner}
        </span>
      );
    }

    // Citation tag: [n]
    const citationMatch = part.match(/^\[(\d+)\]$/);
    if (citationMatch) {
      const num = parseInt(citationMatch[1], 10);
      const matchedCitation = citations.find((c) => c.index === num) || citations[num - 1];

      return (
        <button
          key={idx}
          type="button"
          onClick={() => {
            if (matchedCitation && onCitationClick) {
              onCitationClick(matchedCitation);
            }
          }}
          className="inline-flex items-center justify-center font-mono text-[10px] px-1.5 py-0.2 mx-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 transition-colors cursor-pointer font-semibold align-baseline"
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

    // Plain text
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

/**
 * Parses markdown table text into 2D array of headers and rows.
 */
function parseMarkdownTable(lines: string[]): {
  headers: string[];
  rows: string[][];
} | null {
  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] => {
    const trimmed = line.trim();
    const inner = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
    const clean = inner.endsWith('|') ? inner.slice(0, -1) : inner;
    return clean.split('|').map((c) => c.trim());
  };

  const isSeparator = (line: string): boolean => {
    return /^\|?(\s*:?-+:?\s*\|?)+$/.test(line.trim());
  };

  const firstRow = parseRow(lines[0]);
  let separatorIdx = 1;

  if (isSeparator(lines[1])) {
    separatorIdx = 1;
  } else if (lines.length > 2 && isSeparator(lines[2])) {
    separatorIdx = 2;
  } else {
    // Not a valid standard markdown table
    return null;
  }

  const headers = firstRow;
  const rows = lines
    .slice(separatorIdx + 1)
    .filter((l) => l.trim().length > 0 && !isSeparator(l))
    .map(parseRow);

  return { headers, rows };
}

export function ChatMessageRenderer({
  content,
  isStreaming = false,
  citations = [],
  onCitationClick,
}: ChatMessageRendererProps) {
  if (!content && isStreaming) {
    return null;
  }

  if (!content) {
    return null;
  }

  // Split lines
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Check for table block (lines starting with '|')
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }

      const tableData = parseMarkdownTable(tableLines);
      if (tableData) {
        elements.push(
          <div key={`table-${i}`} className="my-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/60 text-muted-foreground uppercase text-[10px] font-semibold border-b border-border">
                <tr>
                  {tableData.headers.map((h, hIdx) => (
                    <th key={hIdx} className="px-3 py-2 font-medium">
                      {renderInlineFormatting(h, citations, onCitationClick)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card/40">
                {tableData.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 text-foreground">
                        {renderInlineFormatting(cell, citations, onCitationClick)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      } else {
        // Fall back to plain lines
        tableLines.forEach((tl, tIdx) => {
          elements.push(
            <div key={`tl-${i}-${tIdx}`} className="leading-relaxed">
              {renderInlineFormatting(tl, citations, onCitationClick)}
            </div>
          );
        });
        continue;
      }
    }

    // 2. Check for fenced code block ```
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++; // skip opening ```
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```

      elements.push(
        <pre
          key={`code-${i}`}
          className="my-2.5 p-3 rounded-lg bg-muted/70 text-foreground font-mono text-xs overflow-x-auto border border-border"
        >
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // 3. Headings (#, ##, ###)
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${i}`} className="text-sm font-semibold text-foreground mt-3 mb-1">
          {renderInlineFormatting(trimmed.slice(4), citations, onCitationClick)}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${i}`} className="text-sm font-bold text-foreground mt-3.5 mb-1.5">
          {renderInlineFormatting(trimmed.slice(3), citations, onCitationClick)}
        </h3>
      );
      i++;
      continue;
    }

    // 4. Bullet lists (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2 space-y-1 list-disc list-inside text-sm text-foreground">
          {listItems.map((item, lIdx) => (
            <li key={lIdx} className="leading-relaxed">
              {renderInlineFormatting(item, citations, onCitationClick)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 5. Numbered lists (1. , 2. )
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol
          key={`ol-${i}`}
          className="my-2 space-y-1 list-decimal list-inside text-sm text-foreground"
        >
          {listItems.map((item, lIdx) => (
            <li key={lIdx} className="leading-relaxed">
              {renderInlineFormatting(item, citations, onCitationClick)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 6. Empty line -> spacer
    if (trimmed === '') {
      elements.push(<div key={`blank-${i}`} className="h-2" />);
      i++;
      continue;
    }

    // 7. Regular paragraph line
    elements.push(
      <p key={`p-${i}`} className="leading-relaxed text-sm text-foreground">
        {renderInlineFormatting(line, citations, onCitationClick)}
      </p>
    );
    i++;
  }

  return (
    <div className="space-y-1 font-sans text-sm">
      {elements}
      {isStreaming && (
        <span
          className="inline-block w-1.5 h-4 ml-1 align-middle bg-primary animate-pulse"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
