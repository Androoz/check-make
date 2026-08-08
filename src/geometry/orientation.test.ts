import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { analysisForOrientation, analyzeStl, boundingBoxForOrientation, chooseOrientation, geometryForOrientation } from './stl';

// Binary STL for a small triangle is cumbersome; the ranking contract is verified on a modeled analysis.
describe('chooseOrientation',()=>{
  it('prefers low overhang for surface finish',()=>{
    const analysis={orientations:[
      {id:'a',label:'Tall clean side',heightMm:100,bedContactAreaMm2:20,overhangRatio:.01},
      {id:'b',label:'Low rough side',heightMm:20,bedContactAreaMm2:100,overhangRatio:.5}
    ]} as ReturnType<typeof analyzeStl>['analysis'];
    expect(chooseOrientation(analysis,'finish').id).toBe('a');
  });

  it('evaluates process rules against the selected orientation measurements', () => {
    const geometryRisk = { overhangRegionCount: 2 } as ReturnType<typeof analyzeStl>['analysis']['geometryRisk'];
    const analysis = {
      heightMm: 100,
      bedContactAreaMm2: 20,
      overhangRatio: 0.35,
      orientationLabel: 'As imported',
      orientations: [],
    } as ReturnType<typeof analyzeStl>['analysis'];
    const selected = {
      id: 'clean',
      label: 'Clean side down',
      heightMm: 30,
      bedContactAreaMm2: 300,
      overhangRatio: 0.04,
      geometryRisk,
    };
    expect(analysisForOrientation(analysis, selected)).toMatchObject({
      heightMm: 30,
      bedContactAreaMm2: 300,
      overhangRatio: 0.04,
      geometryRisk,
      orientationLabel: 'Clean side down',
    });
  });

  it('computes preview bounds without cloning the complete geometry', () => {
    const geometry = new THREE.BoxGeometry(10, 20, 30).toNonIndexed();
    const bounds = boundingBoxForOrientation(geometry, 'right-side');
    const prepared = geometryForOrientation(geometry, 'right-side');
    expect(bounds.getSize(new THREE.Vector3()).toArray()).toEqual([30, 20, 10]);
    expect(bounds.min.z).toBe(0);
    expect(bounds.min.toArray()).toEqual(prepared.boundingBox?.min.toArray());
    expect(bounds.max.toArray()).toEqual(prepared.boundingBox?.max.toArray());
    geometry.dispose(); prepared.dispose();
  });
});
