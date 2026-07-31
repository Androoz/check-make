import { interpretBriefV3 } from '../intent/inferBrief';
import { interpretSemanticRelations } from '../intent/semanticRelations';
import { interpretUsageContext } from '../intent/usageContext';
import { validateSemanticInterpretation } from './schema';
import {
  semanticVocabularyVersion,
  type CandidateFact,
  type SemanticFactKey,
  type SemanticFactValue,
  type SemanticInterpretation,
  type SemanticInterpretationInput,
} from './types';

function fact(
  key: SemanticFactKey,
  value: SemanticFactValue,
  evidence: string,
  explicit = true,
  confidence: 'strong' | 'weak' = 'strong',
): CandidateFact {
  return {
    key,
    value,
    certainty: explicit ? 'explicit' : confidence === 'strong' ? 'strong_hypothesis' : 'weak_hypothesis',
    basis: explicit ? 'user_description' : 'world_knowledge',
    evidence,
    needsConfirmation: !explicit,
  };
}

function firstMatch(text: string, expression: RegExp) {
  const match = text.match(expression);
  return match?.[0];
}

function deduplicate(facts: CandidateFact[]) {
  const seen = new Set<string>();
  return facts.filter(item => {
    const key = `${item.key}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferenceIsExplicit(field: string, evidence: string) {
  if (field === 'environment') return true;
  if (field === 'load') return /\b(?:cyclic|repeated|fatigue|vibration|constant|steady|static|no (?:meaningful |mechanical )?load|holds?|supports?)\b/i.test(evidence);
  if (field === 'impact') return /\b(?:impacts?|knocks?|bumps?|drops?|struck|no impacts?|no knocks?)\b/i.test(evidence);
  if (field === 'heat') return /\b(?:warm|hot|temperature|heat|engine bay|oven|exhaust|\d+\s*°?\s*c)\b/i.test(evidence);
  if (field === 'priority') return /\b(?:strength|accurate fit|tolerance|press[- ]?fit|snap[- ]?fit|sliding fit|clearance fit|dimensionally accurate|surface finish|visible face|smooth|quick prototype|fast print|flexible|low weight|low cost)\b/i.test(evidence);
  return false;
}

export function deterministicSemanticInterpretation(input: SemanticInterpretationInput): SemanticInterpretation {
  const description = input.description.trim();
  const parsed = interpretBriefV3(description);
  const relation = interpretSemanticRelations(description);
  const usageContext = interpretUsageContext(description, relation.target);
  const contextualIdentity = usageContext?.objectIdentity;
  const contextualFunction = usageContext?.primaryFunction;
  const facts: CandidateFact[] = [];

  if (relation.function) facts.push(fact(
    'primary_function', relation.function.value, relation.function.evidence,
    relation.function.explicit, relation.function.confidence >= 0.7 ? 'strong' : 'weak',
  ));
  const addInference = (key: SemanticFactKey, field: keyof typeof parsed.inference, mapping: (value: string) => SemanticFactValue | undefined) => {
    const inference = parsed.inference[field];
    const value = mapping(String(inference.value));
    if (value && inference.evidence[0]) {
      facts.push(fact(key, value, inference.evidence[0], inferenceIsExplicit(field, inference.evidence[0])));
    }
  };
  addInference('environment.location', 'environment', value => value === 'indoor' || value === 'outdoor' ? value : undefined);
  addInference('load.type', 'load', value => ['none', 'static', 'cyclic'].includes(value) ? value as SemanticFactValue : undefined);
  addInference('impact.severity', 'impact', value => ['none', 'medium', 'high'].includes(value) ? value as SemanticFactValue : undefined);
  addInference('thermal.exposure', 'heat', value => ['normal', 'warm', 'hot'].includes(value) ? value as SemanticFactValue : undefined);
  addInference('priority', 'priority', value => ['strength', 'accuracy', 'finish', 'speed', 'flexibility'].includes(value) ? value as SemanticFactValue : undefined);

  const freezing = firstMatch(parsed.normalizedText, /(?:\b(?:freezer|freezing|frozen|sub[- ]?zero|below freezing)\b|-\d+(?:[.,]\d+)?\s*°?\s*c\b)/i);
  if (freezing) facts.push(fact('thermal.exposure', 'freezing', freezing));
  const quantifiedLoad = firstMatch(parsed.normalizedText, /\b\d+(?:[.,]\d+)?\s*(?:kg|kilograms?|n|newtons?)\b/i);
  if (quantifiedLoad) facts.push(fact('load.magnitude', 'quantified', quantifiedLoad));
  const dishwasher = firstMatch(parsed.normalizedText, /\b(?:dishwasher|dishwasher[- ]safe)\b/i);
  if (dishwasher) facts.push(fact('environment.service', 'dishwasher', dishwasher));
  else {
    const washed = firstMatch(parsed.normalizedText, /\b(?:washed|washing|cleaned|cleaning)\b/i);
    if (washed) facts.push(fact('environment.service', 'washed', washed));
  }
  const intermittent = firstMatch(parsed.normalizedText, /\b(?:(?:occasionally|sometimes|temporarily|taken)\s+(?:used\s+)?(?:outdoors?|outside)|(?:outdoors?|outside)\s+(?:occasionally|sometimes|temporarily))\b/i);
  const continuous = firstMatch(parsed.normalizedText, /\b(?:(?:permanently|always|all year|year[- ]round|continuously)\s+(?:mounted\s+|left\s+|used\s+)?(?:outdoors?|outside)|(?:outdoors?|outside)\s+(?:permanently|always|all year|year[- ]round|continuously))\b/i);
  if (continuous) facts.push(fact('environment.service', 'continuous_outdoor', continuous));
  if (intermittent) facts.push(fact('environment.service', 'intermittent_outdoor', intermittent));
  const slidingWear = firstMatch(parsed.normalizedText, /\b(?:slides?|sliding|rubs?|friction|bearing surface)\b/i);
  if (slidingWear) facts.push(fact('mechanical.wear', 'sliding', slidingWear));
  const abrasive = firstMatch(parsed.normalizedText, /\b(?:abrasive|sand|grit|scrapes?|scraping)\b/i);
  if (abrasive) facts.push(fact('mechanical.wear', 'abrasive', abrasive));
  const internalPressure = firstMatch(parsed.normalizedText, /\b(?:internal pressure|pressurized|holds? pressure)\b/i);
  if (internalPressure) facts.push(fact('pressure.exposure', 'internal', internalPressure));
  const externalPressure = firstMatch(parsed.normalizedText, /\bexternal pressure\b/i);
  if (externalPressure) facts.push(fact('pressure.exposure', 'external', externalPressure));
  const insulation = firstMatch(parsed.normalizedText, /\b(?:electrically insulating|electrical insulation|insulates? electrically|non[- ]conductive)\b/i);
  if (insulation) facts.push(fact('electrical.requirement', 'insulating', insulation));
  const flexible = firstMatch(parsed.normalizedText, /\b(?:flexible|bendable|soft elastomer|rubber-like)\b/i);
  if (flexible) facts.push(fact('flexibility', 'flexible', flexible));
  const nonLoadBearing = firstMatch(parsed.normalizedText, /\b(?:non[- ]load[- ]bearing|not load[- ]bearing|does not support (?:a |the )?(?:person|user|load)|doesn't support (?:a |the )?(?:person|user|load))\b/i);
  if (nonLoadBearing) facts.push(fact('load.role', 'non_load_bearing', nonLoadBearing));
  const statedLoadBearing = firstMatch(parsed.normalizedText, /\b(?:load[- ]bearing|supports (?:a |the )?(?:person|user)|carries (?:a |the )?(?:person|user))\b/i);
  if (statedLoadBearing && !nonLoadBearing) facts.push(fact('load.role', 'load_bearing', statedLoadBearing));

  const facetFacts: Partial<Record<string, [SemanticFactKey, SemanticFactValue]>> = {
    'environment-uv': ['environment.exposure', 'uv'],
    'environment-moisture': ['environment.exposure', 'moisture'],
    'environment-chemical': ['environment.exposure', 'chemical'],
    'environment-food': ['environment.exposure', 'food_contact'],
    'fit-press': ['interface.fit', 'press'],
    'fit-sliding': ['interface.fit', 'sliding'],
    'fit-snap': ['interface.fit', 'snap'],
    'fit-thread': ['interface.fit', 'threaded'],
    'fit-seal': ['interface.fit', 'sealing'],
    'surface-visible': ['appearance.requirement', 'visible_surface'],
    'surface-mating': ['interface.mating', 'true'],
    'failure-safety': ['failure.consequence', 'safety_critical'],
    'failure-noncritical': ['failure.consequence', 'non_critical'],
    'lifetime-long': ['lifetime', 'long_term'],
    'lifetime-temporary': ['lifetime', 'temporary'],
    'preference-weight': ['priority', 'weight'],
    'preference-cost': ['priority', 'cost'],
  };
  parsed.facets.forEach(item => {
    const mapped = facetFacts[item.id];
    if (mapped && item.evidence[0]) facts.push(fact(mapped[0], mapped[1], item.evidence[0]));
  });
  if (relation.function && ['hold', 'support', 'mount', 'connect', 'fasten', 'transmit'].includes(relation.function.value)) {
    facts.push(fact('load.role', 'load_bearing', relation.function.evidence, relation.function.explicit, 'weak'));
  }
  const explicitLoadBearing = firstMatch(
    parsed.normalizedText,
    /\b(?:carr(?:y|ies|ying)|bear(?:s|ing)?|supports?|takes?)\b.{0,30}\b(?:load|weight|compression|tension)\b|\bunder (?:a )?(?:constant|steady|static)?\s*(?:load|compression|tension)\b/i,
  );
  if (explicitLoadBearing) facts.push(fact('load.role', 'load_bearing', explicitLoadBearing));
  if (relation.function?.value === 'display') facts.push(fact('load.role', 'non_load_bearing', relation.function.evidence, relation.function.explicit));
  const explicitlyIndoor = facts.some(existing => existing.key === 'environment.location'
    && existing.value === 'indoor'
    && existing.certainty === 'explicit');
  usageContext?.facts.forEach(contextFact => {
    if (explicitlyIndoor
      && contextFact.key === 'environment.exposure'
      && (contextFact.value === 'uv' || contextFact.value === 'moisture')) return;
    if (explicitlyIndoor
      && contextFact.key === 'environment.service'
      && (contextFact.value === 'continuous_outdoor' || contextFact.value === 'intermittent_outdoor')) return;
    if (!facts.some(existing => existing.key === contextFact.key && existing.certainty === 'explicit')) {
      facts.push(contextFact);
    }
  });

  const candidateFacts = deduplicate(facts).filter(item => !freezing || item.key !== 'thermal.exposure' || item.value === 'freezing');
  const conflicts = parsed.conflicts.map(item => ({
    factKeys: [item.field === 'environment' ? 'environment.location'
      : item.field === 'heat' ? 'thermal.exposure'
        : item.field === 'impact' ? 'impact.severity'
          : item.field === 'priority' ? 'priority' : 'load.type'] as SemanticFactKey[],
    observation: `The Context supports conflicting ${item.field} values: ${item.evidence.join(', ')}.`,
  }));
  const primaryFact = candidateFacts.find(item => item.key === 'primary_function');
  const unknowns = [
    !relation.identity && !contextualIdentity && 'Object identity is not established.',
    !primaryFact && !contextualFunction && 'Primary function is not established.',
    !candidateFacts.some(item => item.key === 'environment.location') && 'Operating location is not stated.',
    !candidateFacts.some(item => item.key === 'load.type') && 'Load pattern is not stated.',
  ].filter(Boolean) as string[];
  const result = {
    schemaVersion: 2 as const,
    vocabularyVersion: semanticVocabularyVersion,
    objectIdentity: contextualIdentity
      ? {
        value: contextualIdentity,
        certainty: 'strong_hypothesis' as const,
        basis: 'world_knowledge' as const,
        evidence: `The combined context “${usageContext?.evidence}” indicates ${contextualIdentity}.`,
        needsConfirmation: true,
      }
      : relation.identity
      ? { value: relation.identity.value, certainty: 'explicit' as const, basis: 'user_description' as const, evidence: relation.identity.evidence, needsConfirmation: false }
      : { value: 'unclassified object', certainty: 'unknown' as const, basis: 'combined' as const, evidence: 'Context and measured geometry do not establish a specific object family.', needsConfirmation: true },
    parentSystem: usageContext
      ? {
        value: usageContext.label,
        certainty: 'strong_hypothesis' as const,
        basis: 'world_knowledge' as const,
        evidence: `The phrase “${usageContext.evidence}” places this part in a ${usageContext.label}.`,
        needsConfirmation: true,
      }
      : {
        value: 'not established',
        certainty: 'unknown' as const,
        basis: 'combined' as const,
        evidence: 'No surrounding product or assembly was recognized.',
        needsConfirmation: false,
      },
    primaryFunction: contextualFunction
      ? {
        value: contextualFunction.label,
        certainty: 'strong_hypothesis' as const,
        basis: 'world_knowledge' as const,
        evidence: contextualFunction.evidence,
        needsConfirmation: true,
      }
      : relation.function
      ? {
        value: relation.function.label,
        certainty: relation.function.explicit ? 'explicit' as const : 'strong_hypothesis' as const,
        basis: relation.function.explicit ? 'user_description' as const : 'world_knowledge' as const,
        evidence: relation.function.evidence,
        needsConfirmation: !relation.function.explicit,
      }
      : { value: 'not established', certainty: 'unknown' as const, basis: 'combined' as const, evidence: 'No reliable function relation was found.', needsConfirmation: true },
    candidateFacts,
    uncertainties: unknowns,
    conflicts,
    confirmationQuestions: [
      ...(primaryFact?.needsConfirmation ? [{
      id: 'confirm-primary-function',
      question: `Should Check Make treat this object as something that ${contextualFunction?.label ?? relation.function?.label}?`,
      why: 'This function follows from the named object family rather than an explicit action in Context.',
      factKeys: ['primary_function' as const],
      }] : []),
      ...(usageContext?.questions ?? []),
    ],
  };
  return validateSemanticInterpretation(result);
}
