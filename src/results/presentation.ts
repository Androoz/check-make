import type { CompatibilityNotice, Recommendation, SettingKey } from '../types';

export type ResultScope = 'essential' | 'all';
export type ResultReviewState = 'standard' | 'attention';

export interface RecommendationGroup {
  id: 'material' | 'structure' | 'printability' | 'quality';
  label: string;
  description: string;
  recommendations: Recommendation[];
}

const essentialSettings = new Set<SettingKey>([
  'material', 'orientation', 'layer_height', 'wall_loops', 'infill_percent', 'support', 'brim',
]);

const groups: Array<Omit<RecommendationGroup, 'recommendations'> & { settings: SettingKey[] }> = [
  {
    id: 'material',
    label: 'Material & temperatures',
    description: 'The material system Check Make expects this part to need.',
    settings: ['material', 'nozzle_temperature', 'bed_temperature'],
  },
  {
    id: 'structure',
    label: 'Orientation & structure',
    description: 'The decisions with the largest effect on load path and internal structure.',
    settings: ['orientation', 'wall_loops', 'top_layers', 'bottom_layers', 'infill_type', 'infill_percent'],
  },
  {
    id: 'printability',
    label: 'Printability',
    description: 'Support and build-plate measures needed to complete the print reliably.',
    settings: ['support', 'brim'],
  },
  {
    id: 'quality',
    label: 'Quality & speed',
    description: 'Surface, dimensional, seam, and throughput choices.',
    settings: ['layer_height', 'wall_generator', 'wall_order', 'seam', 'speed_preset'],
  },
];

export function groupRecommendations(recommendations: Recommendation[], scope: ResultScope): RecommendationGroup[] {
  return groups.map(group => ({
    id: group.id,
    label: group.label,
    description: group.description,
    recommendations: group.settings
      .map(setting => recommendations.find(item => item.setting === setting))
      .filter((item): item is Recommendation => item !== undefined && (scope === 'all' || essentialSettings.has(item.setting))),
  })).filter(group => group.recommendations.length > 0);
}

export function summarizeResult(decisionGaps: Array<{ id: string }>, notices: CompatibilityNotice[]) {
  const warningCount = notices.filter(notice => notice.severity === 'warning').length;
  const reviewState: ResultReviewState = decisionGaps.length || warningCount ? 'attention' : 'standard';
  return {
    reviewState,
    eyebrow: reviewState === 'attention' ? 'REVIEW REQUIRED · ASSUMPTIONS FOUND' : 'REVIEW REQUIRED',
    title: 'Review the recommended print plan',
    message: decisionGaps.length
      ? `This is one complete plan. ${decisionGaps.length} decision${decisionGaps.length === 1 ? '' : 's'} could materially change it; neutral baseline rules are used until reviewed.`
      : warningCount
        ? `This is one complete plan. Review ${warningCount} printer compatibility warning${warningCount === 1 ? '' : 's'} before export.`
        : 'This is one complete plan based on the model, stated use, selected printer, and deterministic rules. Confirm it before export.',
    warningCount,
  };
}
