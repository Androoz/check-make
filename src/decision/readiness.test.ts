import { describe, expect, it } from 'vitest';
import { localModelAnalysis, refineLocalIntelligence } from '../ai/modelIntelligence';
import type { ModelAnalysis } from '../types';
import { assessDecisionReadiness } from './readiness';

const model: ModelAnalysis = {
  fileName: 'hook.stl', triangleCount: 12, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 20, z: 10 }, size: { x: 30, y: 20, z: 10 } },
  heightMm: 10, bedContactAreaMm2: 600, overhangAreaMm2: 0, overhangRatio: 0, confidence: { bedContact: .8, overhang: .8 }, orientations: [], orientationLabel: 'As imported',
  metadata: { format: 'stl', encoding: 'ascii', clues: [] }, geometryRisk: { boundingFootprintAreaMm2: 600, bedCoverageRatio: 1, heightToContactWidthRatio: .5, surfaceCentroidOffsetMm: 0, surfaceCentroidOffsetRatio: 0, overhangRegionCount: 0, largestOverhangRegionAreaMm2: 0, largestOverhangRegionSpanMm: 0, overhangRegions: [], bridgeClassification: 'not-evaluated' },
};

describe('decision readiness', () => {
  it('blocks a recommendation while consequential requirements are unresolved', () => {
    const result = assessDecisionReadiness(localModelAnalysis(model));
    expect(result.requirements).toBe('needs-input'); expect(result.gaps.map(gap => gap.id)).toContain('purpose');
  });
  it('allows the conservative plan after structured user answers close every applicable requirement', () => {
    const refined = refineLocalIntelligence(localModelAnalysis(model), { purpose: 'Indoor wall hook', priority: 'strength', load: 'static', impact: 'none', environment: 'indoor', heat: 'normal' });
    const result = assessDecisionReadiness(refined);
    expect(result.requirements).toBe('ready'); expect(result.conservativePlan).toBe('ready');
    expect(result.processReductions).toBe('unsupported');
  });
});
