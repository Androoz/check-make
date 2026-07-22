import type { ChecklistField, Priority, Questionnaire, RequirementAssessment, RequirementAssessments } from '../types';
import type { ObjectEvidenceSource, ObjectHypothesis } from '../ai/objectHypothesis';
import { interpretBriefV3 } from './inferBrief';
import type { ContextFacet } from './contextFacets';

export type IntentFactStatus = 'unknown' | 'hypothesized' | 'user-stated' | 'confirmed' | 'conflicted' | 'rejected' | 'not-applicable';
export type IntentEvidenceSource = ObjectEvidenceSource | 'requirement' | 'user-confirmation';
export type LoadDirection = 'tension' | 'compression' | 'bending' | 'torsion' | 'shear';
export type FitType = 'press' | 'sliding' | 'snap' | 'threaded' | 'sealing';
export type CriticalSurface = 'visible' | 'mating';
export type FailureConsequence = 'unknown' | 'non-critical' | 'safety-critical';
export type IntendedLifetime = 'unknown' | 'temporary' | 'long-term';

export interface IntentEvidence {
  id: string;
  source: IntentEvidenceSource;
  statement: string;
  confidence: number;
}

export interface EvidencedValue<T> {
  value: T;
  status: IntentFactStatus;
  confidence: number;
  evidenceIds: string[];
}

export interface ManufacturingIntent {
  schemaVersion: 1;
  identity: EvidencedValue<string>;
  function: EvidencedValue<string>;
  environment: {
    location: EvidencedValue<Questionnaire['environment']>;
    uvExposure: EvidencedValue<boolean | 'unknown'>;
    moistureExposure: EvidencedValue<boolean | 'unknown'>;
    chemicalExposure: EvidencedValue<boolean | 'unknown'>;
    chemicalDetails: EvidencedValue<string>;
    foodContact: EvidencedValue<boolean | 'unknown'>;
  };
  thermal: {
    band: EvidencedValue<Questionnaire['heat']>;
    explicitRangeC: EvidencedValue<{ minimum: number; maximum: number } | null>;
  };
  mechanical: {
    loadMode: EvidencedValue<Questionnaire['load']>;
    loadDirections: EvidencedValue<LoadDirection[]>;
    impact: EvidencedValue<Questionnaire['impact']>;
  };
  interface: {
    fitType: EvidencedValue<FitType | 'unknown'>;
    criticalSurfaces: EvidencedValue<CriticalSurface[]>;
  };
  failureConsequence: EvidencedValue<FailureConsequence>;
  intendedLifetime: EvidencedValue<IntendedLifetime>;
  preferences: {
    priority: EvidencedValue<Questionnaire['priority']>;
    supportsAllowed: EvidencedValue<Questionnaire['supportsAllowed']>;
    lowerCost: EvidencedValue<boolean | 'unknown'>;
    lowerWeight: EvidencedValue<boolean | 'unknown'>;
  };
  compatibility: {
    structural: boolean;
    fitCritical: boolean;
    flexible: boolean;
    weatherExposed: boolean;
    heatExposed: boolean;
  };
  evidence: IntentEvidence[];
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const unknown = <T,>(value: T): EvidencedValue<T> => ({ value, status: 'unknown', confidence: 0, evidenceIds: [] });

function requirementStatus(status: RequirementAssessment['status']): IntentFactStatus {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'inferred') return 'hypothesized';
  if (status === 'not_applicable') return 'not-applicable';
  return 'unknown';
}

function hypothesisStatus(status: ObjectHypothesis['identity']['status']): IntentFactStatus {
  return status;
}

function facetValue<T>(facet: ContextFacet | undefined, value: T, evidenceIds: string[]): EvidencedValue<T> {
  if (!facet) return unknown(value);
  return { value, status: 'user-stated', confidence: facet.confidence, evidenceIds };
}

function singleFacetValue<T extends string>(facets: ContextFacet[], mapping: Record<string, T>, fallback: T): { value: T; status: IntentFactStatus; confidence: number; facetIds: string[] } {
  const matches = facets.flatMap(facet => mapping[facet.id] ? [{ facet, value: mapping[facet.id] }] : []);
  const values = [...new Set(matches.map(match => match.value))];
  if (!matches.length) return { value: fallback, status: 'unknown', confidence: 0, facetIds: [] };
  if (values.length > 1) return { value: fallback, status: 'conflicted', confidence: 0, facetIds: matches.map(match => match.facet.id) };
  return { value: values[0], status: 'user-stated', confidence: Math.max(...matches.map(match => match.facet.confidence)), facetIds: matches.map(match => match.facet.id) };
}

export function buildManufacturingIntent(
  contextText: string,
  requirements: RequirementAssessments,
  objectHypothesis?: ObjectHypothesis,
): ManufacturingIntent {
  const interpretation = interpretBriefV3(contextText, '');
  const evidence: IntentEvidence[] = [];
  const addEvidence = (id: string, source: IntentEvidenceSource, statement: string, confidence: number) => {
    if (!evidence.some(item => item.id === id)) evidence.push({ id, source, statement, confidence: clamp(confidence) });
    return id;
  };

  objectHypothesis?.evidence.forEach(item => addEvidence(`object:${item.id}`, item.source, item.statement, item.confidence));
  const objectEvidenceIds = (ids: string[]) => ids.map(id => `object:${id}`);
  const requirementFact = <K extends ChecklistField>(field: K): EvidencedValue<Questionnaire[K]> => {
    const item = requirements[field];
    const ids = item.evidence.map((statement, index) => addEvidence(`requirement:${field}:${index + 1}`, item.source === 'user' ? 'user-confirmation' : 'requirement', statement, item.confidence));
    return { value: item.value as Questionnaire[K], status: requirementStatus(item.status), confidence: item.confidence, evidenceIds: ids };
  };
  const facetEvidence = (facet: ContextFacet) => facet.evidence.map((statement, index) =>
    addEvidence(`facet:${facet.id}:${index + 1}`, 'language-match', `Context matched “${statement}” for ${facet.value}.`, facet.confidence));

  const identity: EvidencedValue<string> = objectHypothesis
    ? { value: objectHypothesis.identity.value, status: hypothesisStatus(objectHypothesis.identity.status), confidence: objectHypothesis.identity.confidence, evidenceIds: objectEvidenceIds(objectHypothesis.identity.evidenceIds) }
    : unknown('Not established');
  const objectFunction: EvidencedValue<string> = objectHypothesis
    ? { value: objectHypothesis.purpose.value, status: hypothesisStatus(objectHypothesis.purpose.status), confidence: objectHypothesis.purpose.confidence, evidenceIds: objectEvidenceIds(objectHypothesis.purpose.evidenceIds) }
    : unknown('Not established');

  const facetsById = new Map(interpretation.facets.map(facet => [facet.id, facet]));
  const booleanFacet = (id: string): EvidencedValue<boolean | 'unknown'> => {
    const facet = facetsById.get(id);
    return facetValue(facet, facet ? true : 'unknown', facet ? facetEvidence(facet) : []);
  };
  const directions = interpretation.facets.filter(facet => facet.category === 'mechanical-demand' && facet.id !== 'load-fatigue');
  const directionMapping: Record<string, LoadDirection> = {
    'load-tension': 'tension', 'load-compression': 'compression', 'load-bending': 'bending',
    'load-torsion': 'torsion', 'load-shear': 'shear',
  };
  const directionValues = [...new Set(directions.flatMap(facet => directionMapping[facet.id] ? [directionMapping[facet.id]] : []))];
  const directionEvidence = directions.flatMap(facetEvidence);
  const fit = singleFacetValue(interpretation.facets, {
    'fit-press': 'press', 'fit-sliding': 'sliding', 'fit-snap': 'snap', 'fit-thread': 'threaded', 'fit-seal': 'sealing',
  }, 'unknown');
  const fitEvidence = fit.facetIds.flatMap(id => facetsById.get(id) ? facetEvidence(facetsById.get(id)!) : []);
  const surfaces = interpretation.facets.filter(facet => facet.category === 'critical-surface');
  const surfaceValues = [...new Set(surfaces.map(facet => facet.id === 'surface-visible' ? 'visible' as const : 'mating' as const))];
  const failure = singleFacetValue(interpretation.facets, { 'failure-safety': 'safety-critical', 'failure-noncritical': 'non-critical' }, 'unknown');
  const lifetime = singleFacetValue(interpretation.facets, { 'lifetime-long': 'long-term', 'lifetime-temporary': 'temporary' }, 'unknown');
  const temperatures = interpretation.temperaturesC;
  const explicitRange = temperatures.length
    ? { value: { minimum: Math.min(...temperatures), maximum: Math.max(...temperatures) }, status: 'user-stated' as const, confidence: 0.99, evidenceIds: [addEvidence('temperature:explicit', 'language-match', `Context states ${Math.min(...temperatures)}–${Math.max(...temperatures)} °C.`, 0.99)] }
    : unknown<{ minimum: number; maximum: number } | null>(null);
  const priority = requirementFact('priority');
  const loadMode = requirementFact('load');
  const environment = requirementFact('environment');
  const heat = requirementFact('heat');
  const mechanicalFunction = objectFunction.status === 'confirmed' || objectFunction.status === 'user-stated'
    ? /hold|support|connect|adapt|move|guide/i.test(objectFunction.value)
    : false;

  return {
    schemaVersion: 1,
    identity,
    function: objectFunction,
    environment: {
      location: environment,
      uvExposure: booleanFacet('environment-uv'),
      moistureExposure: booleanFacet('environment-moisture'),
      chemicalExposure: booleanFacet('environment-chemical'),
      chemicalDetails: unknown(''),
      foodContact: booleanFacet('environment-food'),
    },
    thermal: { band: heat, explicitRangeC: explicitRange },
    mechanical: {
      loadMode,
      loadDirections: directionValues.length
        ? { value: directionValues, status: 'user-stated', confidence: Math.min(...directions.map(facet => facet.confidence)), evidenceIds: directionEvidence }
        : unknown<LoadDirection[]>([]),
      impact: requirementFact('impact'),
    },
    interface: {
      fitType: { value: fit.value, status: fit.status, confidence: fit.confidence, evidenceIds: fitEvidence },
      criticalSurfaces: surfaceValues.length
        ? { value: surfaceValues, status: 'user-stated', confidence: Math.min(...surfaces.map(facet => facet.confidence)), evidenceIds: surfaces.flatMap(facetEvidence) }
        : unknown<CriticalSurface[]>([]),
    },
    failureConsequence: { value: failure.value, status: failure.status, confidence: failure.confidence, evidenceIds: failure.facetIds.flatMap(id => facetsById.get(id) ? facetEvidence(facetsById.get(id)!) : []) },
    intendedLifetime: { value: lifetime.value, status: lifetime.status, confidence: lifetime.confidence, evidenceIds: lifetime.facetIds.flatMap(id => facetsById.get(id) ? facetEvidence(facetsById.get(id)!) : []) },
    preferences: {
      priority,
      supportsAllowed: requirementFact('supportsAllowed'),
      lowerCost: booleanFacet('preference-cost'),
      lowerWeight: booleanFacet('preference-weight'),
    },
    compatibility: {
      structural: mechanicalFunction || directionValues.length > 0 || (intentFactUsable(loadMode) && loadMode.value !== 'unknown' && loadMode.value !== 'none') || (intentFactUsable(priority) && priority.value === 'strength'),
      fitCritical: (fit.status === 'user-stated' || fit.status === 'confirmed') && fit.value !== 'unknown' || surfaceValues.includes('mating') || (intentFactUsable(priority) && priority.value === 'accuracy'),
      flexible: intentFactUsable(priority) && priority.value === 'flexibility',
      weatherExposed: intentFactUsable(environment) && environment.value === 'outdoor' || facetsById.has('environment-uv') || facetsById.has('environment-moisture'),
      heatExposed: intentFactUsable(heat) && (heat.value === 'warm' || heat.value === 'hot') || temperatures.some(value => value >= 45),
    },
    evidence,
  };
}

export function applyManufacturingIntentAnswers(intent: ManufacturingIntent, answers: Record<string, string>): ManufacturingIntent {
  const evidence = [...intent.evidence];
  const record = (id: string, statement: string) => {
    if (!evidence.some(item => item.id === id)) evidence.push({ id, source: 'user-confirmation', statement, confidence: 1 });
    return id;
  };
  const chemicalDetails = answers['intent-chemical-details']?.trim();
  const fitAnswer = answers['intent-fit-type'] as FitType | undefined;
  const safetyAnswer = answers['intent-safety-critical'];
  const foodAnswer = answers['intent-food-contact'];
  const next: ManufacturingIntent = {
    ...intent,
    environment: {
      ...intent.environment,
      chemicalDetails: chemicalDetails
        ? { value: chemicalDetails, status: 'confirmed', confidence: 1, evidenceIds: [record('intent:user:chemical-details', `The user identified the chemical exposure as “${chemicalDetails}”.`)] }
        : intent.environment.chemicalDetails,
      foodContact: foodAnswer === 'confirmed'
        ? { value: true, status: 'confirmed', confidence: 1, evidenceIds: [...intent.environment.foodContact.evidenceIds, record('intent:user:food-confirmed', 'The user confirmed food contact.')] }
        : foodAnswer === 'rejected'
          ? { value: false, status: 'confirmed', confidence: 1, evidenceIds: [...intent.environment.foodContact.evidenceIds, record('intent:user:food-rejected', 'The user confirmed that the part will not contact food.')] }
          : intent.environment.foodContact,
    },
    interface: {
      ...intent.interface,
      fitType: fitAnswer && ['press', 'sliding', 'snap', 'threaded', 'sealing'].includes(fitAnswer)
        ? { value: fitAnswer, status: 'confirmed', confidence: 1, evidenceIds: [...intent.interface.fitType.evidenceIds, record('intent:user:fit-type', `The user selected a ${fitAnswer} interface.`)] }
        : intent.interface.fitType,
    },
    failureConsequence: safetyAnswer === 'confirmed'
      ? { value: 'safety-critical', status: 'confirmed', confidence: 1, evidenceIds: [...intent.failureConsequence.evidenceIds, record('intent:user:safety-confirmed', 'The user confirmed that failure could cause injury.')] }
      : safetyAnswer === 'rejected'
        ? { value: 'non-critical', status: 'confirmed', confidence: 1, evidenceIds: [...intent.failureConsequence.evidenceIds, record('intent:user:safety-rejected', 'The user confirmed that failure is not safety-critical.')] }
        : intent.failureConsequence,
    evidence,
  };
  next.compatibility = {
    ...next.compatibility,
    fitCritical: next.interface.fitType.value !== 'unknown' || next.interface.criticalSurfaces.value.includes('mating') || next.preferences.priority.value === 'accuracy',
  };
  return next;
}

export function intentFactUsable<T>(fact: EvidencedValue<T>) {
  return fact.status === 'confirmed' || fact.status === 'user-stated' || fact.status === 'not-applicable';
}

export function confirmedIntentValue<T>(fact: EvidencedValue<T>, fallback: T): T {
  return intentFactUsable(fact) ? fact.value : fallback;
}

export function emptyManufacturingIntent(answers: Questionnaire): ManufacturingIntent {
  const defaults: Record<ChecklistField, Questionnaire[ChecklistField]> = {
    environment: 'unknown', load: 'unknown', impact: 'unknown', heat: 'unknown', priority: 'unknown', supportsAllowed: 'unknown',
  };
  const requirements = (['environment', 'load', 'impact', 'heat', 'priority', 'supportsAllowed'] as ChecklistField[]).reduce((result, field) => {
    const value = answers[field] ?? defaults[field];
    (result as Record<string, unknown>)[field] = {
      value, status: value === 'unknown' ? 'unknown' : 'confirmed', confidence: value === 'unknown' ? 0 : 1,
      evidence: value === 'unknown' ? [] : [`Structured answer supplied for ${field}.`], source: 'user', affectsRecommendations: [],
    };
    return result;
  }, {} as RequirementAssessments);
  return buildManufacturingIntent(answers.purpose, requirements);
}
