import { describe, expect, it } from 'vitest';
import { getPrinter } from '../printers/profiles';
import { ruleEvidenceById, rules } from '../rules/load';
import { evaluateRules } from '../rules/engine';
import type { ModelAnalysis, PlanPreference, Questionnaire, Recommendation } from '../types';
import { buildPlanPreferenceCandidates, comparePlanRecommendations, planPreferenceDefinitions } from './preferences';
import { emptyManufacturingIntent } from '../intent/manufacturingIntent';

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
  it('builds the five supported profiles from one deterministic baseline', () => {
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
    expect(candidates.find(candidate => candidate.id === 'fit-accuracy')?.recommendations.find(item => item.setting === 'layer_height')?.value).toBe('0.20 mm');
    expect(candidates.find(candidate => candidate.id === 'fit-accuracy')?.recommendations.find(item => item.setting === 'wall_order')?.value).toBe('Outer/Inner');
    expect(candidates.find(candidate => candidate.id === 'structural-margin')?.recommendations.find(item => item.setting === 'wall_loops')?.value).toBe(5);
  });

  it('does not expose cost or weight as selectable preferences', () => {
    expect(planPreferenceDefinitions.map(definition => definition.id)).not.toEqual(expect.arrayContaining(['lower-cost', 'lower-weight']));
  });

  it('uses finer layers only for a confirmed Z or surface concern', () => {
    const value = (criticalDimension: Questionnaire['criticalDimension']) =>
      evaluateRules(rules, analysis, { ...questionnaire, criticalDimension }, ruleEvidenceById)
        .find(item => item.setting === 'layer_height');
    expect(value(undefined)?.value).toBe('0.20 mm');
    expect(value('unknown')?.value).toBe('0.20 mm');
    expect(value('xy')?.value).toBe('0.20 mm');
    expect(value('z')).toMatchObject({
      value: '0.16 mm',
      ruleIds: ['Q11'],
      inputEvidenceIds: ['decision:critical-dimension:z'],
    });
    expect(value('surface')).toMatchObject({
      value: '0.16 mm',
      ruleIds: ['Q12'],
      inputEvidenceIds: ['decision:critical-dimension:surface'],
    });
  });

  it('keeps Faster selectable but unchanged when a critical dimension prevents its changes', () => {
    const fitQuestionnaire = { ...questionnaire, criticalDimension: 'z' as const };
    const balanced = evaluateRules(rules, analysis, fitQuestionnaire, ruleEvidenceById);
    const plans = Object.fromEntries(planPreferenceDefinitions.map(definition => [
      definition.id,
      evaluateRules(rules, analysis, fitQuestionnaire, ruleEvidenceById, definition.objective),
    ])) as Record<PlanPreference, Recommendation[]>;
    expect(buildPlanPreferenceCandidates(balanced, plans, fitQuestionnaire).find(candidate => candidate.id === 'faster'))
      .toMatchObject({
        available: true,
        recommendations: balanced,
        changes: [],
        blockers: [expect.stringContaining('critical dimension')],
      });
  });

  it('keeps confirmed Z and surface resolution when Fit & accuracy is selected', () => {
    for (const criticalDimension of ['z', 'surface'] as const) {
      const fitQuestionnaire = { ...questionnaire, criticalDimension };
      const balanced = evaluateRules(rules, analysis, fitQuestionnaire, ruleEvidenceById);
      const fit = evaluateRules(rules, analysis, fitQuestionnaire, ruleEvidenceById, 'fit-accuracy');
      expect(balanced.find(item => item.setting === 'layer_height')?.value).toBe('0.16 mm');
      expect(fit.find(item => item.setting === 'layer_height')).toMatchObject({
        value: '0.16 mm',
        ruleIds: [criticalDimension === 'z' ? 'Q11' : 'Q12'],
      });
      expect(comparePlanRecommendations(balanced, fit)).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ setting: 'layer_height' }),
      ]));
    }
  });

  it('keeps Faster selectable without weakening a designer-stated load-critical baseline', () => {
    const loadCritical = structuredClone(questionnaire);
    loadCritical.manufacturingIntent = emptyManufacturingIntent(loadCritical);
    loadCritical.manufacturingIntent.failureConsequence = {
      value: 'safety-critical',
      status: 'user-stated',
      confidence: 1,
      evidenceIds: ['facet:failure-safety:1'],
    };
    const balanced = evaluateRules(rules, analysis, loadCritical, ruleEvidenceById);
    const plans = Object.fromEntries(planPreferenceDefinitions.map(definition => [
      definition.id,
      evaluateRules(rules, analysis, loadCritical, ruleEvidenceById, definition.objective),
    ])) as Record<PlanPreference, Recommendation[]>;
    const faster = buildPlanPreferenceCandidates(balanced, plans, loadCritical).find(candidate => candidate.id === 'faster');
    expect(faster).toMatchObject({ available: true, recommendations: balanced, changes: [] });
    expect(faster?.blockers.join(' ')).toContain('designer-stated load-critical use');
  });
});
