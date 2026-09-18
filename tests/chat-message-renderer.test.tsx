import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ChatMessageRenderer } from '../apps/web/src/components/chat/chat-message-renderer';

describe('ChatMessageRenderer Editorial & Bold Formatting (Critique 8 Regression Tests)', () => {
  it('renders <strong> tags for bold figures and bold text', () => {
    const content = 'Noto recorded net revenue of **₹2.0 Cr** in Sep’25 compared to **₹1.5 Cr** in Jun’25.';
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, { content })
    );

    expect(html).toContain('<strong');
    expect(html).toContain('₹2.0 Cr</strong>');
    expect(html).toContain('₹1.5 Cr</strong>');
  });

  it('renders <strong> correctly when citations adjoin or enclose bold text', () => {
    const content = 'Net revenue reached **₹2.0 Cr** [1] while EBITDA stood at **-₹18 L** [2].';
    const citations = [
      { index: 1, filename: 'noto_sep25.xlsx', chunkIndex: 0, text: 'Net revenue' },
      { index: 2, filename: 'noto_sep25.xlsx', chunkIndex: 1, text: 'EBITDA' },
    ];
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, { content, citations })
    );

    // Assert strong tags are properly emitted without broken literal asterisks
    expect(html).toContain('<strong class="font-semibold text-[#1A1815] dark:text-[#FAFAF8] tracking-tight">₹2.0 Cr</strong>');
    expect(html).toContain('<strong class="font-semibold text-[#1A1815] dark:text-[#FAFAF8] tracking-tight">-₹18 L</strong>');
    expect(html).not.toContain('**₹2.0 Cr**');
    expect(html).not.toContain('**-₹18 L**');

    // Assert quiet citation buttons exist
    expect(html).toContain('data-testid="inline-citation"');
    expect(html).toContain('[1]');
    expect(html).toContain('[2]');
  });

  it('renders markdown tables with proper structure via remark-gfm', () => {
    const content = `
| Period | Revenue | EBITDA |
|---|---|---|
| Jun'25 | ₹1.5 Cr | -₹22 L |
| Sep'25 | ₹2.0 Cr | -₹18 L |
`.trim();

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, { content })
    );

    expect(html).toContain('<table');
    expect(html).toContain('<thead');
    expect(html).toContain('<tbody');
    expect(html).toContain('<th');
    expect(html).toContain('<td');
    expect(html).toContain('Revenue');
    expect(html).toContain('EBITDA');
  });

  it('renders lists with clean editorial spacing', () => {
    const content = `
Key observations:
* Net revenue grew 33% over the period
* Gross margin expanded to 42%
* Burn reduced from ₹22 L to ₹18 L
`.trim();

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, { content })
    );

    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('Net revenue grew 33%');
  });

  it('renders "So the trend to watch:" as an editorial pull-quote callout card', () => {
    const content = '**So the trend to watch:** Revenue expansion has accelerated alongside narrowing burn.';
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, { content })
    );

    expect(html).toContain('data-testid="trend-callout"');
    expect(html).toContain('border-l-2 border-[#FF7102]');
    expect(html).toContain('italic');
    expect(html).toContain('Revenue expansion has accelerated');
  });

  it('renders "Basis:" as a muted provenance meta row', () => {
    const content = '**Basis:** Audited monthly MIS filings Jun’25 through Sep’25.';
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, { content })
    );

    expect(html).toContain('data-testid="basis-meta-row"');
    expect(html).toContain('border-t');
    expect(html).toContain('font-mono');
    expect(html).toContain('Audited monthly MIS filings');
  });

  it('enforces 680 px max width container measure for readable line length', () => {
    const content = 'Short response text.';
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ChatMessageRenderer, { content })
    );

    expect(html).toContain('data-testid="chat-message-prose"');
    expect(html).toContain('max-w-[680px]');
  });
});
