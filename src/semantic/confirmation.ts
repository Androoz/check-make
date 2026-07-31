import type { ManufacturingIntent, IntentFactStatus } from '../intent/manufacturingIntent';
import type { ChecklistField, Questionnaire, RequirementAssessment, RequirementAssessments } from '../types';
import type { CandidateFact, SemanticFactKey, SemanticInterpretation } from './types';

export interface PromotedSemanticFact extends CandidateFact {
  promotion: 'explicit-user-statement' | 'user-confirmed';
}

export const semanticFactAnswerId = (fact: Pick<CandidateFact, 'key' | 'value'>) =>
  `semantic:${fact.key}:${fact.value}`;

export const semanticQuestionAnswerId = (questionId: string) => `semantic-question:${questionId}`;

const normalized = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase('en-US')
  .replace(/[“”"'`]/g, '')
  .replace(/[^\p{L}\p{N}°%+-]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export function evidenceIsGroundedInDescription(evidence: string, description: string) {
  const needle = normalized(evidence);
  const haystack = normalized(description);
  return needle.length >= 3 && haystack.includes(needle);
}

function evidenceIsNegated(evidence: string, description: string) {
  const needle = normalized(evidence);
  const haystack = normalized(description);
  const index = haystack.indexOf(needle);
  if (index < 0) return false;
  const context = haystack.slice(Math.max(0, index - 36), index);
  return /\b(?:not|never|no|without|doesnt|isnt|wont|will not|inte|aldrig|utan)\b/u.test(context)
    || /^(?:not|never|no|without|doesnt|isnt|wont|will not|inte|aldrig|utan)\b/u.test(needle);
}

function negationCanExpressFact(fact: CandidateFact) {
  return fact.key === 'load.type' && fact.value === 'none'
    || fact.key === 'interface.mating' && fact.value === 'false'
    || fact.key === 'appearance.requirement' && fact.value === 'none'
    || fact.key === 'failure.consequence' && fact.value === 'non_critical';
}

export function promotedSemanticFacts(
  interpretation: SemanticInterpretation,
  description: string,
  answers: Record<string, string> = {},
): PromotedSemanticFact[] {
  const conflictedKeys = new Set<SemanticFactKey>(interpretation.conflicts.flatMap(conflict => conflict.factKeys));
  const valuesByKey = interpretation.candidateFacts.reduce((map, fact) => {
    const values = map.get(fact.key) ?? new Set<string>();
    values.add(fact.value);
    map.set(fact.key, values);
    return map;
  }, new Map<SemanticFactKey, Set<string>>());
  const promoted: PromotedSemanticFact[] = [];
  interpretation.candidateFacts.forEach(fact => {
    const groupedAnswers = interpretation.confirmationQuestions
      .filter(question => question.factKeys.includes(fact.key))
      .map(question => answers[semanticQuestionAnswerId(question.id)])
      .filter(Boolean);
    if (fact.certainty !== 'explicit' && groupedAnswers.includes('rejected')) return;
    if (fact.certainty !== 'explicit' && groupedAnswers.includes('confirmed')) {
      promoted.push({ ...fact, promotion: 'user-confirmed' });
      return;
    }
    if (answers[semanticFactAnswerId(fact)] === 'rejected') return;
    if (answers[semanticFactAnswerId(fact)] === 'confirmed') {
      promoted.push({ ...fact, promotion: 'user-confirmed' });
      return;
    }
    const explicit = fact.certainty === 'explicit'
      && fact.basis === 'user_description'
      && evidenceIsGroundedInDescription(fact.evidence, description)
      && (!evidenceIsNegated(fact.evidence, description) || negationCanExpressFact(fact))
      && !conflictedKeys.has(fact.key)
      && valuesByKey.get(fact.key)?.size === 1;
    if (explicit) promoted.push({ ...fact, promotion: 'explicit-user-statement' });
  });
  return promoted;
}

const requirementEffects: Record<ChecklistField, string[]> = {
  environment: ['material', 'top and bottom layers'],
  load: ['orientation', 'wall loops', 'infill'],
  impact: ['material', 'wall loops', 'infill'],
  heat: ['material', 'printer compatibility'],
  priority: ['orientation', 'quality and speed'],
  supportsAllowed: ['orientation', 'supports'],
};

function semanticRequirement<T>(
  value: T,
  fact: PromotedSemanticFact,
  field: ChecklistField,
): RequirementAssessment<T> {
  const confirmed = fact.promotion === 'user-confirmed';
  return {
    value,
    status: confirmed ? 'confirmed' : 'inferred',
    source: confirmed ? 'user' : 'ai',
    confidence: confirmed ? 1 : 0.99,
    evidence: [`${confirmed ? 'User confirmed' : 'User explicitly stated'} “${fact.evidence}”.`],
    affectsRecommendations: requirementEffects[field],
  };
}

export function applySemanticFactsToRequirements(
  requirements: RequirementAssessments,
  facts: PromotedSemanticFact[],
): RequirementAssessments {
  const next = { ...requirements } as RequirementAssessments;
  facts.forEach(fact => {
    if (fact.key === 'environment.location' && next.environment.status !== 'confirmed') {
      next.environment = semanticRequirement(fact.value as Questionnaire['environment'], fact, 'environment');
    }
    if (fact.key === 'thermal.exposure' && next.heat.status !== 'confirmed' && ['normal', 'warm', 'hot'].includes(fact.value)) {
      next.heat = semanticRequirement(fact.value as Questionnaire['heat'], fact, 'heat');
    }
    if (fact.key === 'load.type' && next.load.status !== 'confirmed' && ['none', 'static', 'cyclic'].includes(fact.value)) {
      next.load = semanticRequirement(fact.value as Questionnaire['load'], fact, 'load');
    }
    if (fact.key === 'impact.severity' && next.impact.status !== 'confirmed') {
      next.impact = semanticRequirement(fact.value as Questionnaire['impact'], fact, 'impact');
    }
    if (fact.key === 'priority' && next.priority.status !== 'confirmed' && ['strength', 'accuracy', 'finish', 'speed', 'flexibility'].includes(fact.value)) {
      next.priority = semanticRequirement(fact.value as Questionnaire['priority'], fact, 'priority');
    }
    if (fact.key === 'flexibility' && fact.value === 'flexible' && next.priority.status !== 'confirmed') {
      next.priority = semanticRequirement('flexibility', fact, 'priority');
    }
    if (fact.key === 'appearance.requirement' && fact.value === 'finish_critical' && next.priority.status !== 'confirmed') {
      next.priority = semanticRequirement('finish', fact, 'priority');
    }
  });
  return next;
}

export function applySemanticHypothesesToRequirements(
  requirements: RequirementAssessments,
  interpretation: SemanticInterpretation,
): RequirementAssessments {
  const next = { ...requirements } as RequirementAssessments;
  const conflicted = new Set<SemanticFactKey>(interpretation.conflicts.flatMap(conflict => conflict.factKeys));
  const canReplace = (field: ChecklistField) => next[field].status === 'unknown' || next[field].status === 'assumed';
  const assume = <K extends ChecklistField>(field: K, value: Questionnaire[K], fact: CandidateFact) => {
    if (!canReplace(field) || conflicted.has(fact.key) || fact.certainty === 'unknown' || fact.certainty === 'explicit') return;
    const confidence = fact.certainty === 'strong_hypothesis' ? 0.78 : 0.58;
    next[field] = {
      value,
      status: 'assumed',
      source: 'ai',
      confidence,
      evidence: [`Semantic world-model assumption: ${fact.evidence}`],
      affectsRecommendations: requirementEffects[field],
    } as RequirementAssessments[K];
  };
  interpretation.candidateFacts.forEach(fact => {
    if (fact.key === 'environment.location') assume('environment', fact.value as Questionnaire['environment'], fact);
    if (fact.key === 'thermal.exposure' && ['normal', 'warm', 'hot'].includes(fact.value)) {
      assume('heat', fact.value as Questionnaire['heat'], fact);
    }
    if (fact.key === 'load.type' && ['none', 'static', 'cyclic'].includes(fact.value)) assume('load', fact.value as Questionnaire['load'], fact);
    if (fact.key === 'load.type' && fact.value === 'impact') assume('impact', 'medium', fact);
    if (fact.key === 'impact.severity') assume('impact', fact.value as Questionnaire['impact'], fact);
    if (fact.key === 'priority' && ['strength', 'accuracy', 'finish', 'speed', 'flexibility'].includes(fact.value)) {
      assume('priority', fact.value as Questionnaire['priority'], fact);
    }
    if (fact.key === 'flexibility' && fact.value === 'flexible') assume('priority', 'flexibility', fact);
    if (fact.key === 'appearance.requirement' && fact.value === 'finish_critical') assume('priority', 'finish', fact);
  });
  return next;
}

function factStatus(fact: PromotedSemanticFact): IntentFactStatus {
  return fact.promotion === 'user-confirmed' ? 'confirmed' : 'user-stated';
}

export function applySemanticFactsToManufacturingIntent(
  intent: ManufacturingIntent,
  facts: PromotedSemanticFact[],
): ManufacturingIntent {
  const next = structuredClone(intent);
  const functionLabels: Record<string, string> = {
    connect: 'connects components',
    hold: 'holds another object',
    protect: 'protects another component',
    display: 'displays information or an object',
    move: 'moves or guides another component',
    space: 'creates spacing between components',
    seal: 'seals an interface',
    guide: 'guides another component',
    mount: 'mounts another component',
    support: 'supports another component',
    contain: 'contains material or objects',
    fasten: 'fastens or retains components',
    grip: 'provides a hand-operated grip',
    transmit: 'transmits motion, force, or torque',
    other: 'performs the user-confirmed function',
  };
  const evidenceId = (fact: PromotedSemanticFact) => `semantic:${fact.key}:${fact.value}:${fact.promotion}`;
  const setEvidence = (fact: PromotedSemanticFact) => {
    const id = evidenceId(fact);
    if (!next.evidence.some(item => item.id === id)) next.evidence.push({
      id,
      source: fact.promotion === 'user-confirmed' ? 'user-confirmation' : 'user-statement',
      statement: `${fact.promotion === 'user-confirmed' ? 'User confirmed' : 'Context explicitly states'} “${fact.evidence}”.`,
      confidence: 1,
    });
    return { status: factStatus(fact), confidence: 1, evidenceIds: [id] };
  };
  facts.forEach(fact => {
    const evidence = setEvidence(fact);
    const established = (status: IntentFactStatus) => status === 'confirmed' || status === 'user-stated';
    if (fact.key === 'primary_function' && !established(next.function.status)) next.function = { value: functionLabels[fact.value] ?? fact.value, ...evidence };
    if (fact.key === 'environment.location' && !established(next.environment.location.status)) next.environment.location = { value: fact.value as 'indoor' | 'outdoor', ...evidence };
    if (fact.key === 'environment.exposure') {
      if (fact.value === 'uv' && !established(next.environment.uvExposure.status)) next.environment.uvExposure = { value: true, ...evidence };
      if (fact.value === 'moisture' && !established(next.environment.moistureExposure.status)) next.environment.moistureExposure = { value: true, ...evidence };
      if (fact.value === 'chemical' && !established(next.environment.chemicalExposure.status)) next.environment.chemicalExposure = { value: true, ...evidence };
      if (fact.value === 'food_contact' && !established(next.environment.foodContact.status)) next.environment.foodContact = { value: true, ...evidence };
    }
    if (fact.key === 'environment.service' && !established(next.environment.service.status)) next.environment.service = { value: fact.value as 'continuous_outdoor' | 'intermittent_outdoor' | 'washed' | 'dishwasher', ...evidence };
    if (fact.key === 'thermal.exposure' && fact.value === 'freezing' && !established(next.thermal.coldExposure.status)) next.thermal.coldExposure = { value: true, ...evidence };
    if (fact.key === 'thermal.exposure' && ['normal', 'warm', 'hot'].includes(fact.value) && !established(next.thermal.band.status)) next.thermal.band = { value: fact.value as 'normal' | 'warm' | 'hot', ...evidence };
    if (fact.key === 'load.type') {
      if (['none', 'static', 'cyclic'].includes(fact.value) && !established(next.mechanical.loadMode.status)) next.mechanical.loadMode = { value: fact.value as 'none' | 'static' | 'cyclic', ...evidence };
      if (fact.value === 'impact' && !established(next.mechanical.impact.status)) next.mechanical.impact = { value: 'medium', status: 'hypothesized', confidence: 0, evidenceIds: [evidenceId(fact)] };
    }
    if (fact.key === 'impact.severity' && !established(next.mechanical.impact.status)) next.mechanical.impact = { value: fact.value as 'none' | 'medium' | 'high', ...evidence };
    if (fact.key === 'load.magnitude' && !established(next.mechanical.loadMagnitude.status)) next.mechanical.loadMagnitude = { value: fact.value as 'light' | 'moderate' | 'heavy' | 'quantified', ...evidence };
    if (fact.key === 'mechanical.wear' && !established(next.mechanical.wear.status)) next.mechanical.wear = { value: fact.value as 'sliding' | 'abrasive', ...evidence };
    if (fact.key === 'interface.fit' && !established(next.interface.fitType.status)) {
      const fit = fact.value === 'clearance' ? 'sliding' : fact.value;
      next.interface.fitType = { value: fit as 'press' | 'sliding' | 'snap' | 'threaded' | 'sealing', ...evidence };
    }
    if (fact.key === 'interface.mating' && fact.value === 'true' && !established(next.interface.criticalSurfaces.status)) {
      next.interface.criticalSurfaces = { value: ['mating'], ...evidence };
    }
    if (fact.key === 'appearance.requirement' && fact.value !== 'none' && !established(next.interface.criticalSurfaces.status)) {
      next.interface.criticalSurfaces = { value: [...new Set([...next.interface.criticalSurfaces.value, 'visible' as const])], ...evidence };
    }
    if (fact.key === 'failure.consequence' && fact.value !== 'unknown' && !established(next.failureConsequence.status)) {
      next.failureConsequence = { value: fact.value === 'safety_critical' ? 'safety-critical' : 'non-critical', ...evidence };
    }
    if (fact.key === 'lifetime' && !established(next.intendedLifetime.status)) next.intendedLifetime = { value: fact.value === 'long_term' ? 'long-term' : 'temporary', ...evidence };
    if (fact.key === 'pressure.exposure' && !established(next.pressureExposure.status)) next.pressureExposure = { value: fact.value as 'internal' | 'external', ...evidence };
    if (fact.key === 'electrical.requirement' && !established(next.electricalRequirement.status)) next.electricalRequirement = { value: 'insulating', ...evidence };
    if (fact.key === 'priority' && !established(next.preferences.priority.status) && ['strength', 'accuracy', 'finish', 'speed', 'flexibility'].includes(fact.value)) {
      next.preferences.priority = { value: fact.value as Questionnaire['priority'], ...evidence };
    }
    if (fact.key === 'priority' && fact.value === 'cost' && !established(next.preferences.lowerCost.status)) {
      next.preferences.lowerCost = { value: true, ...evidence };
    }
    if (fact.key === 'priority' && fact.value === 'weight' && !established(next.preferences.lowerWeight.status)) {
      next.preferences.lowerWeight = { value: true, ...evidence };
    }
    if (fact.key === 'flexibility' && fact.value === 'flexible') next.preferences.priority = { value: 'flexibility', ...evidence };
  });
  next.compatibility = {
    ...next.compatibility,
    structural: next.compatibility.structural || facts.some(fact =>
      fact.key === 'load.role' && fact.value === 'load_bearing'
      || fact.key === 'primary_function' && ['connect', 'hold', 'move', 'mount', 'support', 'fasten', 'transmit'].includes(fact.value)),
    fitCritical: next.interface.fitType.value !== 'unknown' || next.interface.criticalSurfaces.value.includes('mating'),
    flexible: next.preferences.priority.value === 'flexibility',
    weatherExposed: next.environment.location.value === 'outdoor' || next.environment.uvExposure.value === true || next.environment.moistureExposure.value === true,
    heatExposed: next.thermal.band.value === 'warm' || next.thermal.band.value === 'hot',
    coldExposed: next.thermal.coldExposure?.value === true,
    washExposed: next.environment.service?.value === 'washed' || next.environment.service?.value === 'dishwasher',
    wearExposed: next.mechanical.wear?.value === 'sliding' || next.mechanical.wear?.value === 'abrasive',
  };
  return next;
}

export function semanticFunctionEstablished(
  interpretation: SemanticInterpretation,
  description: string,
  answers: Record<string, string>,
) {
  return promotedSemanticFacts(interpretation, description, answers)
    .some(fact => fact.key === 'primary_function');
}
