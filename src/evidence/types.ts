export type EvidenceSourceStrength =
  | 'public-benchmark'
  | 'peer-reviewed-experiment'
  | 'curated-research-dataset'
  | 'manufacturer-study'
  | 'community-observation';

export type EvidenceDataAccess = 'raw-open'|'raw-restricted'|'summary-only'|'metadata-only';
export type EvidenceIntegrity = 'checksum-verified'|'metadata-verified'|'unverified';
export type EvidenceLicenseUse = 'analysis-allowed'|'analysis-restricted'|'unknown';
export type ScopeMatch = 'exact'|'close'|'partial'|'directional'|'none';
export type OutcomeMatch = 'direct'|'proxy'|'none';
export type EvidenceEligibility = 'eligible-for-fit'|'eligible-as-prior'|'import-required'|'direction-only'|'excluded';
export type DimensionMatch = 'exact'|'compatible'|'unknown'|'mismatch';

export interface ExternalEvidenceScope {
  process: string;
  materialFamilies: string[];
  materialProducts: string[];
  printerManufacturers: string[];
  printerModels: string[];
  kinematicClasses: string[];
  nozzleDiameterMm: number[];
  layerHeightMm: number[];
  enclosure: boolean|'unknown';
  geometryClasses: string[];
}

export interface ExternalEvidenceDataset {
  id: string;
  sourceIds: string[];
  title: string;
  sourceStrength: EvidenceSourceStrength;
  dataAccess: EvidenceDataAccess;
  integrity: EvidenceIntegrity;
  license: string;
  licenseUse: EvidenceLicenseUse;
  landingPage: string;
  rawDataUrl?: string;
  localPath?: string;
  sha256?: string;
  recordCount?: number;
  scope: ExternalEvidenceScope;
  outcomeDomains: string[];
  proxyOutcomeDomains: string[];
  variables: string[];
  ruleIds: string[];
  limitations: string;
  reviewedAt: string;
}

export interface EvidenceTargetScope {
  process: string;
  materialFamily?: string;
  materialProduct?: string;
  printerManufacturer?: string;
  printerModel?: string;
  kinematicClass?: string;
  nozzleDiameterMm?: number;
  layerHeightMm?: number;
  enclosure?: boolean;
  geometryClass?: string;
  outcomeDomain: string;
}

export interface ExternalEvidenceAssessment {
  datasetId: string;
  scopeMatch: ScopeMatch;
  outcomeMatch: OutcomeMatch;
  eligibility: EvidenceEligibility;
  dimensions: Record<string, DimensionMatch>;
  reasons: string[];
}

