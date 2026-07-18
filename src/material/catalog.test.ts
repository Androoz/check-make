import { describe, expect, it } from 'vitest';
import { getPrinter } from '../printers/profiles';
import type { Questionnaire } from '../types';
import { viableMaterials } from './catalog';

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
});
