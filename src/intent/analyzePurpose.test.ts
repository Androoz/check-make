import { describe, expect, it } from 'vitest';
import { analyzePurpose } from './analyzePurpose';

describe('analyzePurpose', () => {
  it('extracts structural, fit and weather intent from Swedish free text', () => {
    const result = analyzePurpose('Ett bärande väggfäste utomhus med pressfit-passning');
    expect(result.structural).toBe(true);
    expect(result.fitCritical).toBe(true);
    expect(result.weatherExposed).toBe(true);
  });
});
