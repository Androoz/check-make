import { describe, expect, it } from 'vitest';
import { interpretUsageContext, usageContextProfiles } from './usageContext';

describe('Interpretation v3.8 usage context', () => {
  it('recognizes a camping chair as the parent system of a printed spacer', () => {
    const result = interpretUsageContext('Spacer for camping chair', 'camping chair');
    expect(result).toMatchObject({ id: 'camping-chair', label: 'camping or folding chair' });
    expect(result?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'environment.location', value: 'outdoor', certainty: 'strong_hypothesis' }),
      expect.objectContaining({ key: 'load.type', value: 'cyclic', certainty: 'strong_hypothesis' }),
      expect.objectContaining({ key: 'failure.consequence', value: 'safety_critical', certainty: 'weak_hypothesis' }),
    ]));
    expect(result?.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'confirm-person-load' }),
    ]));
  });

  it('covers multiple surrounding product systems rather than one camping-chair special case', () => {
    expect(usageContextProfiles.length).toBeGreaterThanOrEqual(10);
    expect(interpretUsageContext('Replacement clip for dishwasher rack')?.id).toBe('dishwasher');
    expect(interpretUsageContext('Spacer inside a bicycle wheel assembly')?.id).toBe('bicycle');
    expect(interpretUsageContext('Seal for a water pipe')?.id).toBe('plumbing');
  });

  it('distinguishes radio-controlled toy cars from real vehicle assemblies', () => {
    expect(interpretUsageContext('Wheel rim for a radio-controlled car')?.id).toBe('toy');
    expect(interpretUsageContext('Fälg till en radiostyrd bil')?.id).toBe('toy');
    expect(interpretUsageContext('Wheel spacer for an automotive vehicle')?.id).toBe('vehicle');
  });
});
