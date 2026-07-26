import { describe, expect, it } from 'vitest';
import type { ModelAnalysis } from '../types';
import { localModelAnalysis } from './modelIntelligence';
import { describeObjectUnderstanding } from './objectUnderstanding';

const model: ModelAnalysis = {
  fileName: 'parasol-spacer.stl',
  triangleCount: 12,
  boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 61, y: 61, z: 225 }, size: { x: 61, y: 61, z: 225 } },
  heightMm: 225,
  bedContactAreaMm2: 2500,
  overhangAreaMm2: 0,
  overhangRatio: 0,
  confidence: { bedContact: 0.7, overhang: 0.8 },
  orientations: [],
  orientationLabel: 'As imported',
  metadata: { format: 'stl', encoding: 'ascii', clues: [] },
};

describe('user-facing object understanding', () => {
  it('turns terse Context into a clear, reviewable explanation', () => {
    const intelligence = localModelAnalysis(model, 'Parasol base distance for outside use.');
    expect(describeObjectUnderstanding(intelligence)).toBe(
      'Check Make understands this as a parasol base spacer that creates or maintains spacing. Because it will be used outdoors, the print plan will account for weather, sunlight, moisture, and temperature exposure.',
    );
  });

  it('states uncertainty instead of blocking analysis when function is missing', () => {
    const intelligence = localModelAnalysis(model, 'Replacement object used outdoors.');
    expect(describeObjectUnderstanding(intelligence)).toContain('its exact function still needs your review');
  });
});
