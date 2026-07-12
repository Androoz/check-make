import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { ModelAnalysis } from '../types';

export function analyzeStl(buffer: ArrayBuffer, fileName: string): { analysis: ModelAnalysis; geometry: THREE.BufferGeometry } {
  const geometry = new STLLoader().parse(buffer);
  geometry.computeBoundingBox(); geometry.computeVertexNormals();
  const box = geometry.boundingBox!; const size = new THREE.Vector3(); box.getSize(size);
  const positions = geometry.getAttribute('position');
  let totalArea = 0, overhangArea = 0, bedContactArea = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  const bedEpsilon = Math.max(0.05, size.z * 0.002);
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
    ab.subVectors(b, a); ac.subVectors(c, a); normal.crossVectors(ab, ac);
    const area = normal.length() / 2; if (!area) continue; normal.normalize(); totalArea += area;
    // Down-facing surfaces steeper than 45° relative to the build plate are support candidates.
    if (normal.z < -Math.SQRT1_2) overhangArea += area;
    if (Math.max(a.z, b.z, c.z) <= box.min.z + bedEpsilon && Math.abs(normal.z) > 0.9) bedContactArea += area;
  }
  const analysis: ModelAnalysis = {
    fileName, triangleCount: positions.count / 3,
    boundingBox: { min: {x:box.min.x,y:box.min.y,z:box.min.z}, max:{x:box.max.x,y:box.max.y,z:box.max.z}, size:{x:size.x,y:size.y,z:size.z} },
    heightMm: size.z, bedContactAreaMm2: bedContactArea, overhangAreaMm2: overhangArea,
    overhangRatio: totalArea ? overhangArea / totalArea : 0,
    confidence: { bedContact: 0.55, overhang: 0.72 }
  };
  return { analysis, geometry };
}
