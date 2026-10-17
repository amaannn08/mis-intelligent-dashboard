import { describe, it, expect } from 'vitest';
import {
  detectCompaniesInText,
  resolveCompanyByName,
  routeQuestion,
  type KnownCompany,
} from '../packages/core/src/index.js';

describe('Company matching: spacing/punctuation/typo tolerant', () => {
  const knownCompanies: KnownCompany[] = [
    { id: 'mc-1', name: 'Masterchow', slug: 'masterchow' },
    { id: 'svg-1', name: 'Simple Viral Games', slug: 'simple-viral-games' },
    { id: 'noto-1', name: 'NOTO', slug: 'noto' },
  ];

  it('detects a company name even when the question splits it with a space ("master chow")', () => {
    const matches = detectCompaniesInText('top selling product of master chow', knownCompanies);
    expect(matches.map((c) => c.id)).toEqual(['mc-1']);
  });

  it('detects a hyphenated variant ("Master-Chow")', () => {
    const matches = detectCompaniesInText('what is Master-Chow burn?', knownCompanies);
    expect(matches.map((c) => c.id)).toEqual(['mc-1']);
  });

  it('is case-insensitive', () => {
    const matches = detectCompaniesInText('revenue for MASTERCHOW', knownCompanies);
    expect(matches.map((c) => c.id)).toEqual(['mc-1']);
  });

  it('does not false-positive match an unrelated multi-word company name', () => {
    const matches = detectCompaniesInText('top selling product of master chow', knownCompanies);
    expect(matches.map((c) => c.id)).not.toContain('svg-1');
  });

  it('resolveCompanyByName resolves a tool-call-style name with a space to the right company', () => {
    const match = resolveCompanyByName('master chow', knownCompanies);
    expect(match?.id).toBe('mc-1');
  });

  it('resolveCompanyByName tolerates a minor typo in a single-word name', () => {
    const match = resolveCompanyByName('Mastrchow', knownCompanies);
    expect(match?.id).toBe('mc-1');
  });

  it('routeQuestion resolves "master chow" to Masterchow even when session is scoped to a different company', () => {
    const res = routeQuestion('top selling product of master chow', {
      sessionCompanyId: 'svg-1',
      knownCompanies,
    });
    expect(res.companyId).toBe('mc-1');
    expect(res.detectedCompanyNames).toEqual(['Masterchow']);
  });
});
