export type Printer = 'X1C' | 'P1S';
export type Material = 'PLA' | 'PETG';
export type Priority = 'strength' | 'accuracy' | 'finish' | 'speed';

export interface Vec3 { x: number; y: number; z: number }
export interface ModelAnalysis {
  fileName: string; triangleCount: number; boundingBox: { min: Vec3; max: Vec3; size: Vec3 };
  heightMm: number; bedContactAreaMm2: number; overhangAreaMm2: number;
  overhangRatio: number; confidence: { bedContact: number; overhang: number };
}
export interface Questionnaire {
  printer: Printer; material: Material; priority: Priority;
  impact: 'none' | 'medium' | 'high'; fitCritical: boolean; outdoor: boolean; supportsAllowed: boolean;
}
export type SettingKey = 'orientation'|'layer_height'|'wall_loops'|'top_layers'|'bottom_layers'|'infill_type'|'infill_percent'|'support'|'brim'|'wall_generator'|'wall_order'|'seam'|'speed_preset';
export interface Recommendation { setting: SettingKey; value: string | number | boolean; reason: string; confidence: number; ruleIds: string[] }
export interface RuleCondition { path: string; op: 'eq'|'gte'|'lte'|'gt'|'lt'; value: string|number|boolean }
export interface RuleAction { setting: SettingKey; value: string|number|boolean; mode?: 'set'|'min'|'max' }
export interface Rule { id: string; group: string; priority: number; conditions: RuleCondition[]; actions: RuleAction[]; reason: string; confidence: number }
