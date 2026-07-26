import { describe, expect, it } from 'vitest';
import { getPrinter } from '../printers/profiles';
import { buildPlanPreferenceCandidates } from '../planning/preferences';
import { emptyManufacturingIntent } from '../intent/manufacturingIntent';
import type { PlanPreference, Questionnaire, Recommendation } from '../types';
import { buildPlanAlternatives, comparePlans } from './alternatives';

const recommendation = (setting: Recommendation['setting'], value: Recommendation['value']): Recommendation => ({
  setting, value, reason: 'test', ruleIds: ['rule'], matchedRuleIds: ['rule'], evidenceLevel: 'C', validationStatus: 'provisional', trace: [],
});

describe('plan alternatives', () => {
  const questionnaire = (priority: Questionnaire['priority'] = 'strength'): Questionnaire => ({
    purpose: 'Functional bracket',
    properties: '',
    environment: 'indoor',
    load: 'static',
    impact: 'none',
    heat: 'normal',
    priority,
    supportsAllowed: true,
    printerId: 'bambu-x1c',
    printer: getPrinter('bambu-x1c'),
  });
  const candidates = (base: Recommendation[], changes: Partial<Record<PlanPreference, Recommendation[]>> = {}, priority: Questionnaire['priority'] = 'strength') =>
    buildPlanPreferenceCandidates(base, {
      balanced: base,
      faster: changes.faster ?? base,
      'visual-quality': changes['visual-quality'] ?? base,
      'fit-accuracy': changes['fit-accuracy'] ?? base,
      'structural-margin': changes['structural-margin'] ?? base,
    }, questionnaire(priority));

  it('reports only settings that actually change', () => {
    const base = [recommendation('layer_height', '0.20 mm'), recommendation('wall_loops', 4)];
    const faster = [recommendation('layer_height', '0.24 mm'), recommendation('wall_loops', 4)];
    expect(comparePlans(base, faster)).toEqual([{ setting: 'layer_height', from: '0.20 mm', to: '0.24 mm' }]);
  });

  it('exposes only the five supported non-cost plan preferences', () => {
    const base = [recommendation('layer_height', '0.16 mm'), recommendation('wall_loops', 4)];
    const alternatives = buildPlanAlternatives(candidates(base, {
      faster: [recommendation('layer_height', '0.20 mm'), recommendation('wall_loops', 4)],
      'visual-quality': [recommendation('layer_height', '0.16 mm'), recommendation('wall_loops', 4), recommendation('seam', 'Back')],
      'fit-accuracy': [recommendation('layer_height', '0.16 mm'), recommendation('wall_loops', 4), recommendation('wall_order', 'Outer/Inner')],
      'structural-margin': [recommendation('layer_height', '0.16 mm'), recommendation('wall_loops', 5)],
    }));
    expect(alternatives.map(item => item.id)).toEqual(['balanced', 'faster', 'visual-quality', 'fit-accuracy', 'structural-margin']);
  });

  it('does not offer a faster plan when the rules produce no change', () => {
    const base = [recommendation('layer_height', '0.24 mm')];
    expect(buildPlanAlternatives(candidates(base)).find(item => item.id === 'faster')?.available).toBe(false);
  });

  it('offers structural margin only when the rule-backed plan changes', () => {
    const base = [recommendation('wall_loops', 4)];
    const performance = [recommendation('wall_loops', 5)];
    expect(buildPlanAlternatives(candidates(base, { 'structural-margin': performance })).find(item => item.id === 'structural-margin')).toMatchObject({ available: true, changes: [{ setting: 'wall_loops', from: 4, to: 5 }] });
  });

  it('blocks a faster preference from overriding a confirmed fit-critical interface', () => {
    const base = [recommendation('layer_height', '0.16 mm')];
    const faster = [recommendation('layer_height', '0.20 mm')];
    const fitCritical = questionnaire('accuracy');
    fitCritical.manufacturingIntent = {
      ...emptyManufacturingIntent(fitCritical),
      compatibility: { structural: false, fitCritical: true, flexible: false, weatherExposed: false, heatExposed: false },
    };
    const plans = { balanced: base, faster, 'visual-quality': base, 'fit-accuracy': base, 'structural-margin': base };
    expect(buildPlanPreferenceCandidates(base, plans, fitCritical).find(item => item.id === 'faster')).toMatchObject({
      available: false,
      blockers: [expect.stringContaining('fit-critical')],
    });
  });
});
