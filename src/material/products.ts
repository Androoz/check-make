import type { Material, PrinterProfile, Recommendation } from '../types';
import type { MaterialBenefit } from './catalog';
import productRegistryJson from './filament-products.v1.json';

export interface TemperatureRange {
  minimum: number;
  maximum: number;
  starting: number;
}

export interface FilamentProductProfile {
  schemaVersion: 1;
  id: string;
  manufacturer: string;
  product: string;
  family: Material;
  nozzleTemperatureC: TemperatureRange;
  bedTemperatureC: TemperatureRange;
  enclosure: 'not-required' | 'recommended' | 'required';
  hardenedNozzle: boolean;
  lifecycle: {
    status: 'active' | 'stale' | 'retired';
    reviewDueAt: string;
    replacementProductId?: string;
  };
  variant: {
    name: string;
    colorScope: 'all-listed-colors' | 'color-specific' | 'unverified';
    nozzleDiametersMm: number[];
  };
  upgradeEvidence: {
    status: 'temperature-profile-only' | 'candidate' | 'qualified';
    sourceEvidenceIds: string[];
    supportedBenefits: MaterialBenefit[];
    blockers: string[];
  };
  strengths: MaterialBenefit[];
  limitations: string[];
  source: {
    evidenceId: string;
    title: string;
    url: string;
    reviewedAt: string;
  };
}

export interface FilamentProductAssessment {
  profile: FilamentProductProfile;
  compatible: boolean;
  limitations: string[];
  warnings: string[];
}

export interface ProductUpgradeAssessment {
  eligible: boolean;
  supportedBenefits: MaterialBenefit[];
  blockers: string[];
}

export interface FilamentProductRegistry {
  schemaVersion: 1;
  catalogId: string;
  profiles: FilamentProductProfile[];
}

const materialFamilies: Material[] = ['PLA', 'PETG', 'ASA', 'TPU', 'PA-CF'];
const benefits: MaterialBenefit[] = [
  'easy-to-print', 'outdoor', 'moisture', 'toughness', 'heat', 'high-heat',
  'flexibility', 'stiffness', 'fatigue', 'creep-resistance', 'dimensional-stability',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const validDate = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function temperatureRange(value: unknown, path: string): TemperatureRange {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  const minimum = value.minimum;
  const maximum = value.maximum;
  const starting = value.starting;
  if (![minimum, maximum, starting].every(item => typeof item === 'number' && Number.isFinite(item))) {
    throw new Error(`${path} must contain finite minimum, maximum, and starting temperatures.`);
  }
  if ((minimum as number) > (starting as number) || (starting as number) > (maximum as number)) {
    throw new Error(`${path}.starting must be inside its declared range.`);
  }
  return { minimum: minimum as number, maximum: maximum as number, starting: starting as number };
}

export function parseFilamentProductRegistry(value: unknown): FilamentProductRegistry {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.catalogId !== 'string' || !Array.isArray(value.profiles)) {
    throw new Error('Unsupported or malformed filament product registry.');
  }
  const ids = new Set<string>();
  const profiles = value.profiles.map((candidate, index): FilamentProductProfile => {
    if (!isRecord(candidate)) throw new Error(`profiles[${index}] must be an object.`);
    const path = `profiles[${index}]`;
    if (candidate.schemaVersion !== 1
      || typeof candidate.id !== 'string'
      || typeof candidate.manufacturer !== 'string'
      || typeof candidate.product !== 'string'
      || !materialFamilies.includes(candidate.family as Material)
      || !['not-required', 'recommended', 'required'].includes(String(candidate.enclosure))
      || typeof candidate.hardenedNozzle !== 'boolean'
      || !isRecord(candidate.lifecycle)
      || !['active', 'stale', 'retired'].includes(String(candidate.lifecycle.status))
      || !validDate(candidate.lifecycle.reviewDueAt)
      || candidate.lifecycle.replacementProductId != null && typeof candidate.lifecycle.replacementProductId !== 'string'
      || !isRecord(candidate.variant)
      || typeof candidate.variant.name !== 'string'
      || !['all-listed-colors', 'color-specific', 'unverified'].includes(String(candidate.variant.colorScope))
      || !Array.isArray(candidate.variant.nozzleDiametersMm)
      || !candidate.variant.nozzleDiametersMm.every(item => typeof item === 'number' && item > 0)
      || !isRecord(candidate.upgradeEvidence)
      || !['temperature-profile-only', 'candidate', 'qualified'].includes(String(candidate.upgradeEvidence.status))
      || !Array.isArray(candidate.upgradeEvidence.sourceEvidenceIds)
      || !candidate.upgradeEvidence.sourceEvidenceIds.every(item => typeof item === 'string')
      || !Array.isArray(candidate.upgradeEvidence.supportedBenefits)
      || !candidate.upgradeEvidence.supportedBenefits.every(item => benefits.includes(item as MaterialBenefit))
      || !Array.isArray(candidate.upgradeEvidence.blockers)
      || !candidate.upgradeEvidence.blockers.every(item => typeof item === 'string')
      || !Array.isArray(candidate.strengths)
      || !candidate.strengths.every(item => benefits.includes(item as MaterialBenefit))
      || !Array.isArray(candidate.limitations)
      || !candidate.limitations.every(item => typeof item === 'string')
      || !isRecord(candidate.source)
      || typeof candidate.source.evidenceId !== 'string'
      || typeof candidate.source.title !== 'string'
      || typeof candidate.source.url !== 'string'
      || !validDate(candidate.source.reviewedAt)
      || String(candidate.lifecycle.reviewDueAt) < String(candidate.source.reviewedAt)) {
      throw new Error(`${path} does not match filament product schema version 1.`);
    }
    if (ids.has(candidate.id)) throw new Error(`Duplicate filament product id: ${candidate.id}.`);
    ids.add(candidate.id);
    return {
      schemaVersion: 1,
      id: candidate.id,
      manufacturer: candidate.manufacturer,
      product: candidate.product,
      family: candidate.family as Material,
      nozzleTemperatureC: temperatureRange(candidate.nozzleTemperatureC, `${path}.nozzleTemperatureC`),
      bedTemperatureC: temperatureRange(candidate.bedTemperatureC, `${path}.bedTemperatureC`),
      enclosure: candidate.enclosure as FilamentProductProfile['enclosure'],
      hardenedNozzle: candidate.hardenedNozzle,
      lifecycle: candidate.lifecycle as unknown as FilamentProductProfile['lifecycle'],
      variant: candidate.variant as unknown as FilamentProductProfile['variant'],
      upgradeEvidence: candidate.upgradeEvidence as unknown as FilamentProductProfile['upgradeEvidence'],
      strengths: candidate.strengths as MaterialBenefit[],
      limitations: candidate.limitations as string[],
      source: candidate.source as unknown as FilamentProductProfile['source'],
    };
  });
  return { schemaVersion: 1, catalogId: value.catalogId, profiles };
}

export const filamentProductRegistry = parseFilamentProductRegistry(productRegistryJson);
export const filamentProductProfiles = filamentProductRegistry.profiles;

export const filamentProductProfile = (id: string | undefined) =>
  filamentProductProfiles.find(profile => profile.id === id);

export const filamentProductsForFamily = (family: Material) =>
  filamentProductProfiles.filter(profile => profile.family === family && profile.lifecycle.status !== 'retired');

const manufacturerMatchesPrinter = (profile: FilamentProductProfile, printer: PrinterProfile) => {
  const printerBrand = printer.manufacturer.toLocaleLowerCase('en-US').split(/\s+/)[0];
  const filamentBrand = profile.manufacturer.toLocaleLowerCase('en-US').split(/\s+/)[0];
  return printerBrand === filamentBrand;
};

export function matchingCompatibleFilamentProduct(
  family: Material,
  printer: PrinterProfile,
): FilamentProductProfile | undefined {
  const matches = filamentProductsForFamily(family)
    .filter(profile => manufacturerMatchesPrinter(profile, printer))
    .filter(profile => assessFilamentProduct(profile, printer).compatible);
  return matches.length === 1 ? matches[0] : undefined;
}

export function effectiveProductLifecycleStatus(
  profile: FilamentProductProfile,
  today = new Date().toISOString().slice(0, 10),
) {
  if (profile.lifecycle.status === 'retired') return 'retired' as const;
  if (profile.lifecycle.status === 'stale' || profile.lifecycle.reviewDueAt < today) return 'stale' as const;
  return 'active' as const;
}

export function assessProductUpgradeEligibility(profile: FilamentProductProfile): ProductUpgradeAssessment {
  const blockers = [...profile.upgradeEvidence.blockers];
  if (effectiveProductLifecycleStatus(profile) !== 'active') blockers.push('The product profile is not actively reviewed.');
  if (profile.upgradeEvidence.status !== 'qualified') {
    blockers.push('The product has not passed Check Make’s product-level performance promotion gate.');
  }
  if (!profile.upgradeEvidence.sourceEvidenceIds.length) blockers.push('No scoped performance evidence is connected.');
  if (!profile.upgradeEvidence.supportedBenefits.length) blockers.push('No product-level upgrade benefit has been qualified.');
  return {
    eligible: blockers.length === 0,
    supportedBenefits: profile.upgradeEvidence.supportedBenefits,
    blockers: [...new Set(blockers)],
  };
}

export function qualifiedProductUpgrades(
  family: Material,
  requiredBenefits: MaterialBenefit[],
) {
  return filamentProductsForFamily(family).filter(profile => {
    const assessment = assessProductUpgradeEligibility(profile);
    return assessment.eligible
      && requiredBenefits.every(benefit => assessment.supportedBenefits.includes(benefit));
  });
}

export function assessFilamentProduct(profile: FilamentProductProfile, printer: PrinterProfile | undefined): FilamentProductAssessment {
  const limitations: string[] = [];
  const warnings: string[] = [];
  const lifecycle = effectiveProductLifecycleStatus(profile);
  if (lifecycle === 'retired') limitations.push(`${profile.product} is retired from the Check Make profile catalog.`);
  if (lifecycle === 'stale') limitations.push(`${profile.product} is due for source review and cannot be newly selected.`);
  if (!printer) return {
    profile,
    compatible: limitations.length === 0,
    limitations,
    warnings: ['Select a printer to validate this product profile.'],
  };
  if (!profile.variant.nozzleDiametersMm.includes(0.4)) {
    limitations.push(`${profile.product} has not been reviewed for the 0.4 mm nozzle used by this printer profile.`);
  }
  if (printer.maxNozzleTempC < profile.nozzleTemperatureC.starting) {
    limitations.push(`${profile.product} starts at ${profile.nozzleTemperatureC.starting} °C nozzle temperature; ${printer.model} is limited to ${printer.maxNozzleTempC} °C.`);
  }
  if (printer.maxBedTempC < profile.bedTemperatureC.starting) {
    limitations.push(`${profile.product} starts at ${profile.bedTemperatureC.starting} °C build-plate temperature; ${printer.model} is limited to ${printer.maxBedTempC} °C.`);
  }
  if (profile.enclosure === 'required' && !printer.enclosed) limitations.push(`${profile.product} requires an enclosure; ${printer.model} is an open-frame profile.`);
  if (profile.enclosure === 'recommended' && !printer.enclosed) warnings.push(`${profile.product} recommends an enclosure; ${printer.model} is an open-frame profile.`);
  if (profile.hardenedNozzle && !printer.hardenedNozzle) limitations.push(`${profile.product} requires a wear-resistant nozzle; ${printer.model} is not configured with one.`);
  return { profile, compatible: limitations.length === 0, limitations, warnings };
}

export function planForFilamentProduct(base: Recommendation[], profile: FilamentProductProfile): Recommendation[] {
  const values = new Map<Recommendation['setting'], string>([
    ['material', profile.family],
    ['nozzle_temperature', `${profile.nozzleTemperatureC.starting} °C`],
    ['bed_temperature', `${profile.bedTemperatureC.starting} °C`],
  ]);
  return base.map(item => values.has(item.setting) ? {
    ...item,
    value: values.get(item.setting)!,
    reason: `${profile.product} uses a reviewed manufacturer starting profile. Final temperatures still require printer, color, geometry, and environment validation.`,
    ruleIds: ['PRODUCT-PROFILE'],
    matchedRuleIds: [...item.matchedRuleIds, 'PRODUCT-PROFILE'],
    inputEvidenceIds: [...(item.inputEvidenceIds ?? []), profile.source.evidenceId],
    evidenceLevel: 'C',
    validationStatus: `Reviewed manufacturer profile · ${profile.source.reviewedAt}`,
  } : item);
}
