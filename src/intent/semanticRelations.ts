import { normalizeEnglishContext } from './englishNormalization';

export type ObjectFunction =
  | 'connect' | 'hold' | 'protect' | 'display' | 'move' | 'space' | 'seal'
  | 'guide' | 'mount' | 'support' | 'contain' | 'fasten' | 'grip' | 'transmit' | 'other';

export interface SemanticRelation {
  identity?: { value: string; evidence: string; confidence: number };
  function?: {
    value: ObjectFunction;
    label: string;
    evidence: string;
    confidence: number;
    explicit: boolean;
  };
  target?: string;
}

interface FamilyDefinition {
  value: string;
  expression: RegExp;
  defaultFunction?: ObjectFunction;
  functionLabel?: string;
}

const families: FamilyDefinition[] = [
  { value: 'parasol base spacer', expression: /\b(?:spacer\s+for\s+(?:a\s+|the\s+)?(?:parasol|umbrella)\s+base|(?:parasol|umbrella)\s+base\s+spacer)\b/i, defaultFunction: 'space', functionLabel: 'creates or maintains spacing' },
  { value: 'mounting bracket', expression: /\b(?:mounting|wall|shelf|camera|sensor)?\s*bracket\b/i, defaultFunction: 'mount', functionLabel: 'mounts another component' },
  { value: 'protective cover or enclosure', expression: /\b(?:protective\s+)?(?:cover|guard|enclosure|housing|case|shell)\b/i, defaultFunction: 'protect', functionLabel: 'protects or encloses' },
  { value: 'protective cap or plug', expression: /\b(?:protective\s+)?(?:cap|plug|dust cap|end cap)\b/i, defaultFunction: 'protect', functionLabel: 'protects or closes an opening' },
  { value: 'adapter, coupler, or reducer', expression: /\b(?:adapter|coupler|reducer|converter)\b/i, defaultFunction: 'connect', functionLabel: 'connects or adapts components' },
  { value: 'hinge component', expression: /\bhinge\b/i, defaultFunction: 'move', functionLabel: 'allows repeated rotation or movement' },
  { value: 'hook or hanger', expression: /\b(?:hook|hanger)\b/i, defaultFunction: 'support', functionLabel: 'supports a hanging object' },
  { value: 'holder, stand, or cradle', expression: /\b(?:holder|stand|cradle|dock)\b/i, defaultFunction: 'hold', functionLabel: 'holds another object in position' },
  { value: 'spacer, bushing, or sleeve', expression: /\b(?:spacer|standoff|distance piece|bushing|sleeve|shim|washer)\b/i, defaultFunction: 'space', functionLabel: 'creates or maintains spacing' },
  { value: 'handle, grip, or knob', expression: /\b(?:handle|grip|knob)\b/i, defaultFunction: 'grip', functionLabel: 'provides a hand-operated grip' },
  { value: 'sign, label, or nameplate', expression: /\b(?:sign|nameplate|plaque|label|badge)\b/i, defaultFunction: 'display', functionLabel: 'displays information or decoration' },
  { value: 'gasket or seal', expression: /\b(?:gasket|seal|o-ring)\b/i, defaultFunction: 'seal', functionLabel: 'seals an interface' },
  { value: 'gear, pulley, or sprocket', expression: /\b(?:gear|cog|pulley|sprocket)\b/i, defaultFunction: 'transmit', functionLabel: 'transmits motion or torque' },
  { value: 'clip, clamp, or latch', expression: /\b(?:clip|clamp|latch|retainer)\b/i, defaultFunction: 'fasten', functionLabel: 'fastens or retains another component' },
  { value: 'guide, rail, or slider', expression: /\b(?:guide|rail|slider|slide block|drawer slide)\b/i, defaultFunction: 'guide', functionLabel: 'guides repeated movement' },
  { value: 'wheel or roller', expression: /\b(?:wheel|roller|caster)\b/i, defaultFunction: 'move', functionLabel: 'allows rolling movement' },
  { value: 'insert or socket', expression: /\b(?:insert|socket|threaded insert)\b/i, defaultFunction: 'connect', functionLabel: 'provides a fitted interface' },
  { value: 'duct, nozzle, or hose fitting', expression: /\b(?:air duct|duct|nozzle|hose fitting|manifold)\b/i, defaultFunction: 'connect', functionLabel: 'routes or connects a flow path' },
  { value: 'container, pot, tray, or vessel', expression: /\b(?:container|vase|plant pot|pot|bin|tray|cup|scoop|vessel)\b/i, defaultFunction: 'contain', functionLabel: 'contains material or objects' },
  { value: 'foot, pad, or bumper', expression: /\b(?:foot|feet|pad|bumper)\b/i, defaultFunction: 'support', functionLabel: 'supports or protects a contact point' },
  { value: 'toy or figurine component', expression: /\b(?:toy|figurine|miniature|model figure|model car|rc car|radio[- ]controlled car|remote[- ]controlled car|radiostyrd bil|leksaksbil)\b/i, defaultFunction: 'display', functionLabel: 'serves as a toy or display object' },
  { value: 'tool component', expression: /\b(?:tool part|power tool|hand tool)\b/i, defaultFunction: 'other', functionLabel: 'forms part of a tool' },
  { value: 'panel or plate', expression: /\b(?:panel|plate)\b/i },
];

const functionPatterns: Array<{ value: ObjectFunction; label: string; expression: RegExp }> = [
  { value: 'protect', label: 'protects or encloses', expression: /\b(?:protect(?:s|ing)?|shield(?:s|ing)?|guard(?:s|ing)?|cover(?:s|ing)?|keeps? .{0,30} (?:safe|dry|clean))\b/i },
  { value: 'space', label: 'creates or maintains spacing', expression: /\b(?:keeps? .{0,40} apart|spac(?:e|es|ing)|creat(?:e|es|ing) (?:a )?(?:gap|spacing)|maintain(?:s|ing)? (?:a )?(?:gap|spacing)|between two)\b/i },
  { value: 'connect', label: 'connects or adapts components', expression: /\b(?:connect(?:s|ing)?|join(?:s|ing)?|coupl(?:e|es|ing)|adapt(?:s|ing)?|link(?:s|ing)?|reduc(?:e|es|ing) .{0,25} diameter)\b/i },
  { value: 'hold', label: 'holds or retains another object', expression: /\b(?:hold(?:s|ing)?|retain(?:s|ing)?|secur(?:e|es|ing)|keeps? .{0,35} in (?:place|position))\b/i },
  { value: 'support', label: 'supports or carries another object', expression: /\b(?:(?<!removable )(?<!print )support(?:s|ing)?|carr(?:y|ies|ying)|bear(?:s|ing)? (?:the )?(?:load|weight))\b/i },
  { value: 'mount', label: 'mounts or positions another component', expression: /\b(?:mounts?|mounting (?!bracket\b)|attach(?:es|ing)? .{0,35} to|position(?:s|ing)? .{0,35} on)\b/i },
  { value: 'guide', label: 'guides movement, alignment, or wayfinding', expression: /\b(?:guid(?:e|es|ing)|show(?:s|ing)? .{0,35} where|align(?:s|ing)?|track(?:s|ing)?|slid(?:e|es|ing) (?:along|inside|within))\b/i },
  { value: 'move', label: 'moves or permits movement', expression: /\b(?:mov(?:e|es|ing)|rotat(?:e|es|ing)|roll(?:s|ing)?|pivot(?:s|ing)?|open(?:s|ing)? and clos(?:e|es|ing))\b/i },
  { value: 'seal', label: 'seals an interface', expression: /\b(?:seal(?:s|ing)?|prevent(?:s|ing)? (?:leaks?|water|air) (?:from )?(?:passing|entering|escaping))\b/i },
  { value: 'display', label: 'displays information or decoration', expression: /\b(?:display(?:s|ing)?|show(?:s|ing)?|decorat(?:e|es|ing))\b/i },
  { value: 'contain', label: 'contains material or objects', expression: /\b(?:contain(?:s|ing)?|stor(?:e|es|ing)|collect(?:s|ing)?|hold(?:s|ing)? (?:water|liquid|soil|food|parts))\b/i },
  { value: 'fasten', label: 'fastens or locks components', expression: /\b(?:fasten(?:s|ing)?|lock(?:s|ing)?|clip(?:s|ping)? (?:onto|into)|snap(?:s|ping)? (?:onto|into))\b/i },
  { value: 'grip', label: 'provides a grip or control surface', expression: /\b(?:grip(?:s|ping)?|is held by hand|turned by hand|pulled by hand)\b/i },
  { value: 'transmit', label: 'transmits motion, force, or torque', expression: /\b(?:transmit(?:s|ting)?|driv(?:e|es|ing)|transfer(?:s|ring)? (?:motion|force|torque))\b/i },
];

function negatedAt(text: string, index: number) {
  const prefix = text.slice(Math.max(0, index - 55), index);
  const clause = prefix.split(/[,.;:!?]|\b(?:but|however|instead)\b/i).at(-1) ?? prefix;
  return /\b(?:not|never|no|is not|isn't|does not|doesn't|rather than)\b(?:\s+[\p{L}\p{N}-]+){0,4}\s*$/iu.test(clause);
}

function firstActiveMatch(text: string, expression: RegExp) {
  const pattern = new RegExp(expression.source, expression.flags.includes('g') ? expression.flags : `${expression.flags}g`);
  return [...text.matchAll(pattern)].find(match => match.index !== undefined && !negatedAt(text, match.index));
}

function targetFrom(text: string, evidence: string) {
  const start = text.toLocaleLowerCase('en-US').indexOf(evidence.toLocaleLowerCase('en-US'));
  const tail = start >= 0 ? text.slice(start + evidence.length) : text;
  const match = tail.match(/\b(?:for|to|onto|into|between|around|inside|on)\s+(?:an?\s+|the\s+)?([^,.;]{2,70})/i);
  return match?.[1]?.trim().replace(/\b(?:outdoor|indoors?|outside|inside)\b.*$/i, '').trim() || undefined;
}

export function interpretSemanticRelations(input: string): SemanticRelation {
  const text = normalizeEnglishContext(input.normalize('NFKC').replace(/\s+/g, ' ').trim()).text;
  if (!text) return {};
  const familyMatch = families.flatMap(family => {
    const match = firstActiveMatch(text, family.expression);
    return match ? [{ family, match }] : [];
  }).sort((left, right) => (left.match.index ?? 0) - (right.match.index ?? 0))[0];
  const explicitFunction = functionPatterns.flatMap(pattern => {
    const match = firstActiveMatch(text, pattern.expression);
    return match ? [{ pattern, match }] : [];
  }).sort((left, right) => (left.match.index ?? 0) - (right.match.index ?? 0))[0];
  const relation: SemanticRelation = {};
  if (familyMatch) relation.identity = {
    value: familyMatch.family.value,
    evidence: familyMatch.match[0],
    confidence: 0.96,
  };
  if (explicitFunction) relation.function = {
    value: explicitFunction.pattern.value,
    label: explicitFunction.pattern.label,
    evidence: explicitFunction.match[0],
    confidence: 0.95,
    explicit: true,
  };
  else if (familyMatch?.family.defaultFunction && familyMatch.family.functionLabel) relation.function = {
    value: familyMatch.family.defaultFunction,
    label: familyMatch.family.functionLabel,
    evidence: familyMatch.match[0],
    confidence: 0.72,
    explicit: false,
  };
  const evidence = explicitFunction?.match[0] ?? familyMatch?.match[0];
  if (evidence) relation.target = targetFrom(text, evidence);
  return relation;
}

export const semanticObjectFamilies = families.map(({ value, defaultFunction }) => ({ value, defaultFunction }));
