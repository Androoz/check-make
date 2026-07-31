import type {
  CandidateFact,
  SemanticConfirmationQuestion,
  SemanticEvidenceStep,
  SemanticFactKey,
  SemanticFactValue,
} from '../semantic/types';
import { normalizeEnglishContext } from './englishNormalization';

export type ConceptKind =
  | 'object-role'
  | 'activity'
  | 'place'
  | 'parent-system'
  | 'mechanism'
  | 'service-environment'
  | 'human-interaction';

export type ConceptRelation =
  | 'is_a'
  | 'part_of'
  | 'used_in'
  | 'used_for'
  | 'typically_exposed_to'
  | 'typically_requires'
  | 'may_carry'
  | 'may_move_repeatedly';

interface GraphFact {
  key: SemanticFactKey;
  value: SemanticFactValue;
  certainty: 'strong_hypothesis' | 'weak_hypothesis';
  reason: string;
  objectRoles?: string[];
  exceptObjectRoles?: string[];
}

interface ConceptNode {
  id: string;
  label: string;
  kind: ConceptKind;
  expressions: RegExp[];
  facts?: GraphFact[];
  function?: { value: SemanticFactValue; label: string };
}

interface GraphEdge {
  from: string;
  relation: ConceptRelation;
  to: string;
}

interface ConceptMatch {
  concept: ConceptNode;
  evidence: string;
  index: number;
  end: number;
}

export interface ParsedContextRelation {
  relation: 'part_of' | 'used_in' | 'used_for';
  evidence: string;
  objectConcept: string;
  targetConcept: string;
}

export interface ComposedUsageContext {
  id: string;
  label: string;
  evidence: string;
  facts: CandidateFact[];
  questions: SemanticConfirmationQuestion[];
  relation: ParsedContextRelation;
  objectIdentity?: string;
  primaryFunction?: {
    value: 'display' | 'guide';
    label: string;
    evidence: string;
  };
}

const strong = (key: SemanticFactKey, value: SemanticFactValue, reason: string, objectRoles?: string[]): GraphFact =>
  ({ key, value, certainty: 'strong_hypothesis', reason, objectRoles });
const weak = (key: SemanticFactKey, value: SemanticFactValue, reason: string, objectRoles?: string[]): GraphFact =>
  ({ key, value, certainty: 'weak_hypothesis', reason, objectRoles });

const structuralRoles = ['spacer', 'hinge', 'guide', 'bracket', 'wheel', 'clip', 'foot', 'adapter', 'handle', 'cover'];
const movingRoles = ['hinge', 'guide', 'wheel', 'clip', 'handle', 'spacer'];

const concepts: ConceptNode[] = [
  { id: 'signage', label: 'signage or marker', kind: 'object-role', expressions: [/\b(?:sign|signage|marker|wayfinding|information board|direction board|skylt|markering)\b/iu], function: { value: 'display', label: 'displays information or directions' } },
  { id: 'holder', label: 'holder or cradle', kind: 'object-role', expressions: [/\b(?:holder|stand|cradle|dock|hållare)\b/iu] },
  { id: 'spacer', label: 'spacer or bushing', kind: 'object-role', expressions: [/\b(?:spacer|standoff|distance piece|bushing|sleeve|shim|washer|distans|bussning)\b/iu] },
  { id: 'hinge', label: 'hinge component', kind: 'object-role', expressions: [/\b(?:hinge|gångjärn)\b/iu] },
  { id: 'guide', label: 'guide or slider', kind: 'object-role', expressions: [/\b(?:guide block|guide|rail|slider|slide block|styrblock|gejd)\b/iu] },
  { id: 'cover', label: 'cover or enclosure', kind: 'object-role', expressions: [/\b(?:protective housing|protective cap|kamerakåpa|housing|enclosure|cover|guard|case|shell|cap|plug|kåpa|hölje|skydd|lock|plugg)\b/iu] },
  { id: 'wheel', label: 'wheel or roller', kind: 'object-role', expressions: [/\b(?:wheel rim|wheel|roller|caster|fälg|hjul|rulle)\b/iu] },
  { id: 'clip', label: 'clip, clamp, or latch', kind: 'object-role', expressions: [/\b(?:clip|clamp|latch|retainer|klämma|spärr)\b/iu] },
  { id: 'bracket', label: 'mounting bracket', kind: 'object-role', expressions: [/\b(?:mounting bracket|bracket|mount|fäste|konsol)\b/iu] },
  { id: 'badge', label: 'badge or decorative nameplate', kind: 'object-role', expressions: [/\b(?:decorative badge|badge|nameplate|plaque|emblem|dekorativ skylt)\b/iu], function: { value: 'display', label: 'displays information or decoration' } },
  { id: 'seal', label: 'seal or gasket', kind: 'object-role', expressions: [/\b(?:seal|gasket|o-ring|packning|tätning)\b/iu] },
  { id: 'adapter', label: 'adapter or fitting', kind: 'object-role', expressions: [/\b(?:adapter|coupler|reducer|hose fitting|fitting|koppling)\b/iu] },
  { id: 'handle', label: 'handle or grip', kind: 'object-role', expressions: [/\b(?:handle|grip|knob|handtag|grepp|vred)\b/iu] },
  { id: 'foot', label: 'foot, pad, or bumper', kind: 'object-role', expressions: [/\b(?:foot|feet|pad|bumper|fot|tass)\b/iu] },

  { id: 'human-supporting-furniture', label: 'human-supporting furniture', kind: 'human-interaction', expressions: [], facts: [
    weak('load.role', 'load_bearing', 'A functional component in human-supporting furniture may transfer or stabilize person load.', structuralRoles),
    weak('load.magnitude', 'heavy', 'A person-supporting assembly can impose substantial load on functional components.', structuralRoles),
    strong('priority', 'strength', 'Functional person-supporting furniture normally prioritizes structural durability.', structuralRoles),
    weak('failure.consequence', 'safety_critical', 'Failure of a person-supporting functional component could cause a fall.', structuralRoles),
  ] },
  { id: 'portable-seating', label: 'portable seating', kind: 'parent-system', expressions: [], facts: [
    strong('environment.location', 'outdoor', 'Portable camping seating is commonly used outdoors.'),
    strong('environment.service', 'intermittent_outdoor', 'Portable seating commonly alternates between storage and temporary outdoor use.'),
    strong('load.type', 'cyclic', 'Folding portable seating is repeatedly opened, closed, loaded, and unloaded.', movingRoles),
    weak('impact.severity', 'medium', 'Portable seating can receive knocks during transport and setup.', structuralRoles),
  ] },
  { id: 'camping-chair', label: 'camping or folding chair', kind: 'parent-system', expressions: [/\b(?:camping chair|folding camping chair|folding chair|foldable chair|camp chair|campingstol|fällstol)\b/iu] },
  { id: 'chair-seating', label: 'chair or seating assembly', kind: 'parent-system', expressions: [/\b(?:chair|seat frame|seat|stool|bench|backrest|armrest|stol|sits|pall|bänk)\b/iu], facts: [strong('load.type', 'static', 'Seating normally carries a mostly static person load during use.', structuralRoles)] },
  { id: 'outdoor-furniture', label: 'outdoor furniture', kind: 'parent-system', expressions: [/\b(?:patio furniture|garden furniture|outdoor table|outdoor bench|garden chair|trädgårdsmöbel|utemöbel|trädgårdsstol)\b/iu], facts: [
    strong('environment.location', 'outdoor', 'Outdoor furniture is used in exterior service conditions.'),
    strong('environment.exposure', 'uv', 'Outdoor furniture commonly receives sunlight and UV exposure.'),
    strong('environment.exposure', 'moisture', 'Outdoor furniture commonly encounters rain and moisture.'),
    strong('priority', 'strength', 'Functional outdoor-furniture components normally prioritize durability.', structuralRoles),
  ] },

  { id: 'repeated-access-mechanism', label: 'repetitive door or drawer mechanism', kind: 'mechanism', expressions: [], facts: [
    strong('load.type', 'cyclic', 'Doors, drawers, and their mechanisms are repeatedly opened and closed.', movingRoles),
    strong('priority', 'accuracy', 'Mechanism components normally require reliable alignment and fit.', structuralRoles),
  ] },
  { id: 'door-drawer-cabinet', label: 'door, drawer, or cabinet mechanism', kind: 'parent-system', expressions: [/\b(?:kitchen drawer|drawer|cabinet door|cabinet|cupboard|door|kökslåda|låda|skåplucka|skåp|dörr)\b/iu] },

  { id: 'cycle-vehicle-system', label: 'cyclically loaded lightweight vehicle', kind: 'parent-system', expressions: [], facts: [
    strong('environment.service', 'intermittent_outdoor', 'Cycle components commonly alternate between storage and outdoor use.'),
    strong('load.type', 'cyclic', 'Cycle components commonly experience vibration and repeated load cycles.', structuralRoles),
    weak('impact.severity', 'medium', 'Cycle components can receive transport and road impacts.', structuralRoles),
    strong('priority', 'strength', 'Functional cycle components normally prioritize fatigue resistance and strength.', structuralRoles),
    weak('failure.consequence', 'safety_critical', 'Failure of some functional cycle components can cause injury.', structuralRoles),
  ] },
  { id: 'bicycle', label: 'bicycle assembly', kind: 'parent-system', expressions: [/\b(?:bicycle|bike|cycle frame|handlebar|bike rack|cykel|cykelram|styre|cykelställ)\b/iu] },
  { id: 'motor-vehicle-system', label: 'motor vehicle system', kind: 'parent-system', expressions: [], facts: [
    strong('load.type', 'cyclic', 'Vehicle components commonly experience vibration and repeated loading.', structuralRoles),
    weak('impact.severity', 'medium', 'Vehicle service can expose functional components to shocks and handling impacts.', structuralRoles),
    weak('thermal.exposure', 'warm', 'Some vehicle locations become warmer than normal room conditions.', structuralRoles),
    strong('priority', 'strength', 'Functional vehicle components normally prioritize durability.', structuralRoles),
  ] },
  { id: 'vehicle', label: 'vehicle assembly', kind: 'parent-system', expressions: [/\b(?:automotive vehicle|real car|car dashboard|car|vehicle|motorcycle|camper van|automotive|bil|fordon|motorcykel|instrumentpanel)\b/iu] },

  { id: 'possible-pressure-system', label: 'possible pressure-carrying flow system', kind: 'service-environment', expressions: [], facts: [
    strong('environment.exposure', 'moisture', 'Plumbing, pipe, and hose components normally contact water or moisture.'),
    weak('pressure.exposure', 'internal', 'Some pipe and hose components retain internal pressure; this is not assumed without confirmation.'),
    strong('priority', 'accuracy', 'Flow-system connections normally depend on fit and sealing geometry.', structuralRoles),
  ] },
  { id: 'plumbing', label: 'pipe, hose, or plumbing assembly', kind: 'parent-system', expressions: [/\b(?:plumbing|water pipe|pipework|garden hose|hose|faucet|tap|drain|vvs|vattenrör|rör|trädgårdsslang|slang|kran|avlopp)\b/iu] },

  { id: 'wet-appliance-environment', label: 'wet household appliance environment', kind: 'service-environment', expressions: [], facts: [
    strong('environment.service', 'dishwasher', 'Dishwasher components experience repeated hot washing cycles.'),
    strong('environment.exposure', 'moisture', 'Dishwasher components are repeatedly exposed to water.'),
  ] },
  { id: 'dishwasher', label: 'dishwasher assembly', kind: 'parent-system', expressions: [/\b(?:dishwasher rack|dishwasher|diskmaskinskorg|diskmaskin)\b/iu], facts: [strong('load.type', 'cyclic', 'Dishwasher racks, wheels, clips, and latches are repeatedly moved and loaded.', movingRoles)] },

  { id: 'electronics-system', label: 'electronics, sensor, or camera assembly', kind: 'parent-system', expressions: [], facts: [
    strong('priority', 'accuracy', 'Electronics mounts and enclosures commonly depend on connector and fastener alignment.', structuralRoles),
    weak('thermal.exposure', 'warm', 'Powered electronics may create local heat, but the actual temperature is not established.', structuralRoles),
  ] },
  { id: 'electronics', label: 'electronics or sensor assembly', kind: 'parent-system', expressions: [/\b(?:security camera|camera cover|electronics|circuit board|pcb|sensor|computer|controller|övervakningskamera|kamerakåpa|kamera|elektronik|kretskort|sensor|styrenhet)\b/iu] },

  { id: 'tool-system', label: 'hand or power tool', kind: 'parent-system', expressions: [/\b(?:power drill|hand saw|hand tool|power tool|drill|saw|sander|tool handle|borrmaskin|handsåg|handverktyg|elverktyg|slipmaskin)\b/iu], facts: [
    strong('load.type', 'cyclic', 'Tool components commonly experience repeated handling or operating loads.', structuralRoles),
    strong('impact.severity', 'medium', 'Tools commonly receive knocks and handling impacts.', structuralRoles),
    strong('priority', 'strength', 'Functional tool components normally prioritize strength and durability.', structuralRoles),
  ] },
  { id: 'toy-vehicle', label: 'toy or play object', kind: 'parent-system', expressions: [/\b(?:toy car|model car|rc car|radio[- ]controlled car|remote[- ]controlled car|radio controlled vehicle|radiostyrd bil|leksaksbil)\b/iu], facts: [
    strong('impact.severity', 'medium', 'Toy vehicles commonly receive drops, knocks, and rough handling.', structuralRoles),
    weak('load.type', 'cyclic', 'Moving toy components may be operated repeatedly.', movingRoles),
  ] },
  { id: 'toy', label: 'toy or play object', kind: 'parent-system', expressions: [/\b(?:toy|playground equipment|children'?s toy|leksak|lekplatsutrustning)\b/iu], facts: [strong('impact.severity', 'medium', 'Toys commonly receive drops, knocks, and rough handling.', structuralRoles)] },
  { id: 'luggage', label: 'luggage or portable bag', kind: 'parent-system', expressions: [/\b(?:suitcase|luggage|travel bag|backpack|resväska|bagage|ryggsäck)\b/iu], facts: [
    strong('load.type', 'cyclic', 'Luggage components are repeatedly handled, opened, and loaded.', structuralRoles),
    strong('impact.severity', 'medium', 'Luggage commonly receives transport and handling impacts.', structuralRoles),
    strong('priority', 'strength', 'Functional luggage components normally prioritize durability.', structuralRoles),
  ] },

  { id: 'outdoor-route-activity', label: 'outdoor route or course activity', kind: 'activity', expressions: [] },
  { id: 'disc-golf', label: 'disc-golf course', kind: 'activity', expressions: [/\b(?:disc golf|disc-golf|frisbee golf|discgolf)\b/iu] },
  { id: 'golf-course', label: 'golf course', kind: 'activity', expressions: [/\b(?:golf course|golf hole|golfbana|golfhål)\b/iu] },
  { id: 'trail-route', label: 'outdoor trail or route', kind: 'activity', expressions: [/\b(?:hiking trail|walking trail|nature trail|cycle trail|trailhead|vandringsled|naturstig|cykelled)\b/iu] },
  { id: 'course-position', label: 'course position', kind: 'place', expressions: [/\b(?:next tee|tee location|next hole|hole marker|nästa tee|nästa hål)\b/iu] },
  { id: 'outdoor-site', label: 'outdoor site', kind: 'place', expressions: [/\b(?:campground|camping ground|campsite|public park|nature reserve|outdoor park|campingplats|naturreservat|utomhuspark)\b/iu] },
  { id: 'outdoor-service', label: 'outdoor service', kind: 'service-environment', expressions: [/\b(?:outdoor|outdoors|outside|exterior|utomhus|utomhusmiljö)\b/iu] },
];

const edges: GraphEdge[] = [
  { from: 'camping-chair', relation: 'is_a', to: 'portable-seating' },
  { from: 'portable-seating', relation: 'is_a', to: 'human-supporting-furniture' },
  { from: 'portable-seating', relation: 'used_in', to: 'outdoor-service' },
  { from: 'portable-seating', relation: 'may_carry', to: 'human-supporting-furniture' },
  { from: 'chair-seating', relation: 'is_a', to: 'human-supporting-furniture' },
  { from: 'door-drawer-cabinet', relation: 'is_a', to: 'repeated-access-mechanism' },
  { from: 'repeated-access-mechanism', relation: 'may_move_repeatedly', to: 'repeated-access-mechanism' },
  { from: 'bicycle', relation: 'is_a', to: 'cycle-vehicle-system' },
  { from: 'vehicle', relation: 'is_a', to: 'motor-vehicle-system' },
  { from: 'plumbing', relation: 'is_a', to: 'possible-pressure-system' },
  { from: 'possible-pressure-system', relation: 'typically_requires', to: 'possible-pressure-system' },
  { from: 'dishwasher', relation: 'used_in', to: 'wet-appliance-environment' },
  { from: 'dishwasher', relation: 'typically_exposed_to', to: 'wet-appliance-environment' },
  { from: 'electronics', relation: 'is_a', to: 'electronics-system' },
  { from: 'disc-golf', relation: 'is_a', to: 'outdoor-route-activity' },
  { from: 'golf-course', relation: 'is_a', to: 'outdoor-route-activity' },
  { from: 'trail-route', relation: 'is_a', to: 'outdoor-route-activity' },
  { from: 'course-position', relation: 'part_of', to: 'outdoor-route-activity' },
  { from: 'signage', relation: 'used_for', to: 'course-position' },
];

const conceptById = new Map(concepts.map(concept => [concept.id, concept]));

function negatedAt(text: string, index: number) {
  const prefix = text.slice(Math.max(0, index - 55), index);
  const clause = prefix.split(/[,.;:!?]|\b(?:but|however|instead|men|däremot)\b/iu).at(-1) ?? prefix;
  return /\b(?:not|never|no|is not|isn't|does not|doesn't|rather than|inte|aldrig|ingen|ej)\b(?:\s+[\p{L}\p{N}-]+){0,4}\s*$/iu.test(clause);
}

function conceptMatches(text: string): ConceptMatch[] {
  return concepts.flatMap(concept => concept.expressions.flatMap(expression => {
    const pattern = new RegExp(expression.source, expression.flags.includes('g') ? expression.flags : `${expression.flags}g`);
    return [...text.matchAll(pattern)].flatMap(match => {
      if (!match[0] || match.index === undefined || negatedAt(text, match.index)) return [];
      return [{ concept, evidence: match[0], index: match.index, end: match.index + match[0].length }];
    });
  }));
}

function ancestors(id: string) {
  const result: Array<{ id: string; via: ConceptRelation }> = [];
  const seen = new Set([id]);
  const visit = (source: string) => edges.filter(edge => edge.from === source && (edge.relation === 'is_a' || edge.relation === 'used_in' || edge.relation === 'typically_exposed_to')).forEach(edge => {
    if (seen.has(edge.to)) return;
    seen.add(edge.to);
    result.push({ id: edge.to, via: edge.relation });
    visit(edge.to);
  });
  visit(id);
  return result;
}

function specificity(id: string) {
  return ancestors(id).filter(item => item.via === 'is_a').length;
}

const connectorPattern = /\b(part of|used as|mounted to|inside|within|for|in|on|del av|används som|monterad på|inuti|för|till|i|på)\b/giu;

function chooseObject(matches: ConceptMatch[], text: string) {
  const objects = matches.filter(match => match.concept.kind === 'object-role');
  if (!objects.length) return undefined;
  const firstConnector = [...text.matchAll(connectorPattern)][0];
  connectorPattern.lastIndex = 0;
  const beforeConnector = firstConnector?.index === undefined ? objects : objects.filter(match => match.index < firstConnector.index!);
  return [...(beforeConnector.length ? beforeConnector : objects)]
    .sort((left, right) => right.index - left.index || right.evidence.length - left.evidence.length)[0];
}

function relationFromConnector(value: string): ParsedContextRelation['relation'] {
  if (/^(?:for|used as|för|till)$/iu.test(value)) return 'used_for';
  if (/^(?:in|inside|within|on|mounted to|i|inuti|på|monterad på)$/iu.test(value)) return 'used_in';
  return 'part_of';
}

function relationAndTarget(text: string, matches: ConceptMatch[], object: ConceptMatch) {
  const targetKinds: ConceptKind[] = ['parent-system', 'activity', 'place'];
  const candidates = matches.filter(match => targetKinds.includes(match.concept.kind));
  const connectors = [...text.matchAll(connectorPattern)];
  connectorPattern.lastIndex = 0;
  const connector = connectors.find(match => match.index !== undefined && match.index >= object.end);
  const aboutRelation = /\b(?:about|themed|tema|om)\b/iu.test(text.slice(object.end, candidates[0]?.index ?? text.length));
  let eligible = connector?.index === undefined
    ? candidates.filter(match => Math.abs(match.index - object.index) <= 55)
    : candidates.filter(match => match.index >= connector.index! + connector[0].length);
  eligible = eligible.filter(match => !/[- ]themed\b|tema(?:tisk)?\b/iu.test(text.slice(match.index, match.end + 14)));
  if (aboutRelation) eligible = [];
  const target = [...eligible].sort((left, right) => right.evidence.length - left.evidence.length || specificity(right.concept.id) - specificity(left.concept.id))[0];
  if (target) return {
    target,
    relation: {
      relation: connector ? relationFromConnector(connector[0]) : 'part_of' as const,
      evidence: connector ? `${object.evidence} ${connector[0]} ${target.evidence}` : `${object.evidence} + ${target.evidence}`,
      objectConcept: object.concept.id,
      targetConcept: target.concept.id,
    },
  };

  const coursePosition = candidates.find(match => match.concept.id === 'course-position');
  if (object.concept.id === 'signage' && coursePosition) return {
    target: coursePosition,
    relation: {
      relation: 'used_for' as const,
      evidence: `${object.evidence} + ${coursePosition.evidence}`,
      objectConcept: object.concept.id,
      targetConcept: coursePosition.concept.id,
    },
  };
  return undefined;
}

function propertyNodes(targetId: string) {
  return [
    { id: targetId, via: undefined as ConceptRelation | undefined },
    ...ancestors(targetId),
  ];
}

function evidencePath(object: ConceptMatch, target: ConceptMatch, relation: ParsedContextRelation, propertyNode: ConceptNode, fact: GraphFact): SemanticEvidenceStep[] {
  const path: SemanticEvidenceStep[] = [
    { kind: 'text_match', value: object.evidence },
    { kind: 'concept', value: object.concept.id },
    { kind: 'relation', value: `${relation.relation}:${target.concept.id}` },
  ];
  if (propertyNode.id !== target.concept.id) path.push({ kind: 'inheritance', value: `${target.concept.id}->${propertyNode.id}` });
  path.push({ kind: 'property', value: `${fact.key}=${fact.value}` });
  return path;
}

function graphFacts(object: ConceptMatch, target: ConceptMatch, relation: ParsedContextRelation) {
  const facts: CandidateFact[] = [];
  propertyNodes(target.concept.id).forEach(({ id }) => {
    const node = conceptById.get(id);
    node?.facts?.forEach(item => {
      if (item.objectRoles && !item.objectRoles.includes(object.concept.id)) return;
      if (item.exceptObjectRoles?.includes(object.concept.id)) return;
      facts.push({
        key: item.key,
        value: item.value,
        certainty: item.certainty,
        basis: 'world_knowledge',
        evidence: `${item.reason} Path: ${object.evidence} -> ${relation.relation} ${target.evidence} -> ${node.label}.`,
        evidencePath: evidencePath(object, target, relation, node, item),
        needsConfirmation: true,
      });
    });
  });
  const seen = new Set<string>();
  return facts.filter(item => {
    const identity = `${item.key}:${item.value}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function signageComposition(object: ConceptMatch, target: ConceptMatch, relation: ParsedContextRelation) {
  if (object.concept.id !== 'signage') return undefined;
  const resolved = new Set([target.concept.id, ...ancestors(target.concept.id).map(item => item.id)]);
  const route = resolved.has('outdoor-route-activity') || target.concept.id === 'course-position';
  const site = target.concept.id === 'outdoor-site';
  if (!route && !site) return undefined;
  const guide = route;
  const compositionId = route ? 'outdoor-wayfinding' : 'outdoor-site-signage';
  const compositionLabel = route ? 'outdoor course wayfinding' : 'outdoor site signage';
  const specs: GraphFact[] = [
    strong('primary_function', guide ? 'guide' : 'display', guide ? 'A course marker guides people to a route or course position.' : 'A site sign displays information at an outdoor place.'),
    strong('environment.location', 'outdoor', 'The printed sign is relationally bound to an outdoor course or site.'),
    weak('environment.exposure', 'uv', 'Outdoor signage may receive prolonged sunlight and UV exposure.'),
    weak('environment.exposure', 'moisture', 'Outdoor signage may be exposed to rain or condensation.'),
    strong('appearance.requirement', 'visible_surface', 'A wayfinding or information sign needs a readable visible face.'),
    strong('priority', 'finish', 'Legibility and surface quality are normally important for signage.'),
    weak('load.role', 'non_load_bearing', 'The sign normally communicates information rather than carrying structural load.'),
  ];
  const facts = specs.map(item => ({
    key: item.key,
    value: item.value,
    certainty: item.certainty,
    basis: 'world_knowledge' as const,
    evidence: `${item.reason} Path: ${object.evidence} -> ${relation.relation} ${target.evidence} -> ${compositionLabel}.`,
    evidencePath: [
      { kind: 'text_match' as const, value: object.evidence },
      { kind: 'relation' as const, value: `${relation.relation}:${target.concept.id}` },
      { kind: 'composition' as const, value: compositionId },
      { kind: 'property' as const, value: `${item.key}=${item.value}` },
    ],
    needsConfirmation: true,
  }));
  return {
    id: compositionId,
    facts,
    objectIdentity: route ? 'outdoor wayfinding or course sign' : 'outdoor information or wayfinding sign',
    primaryFunction: {
      value: (guide ? 'guide' : 'display') as 'guide' | 'display',
      label: guide ? 'guides visitors or players to a course location' : 'displays information at an outdoor site',
      evidence: `${object.evidence} + ${target.evidence} -> ${compositionLabel}`,
    },
  };
}

function groupedQuestions(facts: CandidateFact[]): SemanticConfirmationQuestion[] {
  const has = (key: SemanticFactKey, value?: SemanticFactValue) => facts.some(fact => fact.key === key && (value === undefined || fact.value === value));
  const questions: SemanticConfirmationQuestion[] = [];
  if ((has('environment.location', 'outdoor') || has('environment.exposure', 'uv') && has('environment.exposure', 'moisture'))
    && (has('environment.exposure', 'uv') || has('environment.exposure', 'moisture'))) questions.push({
    id: 'confirm-outdoor-service',
    question: 'This appears to be installed outdoors. Will it remain outside in sun and rain?',
    why: 'One service-environment answer can confirm or reject the related location, UV, and moisture hypotheses before they affect material selection.',
    factKeys: ['environment.location', 'environment.exposure'],
  });
  if (has('load.role', 'load_bearing') || has('failure.consequence', 'safety_critical')) questions.push({
    id: 'confirm-person-load',
    question: 'Does this printed component carry person load, where failure could cause injury?',
    why: 'Person-bearing and safety-critical use must be explicitly confirmed before it can affect manufacturing intent.',
    factKeys: ['load.role', 'load.magnitude', 'failure.consequence'],
  });
  if (has('pressure.exposure', 'internal')) questions.push({
    id: 'confirm-pressure',
    question: 'Will this printed component contain pressurized liquid or air?',
    why: 'A drain guide and a pressure-retaining fitting require materially different validation.',
    factKeys: ['pressure.exposure'],
  });
  return questions;
}

export function interpretContextGraph(text: string, target?: string): ComposedUsageContext | undefined {
  const source = normalizeEnglishContext([text, target].filter(Boolean).join(' · ').normalize('NFKC').replace(/\s+/g, ' ').trim()).text;
  if (!source) return undefined;
  const matches = conceptMatches(source);
  const object = chooseObject(matches, source);
  if (!object) return undefined;
  const bound = relationAndTarget(source, matches, object);
  if (!bound) return undefined;
  const composed = signageComposition(object, bound.target, bound.relation);
  const facts = composed?.facts ?? graphFacts(object, bound.target, bound.relation);
  const targetFamily = new Set([bound.target.concept.id, ...ancestors(bound.target.concept.id).map(item => item.id)]);
  const explicitOutdoor = /\b(?:outdoor|outdoors|outside|exterior|utomhus)\b/iu.test(source)
    && !/\b(?:not|never|inte|aldrig|ej)\b.{0,24}\b(?:outdoor|outdoors|outside|utomhus)\b/iu.test(source);
  if (!composed && explicitOutdoor && targetFamily.has('electronics-system') && (object.concept.id === 'cover' || object.concept.id === 'bracket')) {
    ([
      ['environment.exposure', 'uv', 'Outdoor electronics housings and mounts may receive prolonged sunlight and UV exposure.'],
      ['environment.exposure', 'moisture', 'Outdoor electronics housings and mounts may be exposed to rain or condensation.'],
    ] as const).forEach(([key, value, reason]) => facts.push({
      key,
      value,
      certainty: 'weak_hypothesis',
      basis: 'world_knowledge',
      evidence: `${reason} Path: ${object.evidence} -> ${bound.relation.relation} ${bound.target.evidence} + explicit outdoor modifier.`,
      evidencePath: [
        { kind: 'text_match', value: object.evidence },
        { kind: 'relation', value: `${bound.relation.relation}:${bound.target.concept.id}` },
        { kind: 'composition', value: 'outdoor-electronics-installation' },
        { kind: 'property', value: `${key}=${value}` },
      ],
      needsConfirmation: true,
    }));
  }
  if (!facts.length && bound.target.concept.kind !== 'parent-system') return undefined;
  return {
    id: composed?.id ?? (bound.target.concept.id === 'toy-vehicle' ? 'toy' : bound.target.concept.id === 'tool-system' ? 'tool' : bound.target.concept.id),
    label: bound.target.concept.label,
    evidence: bound.relation.evidence,
    facts,
    questions: groupedQuestions(facts),
    relation: bound.relation,
    objectIdentity: composed?.objectIdentity,
    primaryFunction: composed?.primaryFunction,
  };
}

export const contextGraphConcepts = concepts.map(({ id, label, kind }) => ({ id, label, kind }));
export const contextGraphRelations = edges.map(edge => ({ ...edge }));
export const contextGraphCompositions = [{ id: 'outdoor-wayfinding' }, { id: 'outdoor-site-signage' }];
