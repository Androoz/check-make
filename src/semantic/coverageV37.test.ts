import { describe, expect, it } from 'vitest';
import { interpretSemanticRelations, semanticObjectFamilies } from '../intent/semanticRelations';
import { englishV37Corpus } from '../../validation/semantic/english-v37-corpus';
import { deterministicSemanticInterpretation } from './deterministic';
import type { SemanticInterpretationInput } from './types';

const input = (description: string): SemanticInterpretationInput => ({
  description,
  language: 'en',
  dimensionsMm: { x: 40, y: 30, z: 20 },
  geometryObservations: ['The measured mesh is 40 × 30 × 20 mm. Geometry does not establish intended use.'],
  confirmedManufacturingContext: { facts: [] },
});

describe('Interpretation v3.7 English coverage', () => {
  it('covers at least 100 phrasings across common functional object families', () => {
    expect(englishV37Corpus.length).toBeGreaterThanOrEqual(100);
    expect(new Set(englishV37Corpus.map(item => item.family)).size).toBeGreaterThanOrEqual(20);
    expect(semanticObjectFamilies.length).toBeGreaterThanOrEqual(20);
  });

  it('extracts the intended family and relation from the full deterministic corpus', () => {
    englishV37Corpus.forEach(testCase => {
      const result = interpretSemanticRelations(testCase.text);
      expect(result.identity?.value, testCase.id).toBe(testCase.expectedIdentity);
      expect(result.function?.value, testCase.id).toBe(testCase.expectedFunction);
      expect(result.function?.explicit, testCase.id).toBe(true);
    });
  });

  it('handles corrections, service exposure, quantified load, wear, and cold without keyword leakage', () => {
    const correction = deterministicSemanticInterpretation(input(
      'Correction: this is not a holder. It is a protective cap that protects the connector indoors.',
    ));
    expect(correction.objectIdentity.value).toBe('protective cap or plug');
    expect(correction.candidateFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'primary_function', value: 'protect', certainty: 'explicit' }),
      expect.objectContaining({ key: 'environment.location', value: 'indoor', certainty: 'explicit' }),
    ]));
    expect(correction.candidateFacts).not.toContainEqual(expect.objectContaining({ key: 'primary_function', value: 'hold' }));

    const service = deterministicSemanticInterpretation(input(
      'A dishwasher rack clip carrying 4 kg, washed in a dishwasher, sliding against the rail, and used down to -20 C.',
    ));
    expect(service.candidateFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'environment.service', value: 'dishwasher' }),
      expect.objectContaining({ key: 'load.magnitude', value: 'quantified' }),
      expect.objectContaining({ key: 'mechanical.wear', value: 'sliding' }),
      expect.objectContaining({ key: 'thermal.exposure', value: 'freezing' }),
    ]));
  });
});

