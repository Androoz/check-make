import type { OptimizationObjective, PlanPreference, Questionnaire, Recommendation } from '../types';

export interface PlanPreferenceDefinition {
  id: PlanPreference;
  label: string;
  shortDescription: string;
  objective: OptimizationObjective;
}

export const planPreferenceDefinitions: PlanPreferenceDefinition[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    shortDescription: 'Check Make balances reliability, printability, and the confirmed part requirements.',
    objective: 'recommended',
  },
  {
    id: 'faster',
    label: 'Faster',
    shortDescription: 'Prefer shorter print time when detail, fit, and material constraints permit it.',
    objective: 'time',
  },
  {
    id: 'visual-quality',
    label: 'Visual quality',
    shortDescription: 'Prefer finer layers, controlled seams, and a slower surface-oriented process.',
    objective: 'visual-quality',
  },
  {
    id: 'fit-accuracy',
    label: 'Fit & accuracy',
    shortDescription: 'Prefer dimensional stability and a controlled outer-wall process.',
    objective: 'fit-accuracy',
  },
  {
    id: 'structural-margin',
    label: 'Structural margin',
    shortDescription: 'Add rule-backed wall and internal-structure margin without claiming structural simulation.',
    objective: 'performance',
  },
];

export const isPlanPreference = (value: unknown): value is PlanPreference =>
  planPreferenceDefinitions.some(definition => definition.id === value);

export const planPreferenceDefinition = (preference: PlanPreference) =>
  planPreferenceDefinitions.find(definition => definition.id === preference) ?? planPreferenceDefinitions[0];

export interface PlanPreferenceCandidate {
  id: PlanPreference;
  label: string;
  description: string;
  recommendations: Recommendation[];
  changes: {
    setting: Recommendation['setting'];
    from: Recommendation['value'];
    to: Recommendation['value'];
  }[];
  available: boolean;
  blockers: string[];
}

const valueBySetting = (recommendations: Recommendation[]) =>
  new Map(recommendations.map(recommendation => [recommendation.setting, recommendation.value]));

export function comparePlanRecommendations(base: Recommendation[], candidate: Recommendation[]) {
  const baseValues = valueBySetting(base);
  return candidate.flatMap(recommendation => {
    const previous = baseValues.get(recommendation.setting);
    return !Object.is(previous, recommendation.value)
      ? [{ setting: recommendation.setting, from: previous ?? 'Not set', to: recommendation.value }]
      : [];
  });
}

function preferenceBlockers(preference: PlanPreference, questionnaire: Questionnaire): string[] {
  const priority = questionnaire.priority;
  if (
    preference === 'faster'
    && questionnaire.manufacturingIntent?.failureConsequence.value === 'safety-critical'
    && ['confirmed', 'user-stated'].includes(questionnaire.manufacturingIntent.failureConsequence.status)
  ) {
    return ['A designer-stated load-critical use keeps the Balanced process baseline. Faster remains unavailable unless that Context requirement is removed.'];
  }
  if (preference === 'faster' && questionnaire.manufacturingIntent?.compatibility.fitCritical) {
    return ['A confirmed fit-critical interface retains the finer Balanced process settings.'];
  }
  if (preference === 'faster' && questionnaire.criticalDimension && questionnaire.criticalDimension !== 'unknown') {
    return ['A confirmed critical dimension retains the fit-controlled process baseline.'];
  }
  if (preference === 'faster' && priority === 'flexibility') {
    return ['Flexible-material speed depends on a product-specific feed profile that Check Make has not verified.'];
  }
  if ((preference === 'fit-accuracy' || preference === 'structural-margin') && priority === 'flexibility') {
    return ['The confirmed flexible-function requirement does not support this rigid-part optimization profile.'];
  }
  return [];
}

export function buildPlanPreferenceCandidates(
  base: Recommendation[],
  plans: Record<PlanPreference, Recommendation[]>,
  questionnaire: Questionnaire,
): PlanPreferenceCandidate[] {
  return planPreferenceDefinitions.map(definition => {
    const blockers = definition.id === 'balanced' ? [] : preferenceBlockers(definition.id, questionnaire);
    const recommendations = blockers.length ? base : plans[definition.id];
    const changes = definition.id === 'balanced' ? [] : comparePlanRecommendations(base, recommendations);
    return {
      id: definition.id,
      label: definition.label,
      description: definition.shortDescription,
      recommendations,
      changes,
      available: true,
      blockers,
    };
  });
}
