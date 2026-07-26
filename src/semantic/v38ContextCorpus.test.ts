import { describe, expect, it } from 'vitest';
import { deterministicSemanticInterpretation } from './deterministic';
import { v38ContextCorpus } from '../../validation/semantic/v38-context-corpus';

const input = (description: string) => ({
  description,
  language: 'en',
  dimensionsMm: { x: 40, y: 30, z: 10 },
  geometryObservations: ['Measured mesh. Geometry does not establish purpose.'],
  confirmedManufacturingContext: { facts: [] },
});

describe('Interpretation v3.8 parent-system corpus', () => {
  it('covers common product systems and explicit override cases', () => {
    expect(v38ContextCorpus.length).toBeGreaterThanOrEqual(25);
    expect(v38ContextCorpus.some(item => item.forbiddenFacts?.length)).toBe(true);
  });

  it.each(v38ContextCorpus)('$id', testCase => {
    const interpretation = deterministicSemanticInterpretation(input(testCase.text));
    const facts = new Set(interpretation.candidateFacts.map(fact => `${fact.key}:${fact.value}`));
    if (testCase.parent) expect(interpretation.parentSystem.value).toBe(testCase.parent);
    else expect(interpretation.parentSystem.certainty).toBe('unknown');
    (testCase.expectedFacts ?? []).forEach(expected => expect(facts, expected).toContain(expected));
    (testCase.forbiddenFacts ?? []).forEach(forbidden => expect(facts, forbidden).not.toContain(forbidden));
  });
});

