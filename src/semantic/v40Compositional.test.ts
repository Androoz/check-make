import { describe, expect, it } from 'vitest';
import {
  contextGraphConcepts,
  contextGraphRelations,
  interpretContextGraph,
} from '../intent/contextGraph';
import { promotedSemanticFacts, semanticQuestionAnswerId } from './confirmation';
import { deterministicSemanticInterpretation } from './deterministic';
import { v40CompositionalCorpus } from '../../validation/semantic/v40-compositional-corpus';

const input = (description: string) => ({
  description,
  language: 'en',
  dimensionsMm: { x: 40, y: 30, z: 10 },
  geometryObservations: ['Measured mesh. Geometry does not establish purpose.'],
  confirmedManufacturingContext: { facts: [] },
});

describe('Interpretation v4.0 broad compositional understanding', () => {
  it('supports every required node and relation kind with reusable parent concepts', () => {
    expect(new Set(contextGraphConcepts.map(concept => concept.kind))).toEqual(new Set([
      'object-role', 'activity', 'place', 'parent-system', 'mechanism',
      'service-environment', 'human-interaction',
    ]));
    expect(new Set(contextGraphRelations.map(edge => edge.relation))).toEqual(new Set([
      'is_a', 'part_of', 'used_in', 'used_for', 'typically_exposed_to',
      'typically_requires', 'may_carry', 'may_move_repeatedly',
    ]));
    expect(contextGraphConcepts.filter(concept => concept.kind === 'parent-system').length).toBeGreaterThanOrEqual(10);
  });

  it.each(v40CompositionalCorpus)('$id', testCase => {
    const interpretation = deterministicSemanticInterpretation(input(testCase.text));
    const facts = new Set(interpretation.candidateFacts.map(fact => `${fact.key}:${fact.value}`));
    if (testCase.parent) expect(interpretation.parentSystem.value).toBe(testCase.parent);
    (testCase.expectedFacts ?? []).forEach(expected => expect(facts, expected).toContain(expected));
    (testCase.forbiddenFacts ?? []).forEach(forbidden => expect(facts, forbidden).not.toContain(forbidden));
    if (testCase.evidenceFact) {
      const fact = interpretation.candidateFacts.find(candidate => `${candidate.key}:${candidate.value}` === testCase.evidenceFact);
      expect(fact?.evidencePath, `${testCase.id}:${testCase.evidenceFact}`).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'relation' }),
        expect.objectContaining({ kind: 'property' }),
      ]));
    }
  });

  it('reuses inherited properties across products without sentence templates', () => {
    const hinge = interpretContextGraph('Hinge for a camping chair');
    const spacer = interpretContextGraph('Spacer mounted to a folding camping chair');
    expect(hinge?.facts.find(fact => fact.key === 'failure.consequence')?.evidencePath)
      .toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'inheritance', value: 'camping-chair->human-supporting-furniture' })]));
    expect(spacer?.facts.find(fact => fact.key === 'failure.consequence')?.evidencePath)
      .toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'inheritance', value: 'camping-chair->human-supporting-furniture' })]));
  });

  it('keeps grouped graph hypotheses behind the existing confirmation gate', () => {
    const description = 'Protective housing for an outdoor security camera';
    const interpretation = deterministicSemanticInterpretation(input(description));
    expect(promotedSemanticFacts(interpretation, description)).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ key: 'environment.exposure', value: 'uv' }),
    ]));
    const promoted = promotedSemanticFacts(interpretation, description, {
      [semanticQuestionAnswerId('confirm-outdoor-service')]: 'confirmed',
    });
    expect(promoted).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'environment.location', value: 'outdoor', promotion: 'explicit-user-statement' }),
      expect.objectContaining({ key: 'environment.exposure', value: 'uv', promotion: 'user-confirmed' }),
      expect.objectContaining({ key: 'environment.exposure', value: 'moisture', promotion: 'user-confirmed' }),
    ]));
  });
});
