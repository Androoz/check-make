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
  });

  it('covers multiple surrounding product systems rather than one camping-chair special case', () => {
    expect(usageContextProfiles.length).toBeGreaterThanOrEqual(10);
    expect(interpretUsageContext('Replacement clip for dishwasher rack')?.id).toBe('dishwasher');
    expect(interpretUsageContext('Spacer inside a bicycle wheel assembly')?.id).toBe('bicycle');
    expect(interpretUsageContext('Seal for a water pipe')?.id).toBe('plumbing');
  });
});

