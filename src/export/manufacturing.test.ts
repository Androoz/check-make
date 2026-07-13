import { describe, expect, it } from 'vitest';
import { packageFileName, serializeRecommendations } from './manufacturing';

describe('manufacturing package helpers', () => {
  it('uses an explicit slicer suffix for project packages', () => {
    expect(packageFileName('bracket.stl', 'generic')).toBe('bracket.check-make.3mf');
    expect(packageFileName('bracket.STL', 'bambu')).toBe('bracket.check-make.bambu.3mf');
  });

  it('passes only canonical setting keys and values to native adapters', () => {
    expect(JSON.parse(serializeRecommendations([{ setting: 'wall_loops', value: 5, reason: 'x', confidence: 1, ruleIds: ['U03'] }]))).toEqual([{ setting: 'wall_loops', value: 5 }]);
  });
});
