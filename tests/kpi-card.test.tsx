import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { KpiCard } from '../apps/web/src/components/dashboard/kpi-card';

describe('KpiCard delta chip classification and copy polish', () => {
  it('renders no delta chip or baseline copy for non-metric cards with showDelta={false}', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(KpiCard, {
        label: 'Companies Tracked',
        value: '28',
        showDelta: false,
      })
    );

    expect(html).toContain('Companies Tracked');
    expect(html).toContain('28');
    expect(html).not.toContain('No baseline');
    expect(html).not.toContain('No prior period');
    expect(html).not.toContain('MoM');
    expect(html).not.toContain('data-testid="kpi-delta"');
    expect(html).not.toContain('data-testid="kpi-no-prior-period"');
  });

  it('infers non-metric card and renders no delta chip when delta and showDelta are omitted', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(KpiCard, {
        label: 'Documents Processed',
        value: '1',
      })
    );

    expect(html).toContain('Documents Processed');
    expect(html).toContain('1');
    expect(html).not.toContain('No baseline');
    expect(html).not.toContain('No prior period');
    expect(html).not.toContain('MoM');
    expect(html).not.toContain('data-testid="kpi-delta"');
    expect(html).not.toContain('data-testid="kpi-no-prior-period"');
  });

  it('renders no delta chip for text values and ratios', () => {
    const monthCard = ReactDOMServer.renderToStaticMarkup(
      React.createElement(KpiCard, {
        label: 'Latest Reporting Month',
        value: 'Sep 2025',
        showDelta: false,
      })
    );
    expect(monthCard).toContain('Sep 2025');
    expect(monthCard).not.toContain('No baseline');
    expect(monthCard).not.toContain('No prior period');
    expect(monthCard).not.toContain('MoM');

    const rateCard = ReactDOMServer.renderToStaticMarkup(
      React.createElement(KpiCard, {
        label: 'Reporting Rate',
        value: '1 / 28',
        showDelta: false,
      })
    );
    expect(rateCard).toContain('1 / 28');
    expect(rateCard).not.toContain('No baseline');
    expect(rateCard).not.toContain('No prior period');
    expect(rateCard).not.toContain('MoM');
  });

  it('renders "No prior period" copy on a metric card lacking a prior period (showDelta: true, delta: null)', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(KpiCard, {
        label: 'Total Latest Revenue',
        value: '₹12.5 Cr',
        showDelta: true,
        delta: null,
      })
    );

    expect(html).toContain('Total Latest Revenue');
    expect(html).toContain('₹12.5 Cr');
    expect(html).toContain('No prior period');
    expect(html).not.toContain('No baseline');
    expect(html).not.toContain('MoM');
  });

  it('renders "No prior period" alongside period on a metric card lacking baseline history', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(KpiCard, {
        label: 'Portfolio Revenue',
        value: '₹15.0 Cr',
        showDelta: true,
        delta: null,
        period: 'Sep 2025',
      })
    );

    expect(html).toContain('No prior period');
    expect(html).toContain('Sep 2025');
    expect(html).not.toContain('No baseline');
    expect(html).not.toContain('MoM');
  });

  it('renders the delta percentage chip with MoM label on metric cards with valid delta', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(KpiCard, {
        label: 'Total Latest Revenue',
        value: '₹12.5 Cr',
        delta: 14.2,
        period: 'Sep 2025',
        showDelta: true,
      })
    );

    expect(html).toContain('+14.2%');
    expect(html).toContain('MoM');
    expect(html).toContain('Sep 2025');
    expect(html).not.toContain('No baseline');
    expect(html).not.toContain('No prior period');
  });

  it('renders negative delta with appropriate styling and minus/arrow indicators', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(KpiCard, {
        label: 'Net Cash Burn',
        value: '₹18 L',
        delta: -12.5,
        period: 'Sep 2025',
        directionality: 'down_is_good',
      })
    );

    expect(html).toContain('-12.5%');
    expect(html).toContain('MoM');
    expect(html).not.toContain('No baseline');
    expect(html).not.toContain('No prior period');
  });

  it('infers metric card status when metric kind is provided even if delta is null', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(KpiCard, {
        label: 'Net Revenue',
        value: '₹2.0 Cr',
        kind: 'reported',
        delta: null,
      })
    );

    expect(html).toContain('No prior period');
    expect(html).not.toContain('No baseline');
  });
});
