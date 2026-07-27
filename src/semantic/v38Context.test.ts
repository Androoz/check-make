import { describe, expect, it } from 'vitest';
import { localModelAnalysis } from '../ai/modelIntelligence';
import { intentFactUsable } from '../intent/manufacturingIntent';
import type { ModelAnalysis } from '../types';
import { promotedSemanticFacts } from './confirmation';
import { deterministicSemanticInterpretation } from './deterministic';

const model: ModelAnalysis = {
  fileName: 'spacer.stl',
  triangleCount: 120,
  boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 30, z: 8 }, size: { x: 30, y: 30, z: 8 } },
  heightMm: 8,
  bedContactAreaMm2: 700,
  overhangAreaMm2: 0,
  overhangRatio: 0,
  confidence: { bedContact: 0.9, overhang: 0.9 },
  orientationLabel: 'As imported',
  orientations: [],
  metadata: { format: 'stl', encoding: 'ascii', clues: [] },
  geometryRisk: {
    boundingFootprintAreaMm2: 900, bedCoverageRatio: 0.78, heightToContactWidthRatio: 0.27,
    surfaceCentroidOffsetMm: 0, surfaceCentroidOffsetRatio: 0, overhangRegionCount: 0,
    largestOverhangRegionAreaMm2: 0, largestOverhangRegionSpanMm: 0,
    overhangRegions: [], bridgeClassification: 'not-evaluated',
  },
};

const semanticInput = (description: string) => ({
  description,
  language: 'en',
  dimensionsMm: model.boundingBox.size,
  geometryObservations: ['Measured spacer-like mesh; geometry does not establish use.'],
  confirmedManufacturingContext: { facts: [] },
});

describe('Interpretation v3.8 parent-system integration', () => {
  it('prefills reviewable camping-chair assumptions without confirming them into manufacturing intent', () => {
    const result = localModelAnalysis(model, 'Spacer for camping chair');
    expect(result.semanticInterpretation?.parentSystem).toMatchObject({
      value: 'camping or folding chair',
      certainty: 'strong_hypothesis',
    });
    expect(result.requirements).toMatchObject({
      environment: { value: 'outdoor', status: 'assumed' },
      load: { value: 'cyclic', status: 'assumed' },
      impact: { value: 'medium', status: 'assumed' },
      priority: { value: 'strength', status: 'assumed' },
    });
    expect(result.questions.map(question => question.id)).not.toContain('semantic:failure.consequence:safety_critical');
    expect(intentFactUsable(result.manufacturingIntent!.environment.location)).toBe(false);
    expect(intentFactUsable(result.manufacturingIntent!.failureConsequence)).toBe(false);
  });

  it('lets explicit Context override parent-product world knowledge', () => {
    const interpretation = deterministicSemanticInterpretation(semanticInput(
      'Spacer for a camping chair, used indoors and not load-bearing.',
    ));
    expect(interpretation.candidateFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'environment.location', value: 'indoor', certainty: 'explicit' }),
      expect.objectContaining({ key: 'load.role', value: 'non_load_bearing', certainty: 'explicit' }),
    ]));
    expect(interpretation.candidateFacts).not.toContainEqual(expect.objectContaining({
      key: 'environment.location', value: 'outdoor',
    }));
    expect(interpretation.candidateFacts).not.toContainEqual(expect.objectContaining({
      key: 'load.role', value: 'load_bearing',
    }));
  });

  it('keeps every parent-system assumption behind the semantic confirmation gate', () => {
    const description = 'Spacer for camping chair';
    const interpretation = deterministicSemanticInterpretation(semanticInput(description));
    expect(promotedSemanticFacts(interpretation, description)).toEqual([]);
  });
});
