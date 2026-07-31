import type { SemanticFactKey } from '../../src/semantic/types';

export interface V40CompositionalCase {
  id: string;
  text: string;
  parent?: string;
  expectedFacts?: Array<`${SemanticFactKey}:${string}`>;
  forbiddenFacts?: Array<`${SemanticFactKey}:${string}`>;
  evidenceFact?: `${SemanticFactKey}:${string}`;
}

export const v40CompositionalCorpus: V40CompositionalCase[] = [
  { id: 'en-next-tee', text: 'Next tee sign for disc golf', parent: 'disc-golf course', expectedFacts: ['primary_function:guide', 'environment.location:outdoor'], evidenceFact: 'environment.location:outdoor' },
  { id: 'en-marker-paraphrase', text: 'Marker showing players where the next tee is', parent: 'course position', expectedFacts: ['primary_function:guide', 'appearance.requirement:visible_surface'], evidenceFact: 'appearance.requirement:visible_surface' },
  { id: 'sv-marker-paraphrase', text: 'Skylt som visar spelare var nästa tee finns', parent: 'course position', expectedFacts: ['primary_function:guide', 'environment.location:outdoor'] },
  { id: 'en-camping-hinge', text: 'Replacement hinge for a folding camping chair', parent: 'camping or folding chair', expectedFacts: ['load.type:cyclic', 'load.role:load_bearing', 'failure.consequence:safety_critical'], evidenceFact: 'failure.consequence:safety_critical' },
  { id: 'sv-camping-hinge', text: 'Nytt gångjärn till en campingstol', parent: 'camping or folding chair', expectedFacts: ['load.type:cyclic', 'priority:strength'] },
  { id: 'en-drawer-guide', text: 'Guide block inside a kitchen drawer', parent: 'door, drawer, or cabinet mechanism', expectedFacts: ['load.type:cyclic', 'priority:accuracy'], evidenceFact: 'priority:accuracy' },
  { id: 'sv-drawer-guide', text: 'Styrblock inuti en kökslåda', parent: 'door, drawer, or cabinet mechanism', expectedFacts: ['load.type:cyclic', 'priority:accuracy'] },
  { id: 'en-camera-outdoor', text: 'Protective housing for an outdoor security camera', parent: 'electronics or sensor assembly', expectedFacts: ['environment.location:outdoor', 'environment.exposure:uv', 'environment.exposure:moisture', 'priority:accuracy'], evidenceFact: 'environment.exposure:uv' },
  { id: 'en-camera-indoor', text: 'Camera cover used only indoors', parent: 'electronics or sensor assembly', expectedFacts: ['environment.location:indoor', 'priority:accuracy'], forbiddenFacts: ['environment.location:outdoor', 'environment.exposure:uv', 'environment.exposure:moisture'] },
  { id: 'sv-camera-indoor', text: 'Kamerakåpa, endast inomhus', parent: 'electronics or sensor assembly', expectedFacts: ['environment.location:indoor'], forbiddenFacts: ['environment.location:outdoor', 'environment.exposure:uv'] },
  { id: 'en-toy-wheel', text: 'Wheel for a radio-controlled car', parent: 'toy or play object', expectedFacts: ['impact.severity:medium', 'load.type:cyclic'], forbiddenFacts: ['thermal.exposure:warm', 'priority:strength'] },
  { id: 'sv-toy-wheel', text: 'Hjul till en radiostyrd bil', parent: 'toy or play object', expectedFacts: ['impact.severity:medium'] },
  { id: 'en-real-car-spacer', text: 'Wheel spacer for an automotive vehicle', parent: 'vehicle assembly', expectedFacts: ['load.type:cyclic', 'priority:strength'], forbiddenFacts: ['environment.service:intermittent_outdoor'] },
  { id: 'en-dishwasher-clip', text: 'Clip for a dishwasher rack', parent: 'dishwasher assembly', expectedFacts: ['environment.service:dishwasher', 'environment.exposure:moisture', 'load.type:cyclic'], evidenceFact: 'environment.exposure:moisture' },
  { id: 'en-luggage-wheel', text: 'Replacement wheel mounted to a suitcase', parent: 'luggage or portable bag', expectedFacts: ['load.type:cyclic', 'impact.severity:medium'] },
  { id: 'en-hose-adapter', text: 'Adapter part of a garden hose connection', parent: 'pipe, hose, or plumbing assembly', expectedFacts: ['environment.exposure:moisture', 'pressure.exposure:internal', 'priority:accuracy'], evidenceFact: 'pressure.exposure:internal' },
  { id: 'en-tool-handle', text: 'Replacement handle mounted to a power drill', parent: 'hand or power tool', expectedFacts: ['load.type:cyclic', 'impact.severity:medium', 'priority:strength'] },
  { id: 'counter-disc-holder', text: 'Holder for disc-golf discs stored indoors', expectedFacts: ['environment.location:indoor'], forbiddenFacts: ['environment.location:outdoor', 'environment.exposure:uv', 'primary_function:guide'] },
  { id: 'counter-indoor-display', text: 'Indoor display about disc golf', expectedFacts: ['environment.location:indoor'], forbiddenFacts: ['environment.location:outdoor', 'primary_function:guide'] },
  { id: 'counter-themed-badge', text: 'Decorative badge for a bicycle-themed bedroom', expectedFacts: ['load.type:none'], forbiddenFacts: ['environment.service:intermittent_outdoor', 'failure.consequence:safety_critical', 'priority:strength'] },
  { id: 'override-chair', text: 'Spacer for camping chair, used indoors and not load-bearing.', parent: 'camping or folding chair', expectedFacts: ['environment.location:indoor', 'load.role:non_load_bearing'], forbiddenFacts: ['environment.location:outdoor', 'environment.service:intermittent_outdoor', 'load.role:load_bearing'] },
  { id: 'unknown-niche', text: 'Replacement qelvar for a norbit assembly', forbiddenFacts: ['environment.location:outdoor', 'priority:strength', 'failure.consequence:safety_critical'] },
];
