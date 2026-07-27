import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ChecklistField, Material, ModelAnalysis, Questionnaire, RequirementAssessments, RequirementAssessment } from '../types';
import { inferBrief } from '../intent/inferBrief';
import { applyObjectHypothesisAnswers, buildObjectHypothesis } from './objectHypothesis';
import type { ObjectHypothesis } from './objectHypothesis';
import { applyManufacturingIntentAnswers, buildManufacturingIntent, normalizeManufacturingIntent } from '../intent/manufacturingIntent';
import type { ManufacturingIntent } from '../intent/manufacturingIntent';
import { LlamaCppSemanticInterpreter } from '../semantic/llamaCpp';
import { semanticInputFromModel } from '../semantic/input';
import { deterministicSemanticInterpretation } from '../semantic/deterministic';
import { semanticJsonSchema, validateSemanticInterpretation } from '../semantic/schema';
import {
  applySemanticFactsToManufacturingIntent,
  applySemanticFactsToRequirements,
  applySemanticHypothesesToRequirements,
  promotedSemanticFacts,
  semanticFactAnswerId,
  semanticFunctionEstablished,
} from '../semantic/confirmation';
import type { SemanticInterpretation, SemanticProviderInfo } from '../semantic/types';

export type IntelligenceProvider = 'local' | 'llama' | 'openai';

export interface FollowUpQuestion {
  id: string;
  question: string;
  why: string;
  field?: ChecklistField | 'purpose' | 'components' | 'mesh-repair' | 'object-purpose' | 'intent';
  kind?: 'text' | 'single';
  options?: Array<{ value: string; label: string }>;
}

export interface ModelIntelligence {
  provider: IntelligenceProvider;
  objectName: string;
  likelyPurpose: string;
  purposeConfirmed: boolean;
  evidence: string[];
  assumptions: string[];
  questions: FollowUpQuestion[];
  environment: Questionnaire['environment'];
  load: Questionnaire['load'];
  impact: Questionnaire['impact'];
  heat: Questionnaire['heat'];
  priority: Questionnaire['priority'];
  supportsAllowed: Questionnaire['supportsAllowed'];
  supportPreference?: NonNullable<Questionnaire['supportPreference']>;
  materialHint: Material | 'unknown';
  userEvidence: string[];
  requirements: RequirementAssessments;
  objectHypothesis?: ObjectHypothesis;
  manufacturingIntent?: ManufacturingIntent;
  semanticInterpretation?: SemanticInterpretation;
  semanticProvider?: SemanticProviderInfo;
}

export interface AIConnection {
  provider: IntelligenceProvider;
  apiKey: string;
  model: string;
  localEndpoint: string;
  localModel: string;
  localTimeoutMs: number;
}

const requirementEffects: Record<ChecklistField, string[]> = {
  environment: ['material', 'top and bottom layers'],
  load: ['orientation', 'wall loops', 'infill'],
  impact: ['material', 'wall loops', 'infill'],
  heat: ['material', 'printer compatibility'],
  priority: ['orientation', 'quality and speed'],
  supportsAllowed: ['orientation', 'supports'],
};

function assessment<T>(value: T, status: RequirementAssessment<T>['status'], source: RequirementAssessment<T>['source'], confidence: number, evidence: string[], affectsRecommendations: string[]): RequirementAssessment<T> {
  return { value, status, source, confidence, evidence, affectsRecommendations };
}

function localRequirements(model: ModelAnalysis, contextText = '', hypothesis?: ObjectHypothesis): RequirementAssessments {
  const interpretation = inferBrief(contextText, '');
  const bestOverhang = model.orientations.length
    ? Math.min(...model.orientations.map(orientation => orientation.overhangRatio))
    : model.overhangRatio;
  const supportRelevant = bestOverhang > 0.08;
  const supportStatement = interpretation.supportsAllowed;
  const supportsAllowed = supportStatement.evidence.length
    ? assessment<Questionnaire['supportsAllowed']>(
      supportStatement.value as Questionnaire['supportsAllowed'],
      'confirmed',
      'user',
      supportStatement.confidence,
      supportStatement.evidence.map(term => `Context explicitly states “${term}”.`),
      requirementEffects.supportsAllowed,
    )
    : supportRelevant
      ? assessment<Questionnaire['supportsAllowed']>(
        true,
        'inferred',
        'geometry',
        0.9,
        [`Check Make estimates that the best axis-aligned orientation retains ${(bestOverhang * 100).toFixed(1)}% overhang exposure, so removable supports remain available.`],
        requirementEffects.supportsAllowed,
      )
      : assessment<Questionnaire['supportsAllowed']>(true, 'not_applicable', 'geometry', model.confidence.overhang, ['Check Make estimates that the selected orientation does not need removable supports.'], []);
  const explicit = <K extends Exclude<ChecklistField, 'supportsAllowed'>>(field: K) => {
    const item = interpretation[field];
    return item.evidence.length
      ? assessment(item.value as Questionnaire[K], 'inferred', 'user', item.confidence, item.evidence.map(term => `Context indicates “${term}”.`), requirementEffects[field])
      : undefined;
  };
  const worldText = `${contextText} ${hypothesis?.identity.value ?? ''} ${hypothesis?.purpose.value ?? ''}`.toLocaleLowerCase('en-US');
  const assumed = <K extends Exclude<ChecklistField, 'supportsAllowed'>>(field: K, value: Questionnaire[K], confidence: number, reason: string) =>
    assessment(value, 'assumed', 'ai', confidence, [`Check Make assumption: ${reason}`], requirementEffects[field]);
  const environment = explicit('environment') ?? assumed(
    'environment',
    /\b(?:parasol|patio|garden|outdoor|outside|weather|sun|rain|uv)\b/.test(worldText) ? 'outdoor' : 'indoor',
    /\b(?:parasol|patio|garden|outdoor|outside|weather|sun|rain|uv)\b/.test(worldText) ? 0.78 : 0.58,
    /\b(?:parasol|patio|garden|outdoor|outside|weather|sun|rain|uv)\b/.test(worldText)
      ? 'the described object and operating clues normally place this part outdoors.'
      : 'without contrary operating clues, this functional part is provisionally treated as protected indoor use.',
  );
  const load = explicit('load') ?? assumed(
    'load',
    /\b(?:hinge|spring|clip|latch|handle|lever|repeated|vibration|flex)\b/.test(worldText) ? 'cyclic'
      : /\b(?:sign|display|ornament|decorative|cover|label)\b/.test(worldText) ? 'none' : 'static',
    0.64,
    /\b(?:hinge|spring|clip|latch|handle|lever|repeated|vibration|flex)\b/.test(worldText)
      ? 'parts that move, latch, flex, or are handled normally experience repeated loading.'
      : /\b(?:sign|display|ornament|decorative|cover|label)\b/.test(worldText)
        ? 'the likely display or cover function does not normally carry meaningful mechanical load.'
        : 'a bracket, spacer, mount, adapter, holder, or other functional component normally carries a mostly static load.',
  );
  const impact = explicit('impact') ?? assumed(
    'impact',
    /\b(?:handle|hook|tool|toy|guard|bumper|portable|parasol|outdoor)\b/.test(worldText) ? 'medium' : 'none',
    0.56,
    /\b(?:handle|hook|tool|toy|guard|bumper|portable|parasol|outdoor)\b/.test(worldText)
      ? 'handled or exposed parts can reasonably receive occasional knocks.'
      : 'no handling or exposure clue currently suggests recurring impact.',
  );
  const heat = explicit('heat') ?? assumed(
    'heat',
    environment.value === 'outdoor' && /\b(?:sun|direct sun|vehicle|car|parasol)\b/.test(worldText) ? 'warm' : 'normal',
    environment.value === 'outdoor' && /\b(?:sun|direct sun|vehicle|car|parasol)\b/.test(worldText) ? 0.66 : 0.58,
    environment.value === 'outdoor' && /\b(?:sun|direct sun|vehicle|car|parasol)\b/.test(worldText)
      ? 'sun-exposed outdoor parts can become substantially warmer than ambient conditions.'
      : 'no explicit heat source currently suggests service above ordinary ambient conditions.',
  );
  const priority = explicit('priority') ?? assumed(
    'priority',
    /\b(?:adapter|spacer|distance|fit|thread|mating|bearing|insert)\b/.test(worldText) ? 'accuracy'
      : /\b(?:sign|display|ornament|decorative|visible|cosmetic)\b/.test(worldText) ? 'finish'
        : /\b(?:gasket|seal|flexible|bumper)\b/.test(worldText) ? 'flexibility' : 'strength',
    0.64,
    /\b(?:adapter|spacer|distance|fit|thread|mating|bearing|insert)\b/.test(worldText)
      ? 'an adapter, spacer, thread, or mating part is normally governed by fit and dimensional accuracy.'
      : /\b(?:sign|display|ornament|decorative|visible|cosmetic)\b/.test(worldText)
        ? 'a visible or decorative part is normally governed by surface finish.'
        : /\b(?:gasket|seal|flexible|bumper)\b/.test(worldText)
          ? 'the likely function depends on controlled flexibility.'
          : 'for a functional component, strength and durability are the safest initial optimization direction.',
  );
  return { environment, load, impact, heat, priority, supportsAllowed };
}

function requirementsFromLegacyIntelligence(ai: ModelIntelligence): RequirementAssessments {
  const inferred = <T,>(value: T, effects: string[]): RequirementAssessment<T> => assessment(value, value === 'unknown' ? 'unknown' : 'inferred', 'ai', value === 'unknown' ? 0 : 0.6, [], effects);
  return {
    environment: inferred(ai.environment, requirementEffects.environment),
    load: inferred(ai.load, requirementEffects.load), impact: inferred(ai.impact, requirementEffects.impact),
    heat: inferred(ai.heat, requirementEffects.heat),
    priority: ai.priority === 'unknown' ? assessment('unknown', 'assumed', 'default', 0.5, ['A neutral balanced objective is used until the user states a preference.'], requirementEffects.priority) : inferred(ai.priority, requirementEffects.priority),
    supportsAllowed: inferred(ai.supportsAllowed, requirementEffects.supportsAllowed),
  };
}

const choices = (...options: Array<[string, string]>) => options.map(([value, label]) => ({ value, label }));

function questionsForRequirements(requirements: RequirementAssessments, purposeKnown: boolean, topologyQuestions: FollowUpQuestion[] = []): FollowUpQuestion[] {
  const questions = [...topologyQuestions];
  const needsConfirmation = (field: ChecklistField) => {
    const item = requirements[field];
    if (item.status === 'confirmed' || item.status === 'not_applicable') return false;
    return item.status !== 'inferred' || item.confidence < 0.8 || item.evidence.length === 0;
  };
  if (!purposeKnown) questions.push({
    id: 'purpose', field: 'purpose', kind: 'text',
    question: 'What does this part connect, hold, protect, display, or move?',
    why: 'Check Make needs the intended function confirmed before manufacturing decisions can be finalized.',
  });
  if (needsConfirmation('priority')) questions.push({
    id: 'priority', field: 'priority', kind: 'single', question: 'Which outcome matters most for this part?',
    why: 'Priority changes orientation, structural margin, dimensional settings, and surface strategy.',
    options: choices(['strength', 'Strength and durability'], ['accuracy', 'Fit and dimensional accuracy'], ['finish', 'Visible surface quality'], ['flexibility', 'Flexibility'], ['speed', 'Print speed']),
  });
  if (needsConfirmation('load')) questions.push({
    id: 'load', field: 'load', kind: 'single', question: 'What kind of load will the part experience?',
    why: 'Load pattern changes orientation, walls, and internal structure.',
    options: choices(['none', 'No meaningful mechanical load'], ['static', 'Mostly constant or occasional load'], ['cyclic', 'Repeated movement, vibration, or flexing']),
  });
  if (needsConfirmation('impact')) questions.push({
    id: 'impact', field: 'impact', kind: 'single', question: 'Can the part be knocked, dropped, or struck?',
    why: 'Impact exposure changes material and structural margins.',
    options: choices(['none', 'No expected impact'], ['medium', 'Occasional bumps or drops'], ['high', 'Frequent or hard impacts']),
  });
  if (needsConfirmation('environment')) questions.push({
    id: 'environment', field: 'environment', kind: 'single', question: 'Where will the part normally be used?',
    why: 'Weather, moisture, and sunlight determine the viable material family.',
    options: choices(['indoor', 'Indoors and protected'], ['outdoor', 'Outdoors or weather exposed']),
  });
  if (needsConfirmation('heat')) questions.push({
    id: 'heat', field: 'heat', kind: 'single', question: 'What temperatures will the part experience?',
    why: 'Temperature exposure can exclude otherwise suitable materials.',
    options: choices(['normal', 'Normal room conditions'], ['warm', 'Regularly warm, approximately 45–70 °C'], ['hot', 'Hotter than approximately 70 °C']),
  });
  return questions.slice(0, 7);
}

function questionsForObjectHypothesis(hypothesis?: ObjectHypothesis): FollowUpQuestion[] {
  if (!hypothesis) return [];
  if (hypothesis.purpose.status === 'unknown') return [];
  if (hypothesis.purpose.status !== 'hypothesized' || !hypothesis.purpose.consequential) return [];
  return [{
    id: `object-${hypothesis.purpose.id}`, field: 'object-purpose', kind: 'single',
    question: `Does “${hypothesis.purpose.value}” correctly describe what this object is used for?`,
    why: `This hypothesis could affect ${hypothesis.purpose.affectsRecommendations.join(', ')} and must be confirmed before it can be used.`,
    options: choices(['confirmed', 'Yes, use this purpose'], ['rejected', 'No, use only my Context description']),
  }];
}

function questionsForManufacturingIntent(intent?: ManufacturingIntent): FollowUpQuestion[] {
  if (!intent) return [];
  const questions: FollowUpQuestion[] = [];
  if (intent.interface.fitType.status === 'conflicted') questions.push({
    id: 'intent-fit-type', field: 'intent', kind: 'single',
    question: 'Which interface must this part actually provide?',
    why: 'The Context describes incompatible fit types. The selected fit can change dimensional and seam decisions.',
    options: choices(['press', 'Press fit'], ['sliding', 'Sliding or clearance fit'], ['snap', 'Snap fit'], ['threaded', 'Threaded interface'], ['sealing', 'Sealing interface']),
  });
  if (intent.environment.chemicalExposure.value === true && intent.environment.chemicalDetails.status === 'unknown') questions.push({
    id: 'intent-chemical-details', field: 'intent', kind: 'text',
    question: 'Which chemicals, cleaners, oils, or fuels will contact the part?',
    why: '“Chemical exposure” is not specific enough for a defensible material compatibility decision.',
  });
  if (intent.environment.foodContact.value === true && intent.environment.foodContact.status !== 'confirmed') questions.push({
    id: 'intent-food-contact', field: 'intent', kind: 'single',
    question: 'Will the printed part directly contact food?',
    why: 'Food contact needs an explicit confirmation and cannot be inferred into a qualified material claim.',
    options: choices(['confirmed', 'Yes, direct food contact'], ['rejected', 'No food contact']),
  });
  return questions;
}

function questionsForSemanticInterpretation(
  interpretation: SemanticInterpretation | undefined,
  description: string,
  answers: Record<string, string> = {},
): FollowUpQuestion[] {
  if (!interpretation) return [];
  const alreadyPromoted = new Set(promotedSemanticFacts(interpretation, description, answers).map(fact => `${fact.key}:${fact.value}`));
  const checklistFacts = new Set([
    'primary_function', 'environment.location', 'thermal.exposure', 'load.type', 'impact.severity',
    'priority', 'flexibility', 'appearance.requirement',
  ]);
  const consequentialSemanticQuestions = new Set([
    'pressure.exposure', 'electrical.requirement', 'interface.fit',
  ]);
  const generated = interpretation.candidateFacts.flatMap(fact => {
    const id = semanticFactAnswerId(fact);
    if (
      checklistFacts.has(fact.key)
      || !consequentialSemanticQuestions.has(fact.key)
      || alreadyPromoted.has(`${fact.key}:${fact.value}`)
      || answers[id]
    ) return [];
    return [{
      id,
      field: 'intent' as const,
      kind: 'single' as const,
      question: `Should Check Make treat “${fact.value.replaceAll('_', ' ')}” as true for ${fact.key.replaceAll('.', ' ')}?`,
      why: `${fact.evidence} This ${fact.certainty.replaceAll('_', ' ')} remains an AI hypothesis until you confirm it.`,
      options: choices(['confirmed', 'Yes, use this fact'], ['rejected', 'No, do not use it']),
    }];
  });
  const modelQuestions = interpretation.confirmationQuestions.flatMap(question => {
    const related = interpretation.candidateFacts.find(fact => question.factKeys.includes(fact.key));
    if (!related) return [];
    if (checklistFacts.has(related.key)) return [];
    const id = semanticFactAnswerId(related);
    if (alreadyPromoted.has(`${related.key}:${related.value}`) || answers[id]) return [];
    return [{ id, field: 'intent' as const, kind: 'single' as const, question: question.question, why: question.why, options: choices(['confirmed', 'Yes'], ['rejected', 'No']) }];
  });
  return [...modelQuestions, ...generated]
    .filter((question, index, all) => all.findIndex(candidate => candidate.id === question.id) === index)
    .slice(0, 5);
}

export function prepareIntelligenceForReview(ai: ModelIntelligence): ModelIntelligence {
  const requirements = { ...(ai.requirements ?? requirementsFromLegacyIntelligence(ai)) } as RequirementAssessments;
  const hasSupportTradeoff = (ai.questions ?? []).some(question => question.id === 'support-tradeoff');
  if (requirements.supportsAllowed.status === 'unknown' && !hasSupportTradeoff) {
    const savedConstraint = ai.manufacturingIntent?.preferences.supportsAllowed;
    requirements.supportsAllowed = savedConstraint?.status === 'confirmed' && savedConstraint.value === false
      ? assessment(false, 'confirmed', 'user', 1, ['Restored explicit support-free project constraint.'], requirementEffects.supportsAllowed)
      : assessment(true, 'inferred', 'default', 0.9, ['Removable supports may be recommended unless the user sets a support-free constraint.'], requirementEffects.supportsAllowed);
  }
  const topologyQuestions = (ai.questions ?? []).filter(question => question.id !== 'object-purpose-description' && (question.id === 'components' || question.id === 'mesh-repair' || question.id === 'support-tradeoff' || question.id.startsWith('object-') || question.id.startsWith('intent-') || question.id.startsWith('semantic:')));
  const purposeConfirmed = Boolean(ai.purposeConfirmed);
  const intentFallback = buildManufacturingIntent(ai.userEvidence?.[0] ?? '', requirements, ai.objectHypothesis);
  const manufacturingIntent = normalizeManufacturingIntent(ai.manufacturingIntent, intentFallback);
  return { ...ai, purposeConfirmed, requirements, manufacturingIntent, questions: questionsForRequirements(requirements, purposeConfirmed, topologyQuestions) };
}

export function localModelAnalysis(model: ModelAnalysis, contextText = ''): ModelIntelligence {
  const { x, y, z } = model.boundingBox.size;
  const sorted = [x, y, z].sort((a, b) => a - b);
  const flat = sorted[0] < sorted[2] * 0.18;
  const slender = sorted[2] > Math.max(1, sorted[1]) * 3;
  const tall = z > Math.max(x, y) * 2;

  let objectName = 'mechanical component';
  let likelyPurpose = 'A functional part whose exact role cannot be established from geometry alone.';
  if (flat) {
    objectName = 'plate, cover, sign, or mounting panel';
    likelyPurpose = 'Likely a flat structural, protective, decorative, or mounting part.';
  } else if (slender || tall) {
    objectName = 'post, pin, spacer, handle, or tower-like part';
    likelyPurpose = 'Likely transfers force, creates spacing, or supports another component.';
  } else if (sorted[2] / Math.max(1, sorted[0]) < 1.7) {
    objectName = 'compact bracket, block, adapter, or enclosure component';
    likelyPurpose = 'Likely a compact functional component, but mating features and load direction need confirmation.';
  }
  const nameClue = model.metadata?.clues[0];
  if (nameClue) {
    objectName = `possible ${nameClue.value}`;
    likelyPurpose = `The model's ${nameClue.source === 'file-name' ? 'file name' : 'embedded STL name'} suggests this identity, but its intended use remains unconfirmed.`;
  }
  const clueEvidence = model.metadata?.clues.map(clue => {
    const source = clue.source === 'file-name' ? 'File name' : clue.source === 'stl-solid-name' ? 'Embedded STL solid name' : 'Embedded STL binary header';
    return `${source} provides the unverified clue “${clue.value}”.`;
  }) ?? [];
  const geometryRiskEvidence = model.geometryRisk ? [
    `Bed contact covers ${(model.geometryRisk.bedCoverageRatio * 100).toFixed(1)}% of the XY bounding footprint.`,
    `${model.geometryRisk.overhangRegionCount} connected overhang region(s) were measured; the largest projected span is ${model.geometryRisk.largestOverhangRegionSpanMm.toFixed(1)} mm.`,
  ] : [];
  const topologyEvidence = model.topology ? [
    `${model.topology.componentCount} disconnected mesh component(s) were detected.`,
    model.topology.watertight
      ? 'The measured edge topology is closed and manifold.'
      : `${model.topology.boundaryEdgeCount} boundary edge(s) and ${model.topology.nonManifoldEdgeCount} non-manifold edge(s) were detected.`,
  ] : [];
  const topologyQuestions: FollowUpQuestion[] = [];
  if ((model.topology?.componentCount ?? 1) > 1) topologyQuestions.push({
    id: 'components', question: 'Are the disconnected parts meant to be printed together or handled as separate objects?',
    why: 'Separate parts can require different orientations or process settings.',
  });
  if (model.topology && !model.topology.watertight) topologyQuestions.push({
    id: 'mesh-repair', question: 'Are the open or non-manifold surfaces intentional, or should this be a closed solid?',
    why: 'A slicer may repair ambiguous geometry differently from the intended design.',
  });

  const objectHypothesis = buildObjectHypothesis(model, contextText);
  const requirements = localRequirements(model, contextText, objectHypothesis);
  const baseIntent = buildManufacturingIntent(contextText, requirements, objectHypothesis);
  const semanticInterpretation = deterministicSemanticInterpretation(semanticInputFromModel(model, contextText, 'en', baseIntent));
  const semanticFacts = promotedSemanticFacts(semanticInterpretation, contextText);
  const hypothesizedRequirements = applySemanticHypothesesToRequirements(requirements, semanticInterpretation);
  const semanticRequirements = applySemanticFactsToRequirements(hypothesizedRequirements, semanticFacts);
  const manufacturingIntent = applySemanticFactsToManufacturingIntent(
    buildManufacturingIntent(contextText, semanticRequirements, objectHypothesis),
    semanticFacts,
  );
  if (objectHypothesis.identity.status === 'user-stated') objectName = objectHypothesis.identity.value;
  if (objectHypothesis.purpose.status === 'user-stated') likelyPurpose = objectHypothesis.purpose.value;
  return {
    provider: 'local', objectName, likelyPurpose, purposeConfirmed: false,
    evidence: [
      `Overall dimensions are ${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)} mm.`,
      `${(model.overhangRatio * 100).toFixed(1)}% of the surface is estimated as critical overhang.`,
      `${model.bedContactAreaMm2.toFixed(0)} mm² estimated contact in the imported orientation.`,
      ...geometryRiskEvidence,
      ...topologyEvidence,
      ...clueEvidence,
    ],
    assumptions: ['File names and STL header or solid names are unverified labels, not proof of function.', 'STL geometry does not establish material, load direction, operating environment, or whether a downward region can bridge successfully.'],
    questions: questionsForRequirements(
      semanticRequirements,
      objectHypothesis.purpose.status === 'user-stated' || objectHypothesis.purpose.status === 'confirmed',
      [
      ...topologyQuestions,
      ...(contextText.trim() ? [
        ...questionsForObjectHypothesis(objectHypothesis),
        ...questionsForManufacturingIntent(manufacturingIntent),
        ...questionsForSemanticInterpretation(semanticInterpretation, contextText),
      ] : []),
      ],
    ),
    environment: 'unknown', load: 'unknown', impact: 'unknown', heat: 'unknown',
    priority: 'unknown', supportsAllowed: 'unknown',
    supportPreference: semanticRequirements.supportsAllowed.value === false
      ? 'forbidden'
      : /\b(?:use|required?|enable|add|with)\s+(?:removable\s+)?supports?\b/i.test(contextText) ? 'required' : 'auto',
    materialHint: 'unknown', userEvidence: [], requirements: semanticRequirements, objectHypothesis, manufacturingIntent,
    semanticInterpretation,
  };
}

function normalizeAI(value: Record<string, unknown>, fallback: ModelIntelligence): ModelIntelligence {
  const allowed = <T extends string>(candidate: unknown, values: readonly T[], defaultValue: T) =>
    typeof candidate === 'string' && values.includes(candidate as T) ? candidate as T : defaultValue;
  const list = (candidate: unknown) => Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === 'string').slice(0, 8) : [];
  const aiQuestions = Array.isArray(value.questions) ? value.questions.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const q = item as Record<string, unknown>;
    if (typeof q.question !== 'string') return [];
    return [{ id: typeof q.id === 'string' ? q.id : `question-${index + 1}`, question: q.question, why: typeof q.why === 'string' ? q.why : 'Needed to reduce uncertainty.' }];
  }).slice(0, 5) : [];
  const normalizedValues = {
    environment: allowed(value.environment, ['unknown', 'indoor', 'outdoor'] as const, fallback.environment),
    load: allowed(value.load, ['unknown', 'none', 'static', 'cyclic'] as const, fallback.load),
    impact: allowed(value.impact, ['unknown', 'none', 'medium', 'high'] as const, fallback.impact),
    heat: allowed(value.heat, ['unknown', 'normal', 'warm', 'hot'] as const, fallback.heat),
    priority: allowed(value.priority, ['unknown', 'strength', 'accuracy', 'finish', 'speed', 'flexibility'] as const, fallback.priority),
    supportsAllowed: typeof value.supportsAllowed === 'boolean' || value.supportsAllowed === 'unknown' ? value.supportsAllowed : fallback.supportsAllowed,
  };
  const rawRequirements = value.requirements && typeof value.requirements === 'object' ? value.requirements as Record<string, unknown> : {};
  const requirements = { ...fallback.requirements } as RequirementAssessments;
  const writableRequirements = requirements as unknown as Record<ChecklistField, RequirementAssessment>;
  (Object.keys(requirements) as ChecklistField[]).forEach(field => {
    const raw = rawRequirements[field];
    if (!raw || typeof raw !== 'object') return;
    const details = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const evidence = list(details.evidence);
    const candidate = normalizedValues[field] as Questionnaire[typeof field];
    const status = allowed(details.status, ['confirmed', 'inferred', 'assumed', 'not_applicable', 'unknown'] as const, candidate === 'unknown' ? 'unknown' : 'inferred');
    const source = allowed(details.source, ['user', 'geometry', 'filename', 'ai', 'default'] as const, 'ai');
    const confidence = typeof details.confidence === 'number' ? Math.max(0, Math.min(1, details.confidence)) : candidate === 'unknown' ? 0 : 0.65;
    writableRequirements[field] = assessment(candidate, status, source, confidence, evidence, status === 'not_applicable' ? [] : requirementEffects[field]);
  });
  return {
    provider: 'openai',
    objectName: typeof value.objectName === 'string' ? value.objectName : fallback.objectName,
    likelyPurpose: typeof value.likelyPurpose === 'string' ? value.likelyPurpose : fallback.likelyPurpose,
    purposeConfirmed: fallback.purposeConfirmed,
    evidence: list(value.evidence).length ? list(value.evidence) : fallback.evidence,
    assumptions: list(value.assumptions), questions: aiQuestions,
    ...normalizedValues,
    supportPreference: fallback.supportPreference ?? 'auto',
    materialHint: allowed(value.materialHint, ['unknown', 'PLA', 'PETG', 'ASA', 'TPU', 'PA-CF'] as const, fallback.materialHint),
    userEvidence: fallback.userEvidence, requirements, objectHypothesis: fallback.objectHypothesis, manufacturingIntent: fallback.manufacturingIntent,
  };
}

export function refineLocalIntelligence(ai: ModelIntelligence, answers: Record<string, string>): ModelIntelligence {
  const userEvidence = Object.values(answers).map(value => value.trim()).filter(Boolean);
  if (!userEvidence.length) return ai;
  const detail = userEvidence.join(' ');
  const inference = inferBrief(detail, '');
  const requirements = { ...(ai.requirements ?? requirementsFromLegacyIntelligence(ai)) } as RequirementAssessments;
  const writableRequirements = requirements as unknown as Record<ChecklistField, RequirementAssessment>;
  const structured: Partial<Record<ChecklistField, Questionnaire[ChecklistField]>> = {};
  const accepted: Record<ChecklistField, readonly unknown[]> = {
    environment: ['indoor', 'outdoor'], load: ['none', 'static', 'cyclic'], impact: ['none', 'medium', 'high'],
    heat: ['normal', 'warm', 'hot'], priority: ['strength', 'accuracy', 'finish', 'speed', 'flexibility'], supportsAllowed: [true, false],
  };
  const supportPreference: NonNullable<Questionnaire['supportPreference']> =
    answers['support-preference'] === 'required' || answers['support-preference'] === 'forbidden'
      ? answers['support-preference']
      : 'auto';
  if (supportPreference !== 'auto') {
    const value = supportPreference === 'required';
    structured.supportsAllowed = value;
    writableRequirements.supportsAllowed = assessment(
      value, 'confirmed', 'user', 1,
      [`User selected “${value ? 'Use removable supports' : 'Avoid removable supports'}”.`],
      requirementEffects.supportsAllowed,
    );
  }
  (Object.keys(accepted) as ChecklistField[]).forEach(field => {
    if (field === 'supportsAllowed' && supportPreference !== 'auto') return;
    const raw = field === 'supportsAllowed' ? answers['support-tradeoff'] ?? answers[field] : answers[field];
    const value = field === 'supportsAllowed' ? raw === 'true' ? true : raw === 'false' ? false : undefined : raw;
    if (value === undefined || !accepted[field].includes(value)) return;
    structured[field] = value as Questionnaire[ChecklistField];
    writableRequirements[field] = assessment(
      value as Questionnaire[ChecklistField], 'confirmed', 'user', 1,
      [`User selected “${raw}”.`], requirementEffects[field],
    );
  });
  (Object.keys(requirements) as ChecklistField[]).forEach(field => {
    if (structured[field] !== undefined) return;
    const result = inference[field];
    if (!result.evidence.length) return;
    writableRequirements[field] = assessment(result.value, 'confirmed', 'user', result.confidence, result.evidence.map(term => `User clarification matched “${term}”.`), requirementEffects[field]);
  });
  const inferred = <K extends ChecklistField>(field: K): ModelIntelligence[K] =>
    structured[field] !== undefined ? structured[field] as ModelIntelligence[K]
      : inference[field].evidence.length ? inference[field].value as ModelIntelligence[K] : ai[field];
  const hypothesisAnswers = ai.objectHypothesis?.purpose.status === 'unknown' && ai.userEvidence.length === 0 && answers.purpose?.trim()
    ? { ...answers, 'object-purpose-description': answers.purpose }
    : answers;
  const objectHypothesis = ai.objectHypothesis ? applyObjectHypothesisAnswers(ai.objectHypothesis, hypothesisAnswers) : undefined;
  if (objectHypothesis && answers.components?.trim()) {
    objectHypothesis.features = objectHypothesis.features.map(feature => feature.id === 'feature-multiple-components'
      ? { ...feature, status: 'confirmed', confidence: 1 }
      : feature);
  }
  const unresolvedTopologyQuestions = (ai.questions ?? []).filter(question =>
    (question.id === 'components' && !answers.components?.trim()) ||
    (question.id === 'mesh-repair' && !answers['mesh-repair']?.trim()) ||
    (question.id === 'support-tradeoff' && !answers['support-tradeoff']?.trim()));
  const purposeEstablished = objectHypothesis?.purpose.status === 'confirmed' || objectHypothesis?.purpose.status === 'user-stated';
  const intentContext = [ai.userEvidence[0] ?? answers.purpose ?? '', answers['object-purpose-description'] ?? ''].filter(Boolean).join(' ');
  const semanticFacts = ai.semanticInterpretation
    ? promotedSemanticFacts(ai.semanticInterpretation, answers.purpose ?? ai.userEvidence[0] ?? '', answers)
    : [];
  const semanticRequirements = applySemanticFactsToRequirements(requirements, semanticFacts);
  const manufacturingIntent = applySemanticFactsToManufacturingIntent(
    applyManufacturingIntentAnswers(buildManufacturingIntent(intentContext, semanticRequirements, objectHypothesis), answers),
    semanticFacts,
  );
  const semanticPurposeEstablished = ai.semanticInterpretation
    ? semanticFunctionEstablished(ai.semanticInterpretation, answers.purpose ?? ai.userEvidence[0] ?? '', answers)
    : false;
  return {
    ...ai,
    likelyPurpose: objectHypothesis?.purpose.value !== 'Not established' ? objectHypothesis?.purpose.value ?? ai.likelyPurpose : ai.likelyPurpose,
    purposeConfirmed: purposeEstablished || semanticPurposeEstablished || (!objectHypothesis && (Boolean(answers.purpose?.trim()) || ai.purposeConfirmed)),
    evidence: [...ai.evidence, `User-provided clarification: “${detail}”.`],
    assumptions: [...ai.assumptions, 'Prefilled world-model assumptions become manufacturing requirements only after the user reviews and applies the checklist.'],
    questions: questionsForRequirements(semanticRequirements, purposeEstablished || semanticPurposeEstablished || (!objectHypothesis && (Boolean(answers.purpose?.trim()) || ai.purposeConfirmed)), [
      ...unresolvedTopologyQuestions,
      ...questionsForObjectHypothesis(objectHypothesis),
      ...questionsForManufacturingIntent(manufacturingIntent),
      ...questionsForSemanticInterpretation(ai.semanticInterpretation, answers.purpose ?? ai.userEvidence[0] ?? '', answers),
    ]),
    environment: inferred('environment'), load: inferred('load'), impact: inferred('impact'), heat: inferred('heat'),
    priority: inferred('priority'), supportsAllowed: inferred('supportsAllowed'), supportPreference,
    userEvidence, requirements: semanticRequirements, objectHypothesis, manufacturingIntent,
  };
}

export async function analyzeWithLocalSemanticAI(
  connection: AIConnection,
  model: ModelAnalysis,
  followUpAnswers: Record<string, string>,
  signal?: AbortSignal,
): Promise<ModelIntelligence> {
  const description = followUpAnswers.purpose?.trim() ?? '';
  const fallback = localModelAnalysis(model, description);
  const interpreter = new LlamaCppSemanticInterpreter({
    endpoint: connection.localEndpoint,
    model: connection.localModel,
    timeoutMs: connection.localTimeoutMs,
  });
  const semanticInterpretation = await interpreter.interpret(
    semanticInputFromModel(model, description, 'en', fallback.manufacturingIntent),
    signal,
  );
  return intelligenceFromSemantic('llama', interpreter.provider, model, description, followUpAnswers, fallback, semanticInterpretation);
}

function intelligenceFromSemantic(
  provider: 'llama' | 'openai',
  semanticProvider: SemanticProviderInfo,
  model: ModelAnalysis,
  description: string,
  followUpAnswers: Record<string, string>,
  fallback: ModelIntelligence,
  semanticInterpretation: SemanticInterpretation,
): ModelIntelligence {
  const semanticFacts = promotedSemanticFacts(semanticInterpretation, description, followUpAnswers);
  const hypothesizedRequirements = applySemanticHypothesesToRequirements(fallback.requirements, semanticInterpretation);
  const requirements = applySemanticFactsToRequirements(hypothesizedRequirements, semanticFacts);
  const objectHypothesis = buildObjectHypothesis(model, description, {
    objectName: semanticInterpretation.objectIdentity.value,
    likelyPurpose: semanticInterpretation.primaryFunction.value,
    evidence: [
      semanticInterpretation.objectIdentity.evidence,
      semanticInterpretation.primaryFunction.evidence,
    ],
  });
  const manufacturingIntent = applySemanticFactsToManufacturingIntent(
    buildManufacturingIntent(description, requirements, objectHypothesis),
    semanticFacts,
  );
  const purposeConfirmed = semanticFunctionEstablished(semanticInterpretation, description, followUpAnswers)
    || objectHypothesis.purpose.status === 'user-stated'
    || objectHypothesis.purpose.status === 'confirmed';
  return {
    ...fallback,
    provider,
    objectName: semanticInterpretation.objectIdentity.value,
    likelyPurpose: semanticInterpretation.primaryFunction.value,
    purposeConfirmed,
    requirements,
    objectHypothesis,
    manufacturingIntent,
    semanticInterpretation,
    semanticProvider,
    evidence: [
      ...fallback.evidence,
      `Extended AI Analysis using the ${provider === 'llama' ? 'local' : 'cloud'} provider proposed ${semanticInterpretation.candidateFacts.length} schema-validated candidate fact(s).`,
    ],
    assumptions: [
      ...fallback.assumptions,
      'Extended AI output remains hypothetical unless grounded as an explicit user statement or confirmed by the user.',
    ],
    questions: questionsForRequirements(requirements, purposeConfirmed, [
      ...fallback.questions.filter(question => question.id === 'components' || question.id === 'mesh-repair' || question.id === 'support-tradeoff'),
      ...questionsForObjectHypothesis(objectHypothesis),
      ...questionsForManufacturingIntent(manufacturingIntent),
      ...questionsForSemanticInterpretation(semanticInterpretation, description, followUpAnswers),
    ]),
  };
}

export async function analyzeWithOpenAI(
  connection: AIConnection,
  model: ModelAnalysis,
  previewImage: string | undefined,
  followUpAnswers: Record<string, string>,
): Promise<ModelIntelligence> {
  if (!isTauri()) throw new Error('AI analysis is available in the desktop app.');
  if (!connection.apiKey.trim()) throw new Error('Enter an OpenAI API key or use local preliminary analysis.');
  const description = followUpAnswers.purpose?.trim() ?? '';
  const fallback = localModelAnalysis(model, description);
  const semanticInput = semanticInputFromModel(model, description, 'en', fallback.manufacturingIntent);
  const context = JSON.stringify({
    input: semanticInput,
    schema: semanticJsonSchema,
  });
  const raw = await invoke<string>('analyze_model_with_openai', {
    apiKey: connection.apiKey,
    model: connection.model || 'gpt-5.4-mini',
    context,
    previewImage: previewImage ?? null,
  });
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  const semanticInterpretation = validateSemanticInterpretation(JSON.parse(cleaned));
  return intelligenceFromSemantic(
    'openai',
    { kind: 'openai', endpoint: 'https://api.openai.com/v1/responses', model: connection.model || 'gpt-5.4-mini', localOnly: false },
    model,
    description,
    followUpAnswers,
    fallback,
    semanticInterpretation,
  );
}

export function questionnaireFromIntelligence(ai: ModelIntelligence, printer: Questionnaire['printer']): Questionnaire {
  const purpose = ai.userEvidence.join(' ');
  const requirements = ai.requirements ?? requirementsFromLegacyIntelligence(ai);
  const manufacturingIntent = normalizeManufacturingIntent(
    ai.manufacturingIntent,
    buildManufacturingIntent(purpose, requirements, ai.objectHypothesis),
  );
  return {
    purpose,
    properties: '',
    environment: ai.environment, load: ai.load, impact: ai.impact, heat: ai.heat,
    priority: ai.priority, supportsAllowed: ai.supportsAllowed, supportPreference: ai.supportPreference ?? 'auto',
    printerId: printer.id, printer,
    manufacturingIntent,
  };
}
