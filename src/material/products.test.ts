import { describe, expect, it } from 'vitest';
import { getPrinter } from '../printers/profiles';
import type { Recommendation } from '../types';
import {
  assessFilamentProduct,
  assessProductUpgradeEligibility,
  effectiveProductLifecycleStatus,
  filamentProductProfile,
  filamentProductProfiles,
  filamentProductRegistry,
  matchingCompatibleFilamentProduct,
  parseFilamentProductRegistry,
  planForFilamentProduct,
  qualifiedProductUpgrades,
} from './products';

describe('reviewed filament product profiles', () => {
  it('provides one versioned official-source starter profile for every supported material family', () => {
    expect(filamentProductRegistry).toMatchObject({
      schemaVersion: 1,
      catalogId: 'check-make-filament-products',
    });
    expect(new Set(filamentProductProfiles.map(profile => profile.family))).toEqual(new Set(['PLA', 'PETG', 'ASA', 'TPU', 'PA-CF']));
    expect(filamentProductProfiles).toHaveLength(10);
    expect(new Set(filamentProductProfiles.map(profile => profile.manufacturer)))
      .toEqual(new Set(['Prusa Polymers', 'Bambu Lab']));
    expect(filamentProductProfiles.every(profile =>
      profile.schemaVersion === 1
      && /^(?:PRUSAMENT|BAMBU)-PRODUCT-/.test(profile.source.evidenceId)
      && profile.source.url.startsWith('https://')
      && profile.source.reviewedAt === '2026-07-27'
      && profile.lifecycle.status === 'active'
      && profile.lifecycle.reviewDueAt === '2027-07-27'
      && profile.variant.nozzleDiametersMm.includes(0.4)
      && profile.nozzleTemperatureC.minimum <= profile.nozzleTemperatureC.starting
      && profile.nozzleTemperatureC.starting <= profile.nozzleTemperatureC.maximum
      && profile.bedTemperatureC.minimum <= profile.bedTemperatureC.starting
      && profile.bedTemperatureC.starting <= profile.bedTemperatureC.maximum
    )).toBe(true);
  });

  it('treats overdue and retired products as unavailable for new plans', () => {
    const profile = filamentProductProfile('bambu-petg-hf')!;
    expect(effectiveProductLifecycleStatus(profile, '2027-07-26')).toBe('active');
    expect(effectiveProductLifecycleStatus(profile, '2027-07-28')).toBe('stale');
    expect(assessFilamentProduct({
      ...profile,
      lifecycle: { ...profile.lifecycle, status: 'retired' },
    }, getPrinter('bambu-x1c'))).toMatchObject({
      compatible: false,
      limitations: expect.arrayContaining([expect.stringContaining('retired')]),
    });
  });

  it('keeps every current product out of automatic performance upgrades until evidence is promoted', () => {
    for (const profile of filamentProductProfiles) {
      expect(assessProductUpgradeEligibility(profile)).toMatchObject({
        eligible: false,
        supportedBenefits: [],
        blockers: expect.arrayContaining([expect.stringContaining('promotion gate')]),
      });
    }
    expect(qualifiedProductUpgrades('PETG', ['toughness'])).toEqual([]);
    expect(qualifiedProductUpgrades('PA-CF', ['stiffness'])).toEqual([]);
  });

  it('rejects malformed, duplicate, and out-of-range registry data before it reaches planning', () => {
    expect(() => parseFilamentProductRegistry({ schemaVersion: 2, catalogId: 'future', profiles: [] }))
      .toThrow('Unsupported or malformed');
    expect(() => parseFilamentProductRegistry({
      ...filamentProductRegistry,
      profiles: [filamentProductProfiles[0], filamentProductProfiles[0]],
    })).toThrow('Duplicate filament product id');
    expect(() => parseFilamentProductRegistry({
      ...filamentProductRegistry,
      profiles: [{
        ...filamentProductProfiles[0],
        nozzleTemperatureC: { minimum: 200, maximum: 220, starting: 230 },
      }],
    })).toThrow('starting must be inside');
    expect(() => parseFilamentProductRegistry({
      ...filamentProductRegistry,
      profiles: [{
        ...filamentProductProfiles[0],
        lifecycle: {
          ...filamentProductProfiles[0].lifecycle,
          reviewDueAt: '2025-01-01',
        },
      }],
    })).toThrow('does not match filament product schema');
  });

  it('accepts Prusament PA11 CF on the X1 Carbon baseline but blocks a non-hardened P1S profile', () => {
    const profile = filamentProductProfile('prusament-pa11-cf')!;
    expect(assessFilamentProduct(profile, getPrinter('bambu-x1c'))).toMatchObject({ compatible: true });
    expect(assessFilamentProduct(profile, getPrinter('bambu-p1s'))).toMatchObject({
      compatible: false,
      limitations: expect.arrayContaining([expect.stringContaining('wear-resistant nozzle')]),
    });
  });

  it('uses the reviewed product starting point only when the printer reaches it', () => {
    const asa = filamentProductProfile('prusament-asa')!;
    expect(assessFilamentProduct(asa, getPrinter('bambu-p1s'))).toMatchObject({
      compatible: false,
      limitations: expect.arrayContaining([expect.stringContaining('110 °C build-plate')]),
    });
  });

  it('accepts Bambu PETG HF on the X1 Carbon and applies its reviewed temperatures', () => {
    const profile = filamentProductProfile('bambu-petg-hf')!;
    expect(assessFilamentProduct(profile, getPrinter('bambu-x1c'))).toMatchObject({
      compatible: true,
      limitations: [],
    });
    const recommendation = (setting: Recommendation['setting'], value: Recommendation['value']): Recommendation => ({
      setting, value, reason: 'base', ruleIds: ['base'], matchedRuleIds: ['base'], evidenceLevel: 'C', validationStatus: 'provisional', trace: [],
    });
    const result = planForFilamentProduct([
      recommendation('material', 'PETG'),
      recommendation('nozzle_temperature', '250 °C'),
      recommendation('bed_temperature', '75 °C'),
    ], profile);
    expect(result.map(item => item.value)).toEqual(['PETG', '250 °C', '70 °C']);
  });

  it('finds one compatible product from the printer manufacturer for optional preselection', () => {
    expect(matchingCompatibleFilamentProduct('PETG', getPrinter('bambu-x1c'))?.id).toBe('bambu-petg-hf');
    expect(matchingCompatibleFilamentProduct('PETG', getPrinter('prusa-mk4s'))?.id).toBe('prusament-petg');
  });

  it('maps a selected product into material and temperature recommendations without changing structure settings', () => {
    const recommendation = (setting: Recommendation['setting'], value: Recommendation['value']): Recommendation => ({
      setting, value, reason: 'base', ruleIds: ['base'], matchedRuleIds: ['base'], evidenceLevel: 'C', validationStatus: 'provisional', trace: [],
    });
    const result = planForFilamentProduct([
      recommendation('material', 'PETG'),
      recommendation('nozzle_temperature', '250 °C'),
      recommendation('bed_temperature', '75 °C'),
      recommendation('wall_loops', 4),
    ], filamentProductProfile('prusament-petg')!);
    expect(result.map(item => item.value)).toEqual(['PETG', '250 °C', '80 °C', 4]);
    expect(result.find(item => item.setting === 'material')).toMatchObject({
      ruleIds: ['PRODUCT-PROFILE'],
      inputEvidenceIds: ['PRUSAMENT-PRODUCT-PETG'],
      validationStatus: 'Reviewed manufacturer profile · 2026-07-27',
    });
  });
});
