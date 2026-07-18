import { describe, expect, it } from 'vitest';
import type { Recommendation } from '../types';
import { buildPlanAlternatives, comparePlans } from './alternatives';

const recommendation = (setting: Recommendation['setting'], value: Recommendation['value']): Recommendation => ({
  setting, value, reason: 'test', ruleIds: ['rule'], matchedRuleIds: ['rule'], evidenceLevel: 'C', validationStatus: 'provisional', trace: [],
});

describe('plan alternatives', () => {
  it('reports only settings that actually change', () => {
    const base = [recommendation('layer_height', '0.20 mm'), recommendation('wall_loops', 4)];
    const faster = [recommendation('layer_height', '0.24 mm'), recommendation('wall_loops', 4)];
    expect(comparePlans(base, faster)).toEqual([{ setting: 'layer_height', from: '0.20 mm', to: '0.24 mm' }]);
  });

  it('exposes only objectives that can be evaluated without launching an external slicer', () => {
    const alternatives = buildPlanAlternatives([], [recommendation('layer_height', '0.24 mm')], [recommendation('wall_loops', 5)]);
    expect(alternatives.map(item => item.id)).toEqual(['recommended', 'time', 'performance']);
  });

  it('does not offer a faster plan when the rules produce no change', () => {
    const base = [recommendation('layer_height', '0.24 mm')];
    expect(buildPlanAlternatives(base, base, [recommendation('wall_loops', 5)]).find(item => item.id === 'time')?.available).toBe(false);
  });

  it('offers performance only when the rule-backed plan changes', () => {
    const base = [recommendation('wall_loops', 4)];
    const performance = [recommendation('wall_loops', 5)];
    expect(buildPlanAlternatives(base, base, performance).find(item => item.id === 'performance')).toMatchObject({ available: true, changes: [{ setting: 'wall_loops', from: 4, to: 5 }] });
  });
});
