export type ContextFacetCategory =
  | 'object-function'
  | 'operating-environment'
  | 'mechanical-demand'
  | 'interface'
  | 'critical-surface'
  | 'desired-property'
  | 'intended-lifetime'
  | 'failure-consequence'
  | 'manufacturing-preference';

export type ContextFacetImpact = 'active-requirement' | 'future-requirement' | 'needs-specialist-review';

export interface ContextFacet {
  id: string;
  category: ContextFacetCategory;
  label: string;
  value: string;
  evidence: string[];
  confidence: number;
  impact: ContextFacetImpact;
}

type FacetDefinition = Omit<ContextFacet, 'evidence'> & { patterns: RegExp[] };

const definitions: FacetDefinition[] = [
  { id: 'function-hold', category: 'object-function', label: 'Function', value: 'holds or supports', confidence: .88, impact: 'future-requirement', patterns: [/\b(?:holds?|supports?|mounts?|bears? weight|håller|bär|stödjer|monterar)\b/iu] },
  { id: 'function-protect', category: 'object-function', label: 'Function', value: 'protects or encloses', confidence: .9, impact: 'future-requirement', patterns: [/\b(?:protects?|protective cover|covers?|encloses?|enclosure|guards?|skyddar|skyddskåpa|täcker|kapslar in|kapsling)\b/iu] },
  { id: 'function-connect', category: 'object-function', label: 'Function', value: 'connects or adapts', confidence: .87, impact: 'future-requirement', patterns: [/\b(?:connects?|connector|adapter|joins?|kopplar|ansluter|adapter|sammanfogar)\b/iu] },
  { id: 'function-move', category: 'object-function', label: 'Function', value: 'moves or guides motion', confidence: .88, impact: 'future-requirement', patterns: [/\b(?:moves?|hinge|slider|guide rail|actuates?|rör sig|gångjärn|glider|styr rörelse|manövrerar)\b/iu] },
  { id: 'function-seal', category: 'object-function', label: 'Function', value: 'seals', confidence: .91, impact: 'future-requirement', patterns: [/\b(?:seals?|gasket|watertight closure|tätar|packning|vattentät förslutning)\b/iu] },
  { id: 'function-display', category: 'object-function', label: 'Function', value: 'displays or decorates', confidence: .88, impact: 'future-requirement', patterns: [/\b(?:displays?|sign|decorative|ornament|visar|skylt|dekorativ|prydnad)\b/iu] },
  { id: 'function-space', category: 'object-function', label: 'Function', value: 'creates or maintains spacing', confidence: .9, impact: 'future-requirement', patterns: [/\b(?:spacer|standoff|distance piece|creates? spacing|maintains? (?:spacing|separation))\b/iu] },

  { id: 'environment-uv', category: 'operating-environment', label: 'Exposure', value: 'direct sun / UV', confidence: .95, impact: 'active-requirement', patterns: [/\b(?:direct sun|sunlight|sun exposure|sun|uv(?: exposure)?|direkt sol|solljus|solexponering|uv-ljus)\b/iu] },
  { id: 'environment-moisture', category: 'operating-environment', label: 'Exposure', value: 'water or moisture', confidence: .93, impact: 'future-requirement', patterns: [/\b(?:rain|wet|water|moisture|humidity|splash(?:es)?|regn|våt|vatten|fukt|luftfuktighet|stänk)\b/iu] },
  { id: 'environment-chemical', category: 'operating-environment', label: 'Exposure', value: 'chemicals', confidence: .92, impact: 'needs-specialist-review', patterns: [/\b(?:chemicals?|solvents?|cleaning agents?|oil|fuel|petrol|diesel|kemikalier?|lösningsmedel|rengöringsmedel|olja|bränsle|bensin)\b/iu] },
  { id: 'environment-food', category: 'operating-environment', label: 'Exposure', value: 'food contact', confidence: .96, impact: 'needs-specialist-review', patterns: [/\b(?:food contact|(?:directly\s+)?contacts? food|touches food|food-safe|kitchen utensil|livsmedelskontakt|kontakt med mat|livsmedelssäker|köksredskap)\b/iu] },

  { id: 'load-fatigue', category: 'mechanical-demand', label: 'Load', value: 'repeated / fatigue', confidence: .92, impact: 'active-requirement', patterns: [/\b(?:fatigue|repeated load|cyclic load|repeated movement|many cycles|utmattning|upprepad belastning|cyklisk belastning|upprepad rörelse|många cykler)\b/iu] },
  { id: 'load-tension', category: 'mechanical-demand', label: 'Load direction', value: 'tension / pulling', confidence: .91, impact: 'future-requirement', patterns: [/\b(?:tension|tensile|pulled apart|pulling force|dragbelastning|dragkraft|dras isär)\b/iu] },
  { id: 'load-compression', category: 'mechanical-demand', label: 'Load direction', value: 'compression', confidence: .91, impact: 'future-requirement', patterns: [/\b(?:compression|compressive|squeezed|crushed|tryckbelastning|kompression|kläms|trycks ihop)\b/iu] },
  { id: 'load-bending', category: 'mechanical-demand', label: 'Load direction', value: 'bending', confidence: .91, impact: 'future-requirement', patterns: [/\b(?:bending|bending load|bending force|böjning|böjbelastning|böjkraft)\b/iu] },
  { id: 'load-torsion', category: 'mechanical-demand', label: 'Load direction', value: 'torsion / twisting', confidence: .91, impact: 'future-requirement', patterns: [/\b(?:torsion|torque|twisting|vridning|vridmoment|vridbelastning)\b/iu] },
  { id: 'load-shear', category: 'mechanical-demand', label: 'Load direction', value: 'shear', confidence: .91, impact: 'future-requirement', patterns: [/\b(?:shear|shear load|skjuvning|skjuvbelastning)\b/iu] },

  { id: 'fit-press', category: 'interface', label: 'Fit', value: 'press fit', confidence: .96, impact: 'active-requirement', patterns: [/\b(?:press[- ]?fit|interference fit|presspassning|interferenspassning)\b/iu] },
  { id: 'fit-sliding', category: 'interface', label: 'Fit', value: 'sliding or clearance fit', confidence: .94, impact: 'active-requirement', patterns: [/\b(?:sliding fit|clearance fit|slide freely|glidpassning|spelpassning|glida fritt)\b/iu] },
  { id: 'fit-snap', category: 'interface', label: 'Fit', value: 'snap fit', confidence: .96, impact: 'active-requirement', patterns: [/\b(?:snap[- ]?fit|snap clip|snaps? (?:onto|into)|clips? into|snäppfäste|snäpppassning|klickas fast)\b/iu] },
  { id: 'fit-thread', category: 'interface', label: 'Fit', value: 'threaded interface', confidence: .95, impact: 'active-requirement', patterns: [/\b(?:threaded|screw thread|threads?|gängad|skruvgänga|gängor?)\b/iu] },
  { id: 'fit-seal', category: 'interface', label: 'Fit', value: 'sealing interface', confidence: .95, impact: 'active-requirement', patterns: [/\b(?:sealing .{0,24}interface|seals? (?:an? |the )?interface|o-ring|gasket seat|tätningsyta|o-ring|packningsläge)\b/iu] },

  { id: 'surface-visible', category: 'critical-surface', label: 'Critical surface', value: 'visible face', confidence: .91, impact: 'active-requirement', patterns: [/\b(?:visible face|front face|cosmetic surface|display side|synlig yta|framsida|kosmetisk yta|visningssida)\b/iu] },
  { id: 'surface-mating', category: 'critical-surface', label: 'Critical surface', value: 'mating surface', confidence: .94, impact: 'active-requirement', patterns: [/\b(?:mating surfaces?|contact surfaces?|bearing seat|mounting face|anliggningsyta|kontaktyta|lagerläge|monteringsyta)\b/iu] },

  { id: 'property-watertight', category: 'desired-property', label: 'Property', value: 'watertight', confidence: .93, impact: 'future-requirement', patterns: [/\b(?:watertight|waterproof|leak[- ]?proof|vattentät|läckagesäker)\b/iu] },
  { id: 'property-durable', category: 'desired-property', label: 'Property', value: 'durable', confidence: .86, impact: 'active-requirement', patterns: [/\b(?:durable|long-lasting|robust|tough|hållbar|långlivad|robust|tålig)\b/iu] },

  { id: 'lifetime-long', category: 'intended-lifetime', label: 'Lifetime', value: 'long-term / permanent', confidence: .9, impact: 'future-requirement', patterns: [/\b(?:long[- ]term|permanent|several years|daily for years|långvarig|permanent|flera år|dagligen i flera år)\b/iu] },
  { id: 'lifetime-temporary', category: 'intended-lifetime', label: 'Lifetime', value: 'temporary / prototype', confidence: .9, impact: 'future-requirement', patterns: [/\b(?:temporary|prototype|one[- ]off prototype|short[- ]term|proof of concept|tillfällig|engångsprototyp|kortvarig|koncepttest)\b/iu] },

  { id: 'failure-safety', category: 'failure-consequence', label: 'Failure consequence', value: 'safety-critical', confidence: .98, impact: 'needs-specialist-review', patterns: [/\b(?:safety[- ]critical|failure (?:could|can|may) (?:injure|hurt)|supports? a person|overhead load|personsäkerhet|säkerhetskritisk|fel (?:kan|riskerar att) skada|bär en person|last över huvudet)\b/iu] },
  { id: 'failure-noncritical', category: 'failure-consequence', label: 'Failure consequence', value: 'non-critical', confidence: .93, impact: 'future-requirement', patterns: [/\b(?:non[- ]critical|safe if it fails|failure is only inconvenient|icke[- ]kritisk|ofarlig om den går sönder|fel är bara besvärligt)\b/iu] },

  { id: 'preference-support-free', category: 'manufacturing-preference', label: 'Print preference', value: 'support-free', confidence: .96, impact: 'active-requirement', patterns: [/\b(?:support[- ]free|without supports?|no supports?|utan stöd|inga stöd)\b/iu] },
  { id: 'preference-speed', category: 'manufacturing-preference', label: 'Print preference', value: 'short print time', confidence: .9, impact: 'active-requirement', patterns: [/\b(?:fast print|short print time|quick prototype|snabb utskrift|kort utskriftstid|snabb prototyp)\b/iu] },
  { id: 'preference-weight', category: 'manufacturing-preference', label: 'Print preference', value: 'low weight', confidence: .91, impact: 'future-requirement', patterns: [/\b(?:lightweight|low weight|as light as possible|lättvikt|låg vikt|så lätt som möjligt)\b/iu] },
  { id: 'preference-cost', category: 'manufacturing-preference', label: 'Print preference', value: 'low cost', confidence: .91, impact: 'future-requirement', patterns: [/\b(?:low cost|cheap to print|minimize cost|låg kostnad|billig att skriva ut|minimera kostnad)\b/iu] },
];

const negationBefore = (text: string, index: number) => {
  const prefix = text.slice(Math.max(0, index - 52), index);
  const localClause = prefix.split(/[,.;:!?]|\b(?:and|but|och|men)\b/iu).at(-1) ?? prefix;
  return /\b(?:not|never|no|without|inte|ej|aldrig|utan)\b(?:\s+[\p{L}\p{N}-]+){0,3}\s*$/iu.test(localClause);
};

export function extractContextFacets(text: string): ContextFacet[] {
  const normalized = text.normalize('NFKC').replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  return definitions.flatMap(definition => {
    const evidence = definition.patterns.flatMap(pattern => {
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      return [...normalized.matchAll(globalPattern)]
        .filter(match => match.index !== undefined && !negationBefore(normalized, match.index))
        .map(match => match[0].trim());
    });
    if (!evidence.length) return [];
    const { patterns: _patterns, ...facet } = definition;
    return [{ ...facet, evidence: [...new Set(evidence)] }];
  });
}
