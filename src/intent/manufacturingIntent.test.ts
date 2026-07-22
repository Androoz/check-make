import { describe, expect, it } from 'vitest';
import { localModelAnalysis, refineLocalIntelligence } from '../ai/modelIntelligence';
import type { ModelAnalysis } from '../types';
import { buildManufacturingIntent, intentFactUsable } from './manufacturingIntent';

const model: ModelAnalysis = {
  fileName: 'cover.stl', triangleCount: 12,
  boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 70, z: 15 }, size: { x: 100, y: 70, z: 15 } },
  heightMm: 15, bedContactAreaMm2: 7000, overhangAreaMm2: 0, overhangRatio: 0,
  confidence: { bedContact: .8, overhang: .8 }, orientations: [], orientationLabel: 'As imported',
  metadata: { format: 'stl', encoding: 'ascii', clues: [] },
  geometryRisk: { boundingFootprintAreaMm2: 7000, bedCoverageRatio: 1, heightToContactWidthRatio: null, surfaceCentroidOffsetMm: null, surfaceCentroidOffsetRatio: null, overhangRegionCount: 0, largestOverhangRegionAreaMm2: 0, largestOverhangRegionSpanMm: 0, overhangRegions: [], bridgeClassification: 'not-evaluated' },
};

describe('manufacturing intent v3.4', () => {
  it('keeps specialized Context facts in one provenance-aware contract', () => {
    const context = 'Long-term protective cover in direct sun and rain from 20-65 C. It has a snap fit, a visible face, repeated bending load, is safety-critical, and should have low weight.';
    const result = localModelAnalysis(model, context).manufacturingIntent!;
    expect(result.identity).toMatchObject({ value: 'protective cover or enclosure', status: 'user-stated' });
    expect(result.function).toMatchObject({ value: 'protects or encloses', status: 'user-stated' });
    expect(result.environment.uvExposure.value).toBe(true);
    expect(result.environment.moistureExposure.value).toBe(true);
    expect(result.thermal.explicitRangeC.value).toEqual({ minimum: 20, maximum: 65 });
    expect(result.mechanical.loadDirections.value).toContain('bending');
    expect(result.interface.fitType.value).toBe('snap');
    expect(result.interface.criticalSurfaces.value).toContain('visible');
    expect(result.failureConsequence.value).toBe('safety-critical');
    expect(result.intendedLifetime.value).toBe('long-term');
    expect(result.preferences.lowerWeight.value).toBe(true);
    expect(result.compatibility).toMatchObject({ structural: true, fitCritical: true, weatherExposed: true, heatExposed: true });
    expect(result.evidence.some(item => item.source === 'language-match')).toBe(true);
  });

  it('promotes structured user decisions without losing Context evidence', () => {
    const initial = { ...localModelAnalysis(model, 'Outdoor bracket in direct sun that supports a shelf.'), userEvidence: ['Outdoor bracket in direct sun that supports a shelf.'] };
    const refined = refineLocalIntelligence(initial, {
      priority: 'strength', load: 'static', impact: 'none', environment: 'outdoor', heat: 'warm', supportsAllowed: 'true',
    });
    const intent = refined.manufacturingIntent!;
    expect(intent.environment.location).toMatchObject({ value: 'outdoor', status: 'confirmed' });
    expect(intent.mechanical.loadMode).toMatchObject({ value: 'static', status: 'confirmed' });
    expect(intent.preferences.priority).toMatchObject({ value: 'strength', status: 'confirmed' });
    expect(intentFactUsable(intent.environment.location)).toBe(true);
    expect(intent.evidence.some(item => item.source === 'user-confirmation')).toBe(true);
  });

  it('keeps mutually incompatible fit descriptions conflicted', () => {
    const intelligence = localModelAnalysis(model, 'Adapter with both a press fit and sliding fit.');
    const intent = buildManufacturingIntent('Adapter with both a press fit and sliding fit.', intelligence.requirements, intelligence.objectHypothesis);
    expect(intent.interface.fitType).toMatchObject({ value: 'unknown', status: 'conflicted' });
    expect(intentFactUsable(intent.interface.fitType)).toBe(false);
  });
});
