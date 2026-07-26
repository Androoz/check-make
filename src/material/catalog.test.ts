import { describe, expect, it } from 'vitest';
import { getPrinter } from '../printers/profiles';
import type { Questionnaire } from '../types';
import { materialAlternatives, planForMaterial, viableMaterials } from './catalog';
import type { Recommendation } from '../types';

const answers = (changes: Partial<Questionnaire> = {}): Questionnaire => ({
  purpose: '', properties: '', environment: 'indoor', load: 'static', impact: 'none', heat: 'normal', priority: 'strength', supportsAllowed: true,
  printerId: 'bambu-x1c', printer: getPrinter('bambu-x1c'), ...changes,
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

  it('offers only printer-compatible material alternatives with explicit trade-offs', () => {
    const printer = getPrinter('bambu-p1s');
    const candidates = materialAlternatives(answers({ printer, printerId: printer.id, priority: 'strength' }), 'PLA');
    expect(candidates.map(candidate => candidate.material)).toEqual(expect.arrayContaining(['PLA', 'PETG', 'ASA']));
    expect(candidates.map(candidate => candidate.material)).not.toContain('PA-CF');
    expect(candidates.every(candidate => candidate.disadvantages.length > 0 && candidate.printerRequirements.length > 0)).toBe(true);
    expect(candidates.find(candidate => candidate.material === 'PLA')?.recommended).toBe(true);
  });

  it('ranks the material benefit that matches the confirmed priority ahead of generic fallbacks', () => {
    const candidates = materialAlternatives(answers({ priority: 'strength' }), 'PLA');
    expect(candidates[0].material).toBe('PLA');
    expect(candidates[1].material).toBe('PA-CF');
  });

  it('does not offer an incompatible recommended family as a selectable alternative', () => {
    const printer = getPrinter('bambu-a1');
    expect(materialAlternatives(answers({ printer, printerId: printer.id, heat: 'hot' }), 'ASA')).toEqual([]);
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
