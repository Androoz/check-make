import { describe, expect, it } from 'vitest';
import { getPrinter } from '../printers/profiles';
import type { Questionnaire } from '../types';
import { evaluateMaterialPlan, materialAlternatives, planForMaterial, viableMaterials } from './catalog';
import type { Recommendation } from '../types';
import { emptyManufacturingIntent } from '../intent/manufacturingIntent';
import type { ManufacturingIntent } from '../intent/manufacturingIntent';

const answers = (changes: Partial<Questionnaire> = {}): Questionnaire => ({
  purpose: '', properties: '', environment: 'indoor', load: 'static', impact: 'none', heat: 'normal', priority: 'strength', supportsAllowed: true,
  printerId: 'bambu-x1c', printer: getPrinter('bambu-x1c'), ...changes,
});
const withIntent = (mutate: (intent: ManufacturingIntent) => void, changes: Partial<Questionnaire> = {}): Questionnaire => {
  const questionnaire = answers(changes);
  const intent = emptyManufacturingIntent(questionnaire);
  mutate(intent);
  return { ...questionnaire, manufacturingIntent: intent };
};
const confirmed = <T,>(value: T, evidenceId: string) => ({
  value, status: 'confirmed' as const, confidence: 1, evidenceIds: [evidenceId],
});

describe('material candidate constraints', () => {
  it('does not offer PLA for outdoor use or PA-CF for high impact', () => {
    const result = viableMaterials(answers({ environment: 'outdoor', impact: 'high' }));
    expect(result).not.toContain('PLA'); expect(result).not.toContain('PA-CF'); expect(result).toContain('PETG');
  });
  it('gates enclosure and hardened-nozzle materials by printer capability', () => {
    const printer = getPrinter('bambu-a1');
    const result = viableMaterials(answers({ printer, printerId: printer.id }));
    expect(result).not.toContain('ASA'); expect(result).not.toContain('PA-CF');
  });
  it('keeps flexibility as a separate material requirement', () => {
    expect(viableMaterials(answers({ priority: 'flexibility' }))).toEqual(['TPU']);
  });

  it('shows incompatible material families but only enables requirement- and printer-compatible alternatives', () => {
    const printer = getPrinter('bambu-p1s');
    const candidates = materialAlternatives(answers({ printer, printerId: printer.id, priority: 'strength' }), 'PLA');
    expect(candidates.map(candidate => candidate.material)).toEqual(expect.arrayContaining(['PLA', 'PETG', 'ASA']));
    expect(candidates.find(candidate => candidate.material === 'PA-CF')).toMatchObject({ selectable: false, status: 'printer-incompatible' });
    expect(candidates.every(candidate => candidate.disadvantages.length > 0 && candidate.printerRequirements.length > 0)).toBe(true);
    expect(candidates.find(candidate => candidate.material === 'PLA')?.recommended).toBe(true);
  });

  it('uses stiffness as a preference without claiming one universal family winner', () => {
    const candidates = materialAlternatives(answers({ priority: 'strength' }), 'PLA');
    expect(candidates[0].material).toBe('PLA');
    expect(candidates.find(candidate => candidate.material === 'PETG')?.unmetPreferences).toContain('Stiffness');
    expect(candidates.filter(candidate => candidate.fitLabels.includes('Higher stiffness')).length).toBeGreaterThan(0);
  });

  it('blocks an incompatible recommended family and exposes a compatible replacement', () => {
    const printer = getPrinter('bambu-a1');
    const result = evaluateMaterialPlan(answers({ printer, printerId: printer.id, heat: 'hot' }), 'ASA');
    expect(result.blocked).toBe(true);
    expect(result.recommended).toMatchObject({ material: 'ASA', printerCompatible: false });
    expect(result.candidates.find(candidate => candidate.material === 'ASA')).toMatchObject({ selectable: false, status: 'printer-incompatible' });
    expect(result.candidates.find(candidate => candidate.material === 'PETG')).toMatchObject({ selectable: false, status: 'requirements-gap' });
  });

  it('uses the same weather requirement for the recommendation and the alternative list', () => {
    const outdoor = answers({ environment: 'outdoor', impact: 'none', heat: 'normal' });
    const result = evaluateMaterialPlan(outdoor, 'PETG');
    expect(result.decisionReason).toContain('outdoor or UV exposure');
    expect(result.candidates.find(candidate => candidate.material === 'PLA')).toMatchObject({
      selectable: false,
      status: 'requirements-gap',
      missingRequirements: ['Weather resistance'],
    });
  });

  it('explains medium impact as the PETG trigger instead of using a generic PLA temperature warning', () => {
    const result = evaluateMaterialPlan(answers({ impact: 'medium', priority: 'strength' }), 'PETG');
    expect(result.decisionReason).toContain('medium impact exposure');
    expect(result.candidates.find(candidate => candidate.material === 'PLA')?.whyNotRecommended).toContain('impact toughness');
  });

  it('keeps the warm-service PETG recommendation exportable', () => {
    const result = evaluateMaterialPlan(answers({ heat: 'warm' }), 'PETG');
    expect(result.requirements).toContainEqual(expect.objectContaining({
      id: 'heat-margin',
      benefit: 'heat',
      kind: 'required',
    }));
    expect(result.recommended).toMatchObject({
      material: 'PETG',
      meetsRequirements: true,
      printerCompatible: true,
      selectable: true,
    });
    expect(result.blocked).toBe(false);
  });

  it('uses cyclic loading as a fatigue preference for ordinary functional parts', () => {
    const result = evaluateMaterialPlan(answers({ load: 'cyclic', priority: 'strength' }), 'PETG');
    expect(result.requirements).toContainEqual(expect.objectContaining({ id: 'fatigue-resistance', kind: 'preferred' }));
    expect(result.recommended.matchedRequirements).toContain('fatigue-resistance');
    expect(result.blocked).toBe(false);
  });

  it('requires specialist fatigue evidence for safety-critical cyclic loading', () => {
    const questionnaire = withIntent(intent => {
      intent.mechanical.loadMode = confirmed('cyclic', 'load:cyclic');
      intent.failureConsequence = confirmed('safety-critical', 'failure:safety');
    }, { load: 'cyclic' });
    const result = evaluateMaterialPlan(questionnaire, 'PETG');
    expect(result.requirements).toContainEqual(expect.objectContaining({ id: 'fatigue-resistance', kind: 'specialist-review' }));
    expect(result.blocked).toBe(true);
    expect(result.candidates.every(candidate => !candidate.selectable)).toBe(true);
  });

  it('requires product-specific creep evidence for long-term sustained loading', () => {
    const questionnaire = withIntent(intent => {
      intent.mechanical.loadMode = confirmed('static', 'load:static');
      intent.thermal.band = confirmed('warm', 'heat:warm');
      intent.intendedLifetime = confirmed('long-term', 'lifetime:long');
    }, { load: 'static', heat: 'warm' });
    const result = evaluateMaterialPlan(questionnaire, 'PLA');
    expect(result.requirements).toContainEqual(expect.objectContaining({ id: 'creep-resistance', kind: 'specialist-review' }));
    expect(result.blocked).toBe(true);
  });

  it('uses creep only as a ranking preference for ordinary long-term service without a consequential sustained load', () => {
    const questionnaire = withIntent(intent => {
      intent.mechanical.loadMode = confirmed('static', 'load:static');
      intent.intendedLifetime = confirmed('long-term', 'lifetime:long');
    }, { load: 'static', heat: 'normal' });
    const result = evaluateMaterialPlan(questionnaire, 'PLA');
    expect(result.requirements).toContainEqual(expect.objectContaining({ id: 'creep-resistance', kind: 'preferred' }));
    expect(result.blocked).toBe(false);
  });

  it('treats sliding wear and chemical exposure as product-specific review requirements', () => {
    const questionnaire = withIntent(intent => {
      intent.mechanical.wear = confirmed('sliding', 'wear:sliding');
      intent.environment.chemicalExposure = confirmed(true, 'chemical:present');
      intent.environment.chemicalDetails = confirmed('isopropyl alcohol', 'chemical:details');
    });
    const result = evaluateMaterialPlan(questionnaire, 'PETG');
    expect(result.requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'wear-resistance', kind: 'specialist-review' }),
      expect.objectContaining({ id: 'chemical-compatibility', kind: 'specialist-review' }),
    ]));
    expect(result.blockerReasons.join(' ')).toContain('isopropyl alcohol');
  });

  it('uses direct moisture as a required property separate from general outdoor exposure', () => {
    const questionnaire = withIntent(intent => {
      intent.environment.moistureExposure = confirmed(true, 'moisture:direct');
    });
    const result = evaluateMaterialPlan(questionnaire, 'PETG');
    expect(result.requirements).toContainEqual(expect.objectContaining({ id: 'moisture-resistance', kind: 'required' }));
    expect(result.candidates.find(candidate => candidate.material === 'PLA')).toMatchObject({
      status: 'requirements-gap',
      missingRequirements: ['Moisture resistance'],
    });
  });

  it('changes only material-family settings when a candidate is selected', () => {
    const recommendation = (setting: Recommendation['setting'], value: Recommendation['value']): Recommendation => ({
      setting, value, reason: 'base', ruleIds: ['base'], matchedRuleIds: ['base'], evidenceLevel: 'C', validationStatus: 'provisional', trace: [],
    });
    const changed = planForMaterial([
      recommendation('material', 'PLA'), recommendation('nozzle_temperature', '220 °C'),
      recommendation('bed_temperature', '55 °C'), recommendation('wall_loops', 4),
    ], 'PETG');
    expect(changed.map(item => item.value)).toEqual(['PETG', '250 °C', '75 °C', 4]);
  });
});
