import type { Material, PlanMetrics, Recommendation } from '../types';

export interface EvaluatedPlan {
  material: Material;
  recommendations: Recommendation[];
  metrics: PlanMetrics;
  cost?: number;
}

export interface OptimizationOutcome {
  base: EvaluatedPlan;
  lowerCost?: EvaluatedPlan;
  lowerWeight?: EvaluatedPlan;
}

export function chooseOptimizedPlans(plans: EvaluatedPlan[], pricesPerKg: Partial<Record<Material, number>>): OptimizationOutcome {
  if (!plans.length) throw new Error('At least one sliced candidate is required.');
  const [base] = plans;
  const withCosts = plans.map(plan => {
    const price = pricesPerKg[plan.material];
    return { ...plan, cost: price && price > 0 ? plan.metrics.materialGrams / 1000 * price : undefined };
  });
  const lowerWeight = [...plans].sort((a, b) => a.metrics.materialGrams - b.metrics.materialGrams)[0];
  const priced = withCosts.filter((plan): plan is EvaluatedPlan & { cost: number } => plan.cost !== undefined).sort((a, b) => a.cost - b.cost);
  return {
    base: withCosts[0],
    lowerWeight: lowerWeight.metrics.materialGrams < base.metrics.materialGrams * 0.995 ? lowerWeight : undefined,
    lowerCost: priced.length && withCosts[0].cost !== undefined && priced[0].cost < withCosts[0].cost * 0.995 ? priced[0] : undefined,
  };
}
