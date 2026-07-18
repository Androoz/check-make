import type {
  DimensionMatch, EvidenceTargetScope, ExternalEvidenceAssessment, ExternalEvidenceDataset,
  OutcomeMatch, ScopeMatch,
} from './types';

const normalized = (value: string) => value.trim().toLocaleLowerCase('en-US');
const categorical = (target: string | undefined, candidates: string[]): DimensionMatch => {
  if (!target || !candidates.length) return 'unknown';
  return candidates.some(candidate => normalized(candidate) === normalized(target)) ? 'exact' : 'mismatch';
};
const numeric = (target: number | undefined, candidates: number[]): DimensionMatch => {
  if (target === undefined || !candidates.length) return 'unknown';
  const relativeDifferences = candidates.map(candidate => Math.abs(candidate - target) / Math.max(Math.abs(target), 1e-9));
  if (Math.min(...relativeDifferences) <= 0.02) return 'exact';
  if (Math.min(...relativeDifferences) <= 0.25) return 'compatible';
  return 'mismatch';
};

function materialMatch(dataset: ExternalEvidenceDataset, target: EvidenceTargetScope): DimensionMatch {
  const family = categorical(target.materialFamily, dataset.scope.materialFamilies);
  if (family === 'mismatch') return 'mismatch';
  if (!target.materialProduct) return family === 'exact' ? 'compatible' : family;
  const product = categorical(target.materialProduct, dataset.scope.materialProducts);
  if (product === 'exact') return 'exact';
  return family === 'exact' ? 'compatible' : product;
}

function printerMatch(dataset: ExternalEvidenceDataset, target: EvidenceTargetScope): DimensionMatch {
  const model = categorical(target.printerModel, dataset.scope.printerModels);
  if (model === 'exact') return 'exact';
  const manufacturer = categorical(target.printerManufacturer, dataset.scope.printerManufacturers);
  const kinematics = categorical(target.kinematicClass, dataset.scope.kinematicClasses);
  if (manufacturer === 'exact' || kinematics === 'exact') return 'compatible';
  if (model === 'unknown' && manufacturer === 'unknown' && kinematics === 'unknown') return 'unknown';
  return 'mismatch';
}

function scopeMatch(dimensions: Record<string, DimensionMatch>): ScopeMatch {
  if (dimensions.process === 'mismatch') return 'none';
  if (dimensions.material === 'mismatch' || dimensions.geometry === 'mismatch') return 'directional';
  const values = Object.values(dimensions);
  if (values.every(value => value === 'exact')) return 'exact';
  if (!values.includes('mismatch') && values.filter(value => value === 'unknown').length <= 1) return 'close';
  if (!values.includes('mismatch')) return 'partial';
  return 'directional';
}

function outcomeMatch(dataset: ExternalEvidenceDataset, target: EvidenceTargetScope): OutcomeMatch {
  if (dataset.outcomeDomains.includes(target.outcomeDomain)) return 'direct';
  if (dataset.proxyOutcomeDomains.includes(target.outcomeDomain)) return 'proxy';
  return 'none';
}

export function assessExternalDataset(
  dataset: ExternalEvidenceDataset,
  target: EvidenceTargetScope,
): ExternalEvidenceAssessment {
  const dimensions: Record<string, DimensionMatch> = {
    process: categorical(target.process, [dataset.scope.process]),
    material: materialMatch(dataset, target),
    printer: printerMatch(dataset, target),
    nozzle: numeric(target.nozzleDiameterMm, dataset.scope.nozzleDiameterMm),
    layerHeight: numeric(target.layerHeightMm, dataset.scope.layerHeightMm),
    enclosure: dataset.scope.enclosure === 'unknown' || target.enclosure === undefined
      ? 'unknown' : dataset.scope.enclosure === target.enclosure ? 'exact' : 'mismatch',
    geometry: categorical(target.geometryClass, dataset.scope.geometryClasses),
  };
  const scope = scopeMatch(dimensions); const outcome = outcomeMatch(dataset, target); const reasons: string[] = [];
  let eligibility: ExternalEvidenceAssessment['eligibility'];

  if (scope === 'none' || outcome === 'none' || dataset.licenseUse === 'analysis-restricted') {
    eligibility = 'excluded';
    if (scope === 'none') reasons.push('The manufacturing process does not match.');
    if (outcome === 'none') reasons.push('The dataset does not measure the requested outcome or a declared proxy.');
    if (dataset.licenseUse === 'analysis-restricted') reasons.push('The recorded license does not permit the intended analysis.');
  } else if (dataset.licenseUse === 'unknown') {
    eligibility = 'direction-only';
    reasons.push('License applicability must be resolved before importing or fitting the data.');
  } else if (dataset.dataAccess === 'raw-open' && dataset.integrity !== 'checksum-verified' && scope !== 'directional') {
    eligibility = 'import-required';
    reasons.push('Raw data must be downloaded, normalized, and checksum-verified before use.');
  } else if (dataset.dataAccess !== 'raw-open' || dataset.integrity !== 'checksum-verified') {
    eligibility = 'direction-only';
    reasons.push('Only metadata, restricted files, or summarized results are currently available.');
  } else if (outcome === 'direct' && (scope === 'exact' || scope === 'close')) {
    eligibility = 'eligible-for-fit';
    reasons.push('Verified raw observations directly measure the target in an exact or close scope.');
  } else if ((outcome === 'direct' || outcome === 'proxy') && scope !== 'directional') {
    eligibility = 'eligible-as-prior';
    reasons.push('Verified observations may inform a scoped prior but cannot set the target boundary directly.');
  } else {
    eligibility = 'direction-only';
    reasons.push('Material, geometry, printer, or process differences prevent quantitative transfer.');
  }
  for (const [dimension, match] of Object.entries(dimensions)) {
    if (match === 'mismatch') reasons.push(`${dimension} is outside the dataset scope.`);
    if (match === 'unknown') reasons.push(`${dimension} is not sufficiently specified for transfer.`);
  }
  return { datasetId: dataset.id, scopeMatch: scope, outcomeMatch: outcome, eligibility, dimensions, reasons };
}
