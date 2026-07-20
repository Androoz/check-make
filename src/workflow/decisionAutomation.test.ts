import { describe, expect, it } from 'vitest';
import { analyzePurposeContext, suggestedDecisionsFromPurpose } from './decisionAutomation';

describe('decision automation', () => {
  it('suggests only decisions supported by explicit purpose words', () => {
    const result = suggestedDecisionsFromPurpose('Outdoor wall bracket with repeated movement and no supports');
    expect(result.environment?.value).toBe('outdoor');
    expect(result.load?.value).toBe('cyclic');
    expect(result.priority?.value).toBe('strength');
    expect(result.supportsAllowed?.value).toBe('false');
    expect(result.heat).toBeUndefined();
    expect(result.impact).toBeUndefined();
  });

  it('does not invent decisions from a generic description', () => {
    expect(suggestedDecisionsFromPurpose('A useful replacement part')).toEqual({});
  });

  it('withholds conflicting suggestions and exposes a targeted issue', () => {
    const result = analyzePurposeContext('Used indoors and outdoors');
    expect(result.suggestions.environment).toBeUndefined();
    expect(result.issues).toContainEqual(expect.objectContaining({
      field: 'environment',
      question: 'Which environment should the recommendation cover?',
      options: expect.arrayContaining([expect.objectContaining({ value: 'outdoor' })]),
    }));
  });

  it('prefills an explicit operating temperature without requiring a slicer or AI provider', () => {
    const result = analyzePurposeContext('Electronics cover exposed to 55 C');
    expect(result.suggestions.heat).toMatchObject({ value: 'warm', evidence: ['55 °C'] });
  });

  it('turns vague sun and heat wording into one early temperature clarification', () => {
    const result = analyzePurposeContext('Bracket outside in heat and sun');
    expect(result.suggestions.environment?.value).toBe('outdoor');
    expect(result.suggestions.heat).toBeUndefined();
    expect(result.issues).toEqual([expect.objectContaining({
      field: 'heat',
      question: 'How hot can the part itself become in the hottest condition?',
      options: expect.arrayContaining([
        expect.objectContaining({ label: 'Up to 40 °C', value: 'normal' }),
        expect.objectContaining({ label: '45–70 °C', value: 'warm' }),
        expect.objectContaining({ label: 'Above 70 °C', value: 'hot' }),
      ]),
    })]);
  });

  it('hides a clarification after the user explicitly confirms that requirement', () => {
    const result = analyzePurposeContext('Used indoors and outdoors', { environment: 'outdoor' });
    expect(result.issues).toHaveLength(0);
  });

  it('keeps richer context facts separate from the six legacy decisions', () => {
    const result = analyzePurposeContext('Long-term press-fit cover in direct sun and rain with a visible front face.');
    expect(result.facets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'environment-uv', category: 'operating-environment' }),
      expect.objectContaining({ id: 'environment-moisture', category: 'operating-environment' }),
      expect.objectContaining({ id: 'fit-press', category: 'interface' }),
      expect.objectContaining({ id: 'surface-visible', category: 'critical-surface' }),
      expect.objectContaining({ id: 'lifetime-long', category: 'intended-lifetime' }),
    ]));
  });

  it('requests exact details for specialist material and safety domains', () => {
    const result = analyzePurposeContext('Food contact part exposed to solvents; failure could injure someone.');
    expect(result.specialistPrompts.map(prompt => prompt.id)).toEqual(expect.arrayContaining([
      'environment-food', 'environment-chemical', 'failure-safety',
    ]));
  });
});
