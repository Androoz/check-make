import type { ManufacturingIntent } from './intent/manufacturingIntent';

export type Material = 'PLA' | 'PETG' | 'ASA' | 'TPU' | 'PA-CF';
export type Priority = 'strength' | 'accuracy' | 'finish' | 'speed' | 'flexibility';
export type PlanPreference = 'balanced' | 'faster' | 'visual-quality' | 'fit-accuracy' | 'structural-margin';
export type OptimizationObjective = 'recommended' | 'time' | 'visual-quality' | 'fit-accuracy' | 'performance';

export interface Vec3 { x: number; y: number; z: number }
export type SpatialRegionKind = 'load-bearing' | 'mating-surface' | 'visible-surface' | 'critical-thin';
export type SpatialFactStatus = 'hypothesized' | 'confirmed' | 'rejected' | 'not-applicable';
export type ModelAxis = 'x' | 'y' | 'z';
export interface MeshRegionReference {
  triangleIndices: number[];
  centroid: Vec3;
  normal: Vec3;
  bounds: { min: Vec3; max: Vec3 };
  areaMm2: number;
}
export interface SpatialRegion {
  id: string;
  kind: SpatialRegionKind;
  label: string;
  status: SpatialFactStatus;
  confidence: number;
  provenance: 'geometry-candidate' | 'user-selection' | 'user-confirmation';
  evidenceIds: string[];
  mesh: MeshRegionReference;
  thicknessMm?: number;
}
export interface SpatialAxisFact {
  axis: ModelAxis | 'not-applicable' | 'unknown';
  status: SpatialFactStatus;
  confidence: number;
  provenance: 'geometry-candidate' | 'user-selection' | 'user-confirmation';
  evidenceIds: string[];
}
export interface SpatialManufacturingIntent {
  schemaVersion: 1;
  coordinateSpace: 'source-model';
  loadAxis: SpatialAxisFact;
  regions: SpatialRegion[];
  notApplicable: SpatialRegionKind[];
  rejectedCandidateIds: string[];
}
export interface SpatialRegionCandidate extends SpatialRegion {
  status: 'hypothesized';
  provenance: 'geometry-candidate';
}
export interface SpatialCandidateAnalysis {
  schemaVersion: 1;
  planarCandidates: SpatialRegionCandidate[];
  thinCandidates: SpatialRegionCandidate[];
  thicknessCoverage: { sampledTriangles: number; measuredTriangles: number; totalTriangles: number };
  notes: string[];
}
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
export interface MeshComponent {
  id: number;
  triangleCount: number;
  surfaceAreaMm2: number;
  boundingBox: { min: Vec3; max: Vec3; size: Vec3 };
}
export interface MeshTopology {
  componentCount: number;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  degenerateTriangleCount: number;
  watertight: boolean;
}
export interface GeometryFinding {
  id: string;
  severity: 'info' | 'warning';
  label: string;
  detail: string;
  confidence: number;
}
export interface AnalysisLimit {
  id: string;
  label: string;
  status: 'evaluated' | 'not-evaluated' | 'requires-input';
  detail: string;
}
export interface ModelAnalysis {
  fileName: string; triangleCount: number; boundingBox: { min: Vec3; max: Vec3; size: Vec3 };
  heightMm: number; bedContactAreaMm2: number; overhangAreaMm2: number;
  overhangRatio: number; confidence: { bedContact: number; overhang: number };
  orientations: OrientationCandidate[];
  orientationLabel: string;
  metadata: ModelMetadata;
  geometryRisk: GeometryRiskMetrics;
  topology?: MeshTopology;
  components?: MeshComponent[];
  findings?: GeometryFinding[];
  analysisLimits?: AnalysisLimit[];
}
export interface OrientationComparison {
  candidate: OrientationCandidate;
  overallScore: number;
  stabilityScore: number;
  supportScore: number;
  heightScore: number;
  reason: string;
  constraintsApplied?: string[];
  constraintsUnresolved?: string[];
  spatialEvidenceIds?: string[];
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
  supportPreference?: 'auto' | 'required' | 'forbidden';
  printer: PrinterProfile;
  printerId: string;
  manufacturingIntent?: ManufacturingIntent;
  spatialIntent?: SpatialManufacturingIntent;
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
export type RequirementStatus = 'confirmed'|'inferred'|'assumed'|'not_applicable'|'unknown';
export type RequirementSource = 'user'|'geometry'|'filename'|'ai'|'default';
export interface RequirementAssessment<T = Questionnaire[ChecklistField]> {
  value: T;
  status: RequirementStatus;
  confidence: number;
  evidence: string[];
  source: RequirementSource;
  affectsRecommendations: string[];
}
export type RequirementAssessments = { [K in ChecklistField]: RequirementAssessment<Questionnaire[K]> };
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
  inputEvidenceIds?: string[];
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
  inputEvidenceIds?: string[];
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
export interface PlanMetrics {
  source: 'orca-slicer';
  materialGrams: number;
  filamentLengthMm: number;
  estimatedTimeSeconds: number;
  materialVolumeCm3: number;
  warnings: string[];
}
export interface RuleCondition { path: string; op: 'eq'|'gte'|'lte'|'gt'|'lt'; value: string|number|boolean }
export interface RuleAction { setting: SettingKey; value: string|number|boolean; mode?: 'set'|'min'|'max' }
export interface Rule { id: string; group: string; priority: number; conditions: RuleCondition[]; actions: RuleAction[]; reason: string; confidence: number }
