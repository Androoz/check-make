import { describe, expect, it } from 'vitest';
import { extractContextFacets } from './contextFacets';

describe('context facets', () => {
  it('separates function, exposures, fit, surface, and lifetime', () => {
    const facets = extractContextFacets('Long-term protective cover in direct sun and rain. It snaps onto a housing and the visible face must remain smooth.');
    expect(facets).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'object-function', value: 'protects or encloses' }),
      expect.objectContaining({ id: 'environment-uv' }),
      expect.objectContaining({ id: 'environment-moisture' }),
      expect.objectContaining({ id: 'fit-snap' }),
      expect.objectContaining({ id: 'surface-visible' }),
      expect.objectContaining({ id: 'lifetime-long' }),
    ]));
  });

  it('recognizes explicit English mechanical and interface details', () => {
    const facets = extractContextFacets('The bracket experiences repeated load and bending. It has a press fit and a critical mounting face.');
    expect(facets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'load-fatigue' }),
      expect.objectContaining({ id: 'load-bending' }),
      expect.objectContaining({ id: 'fit-press' }),
      expect.objectContaining({ id: 'surface-mating' }),
    ]));
  });

  it('flags specialist domains without pretending they are ordinary material requirements', () => {
    const facets = extractContextFacets('Food contact part cleaned with solvents; failure could injure someone.');
    expect(facets.filter(facet => facet.impact === 'needs-specialist-review').map(facet => facet.id)).toEqual(expect.arrayContaining([
      'environment-food', 'environment-chemical', 'failure-safety',
    ]));
  });

  it('does not record negated exposure', () => {
    const facets = extractContextFacets('Indoor cover with no water or chemical exposure.');
    expect(facets.some(facet => facet.id === 'environment-moisture')).toBe(false);
    expect(facets.some(facet => facet.id === 'environment-chemical')).toBe(false);
  });

  it('recognizes spacing as an explicit object function', () => {
    expect(extractContextFacets('Spacer for a parasol base')).toContainEqual(expect.objectContaining({
      id: 'function-space', category: 'object-function', value: 'creates or maintains spacing',
    }));
  });

  it('recognizes a designer-stated load-critical requirement', () => {
    expect(extractContextFacets('Load-critical camping-chair spacer under repeated outdoor use.')).toContainEqual(
      expect.objectContaining({ id: 'failure-safety', value: 'safety-critical' }),
    );
  });
});
