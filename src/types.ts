export type Material = 'PLA' | 'PETG' | 'ASA' | 'TPU' | 'PA-CF';
export type Priority = 'strength' | 'accuracy' | 'finish' | 'speed' | 'flexibility';

export interface Vec3 { x: number; y: number; z: number }
export interface ModelAnalysis {
  fileName: string; triangleCount: number; boundingBox: { min: Vec3; max: Vec3; size: Vec3 };
  heightMm: number; bedContactAreaMm2: number; overhangAreaMm2: number;
  overhangRatio: number; confidence: { bedContact: number; overhang: number };
  orientations: OrientationCandidate[];
  orientationLabel: string;
}
export interface OrientationCandidate { id: string; label: string; heightMm: number; bedContactAreaMm2: number; overhangRatio: number }
export interface Questionnaire {
  purpose: string;
  properties: string;
  environment: 'indoor' | 'outdoor';
  load: 'none' | 'static' | 'cyclic';
  impact: 'none' | 'medium' | 'high';
  heat: 'normal' | 'warm' | 'hot';
  priority: Priority;
  supportsAllowed: boolean;
  printer: PrinterProfile;
  printerId: string;
}
export interface PrinterCapabilities {
  maxNozzleTempC: number; maxBedTempC: number; enclosed: boolean; hardenedNozzle: boolean; buildVolume: Vec3;
}
export interface PrinterProfile extends PrinterCapabilities { id: string; manufacturer: string; model: string; notes: string }
export interface PurposeSignals {
  structural: boolean; fitCritical: boolean; flexible: boolean; weatherExposed: boolean;
  heatExposed: boolean; keywords: string[];
}
export type ChecklistField = 'environment'|'load'|'impact'|'heat'|'priority'|'supportsAllowed';
export interface InferenceValue<T> { value: T; confidence: number; evidence: string[] }
export type BriefInference = { [K in ChecklistField]: InferenceValue<Questionnaire[K]> };
export interface CompatibilityNotice { severity: 'info'|'warning'; message: string }
export type SettingKey = 'material'|'nozzle_temperature'|'bed_temperature'|'orientation'|'layer_height'|'wall_loops'|'top_layers'|'bottom_layers'|'infill_type'|'infill_percent'|'support'|'brim'|'wall_generator'|'wall_order'|'seam'|'speed_preset';
export interface Recommendation { setting: SettingKey; value: string | number | boolean; reason: string; confidence: number; ruleIds: string[] }
export type SlicerTarget = 'generic' | 'bambu' | 'orca' | 'prusa' | 'cura';
export interface SlicerAdapterStatus {
  target: SlicerTarget;
  label: string;
  available: boolean;
  executablePath?: string;
  capability: 'core-3mf' | 'project-3mf' | 'planned';
  detail: string;
}
export interface ManufacturingPackageResult {
  path: string;
  target: SlicerTarget;
  validated: boolean;
  appliedSettings: string[];
  warnings: string[];
}
export interface RuleCondition { path: string; op: 'eq'|'gte'|'lte'|'gt'|'lt'; value: string|number|boolean }
export interface RuleAction { setting: SettingKey; value: string|number|boolean; mode?: 'set'|'min'|'max' }
export interface Rule { id: string; group: string; priority: number; conditions: RuleCondition[]; actions: RuleAction[]; reason: string; confidence: number }
