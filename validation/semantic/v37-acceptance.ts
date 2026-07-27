import { localModelAnalysis } from '../../src/ai/modelIntelligence';
import { deterministicSemanticInterpretation } from '../../src/semantic/deterministic';
import type { SemanticFactKey, SemanticInterpretationInput } from '../../src/semantic/types';
import type { ChecklistField, ModelAnalysis, Questionnaire } from '../../src/types';

type ExpectedFact = `${SemanticFactKey}:${string}`;

export interface V37AcceptanceCase {
  id: string;
  description: string;
  identity?: string;
  function?: string;
  expectedFacts?: ExpectedFact[];
  forbiddenFacts?: ExpectedFact[];
  expectedRequirements?: Partial<Record<Exclude<ChecklistField, 'supportsAllowed'>, Questionnaire[Exclude<ChecklistField, 'supportsAllowed'>]>>;
  requiredQuestions?: string[];
  expectedConflictKeys?: SemanticFactKey[];
}

const scenarios: V37AcceptanceCase[] = [
  { id: 'parasol-spacer-outdoor', description: 'Distance piece for a parasol base used outside in direct sun.', identity: 'parasol base spacer', function: 'space', expectedFacts: ['environment.location:outdoor', 'environment.exposure:uv'], expectedRequirements: { environment: 'outdoor', priority: 'accuracy' } },
  { id: 'camera-bracket-weather', description: 'Wall bracket holding a security camera outdoors in rain and sunlight.', identity: 'mounting bracket', function: 'hold', expectedFacts: ['environment.location:outdoor', 'environment.exposure:uv', 'environment.exposure:moisture', 'load.role:load_bearing'], expectedRequirements: { environment: 'outdoor', load: 'static' } },
  { id: 'heavy-wall-hook', description: 'Indoor wall hook carrying 12 kg continuously. Strength is the priority.', identity: 'hook or hanger', function: 'support', expectedFacts: ['load.magnitude:quantified', 'priority:strength'], expectedRequirements: { environment: 'indoor', load: 'static', priority: 'strength' } },
  { id: 'dishwasher-clip', description: 'Replacement dishwasher rack clip that slides against the rail.', identity: 'clip, clamp, or latch', function: 'fasten', expectedFacts: ['environment.service:dishwasher', 'mechanical.wear:sliding'] },
  { id: 'freezer-bracket', description: 'Freezer shelf bracket supporting 6 kg at -20 C.', identity: 'mounting bracket', function: 'support', expectedFacts: ['thermal.exposure:freezing', 'load.magnitude:quantified'], forbiddenFacts: ['thermal.exposure:hot'] },
  { id: 'engine-cover-hot', description: 'Protective cover inside an engine bay at 85 C.', identity: 'protective cover or enclosure', function: 'protect', expectedFacts: ['thermal.exposure:hot'], expectedRequirements: { heat: 'hot' } },
  { id: 'snap-enclosure', description: 'Electronics enclosure with a snap fit and accurate mating surfaces.', identity: 'protective cover or enclosure', function: 'protect', expectedFacts: ['interface.fit:snap', 'interface.mating:true', 'priority:accuracy'], expectedRequirements: { priority: 'accuracy' } },
  { id: 'press-bushing', description: 'Press-fit bushing connecting a shaft to a housing.', identity: 'spacer, bushing, or sleeve', function: 'connect', expectedFacts: ['interface.fit:press', 'load.role:load_bearing'] },
  { id: 'drawer-guide', description: 'Drawer guide that slides repeatedly and must fit accurately.', identity: 'guide, rail, or slider', function: 'guide', expectedFacts: ['mechanical.wear:sliding', 'priority:accuracy'], expectedRequirements: { load: 'cyclic', priority: 'accuracy' } },
  { id: 'drive-gear', description: 'Drive gear transmitting torque with repeated rotation.', identity: 'gear, pulley, or sprocket', function: 'transmit', expectedFacts: ['load.role:load_bearing'], expectedRequirements: { load: 'cyclic' } },
  { id: 'pump-gasket', description: 'Flexible pump gasket sealing a water interface.', identity: 'gasket or seal', function: 'seal', expectedFacts: ['interface.fit:sealing', 'flexibility:flexible'], expectedRequirements: { priority: 'flexibility' } },
  { id: 'door-nameplate', description: 'Decorative door nameplate displaying a room number with a smooth visible face.', identity: 'sign, label, or nameplate', function: 'display', expectedFacts: ['appearance.requirement:visible_surface', 'priority:finish'], expectedRequirements: { load: 'none', priority: 'finish' } },
  { id: 'impact-toy', description: 'Toy wheel that can be dropped and receive hard impacts.', identity: 'toy or figurine component', expectedFacts: ['impact.severity:high'], expectedRequirements: { impact: 'high' } },
  { id: 'drawer-handle', description: 'Replacement handle pulled by hand every day.', identity: 'handle, grip, or knob', function: 'grip', expectedRequirements: { load: 'cyclic' } },
  { id: 'outdoor-plant-pot', description: 'Plant pot used outdoors year-round in rain and UV.', identity: 'container, pot, tray, or vessel', function: 'contain', expectedFacts: ['environment.service:continuous_outdoor', 'environment.exposure:moisture', 'environment.exposure:uv'] },
  { id: 'pressurized-hose-adapter', description: 'Hose adapter connecting two diameters under internal pressure.', identity: 'adapter, coupler, or reducer', function: 'connect', expectedFacts: ['pressure.exposure:internal'] },
  { id: 'electrical-cover', description: 'Non-conductive protective cover that electrically insulates exposed terminals.', identity: 'protective cover or enclosure', function: 'protect', expectedFacts: ['electrical.requirement:insulating'] },
  { id: 'food-contact-tray', description: 'Tray that directly contacts food.', identity: 'container, pot, tray, or vessel', function: 'contain', expectedFacts: ['environment.exposure:food_contact'], requiredQuestions: ['intent-food-contact'] },
  { id: 'solvent-cover', description: 'Protective cover cleaned with solvents.', identity: 'protective cover or enclosure', function: 'protect', expectedFacts: ['environment.exposure:chemical'], requiredQuestions: ['intent-chemical-details'] },
  { id: 'safety-bracket', description: 'Safety-critical overhead mounting bracket supporting a load.', identity: 'mounting bracket', function: 'support', expectedFacts: ['failure.consequence:safety_critical'], requiredQuestions: [] },
  { id: 'vague-replacement', description: 'Replacement part.', requiredQuestions: ['purpose'], forbiddenFacts: ['primary_function:hold', 'primary_function:protect', 'environment.location:outdoor'] },
  { id: 'location-conflict', description: 'Normally used indoors but permanently mounted outdoors.', expectedConflictKeys: ['environment.location'] },
  { id: 'negated-outdoor', description: 'This cover is not used outdoors; it stays indoors.', identity: 'protective cover or enclosure', function: 'protect', expectedFacts: ['environment.location:indoor'], forbiddenFacts: ['environment.location:outdoor'] },
  { id: 'corrected-function', description: 'Correction: this is not a holder. It protects a connector indoors.', function: 'protect', expectedFacts: ['primary_function:protect', 'environment.location:indoor'], forbiddenFacts: ['primary_function:hold'] },
  { id: 'support-free-bracket', description: 'Mounting bracket that must print without removable supports.', identity: 'mounting bracket', function: 'mount' },
  { id: 'visible-cover', description: 'Protective cover with a cosmetic visible face that must look smooth.', identity: 'protective cover or enclosure', function: 'protect', expectedFacts: ['appearance.requirement:visible_surface', 'priority:finish'], expectedRequirements: { priority: 'finish' } },
  { id: 'quick-prototype', description: 'Quick prototype mounting plate where print speed matters most.', identity: 'panel or plate', expectedFacts: ['priority:speed', 'lifetime:temporary'], expectedRequirements: { priority: 'speed' } },
  { id: 'long-life-outdoor-cap', description: 'Long-term protective cap permanently outdoors in sun and rain.', identity: 'protective cap or plug', function: 'protect', expectedFacts: ['lifetime:long_term', 'environment.location:outdoor', 'environment.exposure:uv', 'environment.exposure:moisture'] },
  { id: 'display-only-figurine', description: 'Decorative figurine for display only with no mechanical load.', identity: 'toy or figurine component', function: 'display', expectedFacts: ['load.type:none'], expectedRequirements: { load: 'none' } },
  { id: 'plain-language-distance', description: 'Parasol base distance for outside use.', identity: 'parasol base spacer', function: 'space', expectedFacts: ['environment.location:outdoor'], expectedRequirements: { environment: 'outdoor', priority: 'accuracy' } },
];

const model: ModelAnalysis = {
  fileName: 'acceptance-part.stl',
  triangleCount: 120,
  boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 80, y: 50, z: 25 }, size: { x: 80, y: 50, z: 25 } },
  heightMm: 25,
  bedContactAreaMm2: 1200,
  overhangAreaMm2: 120,
  overhangRatio: 0.05,
  confidence: { bedContact: 0.8, overhang: 0.8 },
  orientationLabel: 'As imported',
  metadata: { format: 'stl', encoding: 'ascii', clues: [] },
  geometryRisk: {
    boundingFootprintAreaMm2: 4000,
    bedCoverageRatio: 0.3,
    heightToContactWidthRatio: 0.5,
    surfaceCentroidOffsetMm: 0,
    surfaceCentroidOffsetRatio: 0,
    overhangRegionCount: 1,
    largestOverhangRegionAreaMm2: 120,
    largestOverhangRegionSpanMm: 15,
    overhangRegions: [],
    bridgeClassification: 'not-evaluated',
  },
  orientations: [],
};

const semanticInput = (description: string): SemanticInterpretationInput => ({
  description,
  language: 'en',
  filename: { value: model.fileName, certainty: 'uncertain' },
  dimensionsMm: model.boundingBox.size,
  geometryObservations: ['Measured compact mesh. Geometry does not establish identity or use.'],
  confirmedManufacturingContext: { facts: [] },
});

export interface AcceptanceFailure {
  caseId: string;
  check: string;
  expected: string;
  actual: string;
}

export interface V37AcceptanceReport {
  cases: number;
  checks: number;
  passed: number;
  score: number;
  falsePositiveCount: number;
  criticalQuestionMisses: number;
  failures: AcceptanceFailure[];
}

export function evaluateV37Acceptance(): V37AcceptanceReport {
  const failures: AcceptanceFailure[] = [];
  let checks = 0;
  let passed = 0;
  let falsePositiveCount = 0;
  let criticalQuestionMisses = 0;
  const check = (caseId: string, name: string, expected: string, actual: string, condition: boolean, category?: 'false-positive' | 'critical-question') => {
    checks += 1;
    if (condition) {
      passed += 1;
      return;
    }
    if (category === 'false-positive') falsePositiveCount += 1;
    if (category === 'critical-question') criticalQuestionMisses += 1;
    failures.push({ caseId, check: name, expected, actual });
  };

  scenarios.forEach(scenario => {
    const semantic = deterministicSemanticInterpretation(semanticInput(scenario.description));
    const intelligence = localModelAnalysis(model, scenario.description);
    const facts = new Set(semantic.candidateFacts.map(fact => `${fact.key}:${fact.value}`));
    if (scenario.identity) check(scenario.id, 'identity', scenario.identity, semantic.objectIdentity.value, semantic.objectIdentity.value === scenario.identity);
    if (scenario.function) {
      const functionFact = semantic.candidateFacts.find(fact => fact.key === 'primary_function')?.value ?? 'missing';
      check(scenario.id, 'function', scenario.function, functionFact, functionFact === scenario.function);
    }
    (scenario.expectedFacts ?? []).forEach(expected =>
      check(scenario.id, 'expected-fact', expected, [...facts].join(', '), facts.has(expected)));
    (scenario.forbiddenFacts ?? []).forEach(forbidden =>
      check(scenario.id, 'forbidden-fact', `not ${forbidden}`, [...facts].join(', '), !facts.has(forbidden), 'false-positive'));
    Object.entries(scenario.expectedRequirements ?? {}).forEach(([field, expected]) => {
      const actual = String(intelligence.requirements[field as Exclude<ChecklistField, 'supportsAllowed'>].value);
      check(scenario.id, `requirement:${field}`, String(expected), actual, actual === String(expected));
    });
    const questionIds = intelligence.questions.map(question => question.id);
    (scenario.requiredQuestions ?? []).forEach(question =>
      check(scenario.id, 'critical-question', question, questionIds.join(', '), questionIds.includes(question), 'critical-question'));
    const conflictKeys = new Set(semantic.conflicts.flatMap(conflict => conflict.factKeys));
    (scenario.expectedConflictKeys ?? []).forEach(key =>
      check(scenario.id, 'conflict', key, [...conflictKeys].join(', '), conflictKeys.has(key)));
  });

  return {
    cases: scenarios.length,
    checks,
    passed,
    score: checks ? passed / checks : 0,
    falsePositiveCount,
    criticalQuestionMisses,
    failures,
  };
}

export const v37AcceptanceScenarios = scenarios;
