import { describe, expect, it } from 'vitest';
import { cameraPose } from './previewScene';

describe('preview camera presets', () => {
  it('keeps printer Z vertical for front, back, left, and right views', () => {
    for (const view of ['front', 'back', 'left', 'right'] as const) expect(cameraPose(view, 100, 25).up).toEqual([0, 1, 0]);
  });

  it('places opposing views on opposite sides of the same model target', () => {
    expect(cameraPose('front', 100, 25).position).toEqual([0, 25, 100]);
    expect(cameraPose('back', 100, 25).position).toEqual([0, 25, -100]);
    expect(cameraPose('left', 100, 25).position).toEqual([-100, 25, 0]);
    expect(cameraPose('right', 100, 25).position).toEqual([100, 25, 0]);
  });

  it('uses printer Y as screen-up in top and bottom views', () => {
    expect(cameraPose('top', 100, 25).up).toEqual([0, 0, -1]);
    expect(cameraPose('bottom', 100, 25).up).toEqual([0, 0, 1]);
  });
});
