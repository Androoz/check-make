import { describe, expect, it } from 'vitest';
import { analyzePurpose } from './analyzePurpose';

describe('analyzePurpose', () => {
  it('extracts structural, fit and weather intent from Swedish free text', () => {
    const result = analyzePurpose('Ett bärande väggfäste utomhus med pressfit-passning');
    expect(result.structural).toBe(true);
    expect(result.fitCritical).toBe(true);
    expect(result.weatherExposed).toBe(true);
  });

  it('does not infer heat merely because a toy or radio-controlled car is named', () => {
    expect(analyzePurpose('Wheel rim for a radio-controlled car').heatExposed).toBe(false);
    expect(analyzePurpose('Fälg till en radiostyrd bil').heatExposed).toBe(false);
    expect(analyzePurpose('Bracket in a hot car engine bay').heatExposed).toBe(true);
  });
});
