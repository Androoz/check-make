import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { analyzeGeometry } from './stl';

const metadata = { format: 'stl', encoding: 'ascii', clues: [] } as const;

function floatingDownwardSquares() {
  const positions = new Float32Array([
    // Bed-contact square, 2 x 2 mm at Z=0.
    0, 0, 0, 0, 2, 0, 2, 0, 0,
    2, 0, 0, 0, 2, 0, 2, 2, 0,
    // Connected 2 x 2 mm downward-facing region at Z=10.
    0, 0, 10, 0, 2, 10, 2, 0, 10,
    2, 0, 10, 0, 2, 10, 2, 2, 10,
    // Separate 1 x 1 mm downward-facing region at Z=8.
    5, 0, 8, 5, 1, 8, 6, 0, 8,
    6, 0, 8, 5, 1, 8, 6, 1, 8,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

describe('P1 analytical geometry fixtures', () => {
  it('normalizes bed contact against footprint and exposes a leverage proxy', () => {
    const box = new THREE.BoxGeometry(20, 10, 40).translate(0, 0, 20);
    const { analysis } = analyzeGeometry(box, 'tower.stl', metadata);

    expect(analysis.bedContactAreaMm2).toBeCloseTo(200, 5);
    expect(analysis.geometryRisk.boundingFootprintAreaMm2).toBeCloseTo(200, 5);
    expect(analysis.geometryRisk.bedCoverageRatio).toBeCloseTo(1, 5);
    expect(analysis.geometryRisk.heightToContactWidthRatio).toBeCloseTo(40 / Math.sqrt(200), 5);
    expect(analysis.geometryRisk.surfaceCentroidOffsetMm).toBeCloseTo(0, 5);
  });

  it('does not count the first-layer contact face as an unsupported overhang', () => {
    const box = new THREE.BoxGeometry(20, 10, 40).translate(0, 0, 20);
    const { analysis } = analyzeGeometry(box, 'box.stl', metadata);

    expect(analysis.overhangAreaMm2).toBe(0);
    expect(analysis.geometryRisk.overhangRegionCount).toBe(0);
  });

  it('groups edge-connected overhang triangles and keeps separate regions apart', () => {
    const { analysis } = analyzeGeometry(floatingDownwardSquares(), 'regions.stl', metadata);

    expect(analysis.geometryRisk.overhangRegionCount).toBe(2);
    expect(analysis.geometryRisk.largestOverhangRegionAreaMm2).toBeCloseTo(4, 5);
    expect(analysis.geometryRisk.largestOverhangRegionSpanMm).toBeCloseTo(2, 5);
    expect(analysis.geometryRisk.overhangRegions[0]).toMatchObject({
      triangleCount: 2,
      minZMm: 10,
      maxZMm: 10,
      meanDownwardNormalAngleDeg: 0,
      horizontalAreaFraction: 1,
    });
    expect(analysis.geometryRisk.bridgeClassification).toBe('not-evaluated');
  });

  it('calculates the same P1 metrics for every orientation candidate', () => {
    const box = new THREE.BoxGeometry(20, 10, 40).translate(0, 0, 20);
    const { analysis } = analyzeGeometry(box, 'orientations.stl', metadata);

    expect(analysis.orientations).toHaveLength(6);
    expect(analysis.orientations.every(candidate => candidate.geometryRisk.boundingFootprintAreaMm2 > 0)).toBe(true);
    expect(analysis.orientations.find(candidate => candidate.id === 'right-side')?.heightMm).toBeCloseTo(20, 5);
  });
});
