import type {
  CandidateFact,
  SemanticConfirmationQuestion,
  SemanticFactKey,
  SemanticFactValue,
} from '../semantic/types';

interface ContextFact {
  key: SemanticFactKey;
  value: SemanticFactValue;
  certainty: 'strong_hypothesis' | 'weak_hypothesis';
  reason: string;
}

interface UsageProfile {
  id: string;
  label: string;
  expression: RegExp;
  facts: ContextFact[];
  questions?: SemanticConfirmationQuestion[];
}

export interface UsageContextInterpretation {
  id: string;
  label: string;
  evidence: string;
  facts: CandidateFact[];
  questions: SemanticConfirmationQuestion[];
}

const strong = (key: SemanticFactKey, value: SemanticFactValue, reason: string): ContextFact =>
  ({ key, value, certainty: 'strong_hypothesis', reason });
const weak = (key: SemanticFactKey, value: SemanticFactValue, reason: string): ContextFact =>
  ({ key, value, certainty: 'weak_hypothesis', reason });

const profiles: UsageProfile[] = [
  {
    id: 'camping-chair',
    label: 'camping or folding chair',
    expression: /\b(?:camping chair|folding chair|foldable chair|camp chair)\b/i,
    facts: [
      strong('environment.location', 'outdoor', 'Camping chairs are portable seating commonly used outdoors.'),
      strong('environment.service', 'intermittent_outdoor', 'Camping chairs normally move between storage and temporary outdoor use.'),
      strong('load.type', 'cyclic', 'A folding chair is repeatedly opened, closed, loaded, and unloaded.'),
      weak('load.role', 'load_bearing', 'A spacer in a chair assembly may participate in transferring or stabilizing person load.'),
      weak('load.magnitude', 'heavy', 'Furniture intended for a seated person experiences substantial assembly-level load.'),
      weak('impact.severity', 'medium', 'Portable folding furniture can receive knocks during transport and setup.'),
      strong('priority', 'strength', 'A functional chair component normally prioritizes durability and structural margin.'),
      weak('failure.consequence', 'safety_critical', 'Failure of some chair components can cause a person to fall.'),
    ],
    questions: [{
      id: 'confirm-person-support',
      question: 'Does this spacer help support or stabilize the seated person?',
      why: 'A camping chair contains both load-bearing and non-load-bearing spacers. This determines whether failure could cause a fall.',
      factKeys: ['failure.consequence'],
    }],
  },
  {
    id: 'chair-seating',
    label: 'chair or seating assembly',
    expression: /\b(?:chair|seat|stool|bench|backrest|armrest)\b/i,
    facts: [
      strong('load.type', 'static', 'Seating normally carries a mostly static person load during use.'),
      weak('load.role', 'load_bearing', 'A component in a seating assembly may participate in supporting a person.'),
      strong('priority', 'strength', 'Functional seating components normally prioritize structural durability.'),
      weak('failure.consequence', 'safety_critical', 'Failure of a load-bearing seating component could cause a fall.'),
    ],
    questions: [{
      id: 'confirm-seat-load',
      question: 'Is this component part of the structure that supports the seated person?',
      why: 'Decorative covers and feet need different margins from load-bearing joints, spacers, and frame components.',
      factKeys: ['failure.consequence'],
    }],
  },
  {
    id: 'outdoor-furniture',
    label: 'outdoor furniture',
    expression: /\b(?:patio furniture|garden furniture|outdoor table|outdoor bench|garden chair)\b/i,
    facts: [
      strong('environment.location', 'outdoor', 'Outdoor furniture is exposed to exterior service conditions.'),
      strong('environment.exposure', 'uv', 'Outdoor furniture commonly receives sunlight and UV exposure.'),
      strong('environment.exposure', 'moisture', 'Outdoor furniture commonly encounters rain and moisture.'),
      strong('priority', 'strength', 'Functional furniture components normally prioritize durability.'),
    ],
  },
  {
    id: 'dishwasher',
    label: 'dishwasher assembly',
    expression: /\b(?:dishwasher|dishwasher rack)\b/i,
    facts: [
      strong('environment.service', 'dishwasher', 'Dishwasher components experience repeated hot washing cycles.'),
      strong('environment.exposure', 'moisture', 'Dishwasher components are repeatedly exposed to water.'),
      strong('load.type', 'cyclic', 'Dishwasher racks and latches are repeatedly moved and loaded.'),
    ],
  },
  {
    id: 'bicycle',
    label: 'bicycle assembly',
    expression: /\b(?:bicycle|bike|cycle frame|handlebar|bike rack)\b/i,
    facts: [
      strong('environment.service', 'intermittent_outdoor', 'Bicycle components commonly alternate between storage and outdoor use.'),
      strong('load.type', 'cyclic', 'Bicycle components commonly experience repeated vibration and load cycles.'),
      weak('impact.severity', 'medium', 'Bicycle components can receive transport and road impacts.'),
      strong('priority', 'strength', 'Functional bicycle components normally prioritize fatigue resistance and strength.'),
      weak('failure.consequence', 'safety_critical', 'Failure of some bicycle components can cause injury.'),
    ],
    questions: [{
      id: 'confirm-bicycle-safety',
      question: 'Could failure of this component affect steering, braking, wheel retention, or rider support?',
      why: 'Only some bicycle components are safety-critical, and Check Make cannot infer the component’s exact role from the parent product alone.',
      factKeys: ['failure.consequence'],
    }],
  },
  {
    id: 'vehicle',
    label: 'vehicle assembly',
    expression: /\b(?:car|vehicle|motorcycle|camper van|automotive)\b/i,
    facts: [
      strong('load.type', 'cyclic', 'Vehicle components commonly experience vibration and repeated loading.'),
      weak('impact.severity', 'medium', 'Vehicle use can expose components to shocks and handling impacts.'),
      weak('thermal.exposure', 'warm', 'Some vehicle locations become warmer than normal room conditions.'),
      strong('priority', 'strength', 'Functional vehicle components normally prioritize durability.'),
    ],
  },
  {
    id: 'door-drawer-cabinet',
    label: 'door, drawer, or cabinet mechanism',
    expression: /\b(?:door|drawer|cabinet|cupboard)\b/i,
    facts: [
      strong('load.type', 'cyclic', 'Doors and drawers are repeatedly opened and closed.'),
      strong('priority', 'accuracy', 'Mechanism components normally require reliable alignment and fit.'),
    ],
  },
  {
    id: 'plumbing',
    label: 'pipe, hose, or plumbing assembly',
    expression: /\b(?:plumbing|water pipe|pipework|hose|faucet|tap|drain)\b/i,
    facts: [
      strong('environment.exposure', 'moisture', 'Plumbing and hose components normally contact water or moisture.'),
      weak('pressure.exposure', 'internal', 'Some pipe and hose components are exposed to internal pressure.'),
      strong('priority', 'accuracy', 'Connections in flow systems normally depend on fit and sealing geometry.'),
    ],
    questions: [{
      id: 'confirm-pressure',
      question: 'Will this component contain pressurized liquid or air?',
      why: 'A drain guide and a pressure-retaining fitting require materially different validation.',
      factKeys: ['pressure.exposure'],
    }],
  },
  {
    id: 'electronics',
    label: 'electronics or sensor assembly',
    expression: /\b(?:electronics|circuit board|pcb|sensor|camera|computer|controller)\b/i,
    facts: [
      strong('priority', 'accuracy', 'Electronics mounts and enclosures commonly depend on connector and fastener alignment.'),
      weak('thermal.exposure', 'warm', 'Powered electronics may create local heat, but the actual service temperature is not established.'),
    ],
  },
  {
    id: 'tool',
    label: 'hand or power tool',
    expression: /\b(?:hand tool|power tool|drill|saw|sander|tool handle)\b/i,
    facts: [
      strong('load.type', 'cyclic', 'Tool components commonly experience repeated handling or operating loads.'),
      strong('impact.severity', 'medium', 'Tools commonly receive knocks and handling impacts.'),
      strong('priority', 'strength', 'Functional tool components normally prioritize strength and durability.'),
    ],
  },
  {
    id: 'toy',
    label: 'toy or play object',
    expression: /\b(?:toy car|toy|playground|children'?s toy)\b/i,
    facts: [
      strong('impact.severity', 'medium', 'Toys commonly receive drops, knocks, and rough handling.'),
      weak('load.type', 'cyclic', 'Moving toy components may be operated repeatedly.'),
    ],
  },
  {
    id: 'luggage',
    label: 'luggage or portable bag',
    expression: /\b(?:suitcase|luggage|travel bag|backpack)\b/i,
    facts: [
      strong('load.type', 'cyclic', 'Luggage components are repeatedly handled, opened, and loaded.'),
      strong('impact.severity', 'medium', 'Luggage commonly receives transport and handling impacts.'),
      strong('priority', 'strength', 'Functional luggage components normally prioritize durability.'),
    ],
  },
];

export function interpretUsageContext(text: string, target?: string): UsageContextInterpretation | undefined {
  const source = [target, text].filter(Boolean).join(' · ');
  const match = profiles.flatMap(profile => {
    const evidence = source.match(profile.expression)?.[0];
    return evidence ? [{ profile, evidence }] : [];
  }).sort((left, right) => right.evidence.length - left.evidence.length)[0];
  if (!match) return undefined;
  const { profile } = match;
  const matched = match.evidence;
  return {
    id: profile.id,
    label: profile.label,
    evidence: matched,
    facts: profile.facts.map(item => ({
      key: item.key,
      value: item.value,
      certainty: item.certainty,
      basis: 'world_knowledge',
      evidence: item.reason,
      needsConfirmation: true,
    })),
    questions: profile.questions ?? [],
  };
}

export const usageContextProfiles = profiles.map(profile => ({ id: profile.id, label: profile.label }));
