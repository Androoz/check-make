import type { BriefInference, ChecklistField, InferenceValue, Questionnaire } from '../types';
import { extractContextFacets } from './contextFacets';
import type { ContextFacet } from './contextFacets';
import { normalizeEnglishContext } from './englishNormalization';
import type { EnglishCorrection, EnglishReviewCue } from './englishNormalization';

type RequirementValue = Questionnaire[ChecklistField];
type PhrasePattern = { expression: RegExp; allowNegated?: boolean };
type Candidate = {
  field: ChecklistField;
  value: RequirementValue;
  confidence: number;
  patterns: PhrasePattern[];
};

export interface ContextConflict {
  field: ChecklistField;
  values: RequirementValue[];
  evidence: string[];
}

export interface ContextAmbiguity {
  field: ChecklistField;
  evidence: string[];
  reason: string;
}

export interface ContextInterpretation {
  normalizedText: string;
  inference: BriefInference;
  conflicts: ContextConflict[];
  ambiguities: ContextAmbiguity[];
  temperaturesC: number[];
  facets: ContextFacet[];
  corrections: EnglishCorrection[];
  languageCues: EnglishReviewCue[];
}

const phrase = (expression: RegExp, allowNegated = false): PhrasePattern => ({ expression, allowNegated });
const candidate = (field: ChecklistField, value: RequirementValue, confidence: number, ...patterns: PhrasePattern[]): Candidate => ({ field, value, confidence, patterns });

const candidates: Candidate[] = [
  candidate('environment', 'outdoor', .93,
    phrase(/\b(?:outdoor|outdoors|outside|weather[- ]exposed|weatherproof|rain|sun|sunlight|uv|garden|marine|utomhus[\p{L}-]*|väderutsatt|regn|sol|solljus)\b/iu)),
  candidate('environment', 'indoor', .91,
    phrase(/\b(?:indoor|indoors|inside only|inomhus|endast inomhus)\b/i),
    phrase(/\b(?:not|never)\s+(?:used\s+)?(?:outdoor|outdoors|outside)\b/i, true),
    phrase(/\b(?:inte|ej|aldrig)\s+(?:används?\s+)?utomhus\b/i, true)),

  candidate('load', 'cyclic', .91,
    phrase(/\b(?:repeated|cyclic|fatigue|moving|hinge|gear|vibration|flexes|opens? and closes?|daily movement|upprepad|cyklisk|utmattning|rörlig|gångjärn|kugghjul|vibration)\b/i)),
  candidate('load', 'static', .80,
    phrase(/\b(?:holds?|supports?|mounted|bracket|shelf|constant .{0,20}load|steady (?:load|compression|tension)|under steady (?:load|compression|tension)|hook|holder|clamp|mount|håller|monterad|fäste|konsol|konstant last|krok|hållare|klämma)\b/i)),
  candidate('load', 'none', .90,
    phrase(/\b(?:no meaningful load|no mechanical load|no load|display only|visual only|ingen (?:mekanisk |betydande )?last|endast visning)\b/i, true),
    phrase(/\b(?:decorative|ornament|dekorativ|prydnad)\b/i)),

  candidate('impact', 'high', .94,
    phrase(/\b(?:heavy impact|hard impacts?|hammer|struck repeatedly|drop resistant|high impact|hårda slag|hög slagbelastning|kraftiga stötar)\b/i)),
  candidate('impact', 'medium', .84,
    phrase(/\b(?:impact|knocks?|knocked|bumps?|bumped|drops?|dropped|tough|durable|slag|stöt|tappas|tålig)\b/i)),
  candidate('impact', 'none', .91,
    phrase(/\b(?:no impacts?|not dropped|no knocks?|ingen slagbelastning|inga slag|tappas inte)\b/i, true)),

  candidate('heat', 'hot', .94,
    phrase(/\b(?:engine bay|oven|over 70(?:\s*°?c)?|above 70(?:\s*°?c)?|high heat|hot car|exhaust|motorutrymme|ugn|över 70(?:\s*°?c)?|hög värme|avgassystem)\b/i)),
  candidate('heat', 'warm', .86,
    phrase(/\b(?:warm|heat resistant|sun[- ]heated|varm|värmetålig|soluppvärmd)\b/i)),
  candidate('heat', 'normal', .91,
    phrase(/\b(?:room temperature|ambient temperature|normal temperature|no heat|rumstemperatur|normal temperatur|ingen värme)\b/i, true)),

  candidate('priority', 'flexibility', .95,
    phrase(/\b(?:flexible|soft|rubber|gasket|bendable|mjuk|flexibel|gummi|packning)\b/i)),
  candidate('priority', 'accuracy', .93,
    phrase(/\b(?:accurate fit|fits? accurately|tolerance|press[- ]?fit|snap[- ]?fit|sliding fit|clearance fit|dimensionally accurate|mating surfaces?|bearing (?:seat|fit|bore)|thread|precise fit|noggrann|tolerans|passning|presspassning|snäppfäste|glidpassning|spelpassning|anliggningsyta|lagerläge|gänga)\b/i)),
  candidate('priority', 'finish', .91,
    phrase(/\b(?:smooth|surface finish|visible face|cosmetic|display quality|appearance|ytfinish|synlig yta|utseende|kosmetisk)\b/i)),
  candidate('priority', 'speed', .89,
    phrase(/\b(?:quick prototype|fast print|draft|print time|snabb utskrift|snabb prototyp|utkast)\b/i)),
  candidate('priority', 'strength', .84,
    phrase(/\b(?:strong|strength|structural|load[- ]bearing|bracket|durable|hook|holder|clamp|mount|styrka|bärande|tålig|krok|hållare|fäste|konsol)\b/i)),

  candidate('supportsAllowed', false, .97,
    phrase(/\b(?:no supports?|support[- ]free|without supports?|avoid supports?|utan stöd|inga stöd|undvik stöd)\b/i, true)),
  candidate('supportsAllowed', true, .92,
    phrase(/\b(?:supports? (?:are |is )?(?:allowed|acceptable|fine)|can use supports?|stöd (?:är )?tillåtna|stöd går bra)\b/i)),
];

const normalize = (text: string) => text
  .normalize('NFKC')
  .replace(/[‐‑‒–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const negationBefore = (text: string, index: number) => {
  const prefix = text.slice(Math.max(0, index - 48), index);
  const localClause = prefix.split(/[,.;:!?]|\b(?:and|but|or|och|men|eller)\b/iu).at(-1) ?? prefix;
  return /\b(?:not|never|no|without|inte|ej|aldrig|utan)\b(?:\s+[\p{L}\p{N}-]+){0,2}\s*$/iu.test(localClause);
};

function evidenceFor(text: string, pattern: PhrasePattern): string[] {
  const match = pattern.expression.exec(text);
  pattern.expression.lastIndex = 0;
  if (!match || match.index === undefined) return [];
  if (!pattern.allowNegated && negationBefore(text, match.index)) return [];
  return [match[0].trim()];
}

function temperatures(text: string): number[] {
  const found: number[] = [];
  const range = /(-?\d+(?:[.,]\d+)?)\s*(?:-|to|till)\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*c\b/giu;
  for (const match of text.matchAll(range)) found.push(Number(match[1].replace(',', '.')), Number(match[2].replace(',', '.')));
  const single = /(?<![\d-])(-?\d+(?:[.,]\d+)?)\s*°\s*c\b|(?<![\d-])(-?\d+(?:[.,]\d+)?)\s*c\b/giu;
  for (const match of text.matchAll(single)) found.push(Number((match[1] ?? match[2]).replace(',', '.')));
  return [...new Set(found.filter(Number.isFinite))];
}

function temperatureCandidate(values: number[]): Candidate | undefined {
  if (!values.length) return undefined;
  const maximum = Math.max(...values);
  const evidence = values.length > 1 ? `${Math.min(...values)}-${maximum} °C` : `${maximum} °C`;
  if (maximum > 70) return candidate('heat', 'hot', .99, phrase(new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), true));
  if (maximum >= 45) return candidate('heat', 'warm', .98, phrase(new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), true));
  if (maximum <= 40) return candidate('heat', 'normal', .97, phrase(new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), true));
  return undefined;
}

const unknownInference = (): BriefInference => ({
  environment: { value: 'unknown', confidence: 0, evidence: [] },
  load: { value: 'unknown', confidence: 0, evidence: [] },
  impact: { value: 'unknown', confidence: 0, evidence: [] },
  heat: { value: 'unknown', confidence: 0, evidence: [] },
  priority: { value: 'unknown', confidence: 0, evidence: [] },
  supportsAllowed: { value: 'unknown', confidence: 0, evidence: [] },
});

export function interpretBriefV3(purpose: string, properties = ''): ContextInterpretation {
  const language = normalizeEnglishContext(normalize(`${purpose} ${properties}`));
  const normalizedText = language.text;
  const facets = extractContextFacets(normalizedText);
  const parsedTemperatures = temperatures(normalizedText);
  const activeCandidates = [...candidates];
  const numericHeat = temperatureCandidate(parsedTemperatures);
  if (numericHeat) activeCandidates.push(numericHeat);
  const inference = unknownInference();
  const writable = inference as unknown as Record<ChecklistField, InferenceValue<RequirementValue>>;
  const conflicts: ContextConflict[] = [];
  const ambiguities: ContextAmbiguity[] = [];

  (Object.keys(inference) as ChecklistField[]).forEach(field => {
    const matches = activeCandidates.filter(item => item.field === field).flatMap(item => {
      const evidence = item === numericHeat
        ? parsedTemperatures.length ? [`${Math.min(...parsedTemperatures)}${parsedTemperatures.length > 1 ? `-${Math.max(...parsedTemperatures)}` : ''} °C`] : []
        : item.patterns.flatMap(pattern => evidenceFor(normalizedText, pattern));
      return evidence.length ? [{ ...item, evidence: [...new Set(evidence)] }] : [];
    });
    const byValue = new Map<string, typeof matches>();
    matches.forEach(item => {
      const key = String(item.value);
      byValue.set(key, [...(byValue.get(key) ?? []), item]);
    });
    if (byValue.size > 1) {
      const rankedValues = [...byValue.values()].map(items => ({
        items,
        confidence: Math.max(...items.map(item => item.confidence)),
      })).sort((left, right) => right.confidence - left.confidence);
      if (rankedValues[0].confidence - rankedValues[1].confidence >= .06) {
        const strongestGroup = rankedValues[0].items;
        writable[field] = {
          value: strongestGroup[0].value,
          confidence: rankedValues[0].confidence,
          evidence: [...new Set(strongestGroup.flatMap(item => item.evidence))],
        };
        return;
      }
      const values = rankedValues.map(group => group.items[0].value);
      const evidence = [...new Set(matches.flatMap(item => item.evidence))];
      conflicts.push({ field, values, evidence });
      writable[field] = { value: 'unknown', confidence: 0, evidence };
      return;
    }
    const strongest = [...matches].sort((left, right) => right.confidence - left.confidence)[0];
    if (strongest) writable[field] = {
      value: strongest.value,
      confidence: strongest.confidence,
      evidence: [...new Set(matches.flatMap(item => item.evidence))],
    };
  });

  if (inference.heat.value === 'unknown') {
    const vagueHeat = normalizedText.match(/\b(?:heat|temperature|sun|värme|temperatur|sol)\b/giu) ?? [];
    if (vagueHeat.length) ambiguities.push({
      field: 'heat', evidence: [...new Set(vagueHeat.map(value => value.toLocaleLowerCase('en-US')))],
      reason: 'Temperature exposure is mentioned without a usable operating temperature or explicit heat band.',
    });
  }
  return {
    normalizedText, inference, conflicts, ambiguities, temperaturesC: parsedTemperatures, facets,
    corrections: language.corrections, languageCues: language.reviewCues,
  };
}

export function inferBrief(purpose: string, properties: string): BriefInference {
  return interpretBriefV3(purpose, properties).inference;
}

export function applyInference(answers: Questionnaire, inference: BriefInference, manual: Set<ChecklistField>): Questionnaire {
  const next = { ...answers };
  const writable = next as unknown as Record<ChecklistField, unknown>;
  (Object.keys(inference) as ChecklistField[]).forEach(field => {
    if (!manual.has(field)) writable[field] = inference[field].value;
  });
  return next;
}
