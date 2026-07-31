import { describe, expect, it } from 'vitest';
import { interpretContextGraph } from './contextGraph';

describe('Interpretation v3.9 compositional context graph', () => {
  it('composes signage and disc golf into outdoor course wayfinding', () => {
    const result = interpretContextGraph('Next tee sign for disc golf');
    expect(result).toMatchObject({
      id: 'outdoor-wayfinding',
      label: 'disc-golf course',
      objectIdentity: 'outdoor wayfinding or course sign',
      primaryFunction: { value: 'guide' },
    });
    expect(result?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'environment.location', value: 'outdoor', certainty: 'strong_hypothesis' }),
      expect.objectContaining({ key: 'environment.exposure', value: 'uv', certainty: 'weak_hypothesis' }),
      expect.objectContaining({ key: 'environment.exposure', value: 'moisture', certainty: 'weak_hypothesis' }),
      expect.objectContaining({ key: 'appearance.requirement', value: 'visible_surface' }),
      expect.objectContaining({ key: 'primary_function', value: 'guide' }),
    ]));
  });

  it('reuses the same composition for other route and site signage', () => {
    expect(interpretContextGraph('Trail marker for a hiking trail')).toMatchObject({
      id: 'outdoor-wayfinding', label: 'outdoor trail or route',
    });
    expect(interpretContextGraph('Information sign for a campground')).toMatchObject({
      id: 'outdoor-site-signage', label: 'outdoor site',
    });
  });

  it('does not leak activity context into unrelated printed objects', () => {
    expect(interpretContextGraph('Holder for disc golf discs')).toBeUndefined();
    expect(interpretContextGraph('Golf tee organizer')).toBeUndefined();
    expect(interpretContextGraph('Indoor scoreboard showing disc golf scores')).toBeUndefined();
  });
});
