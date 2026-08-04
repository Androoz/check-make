import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSingleSolid } from './booleanRepair';

describe('explicit boolean repair', () => {
  it('unions overlapping closed parts into one verified watertight derived mesh', async () => {
    const left = new THREE.BoxGeometry(10, 10, 4).translate(5, 5, 2);
    const right = new THREE.BoxGeometry(10, 10, 4).translate(10, 5, 2);
    const result = await createSingleSolid([left, right]);

    expect(result.evidence).toMatchObject({
      engine: 'Manifold',
      operation: 'union',
      inputPartCount: 2,
      inputTriangleCount: 24,
      outputBoundaryEdgeCount: 0,
      outputNonManifoldEdgeCount: 0,
    });
    expect(result.evidence.boundingBoxDeltaMm).toBeLessThan(1e-5);
    expect(result.analysis.topology?.watertight).toBe(true);
    expect(result.stl.byteLength).toBe(84 + result.evidence.outputTriangleCount * 50);
  });
});
