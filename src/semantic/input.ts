import { intentFactUsable, type ManufacturingIntent } from '../intent/manufacturingIntent';
import type { ModelAnalysis } from '../types';
import type { ConfirmedSemanticContext, SemanticFactKey, SemanticFactValue, SemanticInterpretationInput } from './types';

function confirmedContext(intent?: ManufacturingIntent): ConfirmedSemanticContext {
  if (!intent) return { facts: [] };
  const facts: ConfirmedSemanticContext['facts'] = [];
  const add = (key: SemanticFactKey, value: SemanticFactValue, evidence: string) => facts.push({ key, value, evidence });
  if (intentFactUsable(intent.environment.location) && intent.environment.location.value !== 'unknown') {
    add('environment.location', intent.environment.location.value, 'Existing confirmed manufacturing context.');
  }
  if (intentFactUsable(intent.thermal.band) && intent.thermal.band.value !== 'unknown') {
    add('thermal.exposure', intent.thermal.band.value, 'Existing confirmed manufacturing context.');
  }
  if (intentFactUsable(intent.mechanical.loadMode) && intent.mechanical.loadMode.value !== 'unknown') {
    add('load.type', intent.mechanical.loadMode.value, 'Existing confirmed manufacturing context.');
  }
  if (intentFactUsable(intent.interface.fitType) && intent.interface.fitType.value !== 'unknown') {
    add('interface.fit', intent.interface.fitType.value === 'sliding' ? 'sliding' : intent.interface.fitType.value, 'Existing confirmed manufacturing context.');
  }
  if (intentFactUsable(intent.failureConsequence) && intent.failureConsequence.value !== 'unknown') {
    add('failure.consequence', intent.failureConsequence.value === 'safety-critical' ? 'safety_critical' : 'non_critical', 'Existing confirmed manufacturing context.');
  }
  return { facts };
}

export function semanticInputFromModel(
  model: ModelAnalysis,
  description: string,
  language = 'en',
  intent?: ManufacturingIntent,
): SemanticInterpretationInput {
  const dimensions = [model.boundingBox.size.x, model.boundingBox.size.y, model.boundingBox.size.z].sort((left, right) => left - right);
  const largest = Math.max(0.001, dimensions[2]);
  const flatness = dimensions[0] / largest;
  const elongation = largest / Math.max(0.001, dimensions[1]);
  const orientationHeights = model.orientations.map(item => item.heightMm);
  const orientationOverhangs = model.orientations.map(item => item.overhangRatio);
  const geometryObservations = [
    `Triangle mesh dimensions are ${model.boundingBox.size.x.toFixed(1)} × ${model.boundingBox.size.y.toFixed(1)} × ${model.boundingBox.size.z.toFixed(1)} mm.`,
    `Dimension ratios indicate ${flatness <= 0.18 ? 'a plate-like form' : elongation >= 3 ? 'an elongated form' : 'a compact or moderately proportioned form'}; this describes shape only, not purpose.`,
    `The imported orientation has an estimated ${(model.overhangRatio * 100).toFixed(1)}% overhang ratio.`,
    `The imported orientation has an estimated ${model.bedContactAreaMm2.toFixed(0)} mm² bed contact.`,
    model.topology
      ? `The mesh has ${model.topology.componentCount} component(s), ${model.topology.boundaryEdgeCount} boundary edge(s), ${model.topology.nonManifoldEdgeCount} non-manifold edge(s), and is ${model.topology.watertight ? 'watertight' : 'not watertight'}.`
      : 'Detailed mesh topology is unavailable.',
    model.geometryRisk
      ? `${model.geometryRisk.overhangRegionCount} connected overhang region(s) were measured; bed contact covers ${(model.geometryRisk.bedCoverageRatio * 100).toFixed(1)}% of the bounding footprint.`
      : 'Connected overhang-region analysis is unavailable.',
    orientationHeights.length
      ? `Axis-aligned candidate orientations range from ${Math.min(...orientationHeights).toFixed(1)} to ${Math.max(...orientationHeights).toFixed(1)} mm tall and ${(Math.min(...orientationOverhangs) * 100).toFixed(1)}% to ${(Math.max(...orientationOverhangs) * 100).toFixed(1)}% estimated overhang.`
      : 'Alternative axis-aligned orientation measurements are unavailable.',
    'No hole, thread, cavity, mating-feature, load-path, or object-purpose claim is derived from these broad mesh observations.',
  ];
  const filenameClue = model.metadata.clues.find(clue => clue.source === 'file-name')?.value ?? model.fileName;
  return {
    description,
    language,
    filename: filenameClue ? { value: filenameClue, certainty: 'uncertain' } : undefined,
    dimensionsMm: model.boundingBox.size,
    geometryObservations,
    confirmedManufacturingContext: confirmedContext(intent),
  };
}
