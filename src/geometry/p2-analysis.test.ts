import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { analyzeGeometry, compareOrientations, geometryForOrientation, riskVisualizationGeometry } from './stl';
import { localModelAnalysis, refineLocalIntelligence } from '../ai/modelIntelligence';

const metadata = { format: 'stl', encoding: 'ascii', clues: [] } as const;

describe('P2 model analysis', () => {
  it('identifies a closed single-component mesh', () => {
    const box = new THREE.BoxGeometry(20, 10, 40).translate(0, 0, 20);
    const { analysis } = analyzeGeometry(box, 'closed-box.stl', metadata);

    expect(analysis.topology).toMatchObject({
      componentCount: 1,
      boundaryEdgeCount: 0,
      nonManifoldEdgeCount: 0,
      watertight: true,
    });
    expect(analysis.components).toHaveLength(1);
  });

  it('reports disconnected parts and keeps their bounds', () => {
    const first = new THREE.BoxGeometry(10, 10, 10).translate(0, 0, 5).toNonIndexed();
    const second = new THREE.BoxGeometry(4, 4, 4).translate(25, 0, 2).toNonIndexed();
    const firstPositions = first.getAttribute('position').array as Float32Array;
    const secondPositions = second.getAttribute('position').array as Float32Array;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...firstPositions, ...secondPositions]), 3));

    const { analysis } = analyzeGeometry(geometry, 'two-parts.stl', metadata);

    expect(analysis.topology?.componentCount).toBe(2);
    expect(analysis.components).toHaveLength(2);
    expect(analysis.findings).toContainEqual(expect.objectContaining({ id: 'multiple-components', severity: 'warning' }));
  });

  it('reports open boundaries without calling them a failure probability', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 10, 0, 0, 0, 10, 0], 3));

    const { analysis } = analyzeGeometry(geometry, 'open-triangle.stl', metadata);

    expect(analysis.topology).toMatchObject({ boundaryEdgeCount: 3, watertight: false });
    expect(analysis.findings?.find(finding => finding.id === 'open-mesh')?.detail).toContain('boundary edges');
    expect(analysis.analysisLimits?.find(limit => limit.id === 'load-path')?.status).toBe('requires-input');
  });

  it('builds a vertex-colored risk view and preserves the source geometry', () => {
    const source = new THREE.BoxGeometry(20, 10, 40).translate(0, 0, 20);
    const originalPosition = source.getAttribute('position').getZ(0);
    const risk = riskVisualizationGeometry(source, 'as-imported');

    expect(risk.getAttribute('color')).toBeDefined();
    expect(risk.getAttribute('color').count).toBe(risk.getAttribute('position').count);
    expect(source.getAttribute('position').getZ(0)).toBe(originalPosition);
  });

  it('compares all six axis-aligned orientations with finite relative scores', () => {
    const box = new THREE.BoxGeometry(20, 10, 40).translate(0, 0, 20);
    const { analysis } = analyzeGeometry(box, 'orientation-box.stl', metadata);
    const comparisons = compareOrientations(analysis, 'strength');

    expect(comparisons).toHaveLength(6);
    expect(comparisons.every(item => Number.isFinite(item.overallScore))).toBe(true);
    expect(comparisons[0].overallScore).toBeGreaterThanOrEqual(comparisons[1].overallScore);
    expect(comparisons[0].reason).toContain('six axis-aligned candidates');
  });

  it('applies support-free intent while exposing constraints that are not geometrically localized', () => {
    const box = new THREE.BoxGeometry(20, 10, 40).translate(0, 0, 20);
    const { analysis } = analyzeGeometry(box, 'orientation-intent.stl', metadata);
    const initial = { ...localModelAnalysis(analysis, 'Snap-fit bracket under repeated bending with a visible face and no supports.'), userEvidence: ['Snap-fit bracket under repeated bending with a visible face and no supports.'] };
    const refined = refineLocalIntelligence(initial, { supportsAllowed: 'false', load: 'cyclic', priority: 'strength', impact: 'none', environment: 'indoor', heat: 'normal' });
    const comparisons = compareOrientations(analysis, 'strength', refined.manufacturingIntent);

    expect(comparisons[0].constraintsApplied).toContain('Support-free printing increases the support-exposure weight.');
    expect(comparisons[0].constraintsUnresolved?.join(' ')).toMatch(/Load type.*mating geometry.*Critical visible/s);
    expect(comparisons[0].reason).toContain('not geometrically localized');
  });

  it('creates a translated preview geometry for the selected orientation', () => {
    const box = new THREE.BoxGeometry(20, 10, 40).translate(0, 0, 20);
    const oriented = geometryForOrientation(box, 'right-side');
    oriented.computeBoundingBox();
    const size = new THREE.Vector3();
    oriented.boundingBox?.getSize(size);

    expect(size.z).toBeCloseTo(20, 5);
    expect(oriented.boundingBox?.min.z).toBeCloseTo(0, 5);
  });
});
