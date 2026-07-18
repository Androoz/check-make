import { describe, expect, it } from 'vitest';
import { chooseOptimizedPlans } from './optimizer';
import type { EvaluatedPlan } from './optimizer';

const plan = (material: EvaluatedPlan['material'], grams: number): EvaluatedPlan => ({
  material, recommendations: [], metrics: { source: 'orca-slicer', materialGrams: grams, filamentLengthMm: 1000, estimatedTimeSeconds: 600, materialVolumeCm3: 2.4, warnings: [] },
});

describe('constrained plan optimizer', () => {
  it('uses sliced mass and user prices rather than nominal mesh volume', () => {
    const result = chooseOptimizedPlans([plan('PETG', 100), plan('ASA', 82)], { PETG: 20, ASA: 40 });
    expect(result.lowerWeight?.material).toBe('ASA');
    expect(result.lowerCost).toBeUndefined();
  });
  it('selects lower cost only when both baseline and candidate have user prices', () => {
    const result = chooseOptimizedPlans([plan('PETG', 100), plan('ASA', 82)], { PETG: 40, ASA: 20 });
    expect(result.lowerCost?.material).toBe('ASA');
  });
});
