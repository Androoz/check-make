import type { OptimizationObjective, Recommendation } from '../types';

export type PlanObjective = Extract<OptimizationObjective, 'recommended' | 'time' | 'performance'>;

export interface PlanChange {
  setting: Recommendation['setting'];
  from: Recommendation['value'];
  to: Recommendation['value'];
}

export interface PlanAlternative {
  id: PlanObjective;
  label: string;
  description: string;
  available: boolean;
  changes: PlanChange[];
  limitation?: string;
}

const bySetting = (recommendations: Recommendation[]) =>
  new Map(recommendations.map(item => [item.setting, item.value]));

export function comparePlans(base: Recommendation[], candidate: Recommendation[]): PlanChange[] {
  const baseValues = bySetting(base);
  return candidate.flatMap(item => {
    const previous = baseValues.get(item.setting);
    return previous !== undefined && !Object.is(previous, item.value)
      ? [{ setting: item.setting, from: previous, to: item.value }]
      : [];
  });
}

export function buildPlanAlternatives(base: Recommendation[], faster: Recommendation[], performance: Recommendation[]): PlanAlternative[] {
  const fasterChanges = comparePlans(base, faster);
  const performanceChanges = comparePlans(base, performance);
  return [
    {
      id: 'recommended', label: 'Recommended', available: true, changes: [],
      description: 'The primary plan based on the model, intended use, and selected printer.',
    },
    {
      id: 'time', label: 'Faster', available: fasterChanges.length > 0, changes: fasterChanges,
      description: 'Re-weights time while preserving every original use and load requirement.',
      limitation: fasterChanges.length ? undefined : 'The current safety and geometry constraints leave no supported faster alternative.',
    },
    {
      id: 'performance', label: 'Strength / performance', available: performanceChanges.length > 0, changes: performanceChanges,
      description: 'Adds rule-backed structural margin while preserving the same base requirements.',
      limitation: performanceChanges.length ? 'Material upgrade candidates will be added after verified material profiles and printer gating.' : 'The Recommended plan already meets the current performance-rule margins.',
    },
  ];
}
