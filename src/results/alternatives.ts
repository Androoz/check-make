import type { Recommendation } from '../types';
import type { PlanPreferenceCandidate } from '../planning/preferences';

export interface PlanChange {
  setting: Recommendation['setting'];
  from: Recommendation['value'];
  to: Recommendation['value'];
}

export interface PlanAlternative {
  id: PlanPreferenceCandidate['id'];
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
    return !Object.is(previous, item.value)
      ? [{ setting: item.setting, from: previous ?? 'Not set', to: item.value }]
      : [];
  });
}

export const buildPlanAlternatives = (candidates: PlanPreferenceCandidate[]): PlanAlternative[] =>
  candidates.map(candidate => ({
    id: candidate.id,
    label: candidate.label,
    description: candidate.description,
    available: candidate.available,
    changes: candidate.changes,
    limitation: candidate.blockers[0],
  }));
