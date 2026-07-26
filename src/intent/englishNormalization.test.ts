import { describe, expect, it } from 'vitest';
import { normalizeEnglishContext } from './englishNormalization';

describe('English context normalization', () => {
  it('normalizes reviewed compounds, inflections, and common harmless typos', () => {
    const result = normalizeEnglishContext('Outdor pressfit bracket flexing repetedly with suports');
    expect(result.text).toBe('outdoor press-fit bracket flexes repeated with supports');
    expect(result.corrections.map(item => item.ruleId)).toEqual(expect.arrayContaining([
      'typo-outdoor', 'compound-press-fit', 'inflection-flexing', 'typo-support',
    ]));
  });

  it('does not silently repair safety-relevant typos', () => {
    const result = normalizeEnglishContext('Foodsafe part exposed to solvant in a saftey-critical use.');
    expect(result.text).toBe('Foodsafe part exposed to solvant in a saftey-critical use.');
    expect(result.reviewCues).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: 'food-contact', suggested: 'food contact' }),
      expect.objectContaining({ domain: 'chemical', suggested: 'solvent exposure' }),
      expect.objectContaining({ domain: 'safety', suggested: 'safety-critical use' }),
    ]));
  });

  it('normalizes the reviewed parasol spacer wording', () => {
    const result = normalizeEnglishContext('Distance for parasoll base');
    expect(result.text).toBe('spacer for parasol base');
    expect(result.corrections.map(item => item.ruleId)).toEqual(['typo-parasol', 'alias-parasol-distance']);
  });

  it('normalizes natural parasol-base wording without requiring a verb', () => {
    const result = normalizeEnglishContext('Parasol base distance for outside use.');
    expect(result.text).toBe('spacer for parasol base for outdoor use.');
    expect(result.corrections.map(item => item.ruleId)).toEqual([
      'alias-parasol-base-distance', 'alias-outside-use',
    ]);
  });
});
