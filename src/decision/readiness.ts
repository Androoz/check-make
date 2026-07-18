import type { ChecklistField, RequirementAssessment } from '../types';
import type { ModelIntelligence } from '../ai/modelIntelligence';

export type ReadinessState = 'ready' | 'needs-input' | 'unsupported';
export interface ReadinessGap { id: string; label: string; reason: string }
export interface DecisionReadiness {
  requirements: ReadinessState;
  conservativePlan: ReadinessState;
  materialAlternatives: ReadinessState;
  processReductions: ReadinessState;
  gaps: ReadinessGap[];
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

export function assessDecisionReadiness(intelligence: ModelIntelligence): DecisionReadiness {
  const gaps: ReadinessGap[] = [];
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
  const requirements: ReadinessState = gaps.length ? 'needs-input' : 'ready';
  return {
    requirements,
    conservativePlan: requirements,
    materialAlternatives: requirements,
    processReductions: 'unsupported',
    gaps,
    processReductionReason: 'Reducing walls, infill, or structural shells requires scoped transferable performance evidence. User answers establish requirements but cannot prove mechanical equivalence.',
  };
}
