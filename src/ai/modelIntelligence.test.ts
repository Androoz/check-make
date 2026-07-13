import { describe, expect, it } from 'vitest';
import { localModelAnalysis } from './modelIntelligence';
import type { ModelAnalysis } from '../types';

const model: ModelAnalysis = {
  fileName: 'panel.stl', triangleCount: 12,
  boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 60, z: 4 }, size: { x: 100, y: 60, z: 4 } },
  heightMm: 4, bedContactAreaMm2: 6000, overhangAreaMm2: 20, overhangRatio: 0.01,
  confidence: { bedContact: 0.65, overhang: 0.78 }, orientations: [], orientationLabel: 'As imported',
};

describe('local model intelligence', () => {
  it('identifies flat model families without pretending to know exact semantics', () => {
    const result = localModelAnalysis(model);
    expect(result.objectName).toContain('plate');
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.questions).toHaveLength(3);
  });
});
