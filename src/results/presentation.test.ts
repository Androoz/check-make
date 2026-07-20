import { describe, expect, it } from 'vitest';
import type { Recommendation } from '../types';
import { groupRecommendations, recommendationExplanation, summarizeResult } from './presentation';

const recommendation = (setting: Recommendation['setting'], value: Recommendation['value']): Recommendation => ({
  setting, value, reason: 'Because.', ruleIds: ['rule'], matchedRuleIds: ['rule'], evidenceLevel: 'C', validationStatus: 'provisional', trace: [],
});

const recommendations = [
  recommendation('material', 'PETG'), recommendation('nozzle_temperature', 245),
  recommendation('orientation', 'Largest face down'), recommendation('wall_loops', 4),
  recommendation('infill_percent', 25), recommendation('support', false), recommendation('brim', 6),
  recommendation('layer_height', 0.2), recommendation('seam', 'rear'),
];

describe('result presentation', () => {
  it('shows a compact essential plan without dropping the full plan', () => {
    expect(groupRecommendations(recommendations, 'essential').flatMap(group => group.recommendations)).toHaveLength(7);
    expect(groupRecommendations(recommendations, 'all').flatMap(group => group.recommendations)).toHaveLength(9);
  });

  it('always requires review and makes assumptions or warnings more prominent', () => {
    expect(summarizeResult([{ id: 'load' }], []).reviewState).toBe('attention');
    expect(summarizeResult([], [{ severity: 'warning', message: 'Too hot.' }]).warningCount).toBe(1);
    expect(summarizeResult([], []).reviewState).toBe('standard');
    expect(summarizeResult([], []).eyebrow).toBe('REVIEW REQUIRED');
  });

  it('explains temperatures as material-dependent starting values', () => {
    const nozzle = recommendations.find(item => item.setting === 'nozzle_temperature')!;
    expect(recommendationExplanation(nozzle, recommendations)).toContain('recommended PETG material family');
    expect(recommendationExplanation(nozzle, recommendations)).toContain('filament manufacturer');
    expect(recommendationExplanation(recommendations[0], recommendations)).toBe('Because.');
  });
});
