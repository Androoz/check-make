import type { Recommendation, SlicerTarget } from '../types';

export const packageExtension = '.3mf';

export function packageFileName(fileName: string, target: SlicerTarget): string {
  const stem = fileName.replace(/\.(?:stl|3mf|obj)$/i, '');
  return target === 'generic' ? `${stem}.check-make.3mf` : `${stem}.check-make.${target}.3mf`;
}

export function serializeRecommendations(recommendations: Recommendation[]): string {
  return JSON.stringify(recommendations.map(({ setting, value }) => ({ setting, value })));
}
