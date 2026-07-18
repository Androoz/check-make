export type Material = 'PLA' | 'PETG' | 'ASA' | 'TPU' | 'PA-CF';
export type Priority = 'strength' | 'accuracy' | 'finish' | 'speed' | 'flexibility';

export interface Vec3 { x: number; y: number; z: number }
export type ModelFormat = 'stl' | '3mf' | 'obj';
export type ModelClueSource = 'file-name' | 'stl-solid-name' | 'stl-binary-header' | 'model-name';
export interface ModelClue { source: ModelClueSource; value: string }
export interface ModelMetadata {
  format: ModelFormat;
  encoding: 'ascii' | 'binary' | 'archive' | 'unknown';
  clues: ModelClue[];
}
export interface OverhangRegion {
  triangleCount: number;
  areaMm2: number;
  projectedSpanMm: number;
  minZMm: number;
  maxZMm: number;
  meanDownwardNormalAngleDeg: number;
  horizontalAreaFraction: number;
}
export interface GeometryRiskMetrics {
  boundingFootprintAreaMm2: number;
  bedCoverageRatio: number;
  heightToContactWidthRatio: number | null;
  surfaceCentroidOffsetMm: number | null;
  surfaceCentroidOffsetRatio: number | null;
  overhangRegionCount: number;
  largestOverhangRegionAreaMm2: number;
  largestOverhangRegionSpanMm: number;
  overhangRegions: OverhangRegion[];
  bridgeClassification: 'not-evaluated';
}
export interface ModelAnalysis {
  fileName: string; triangleCount: number; boundingBox: { min: Vec3; max: Vec3; size: Vec3 };
  heightMm: number; bedContactAreaMm2: number; overhangAreaMm2: number;
  overhangRatio: number; confidence: { bedContact: number; overhang: number };
  orientations: OrientationCandidate[];
  orientationLabel: string;
  metadata: ModelMetadata;
  geometryRisk: GeometryRiskMetrics;
}
export interface OrientationCandidate {
  id: string;
  label: string;
  heightMm: number;
  bedContactAreaMm2: number;
  overhangRatio: number;
  geometryRisk: GeometryRiskMetrics;
}
export interface Questionnaire {
  purpose: string;
  properties: string;
  environment: 'unknown' | 'indoor' | 'outdoor';
  load: 'unknown' | 'none' | 'static' | 'cyclic';
  impact: 'unknown' | 'none' | 'medium' | 'high';
  heat: 'unknown' | 'normal' | 'warm' | 'hot';
  priority: 'unknown' | Priority;
  supportsAllowed: 'unknown' | boolean;
  printer: PrinterProfile;
  printerId: string;
}
export interface PrinterCapabilities {
  maxNozzleTempC: number; maxBedTempC: number; enclosed: boolean; hardenedNozzle: boolean; buildVolume: Vec3;
}
export interface PrinterProfile extends PrinterCapabilities {
  id: string;
  manufacturer: string;
  familyId: string;
  family: string;
  variant: string;
  model: string;
  notes: string;
}
export interface PurposeSignals {
  structural: boolean; fitCritical: boolean; flexible: boolean; weatherExposed: boolean;
  heatExposed: boolean; keywords: string[];
}
export type ChecklistField = 'environment'|'load'|'impact'|'heat'|'priority'|'supportsAllowed';
export interface InferenceValue<T> { value: T; confidence: number; evidence: string[] }
export type BriefInference = { [K in ChecklistField]: InferenceValue<Questionnaire[K]> };
export interface CompatibilityNotice { severity: 'info'|'warning'; message: string }
export type SettingKey = 'material'|'nozzle_temperature'|'bed_temperature'|'orientation'|'layer_height'|'wall_loops'|'top_layers'|'bottom_layers'|'infill_type'|'infill_percent'|'support'|'brim'|'wall_generator'|'wall_order'|'seam'|'speed_preset';
export type EvidenceLevel = 'A'|'B'|'C'|'D';
export interface RuleEvidenceRecord {
  ruleId: string;
  status: string;
  evidenceLevel: EvidenceLevel;
  sourceIds: string[];
  supportedClaim: string;
  unsupportedSpecifics: string;
  experimentPriority: 'low'|'medium'|'high'|'critical';
}
export interface DecisionTraceEntry {
  ruleId: string;
  state: 'active'|'supporting'|'superseded';
  conflictsWithFinal: boolean;
  proposedValue: string|number|boolean;
  resultingValue: string|number|boolean;
}
export interface Recommendation {
  setting: SettingKey;
  value: string | number | boolean;
  reason: string;
  ruleIds: string[];
  matchedRuleIds: string[];
  evidenceLevel: EvidenceLevel;
  validationStatus: string;
  trace: DecisionTraceEntry[];
}
export type SlicerTarget = 'generic' | 'bambu' | 'orca' | 'prusa' | 'cura' | 'creality';
export interface SlicerAdapterStatus {
  target: SlicerTarget;
  label: string;
  available: boolean;
  executablePath?: string;
  capability: 'core-3mf' | 'project-3mf' | 'planned';
  detail: string;
  supportedPrinterIds?: string[];
}
export interface ManufacturingPackageResult {
  path: string;
  target: SlicerTarget;
  validated: boolean;
  appliedSettings: string[];
  warnings: string[];
}
export interface PackageValidationCheck { id: string; label: string; passed: boolean; detail: string }
export interface PackageValidationReport { valid: boolean; target: SlicerTarget; checks: PackageValidationCheck[] }
export interface RuleCondition { path: string; op: 'eq'|'gte'|'lte'|'gt'|'lt'; value: string|number|boolean }
export interface RuleAction { setting: SettingKey; value: string|number|boolean; mode?: 'set'|'min'|'max' }
export interface Rule { id: string; group: string; priority: number; conditions: RuleCondition[]; actions: RuleAction[]; reason: string; confidence: number }
