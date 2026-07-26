import { describe, expect, it } from 'vitest';
import { getPrinter } from '../printers/profiles';
import { ruleEvidenceById, rules } from '../rules/load';
import { evaluateRules } from '../rules/engine';
import type { ModelAnalysis, PlanPreference, Questionnaire, Recommendation } from '../types';
import { buildPlanPreferenceCandidates, planPreferenceDefinitions } from './preferences';

const analysis = {
  heightMm: 80,
  bedContactAreaMm2: 900,
  overhangRatio: 0.02,
  orientationLabel: 'As imported',
} as ModelAnalysis;

const questionnaire: Questionnaire = {
  purpose: 'Functional indoor bracket',
  properties: '',
  environment: 'indoor',
  load: 'static',
  impact: 'none',
  heat: 'normal',
  priority: 'strength',
  supportsAllowed: true,
  printerId: 'bambu-x1c',
  printer: getPrinter('bambu-x1c'),
};

const evaluate = (preference: PlanPreference): Recommendation[] => {
  const objective = planPreferenceDefinitions.find(item => item.id === preference)?.objective ?? 'recommended';
  return evaluateRules(rules, analysis, questionnaire, ruleEvidenceById, objective);
};

describe('plan preference pipeline', () => {
  it('builds the five supported profiles from one Balanced baseline', () => {
    const balanced = evaluate('balanced');
    const plans = Object.fromEntries(planPreferenceDefinitions.map(definition => [definition.id, evaluate(definition.id)])) as Record<PlanPreference, Recommendation[]>;
    const candidates = buildPlanPreferenceCandidates(balanced, plans, questionnaire);

    expect(candidates.map(candidate => candidate.id)).toEqual([
      'balanced',
      'faster',
      'visual-quality',
      'fit-accuracy',
      'structural-margin',
    ]);
    expect(candidates.find(candidate => candidate.id === 'faster')?.changes).toContainEqual({
      setting: 'layer_height',
      from: '0.20 mm',
      to: '0.24 mm',
    });
    expect(candidates.find(candidate => candidate.id === 'visual-quality')?.recommendations.find(item => item.setting === 'seam')?.value).toBe('Back');
    expect(candidates.find(candidate => candidate.id === 'fit-accuracy')?.recommendations.find(item => item.setting === 'wall_order')?.value).toBe('Outer/Inner');
    expect(candidates.find(candidate => candidate.id === 'structural-margin')?.recommendations.find(item => item.setting === 'wall_loops')?.value).toBe(5);
  });

  it('does not expose cost or weight as selectable preferences', () => {
    expect(planPreferenceDefinitions.map(definition => definition.id)).not.toEqual(expect.arrayContaining(['lower-cost', 'lower-weight']));
  });
});
