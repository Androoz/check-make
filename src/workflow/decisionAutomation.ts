import { interpretBriefV3 } from '../intent/inferBrief';
import type { ContextFacet } from '../intent/contextFacets';
import type { ChecklistField } from '../types';

export type SuggestedDecision = { value: string; evidence: string[] };
export type ContextClarificationOption = {
  label: string;
  value: string;
  statement: string;
};
export type ContextInterpretationIssue = {
  field: ChecklistField;
  evidence: string[];
  message: string;
  question: string;
  options: ContextClarificationOption[];
};
export interface ContextDecisionAnalysis {
  suggestions: Partial<Record<ChecklistField, SuggestedDecision>>;
  issues: ContextInterpretationIssue[];
  facets: ContextFacet[];
  specialistPrompts: Array<{ id: string; question: string; message: string }>;
}

const clarificationOptions: Record<ChecklistField, ContextClarificationOption[]> = {
  environment: [
    { label: 'Indoors', value: 'indoor', statement: 'Normal use is indoors and protected.' },
    { label: 'Outdoors', value: 'outdoor', statement: 'Normal use is outdoors or weather-exposed.' },
  ],
  load: [
    { label: 'No load', value: 'none', statement: 'The part has no meaningful mechanical load.' },
    { label: 'Mostly constant', value: 'static', statement: 'The part carries a mostly constant or occasional load.' },
    { label: 'Repeated movement', value: 'cyclic', statement: 'The part experiences repeated movement, vibration, or flexing.' },
  ],
  impact: [
    { label: 'No impact', value: 'none', statement: 'No impacts or drops are expected.' },
    { label: 'Occasional', value: 'medium', statement: 'Occasional bumps or drops are expected.' },
    { label: 'Frequent / hard', value: 'high', statement: 'Frequent or hard impacts are expected.' },
  ],
  heat: [
    { label: 'Up to 40 °C', value: 'normal', statement: 'Maximum part temperature is 40 °C.' },
    { label: '45–70 °C', value: 'warm', statement: 'Maximum part temperature is between 45–70 °C.' },
    { label: 'Above 70 °C', value: 'hot', statement: 'Maximum part temperature is over 70 °C.' },
  ],
  priority: [
    { label: 'Strength', value: 'strength', statement: 'Strength and durability are the main priority.' },
    { label: 'Accurate fit', value: 'accuracy', statement: 'Fit and dimensional accuracy are the main priority.' },
    { label: 'Surface finish', value: 'finish', statement: 'Visible surface quality is the main priority.' },
    { label: 'Flexibility', value: 'flexibility', statement: 'Flexibility is the main priority.' },
    { label: 'Print speed', value: 'speed', statement: 'Print speed is the main priority.' },
  ],
  supportsAllowed: [
    { label: 'Supports are fine', value: 'true', statement: 'Removable supports are acceptable.' },
    { label: 'Support-free', value: 'false', statement: 'The print must be support-free.' },
  ],
};

const clarificationQuestion: Record<ChecklistField, string> = {
  environment: 'Which environment should the recommendation cover?',
  load: 'Which load condition should the recommendation cover?',
  impact: 'How much impact should the part withstand?',
  heat: 'How hot can the part itself become in the hottest condition?',
  priority: 'Which outcome matters most for this part?',
  supportsAllowed: 'May the print use removable supports?',
};

export function analyzePurposeContext(
  purpose: string,
  confirmed: Partial<Record<ChecklistField, string>> = {},
): ContextDecisionAnalysis {
  if (!purpose.trim()) return { suggestions: {}, issues: [], facets: [], specialistPrompts: [] };
  const interpretation = interpretBriefV3(purpose, '');
  const suggestions: Partial<Record<ChecklistField, SuggestedDecision>> = {};
  (Object.keys(interpretation.inference) as ChecklistField[]).forEach(field => {
    const item = interpretation.inference[field];
    if (item.value === 'unknown' || item.evidence.length === 0) return;
    suggestions[field] = { value: String(item.value), evidence: item.evidence };
  });
  const issues: ContextInterpretationIssue[] = [
    ...interpretation.conflicts.map(conflict => ({
      field: conflict.field,
      evidence: conflict.evidence,
      message: `Conflicting ${conflict.field} statements were found; confirm the intended condition.`,
      question: clarificationQuestion[conflict.field],
      options: clarificationOptions[conflict.field],
    })),
    ...interpretation.ambiguities.map(ambiguity => ({
      field: ambiguity.field,
      evidence: ambiguity.evidence,
      message: ambiguity.reason,
      question: clarificationQuestion[ambiguity.field],
      options: clarificationOptions[ambiguity.field],
    })),
  ].filter(issue => !confirmed[issue.field]);
  const specialistPrompts = interpretation.facets.flatMap(facet => {
    if (facet.id === 'environment-chemical') return [{
      id: facet.id,
      question: 'Which exact chemical will contact the part?',
      message: 'Add the substance, concentration, contact duration, and temperature. A generic “chemical resistant” claim is not enough for material selection.',
    }];
    if (facet.id === 'environment-food') return [{
      id: facet.id,
      question: 'What kind of food contact and cleaning must it tolerate?',
      message: 'Add contact duration, temperature, cleaning method, and applicable regulatory context before treating a material as suitable.',
    }];
    if (facet.id === 'failure-safety') return [{
      id: facet.id,
      question: 'What is the maximum load and acceptable failure condition?',
      message: 'Check Make can identify print risks but cannot certify a safety-critical part. Add quantified loads and required safety margin for review.',
    }];
    return [];
  }).concat(interpretation.languageCues.map(cue => ({
    id: `language-${cue.domain}-${cue.original.toLocaleLowerCase('en-US')}`,
    question: `Did you mean ${cue.suggested}?`,
    message: `“${cue.original}” resembles a safety-relevant term. Confirm it explicitly in Context before Check Make uses it.`,
  })));
  return { suggestions, issues, facets: interpretation.facets, specialistPrompts };
}

export function suggestedDecisionsFromPurpose(purpose: string): Partial<Record<ChecklistField, SuggestedDecision>> {
  return analyzePurposeContext(purpose).suggestions;
}
