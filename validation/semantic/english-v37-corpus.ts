import type { ObjectFunction } from '../../src/intent/semanticRelations';

export interface EnglishSemanticCase {
  id: string;
  family: string;
  text: string;
  expectedIdentity: string;
  expectedFunction: ObjectFunction;
}

interface FamilySeed {
  id: string;
  family: string;
  noun: string;
  identity: string;
  function: ObjectFunction;
  action: string;
}

const families: FamilySeed[] = [
  { id: 'parasol-spacer', family: 'spacer', noun: 'parasol base spacer', identity: 'parasol base spacer', function: 'space', action: 'keeps the parasol tube and base 3 mm apart' },
  { id: 'bracket', family: 'mounting', noun: 'wall bracket', identity: 'mounting bracket', function: 'hold', action: 'holds a security camera in position' },
  { id: 'cover', family: 'protection', noun: 'protective cover', identity: 'protective cover or enclosure', function: 'protect', action: 'protects an outdoor sensor from rain' },
  { id: 'cap', family: 'closure', noun: 'protective cap', identity: 'protective cap or plug', function: 'protect', action: 'protects a threaded connector from dirt' },
  { id: 'adapter', family: 'connection', noun: 'hose adapter', identity: 'adapter, coupler, or reducer', function: 'connect', action: 'connects two different hose diameters' },
  { id: 'hinge', family: 'movement', noun: 'cabinet hinge', identity: 'hinge component', function: 'move', action: 'opens and closes repeatedly' },
  { id: 'hook', family: 'support', noun: 'wall hook', identity: 'hook or hanger', function: 'support', action: 'supports a hanging bicycle helmet' },
  { id: 'holder', family: 'holding', noun: 'phone holder', identity: 'holder, stand, or cradle', function: 'hold', action: 'holds a phone in position' },
  { id: 'spacer', family: 'spacing', noun: '8 mm standoff', identity: 'spacer, bushing, or sleeve', function: 'space', action: 'keeps two circuit boards 8 mm apart' },
  { id: 'handle', family: 'grip', noun: 'replacement handle', identity: 'handle, grip, or knob', function: 'grip', action: 'is held by hand to pull a drawer' },
  { id: 'sign', family: 'display', noun: 'door nameplate', identity: 'sign, label, or nameplate', function: 'display', action: 'displays a room number' },
  { id: 'gasket', family: 'sealing', noun: 'pump gasket', identity: 'gasket or seal', function: 'seal', action: 'seals an interface against water' },
  { id: 'gear', family: 'transmission', noun: 'drive gear', identity: 'gear, pulley, or sprocket', function: 'transmit', action: 'transmits torque to a shaft' },
  { id: 'clip', family: 'fastening', noun: 'dishwasher rack clip', identity: 'clip, clamp, or latch', function: 'fasten', action: 'fastens the rack wheel to its axle' },
  { id: 'guide', family: 'guidance', noun: 'drawer guide', identity: 'guide, rail, or slider', function: 'guide', action: 'guides a drawer during repeated movement' },
  { id: 'wheel', family: 'rolling', noun: 'replacement roller', identity: 'wheel or roller', function: 'move', action: 'rolls along a sliding door track' },
  { id: 'insert', family: 'interface', noun: 'threaded insert', identity: 'insert or socket', function: 'connect', action: 'connects a screw to the plastic housing' },
  { id: 'duct', family: 'flow', noun: 'air duct reducer', identity: 'duct, nozzle, or hose fitting', function: 'connect', action: 'connects two air ducts with different diameters' },
  { id: 'container', family: 'containment', noun: 'small parts tray', identity: 'container, pot, tray, or vessel', function: 'contain', action: 'stores loose screws and washers' },
  { id: 'foot', family: 'contact', noun: 'replacement rubber foot', identity: 'foot, pad, or bumper', function: 'support', action: 'supports a table at the floor contact point' },
];

const phrasings = [
  (seed: FamilySeed) => `A ${seed.noun} that ${seed.action}.`,
  (seed: FamilySeed) => `Replacement ${seed.noun}; it ${seed.action}.`,
  (seed: FamilySeed) => `I need a ${seed.noun} for a repair. It ${seed.action}.`,
  (seed: FamilySeed) => `Functional ${seed.noun}, intended to ${seed.action}.`,
  (seed: FamilySeed) => `This is not decorative. The ${seed.noun} ${seed.action}.`,
];

export const englishV37Corpus: EnglishSemanticCase[] = families.flatMap(seed =>
  phrasings.map((phrase, index) => ({
    id: `${seed.id}-${index + 1}`,
    family: seed.family,
    text: phrase(seed),
    expectedIdentity: seed.identity,
    expectedFunction: seed.function,
  })));
