import { describe, expect, it } from 'vitest';
import { getPrinter, printerFamilies, printerProfiles } from './profiles';

describe('printer families', () => {
  it('assigns every profile to exactly one family', () => {
    const groupedIds = printerFamilies.flatMap(group => group.profiles.map(profile => profile.id));
    expect(groupedIds).toHaveLength(printerProfiles.length);
    expect(new Set(groupedIds).size).toBe(printerProfiles.length);
  });

  it('groups all Ender-3 V3 variants together', () => {
    const family = printerFamilies.find(group => group.id === 'creality-ender3-v3');
    expect(family?.profiles.map(profile => profile.variant)).toEqual(['V3', 'SE', 'KE']);
  });

  it('keeps the SE and KE hardware limits distinct', () => {
    const se = getPrinter('creality-ender3-v3-se');
    const ke = getPrinter('creality-ender3-v3-ke');
    expect(se.maxNozzleTempC).toBe(260);
    expect(se.buildVolume.z).toBe(250);
    expect(ke.maxNozzleTempC).toBe(300);
    expect(ke.buildVolume.z).toBe(240);
  });
});
