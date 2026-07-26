import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateContextCorpus } from './contextEvaluation';
import type { ContextCorpus } from './contextEvaluation';

const corpus = JSON.parse(readFileSync(new URL('../../validation/interpretation/context-corpus.v1.json', import.meta.url), 'utf8')) as ContextCorpus;

describe('Interpretation v3 context corpus', () => {
  const report = evaluateContextCorpus(corpus);

  it('uses a versioned English-only corpus', () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.corpusVersion).toMatch(/^1\./);
    expect(corpus.cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(corpus.cases.map(item => item.language))).toEqual(new Set(['en']));
  });

  it('has no false confirmations in the baseline corpus', () => {
    const failures = report.results.filter(result => result.falseConfirmations.length);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect(report.falseConfirmationRate).toBe(0);
  });

  it('measures coverage separately from safe abstention', () => {
    const failures = report.results.filter(result => result.missedConfirmations.length || result.missingIssues.length || result.missingFacets.length || result.unexpectedFacets.length || result.missingLanguageCues.length || result.missingCorrections.length);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect(report.confirmationCoverage).toBe(1);
    expect(report.unknownAbstentionRate).toBe(1);
    expect(report.issueCoverage).toBe(1);
    expect(report.facetCoverage).toBe(1);
    expect(report.languageCueCoverage).toBe(1);
    expect(report.correctionCoverage).toBe(1);
  });
});
