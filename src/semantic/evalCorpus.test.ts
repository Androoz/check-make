import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { semanticFactVocabulary, type SemanticFactKey } from './types';

interface EvalCase {
  id: string;
  language: string;
  text: string;
  equivalentTo?: string;
  expectedCandidates?: Array<{ key: SemanticFactKey; value: string; certainty: string }>;
  forbiddenCandidates?: Array<{ key: SemanticFactKey; value: string }>;
  expectedConflictKeys?: SemanticFactKey[];
  expectedUnknown?: SemanticFactKey[];
}

describe('Local Semantic Interpreter v3 eval corpus', () => {
  const corpus = JSON.parse(readFileSync(new URL('../../validation/semantic/local-semantic-v1-corpus.json', import.meta.url), 'utf8')) as {
    schemaVersion: number;
    cases: EvalCase[];
  };

  it('covers English paraphrases, negation, correction, conflict, abstention, and extended service demands', () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.cases.length).toBeGreaterThanOrEqual(12);
    expect(new Set(corpus.cases.map(item => item.language))).toEqual(new Set(['en']));
    expect(corpus.cases.some(item => item.equivalentTo)).toBe(true);
    expect(corpus.cases.some(item => item.forbiddenCandidates?.length)).toBe(true);
    expect(corpus.cases.some(item => item.expectedConflictKeys?.length)).toBe(true);
    expect(corpus.cases.some(item => item.expectedCandidates?.length === 0 && item.expectedUnknown?.length)).toBe(true);
    expect(corpus.cases.some(item => item.expectedCandidates?.some(candidate => candidate.key === 'environment.service'))).toBe(true);
    expect(corpus.cases.some(item => item.expectedCandidates?.some(candidate => candidate.key === 'load.magnitude'))).toBe(true);
  });

  it('uses only the versioned vocabulary in scored expectations', () => {
    corpus.cases.forEach(testCase => {
      [...(testCase.expectedCandidates ?? []), ...(testCase.forbiddenCandidates ?? [])].forEach(candidate => {
        expect(Object.keys(semanticFactVocabulary)).toContain(candidate.key);
        expect(semanticFactVocabulary[candidate.key] as readonly string[]).toContain(candidate.value);
      });
      (testCase.expectedConflictKeys ?? []).forEach(key => expect(Object.keys(semanticFactVocabulary)).toContain(key));
      (testCase.expectedUnknown ?? []).forEach(key => expect(Object.keys(semanticFactVocabulary)).toContain(key));
    });
  });
});
