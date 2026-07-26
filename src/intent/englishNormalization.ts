export interface EnglishCorrection {
  original: string;
  replacement: string;
  ruleId: string;
}

export interface EnglishReviewCue {
  original: string;
  suggested: string;
  domain: 'chemical' | 'food-contact' | 'safety';
}

export interface EnglishNormalizationResult {
  text: string;
  corrections: EnglishCorrection[];
  reviewCues: EnglishReviewCue[];
}

type CorrectionRule = { id: string; expression: RegExp; replacement: string };

// Reviewed aliases only: no open-ended edit-distance matching is used here.
const correctionRules: CorrectionRule[] = [
  { id: 'compound-press-fit', expression: /\bpressfit\b/giu, replacement: 'press-fit' },
  { id: 'compound-snap-fit', expression: /\bsnapfit\b/giu, replacement: 'snap-fit' },
  { id: 'compound-support-free', expression: /\bsupportfree\b/giu, replacement: 'support-free' },
  { id: 'compound-waterproof', expression: /\bwater proof\b/giu, replacement: 'waterproof' },
  { id: 'compound-weatherproof', expression: /\bweather proof\b/giu, replacement: 'weatherproof' },
  { id: 'compound-sunlight', expression: /\bsun light\b/giu, replacement: 'sunlight' },
  { id: 'hyphen-dimensional', expression: /\bdimensionally-accurate\b/giu, replacement: 'dimensionally accurate' },
  { id: 'inflection-repeatedly', expression: /\brepeatedly\b/giu, replacement: 'repeated' },
  { id: 'inflection-flexing', expression: /\bflexing\b/giu, replacement: 'flexes' },
  { id: 'inflection-vibrating', expression: /\bvibrating\b/giu, replacement: 'vibration' },
  { id: 'typo-parasol', expression: /\bparasoll\b/giu, replacement: 'parasol' },
  { id: 'alias-distance-piece', expression: /\bdistance piece\b/giu, replacement: 'spacer' },
  { id: 'alias-parasol-base-distance', expression: /\bparasol\s+base\s+distance\b/giu, replacement: 'spacer for parasol base' },
  { id: 'alias-umbrella-base-distance', expression: /\bumbrella\s+base\s+distance\b/giu, replacement: 'spacer for umbrella base' },
  { id: 'alias-parasol-distance', expression: /\bdistance for (?=(?:a |an |the )?(?:parasol|umbrella)\b)/giu, replacement: 'spacer for ' },
  { id: 'alias-outside-use', expression: /\b(?:for\s+)?outside use\b/giu, replacement: 'for outdoor use' },
  { id: 'typo-outdoor', expression: /\boutdors?\b/giu, replacement: 'outdoor' },
  { id: 'typo-repeated', expression: /\brepeted(?:ly)?\b/giu, replacement: 'repeated' },
  { id: 'typo-strength', expression: /\bstrenght\b/giu, replacement: 'strength' },
  { id: 'typo-flexible', expression: /\bflexable\b/giu, replacement: 'flexible' },
  { id: 'typo-dimensional', expression: /\bdimensionaly\b/giu, replacement: 'dimensionally' },
  { id: 'typo-support', expression: /\bsuports?\b/giu, replacement: 'supports' },
  { id: 'typo-temperature', expression: /\btemperatur\b/giu, replacement: 'temperature' },
  { id: 'typo-moisture', expression: /\bmoister\b/giu, replacement: 'moisture' },
  { id: 'typo-resistant', expression: /\bresistent\b/giu, replacement: 'resistant' },
];

const reviewCueRules: Array<{ expression: RegExp; suggested: string; domain: EnglishReviewCue['domain'] }> = [
  { expression: /\b(?:chemcal|chemcial|cemical)\b/giu, suggested: 'chemical exposure', domain: 'chemical' },
  { expression: /\b(?:solvant|solvnt)\b/giu, suggested: 'solvent exposure', domain: 'chemical' },
  { expression: /\b(?:foodsafe|foodsfe|food saft)\b/giu, suggested: 'food contact', domain: 'food-contact' },
  { expression: /\b(?:saftey|safty)[- ]critical\b/giu, suggested: 'safety-critical use', domain: 'safety' },
];

export function normalizeEnglishContext(input: string): EnglishNormalizationResult {
  const corrections: EnglishCorrection[] = [];
  let text = input;
  correctionRules.forEach(rule => {
    text = text.replace(rule.expression, original => {
      corrections.push({ original, replacement: rule.replacement, ruleId: rule.id });
      return rule.replacement;
    });
    rule.expression.lastIndex = 0;
  });
  const reviewCues = reviewCueRules.flatMap(rule => {
    const matches = [...input.matchAll(rule.expression)];
    rule.expression.lastIndex = 0;
    return matches.map(match => ({ original: match[0], suggested: rule.suggested, domain: rule.domain }));
  });
  return { text, corrections, reviewCues };
}
