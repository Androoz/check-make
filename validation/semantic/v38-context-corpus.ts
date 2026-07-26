import type { SemanticFactKey } from '../../src/semantic/types';

export interface V38ContextCase {
  id: string;
  text: string;
  parent?: string;
  expectedFacts?: Array<`${SemanticFactKey}:${string}`>;
  forbiddenFacts?: Array<`${SemanticFactKey}:${string}`>;
}

export const v38ContextCorpus: V38ContextCase[] = [
  { id: 'camp-chair-spacer', text: 'Spacer for camping chair', parent: 'camping or folding chair', expectedFacts: ['environment.location:outdoor', 'load.type:cyclic', 'priority:strength'] },
  { id: 'folding-chair-hinge', text: 'Replacement hinge for a folding chair', parent: 'camping or folding chair', expectedFacts: ['load.type:cyclic', 'failure.consequence:safety_critical'] },
  { id: 'garden-chair-foot', text: 'Replacement foot for a garden chair', parent: 'outdoor furniture', expectedFacts: ['environment.location:outdoor', 'environment.exposure:uv', 'environment.exposure:moisture'] },
  { id: 'seat-bushing', text: 'Bushing for a seat frame', parent: 'chair or seating assembly', expectedFacts: ['load.type:static', 'priority:strength'] },
  { id: 'dishwasher-clip', text: 'Clip for dishwasher rack wheel', parent: 'dishwasher assembly', expectedFacts: ['environment.service:dishwasher', 'environment.exposure:moisture'] },
  { id: 'dishwasher-roller', text: 'Replacement roller in a dishwasher', parent: 'dishwasher assembly', expectedFacts: ['load.type:cyclic'] },
  { id: 'bicycle-spacer', text: 'Wheel spacer for a bicycle', parent: 'bicycle assembly', expectedFacts: ['environment.service:intermittent_outdoor', 'load.type:cyclic'] },
  { id: 'bike-bracket', text: 'Mounting bracket for a bike rack', parent: 'bicycle assembly', expectedFacts: ['priority:strength'] },
  { id: 'vehicle-dashboard-clip', text: 'Clip for a car dashboard', parent: 'vehicle assembly', expectedFacts: ['load.type:cyclic', 'impact.severity:medium'] },
  { id: 'motorcycle-cover', text: 'Protective cover for a motorcycle', parent: 'vehicle assembly', expectedFacts: ['priority:strength'] },
  { id: 'drawer-guide', text: 'Guide block for a drawer', parent: 'door, drawer, or cabinet mechanism', expectedFacts: ['load.type:cyclic', 'priority:accuracy'] },
  { id: 'cabinet-spacer', text: 'Spacer for a cabinet door hinge', parent: 'door, drawer, or cabinet mechanism', expectedFacts: ['priority:accuracy'] },
  { id: 'water-pipe-seal', text: 'Seal for a water pipe', parent: 'pipe, hose, or plumbing assembly', expectedFacts: ['environment.exposure:moisture', 'pressure.exposure:internal'] },
  { id: 'hose-adapter', text: 'Adapter for a garden hose', parent: 'pipe, hose, or plumbing assembly', expectedFacts: ['priority:accuracy'] },
  { id: 'sensor-mount', text: 'Mounting bracket for an indoor sensor', parent: 'electronics or sensor assembly', expectedFacts: ['priority:accuracy'], forbiddenFacts: ['environment.location:outdoor'] },
  { id: 'pcb-standoff', text: 'Standoff for a circuit board', parent: 'electronics or sensor assembly', expectedFacts: ['priority:accuracy'] },
  { id: 'drill-handle', text: 'Replacement handle for a power drill', parent: 'hand or power tool', expectedFacts: ['impact.severity:medium', 'priority:strength'] },
  { id: 'saw-guard', text: 'Guard for a hand saw', parent: 'hand or power tool', expectedFacts: ['load.type:cyclic'] },
  { id: 'toy-wheel', text: 'Replacement wheel for a toy car', parent: 'toy or play object', expectedFacts: ['impact.severity:medium'] },
  { id: 'playground-cap', text: 'Protective cap for playground equipment', parent: 'toy or play object', expectedFacts: ['impact.severity:medium'] },
  { id: 'suitcase-wheel', text: 'Wheel spacer for a suitcase', parent: 'luggage or portable bag', expectedFacts: ['load.type:cyclic', 'impact.severity:medium'] },
  { id: 'backpack-clip', text: 'Replacement clip for a backpack', parent: 'luggage or portable bag', expectedFacts: ['priority:strength'] },
  { id: 'explicit-chair-override', text: 'Decorative non-load-bearing nameplate for a chair; failure is only inconvenient.', parent: 'chair or seating assembly', expectedFacts: ['load.role:non_load_bearing', 'failure.consequence:non_critical'], forbiddenFacts: ['load.role:load_bearing', 'failure.consequence:safety_critical'] },
  { id: 'indoor-camp-chair', text: 'Spacer for camping chair, used indoors and not load-bearing.', parent: 'camping or folding chair', expectedFacts: ['environment.location:indoor', 'load.role:non_load_bearing'], forbiddenFacts: ['environment.location:outdoor', 'load.role:load_bearing'] },
  { id: 'unknown-parent', text: 'Replacement spacer for a custom assembly', forbiddenFacts: ['environment.location:outdoor', 'failure.consequence:safety_critical'] },
  { id: 'camping-not-chair', text: 'Spacer for a camping stove', forbiddenFacts: ['failure.consequence:safety_critical', 'load.role:load_bearing'] },
];

