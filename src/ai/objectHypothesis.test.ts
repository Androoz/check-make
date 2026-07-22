import { describe, expect, it } from 'vitest';
import referenceCorpus from '../../validation/interpretation/object-family-reference.v1.json';
import type { ModelAnalysis } from '../types';
import { applyObjectHypothesisAnswers, buildObjectHypothesis } from './objectHypothesis';

function modelFor(size: [number, number, number], fileName = 'model.stl'): ModelAnalysis {
  const [x, y, z] = size;
  return {
    fileName,
    triangleCount: 12,
    boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x, y, z }, size: { x, y, z } },
    heightMm: z,
    bedContactAreaMm2: x * y,
    overhangAreaMm2: 0,
    overhangRatio: 0,
    confidence: { bedContact: 0.7, overhang: 0.8 },
    orientations: [],
    orientationLabel: 'As imported',
    metadata: { format: 'stl', encoding: 'ascii', clues: [] },
    geometryRisk: {
      boundingFootprintAreaMm2: x * y, bedCoverageRatio: 1, heightToContactWidthRatio: null,
      surfaceCentroidOffsetMm: null, surfaceCentroidOffsetRatio: null, overhangRegionCount: 0,
      largestOverhangRegionAreaMm2: 0, largestOverhangRegionSpanMm: 0, overhangRegions: [], bridgeClassification: 'not-evaluated',
    },
    topology: { componentCount: 1, boundaryEdgeCount: 0, nonManifoldEdgeCount: 0, degenerateTriangleCount: 0, watertight: true },
  };
}

describe('v3.3 object hypothesis', () => {
  it.each(referenceCorpus.cases)('keeps $id inside its allowed broad identity range', reference => {
    const result = buildObjectHypothesis(modelFor(reference.sizeMm as [number, number, number]), reference.context);
    expect(result.identity.value).toBe(reference.expectedIdentity);
    expect(result.identity.confidence).toBeGreaterThanOrEqual(reference.minimumConfidence);
    expect(result.identity.status).toBe(reference.expectedStatus);
  });

  it('records geometry, filename, user language, and AI as separate provenance', () => {
    const model = modelFor([100, 70, 4], 'wall_bracket.stl');
    model.metadata.clues = [{ source: 'file-name', value: 'wall bracket' }];
    const result = buildObjectHypothesis(
      model,
      'Protective cover with a snap fit, visible face, and repeated bending load.',
      { objectName: 'equipment guard', likelyPurpose: 'protects a machine', evidence: ['Vision shows a shell-like form.'] },
    );
    expect(result.identity).toMatchObject({ value: 'protective cover or enclosure', status: 'user-stated' });
    expect(result.evidence.map(item => item.source)).toEqual(expect.arrayContaining([
      'geometry-observation', 'topology-observation', 'filename-clue', 'user-statement', 'language-match', 'ai-hypothesis',
    ]));
    expect(result.features.map(feature => feature.label)).toEqual(expect.arrayContaining(['Likely mating feature', 'Visible surface', 'Load-bearing relevance']));
  });

  it('does not silently confirm consequential AI hypotheses', () => {
    const result = buildObjectHypothesis(modelFor([40, 40, 40]), '', {
      objectName: 'bearing mount', likelyPurpose: 'holds a rotating shaft',
    });
    expect(result.identity.status).toBe('hypothesized');
    expect(result.purpose).toMatchObject({ status: 'hypothesized', consequential: true });
    const confirmed = applyObjectHypothesisAnswers(result, { 'object-purpose': 'confirmed' });
    expect(confirmed.purpose).toMatchObject({ status: 'confirmed', confidence: 1 });
  });

  it('stores a user-supplied missing purpose as project-specific confirmation', () => {
    const result = buildObjectHypothesis(modelFor([40, 40, 40]), 'Outdoor part in direct sun.');
    const confirmed = applyObjectHypothesisAnswers(result, { 'object-purpose-description': 'Holds a distance sensor on a fence.' });
    expect(confirmed.purpose).toMatchObject({ value: 'Holds a distance sensor on a fence.', status: 'confirmed', confidence: 1 });
  });

  it('states unsupported local feature analysis as limits instead of findings', () => {
    const result = buildObjectHypothesis(modelFor([70, 40, 20]), 'General replacement part.');
    expect(result.limits.join(' ')).toMatch(/Holes, threads/);
    expect(result.limits.join(' ')).toMatch(/wall thickness/);
    expect(result.limits.join(' ')).toMatch(/Load paths/);
    expect(result.features).toHaveLength(0);
  });
});
