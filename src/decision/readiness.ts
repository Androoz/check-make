import type { ChecklistField, RequirementAssessment, SpatialManufacturingIntent, SpatialRegionKind } from '../types';
import type { ModelIntelligence } from '../ai/modelIntelligence';
import { intentFactUsable } from '../intent/manufacturingIntent';
import { confirmedRegion } from '../geometry/spatialIntent';

export type ReadinessState = 'ready' | 'needs-input' | 'unsupported';
export interface ReadinessGap { id: string; label: string; reason: string }
export interface DecisionReadiness {
  requirements: ReadinessState;
  conservativePlan: ReadinessState;
  materialAlternatives: ReadinessState;
  processReductions: ReadinessState;
  gaps: ReadinessGap[];
  unsupportedReasons: string[];
  processReductionReason: string;
}

const labels: Record<'purpose' | ChecklistField, string> = {
  purpose: 'Intended purpose', environment: 'Operating environment', load: 'Load pattern', impact: 'Impact exposure',
  heat: 'Temperature exposure', priority: 'Primary outcome', supportsAllowed: 'Support constraint',
};

function resolved(assessment: RequirementAssessment | undefined) {
  if (!assessment) return false;
  if (assessment.status === 'confirmed' || assessment.status === 'not_applicable') return true;
  return assessment.status === 'inferred' && assessment.confidence >= 0.8 && assessment.evidence.length > 0;
}

export function assessDecisionReadiness(intelligence: ModelIntelligence, spatial?: SpatialManufacturingIntent): DecisionReadiness {
  const gaps: ReadinessGap[] = [];
  const unsupportedReasons: string[] = [];
  if (!intelligence.purposeConfirmed) gaps.push({ id: 'purpose', label: labels.purpose, reason: 'Confirm what the object is expected to do.' });
  (['environment', 'load', 'impact', 'heat', 'priority', 'supportsAllowed'] as ChecklistField[]).forEach(field => {
    const assessment = intelligence.requirements?.[field];
    if (resolved(assessment)) return;
    gaps.push({ id: field, label: labels[field], reason: assessment?.status === 'inferred'
      ? `The current inference is only ${Math.round(assessment.confidence * 100)}% confident and needs confirmation.`
      : 'No sufficiently supported value is available.' });
  });
  intelligence.questions.filter(question => question.id === 'components' || question.id === 'mesh-repair').forEach(question => {
    gaps.push({ id: question.id, label: question.id === 'components' ? 'Separate mesh components' : 'Mesh repair intent', reason: question.why });
  });
  intelligence.questions.filter(question => question.id.startsWith('intent-')).forEach(question => {
    gaps.push({ id: question.id, label: 'Consequential use requirement', reason: question.why });
  });
  const intent = intelligence.manufacturingIntent;
  const regionResolved = (kind: SpatialRegionKind) => Boolean(confirmedRegion(spatial, kind) || spatial?.notApplicable.includes(kind));
  if (intent && intentFactUsable(intent.mechanical.loadDirections) && intent.mechanical.loadDirections.value.length
    && spatial?.loadAxis.status !== 'confirmed' && spatial?.loadAxis.status !== 'not-applicable') {
    gaps.push({ id: 'spatial-load-axis', label: 'Load axis', reason: 'The load type is known, but its model-space axis must be confirmed before orientation can account for layer direction.' });
  }
  if (intent && intentFactUsable(intent.mechanical.loadDirections) && intent.mechanical.loadDirections.value.length && !regionResolved('load-bearing')) {
    gaps.push({ id: 'spatial-load-region', label: 'Load-bearing region', reason: 'Select where the consequential load is applied, or state that no single region applies.' });
  }
  const matingRequired = Boolean(intent && intentFactUsable(intent.interface.fitType) && intent.interface.fitType.value !== 'unknown'
    || intent && intentFactUsable(intent.interface.criticalSurfaces) && intent.interface.criticalSurfaces.value.includes('mating'));
  if (matingRequired && !regionResolved('mating-surface')) gaps.push({ id: 'spatial-mating-surface', label: 'Mating surface', reason: 'Select the mating surface, or state that no single mating surface applies.' });
  const visibleRequired = Boolean(intent && intentFactUsable(intent.interface.criticalSurfaces) && intent.interface.criticalSurfaces.value.includes('visible'));
  if (visibleRequired && !regionResolved('visible-surface')) gaps.push({ id: 'spatial-visible-surface', label: 'Visible surface', reason: 'Select the appearance-critical surface, or state that no single surface applies.' });
  if (intent?.environment.foodContact.value === true && intent.environment.foodContact.status === 'confirmed') unsupportedReasons.push(
    'Check Make has no qualified food-contact material and process dataset, so it cannot make a food-safety material claim.',
  );
  if (intent?.environment.chemicalExposure.value === true && intent.environment.chemicalDetails.status === 'confirmed') unsupportedReasons.push(
    'The chemical exposure is recorded, but no reviewed chemical compatibility matrix is connected to the material rules yet.',
  );
  const requirements: ReadinessState = gaps.length ? 'needs-input' : 'ready';
  const conservativePlan: ReadinessState = requirements === 'needs-input' ? 'needs-input' : unsupportedReasons.length ? 'unsupported' : 'ready';
  return {
    requirements,
    conservativePlan,
    materialAlternatives: requirements === 'needs-input' ? 'needs-input' : unsupportedReasons.length ? 'unsupported' : 'ready',
    processReductions: 'unsupported',
    gaps,
    unsupportedReasons,
    processReductionReason: 'Reducing walls, infill, or structural shells requires scoped transferable performance evidence. User answers establish requirements but cannot prove mechanical equivalence.',
  };
}
