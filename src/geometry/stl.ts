import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { GeometryRiskMetrics, ModelAnalysis, ModelClue, ModelMetadata, OverhangRegion, Questionnaire } from '../types';

const genericNameTokens = new Set([
  'ascii', 'binary', 'stl', 'mesh', 'model', 'part', 'object', 'solid', 'untitled',
  'export', 'exported', 'final', 'copy', 'repaired', 'fixed', 'scaled', 'revision', 'rev', 'mm',
  'openscad', 'meshlab', 'blender', 'freecad', 'solidworks', 'bambustudio', 'orcaslicer', 'prusaslicer',
  'color', 'material', 'magics', 'viscam',
]);

function cleanSemanticClue(input: string) {
  let normalized = input.normalize('NFKC')
    .replace(/\.stl$/i, '')
    .replace(/([\p{Ll}])([\p{Lu}])/gu, '$1 $2')
    .replace(/\b(?:generated|exported|created)\s+by\b.*$/iu, '')
    .trim();
  if (normalized.includes('@')) return undefined;
  normalized = normalized.split(/[\\/]/).at(-1)?.replace(/\.stl$/i, '').trim() ?? '';
  if (!normalized || /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(normalized)) return undefined;
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu)?.filter(token => {
    const lower = token.toLocaleLowerCase('en-US');
    if (genericNameTokens.has(lower) || /^\d+$/.test(lower)) return false;
    if (/^(?:v|ver|rev)\d+$/i.test(lower) || /^copy\d*$/i.test(lower)) return false;
    if (/^[0-9a-f]{8,}$/i.test(lower)) return false;
    return true;
  }).slice(0, 8) ?? [];
  if (!tokens.some(token => /\p{L}{3,}/u.test(token))) return undefined;
  return tokens.map(token => token.toLocaleLowerCase('en-US')).join(' ').slice(0, 96);
}

function isBinaryStl(bytes: Uint8Array) {
  if (bytes.byteLength < 84) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  return 84 + triangleCount * 50 === bytes.byteLength;
}

function binaryHeader(bytes: Uint8Array) {
  const printable = Array.from(bytes.subarray(0, Math.min(80, bytes.length)), byte =>
    byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ' ',
  ).join('').replace(/\s+/g, ' ').trim();
  return cleanSemanticClue(printable);
}

export function extractModelMetadata(buffer: ArrayBuffer, fileName: string): ModelMetadata {
  const bytes = new Uint8Array(buffer);
  const binary = isBinaryStl(bytes);
  const prefix = binary ? '' : new TextDecoder().decode(bytes.subarray(0, Math.min(2048, bytes.length)));
  const solidName = prefix.match(/^\s*(?:\uFEFF)?solid(?:[\t ]+([^\r\n]+))?/i)?.[1];
  const embedded = binary ? binaryHeader(bytes) : solidName ? cleanSemanticClue(solidName) : undefined;
  const fileHint = cleanSemanticClue(fileName);
  const clues: ModelClue[] = [];
  if (embedded) clues.push({ source: binary ? 'stl-binary-header' : 'stl-solid-name', value: embedded });
  if (fileHint) clues.push({ source: 'file-name', value: fileHint });
  return { format: 'stl', encoding: binary ? 'binary' : /^\s*(?:\uFEFF)?solid\b/i.test(prefix) ? 'ascii' : 'unknown', clues };
}

interface MeasuredTriangle {
  vertices: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  area: number;
  normalZ: number;
}

interface GeometryMeasurement {
  min: THREE.Vector3;
  max: THREE.Vector3;
  size: THREE.Vector3;
  totalArea: number;
  bedContactArea: number;
  overhangArea: number;
  risk: GeometryRiskMetrics;
}

function connectedOverhangRegions(triangles: MeasuredTriangle[], quantizationMm: number): OverhangRegion[] {
  if (!triangles.length) return [];
  const parents = triangles.map((_, index) => index);
  const ranks = triangles.map(() => 0);
  const find = (index: number) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index]; parents[index] = root; index = next;
    }
    return root;
  };
  const join = (left: number, right: number) => {
    const leftRoot = find(left); const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (ranks[leftRoot] < ranks[rightRoot]) parents[leftRoot] = rightRoot;
    else if (ranks[leftRoot] > ranks[rightRoot]) parents[rightRoot] = leftRoot;
    else { parents[rightRoot] = leftRoot; ranks[leftRoot] += 1; }
  };
  const vertexKey = (vertex: THREE.Vector3) => [vertex.x, vertex.y, vertex.z]
    .map(value => Math.round(value / quantizationMm)).join(',');
  const edgeOwners = new Map<string, number[]>();
  triangles.forEach((triangle, triangleIndex) => {
    const keys = triangle.vertices.map(vertexKey);
    for (const [left, right] of [[0, 1], [1, 2], [2, 0]] as const) {
      const edge = [keys[left], keys[right]].sort().join('|');
      const owners = edgeOwners.get(edge) ?? [];
      owners.forEach(owner => join(triangleIndex, owner));
      owners.push(triangleIndex); edgeOwners.set(edge, owners);
    }
  });
  const groups = new Map<number, MeasuredTriangle[]>();
  triangles.forEach((triangle, index) => {
    const root = find(index); groups.set(root, [...(groups.get(root) ?? []), triangle]);
  });
  return [...groups.values()].map(group => {
    let area = 0, weightedAngle = 0, horizontalArea = 0;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    group.forEach(triangle => {
      const angle = Math.acos(THREE.MathUtils.clamp(-triangle.normalZ, -1, 1)) * 180 / Math.PI;
      area += triangle.area; weightedAngle += angle * triangle.area;
      if (angle <= 15) horizontalArea += triangle.area;
      triangle.vertices.forEach(vertex => { min.min(vertex); max.max(vertex); });
    });
    return {
      triangleCount: group.length,
      areaMm2: area,
      projectedSpanMm: Math.max(max.x - min.x, max.y - min.y),
      minZMm: min.z,
      maxZMm: max.z,
      meanDownwardNormalAngleDeg: area ? weightedAngle / area : 0,
      horizontalAreaFraction: area ? horizontalArea / area : 0,
    };
  }).sort((left, right) => right.areaMm2 - left.areaMm2);
}

function measureGeometry(
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  transform: (vertex: THREE.Vector3) => THREE.Vector3 = vertex => vertex.clone(),
): GeometryMeasurement {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const source = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    source.fromBufferAttribute(positions, index); const vertex = transform(source);
    min.min(vertex); max.max(vertex);
  }
  const size = new THREE.Vector3().subVectors(max, min);
  const bedEpsilon = Math.max(0.05, size.z * 0.002);
  const quantizationMm = Math.max(1e-6, Math.max(size.x, size.y, size.z, 1) * 1e-6);
  let totalArea = 0, bedContactArea = 0, bedCentroidWeight = 0, surfaceCentroidWeight = 0;
  const bedCentroid = new THREE.Vector3(); const surfaceCentroid = new THREE.Vector3();
  const overhangTriangles: MeasuredTriangle[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3(), centroid = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 3) {
    source.fromBufferAttribute(positions, index); a.copy(transform(source));
    source.fromBufferAttribute(positions, index + 1); b.copy(transform(source));
    source.fromBufferAttribute(positions, index + 2); c.copy(transform(source));
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const area = normal.length() / 2; if (!area) continue;
    normal.normalize(); totalArea += area;
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    surfaceCentroid.addScaledVector(centroid, area); surfaceCentroidWeight += area;
    const touchesBed = Math.max(a.z, b.z, c.z) <= min.z + bedEpsilon && Math.abs(normal.z) > 0.9;
    if (touchesBed) {
      bedContactArea += area; bedCentroid.addScaledVector(centroid, area); bedCentroidWeight += area;
    } else if (normal.z < -Math.SQRT1_2) {
      overhangTriangles.push({ vertices: [a.clone(), b.clone(), c.clone()], area, normalZ: normal.z });
    }
  }
  if (surfaceCentroidWeight) surfaceCentroid.multiplyScalar(1 / surfaceCentroidWeight);
  if (bedCentroidWeight) bedCentroid.multiplyScalar(1 / bedCentroidWeight);
  const regions = connectedOverhangRegions(overhangTriangles, quantizationMm);
  const overhangArea = regions.reduce((sum, region) => sum + region.areaMm2, 0);
  const boundingFootprintArea = Math.max(0, size.x * size.y);
  const centroidOffset = bedCentroidWeight && surfaceCentroidWeight
    ? Math.hypot(surfaceCentroid.x - bedCentroid.x, surfaceCentroid.y - bedCentroid.y)
    : null;
  const contactWidth = bedContactArea > 0 ? Math.sqrt(bedContactArea) : null;
  return {
    min, max, size, totalArea, bedContactArea, overhangArea,
    risk: {
      boundingFootprintAreaMm2: boundingFootprintArea,
      bedCoverageRatio: boundingFootprintArea ? Math.min(1, bedContactArea / boundingFootprintArea) : 0,
      heightToContactWidthRatio: contactWidth ? size.z / contactWidth : null,
      surfaceCentroidOffsetMm: centroidOffset,
      surfaceCentroidOffsetRatio: centroidOffset !== null && contactWidth ? centroidOffset / contactWidth : null,
      overhangRegionCount: regions.length,
      largestOverhangRegionAreaMm2: regions[0]?.areaMm2 ?? 0,
      largestOverhangRegionSpanMm: regions[0]?.projectedSpanMm ?? 0,
      overhangRegions: regions,
      bridgeClassification: 'not-evaluated',
    },
  };
}

export function analyzeGeometry(geometry: THREE.BufferGeometry, fileName: string, metadata: ModelMetadata): { analysis: ModelAnalysis; geometry: THREE.BufferGeometry } {
  if (geometry.index) geometry = geometry.toNonIndexed();
  geometry.computeBoundingBox(); geometry.computeVertexNormals();
  const positions = geometry.getAttribute('position');
  const measured = measureGeometry(positions);
  const orientations = analyzeOrientations(geometry);
  const analysis: ModelAnalysis = {
    fileName, triangleCount: positions.count / 3,
    boundingBox: {
      min: { x: measured.min.x, y: measured.min.y, z: measured.min.z },
      max: { x: measured.max.x, y: measured.max.y, z: measured.max.z },
      size: { x: measured.size.x, y: measured.size.y, z: measured.size.z },
    },
    heightMm: measured.size.z, bedContactAreaMm2: measured.bedContactArea, overhangAreaMm2: measured.overhangArea,
    overhangRatio: measured.totalArea ? measured.overhangArea / measured.totalArea : 0,
    confidence: { bedContact: 0.55, overhang: 0.72 }, orientations, orientationLabel: 'As imported', metadata,
    geometryRisk: measured.risk,
  };
  return { analysis, geometry };
}

export function analyzeStl(buffer: ArrayBuffer, fileName: string): { analysis: ModelAnalysis; geometry: THREE.BufferGeometry } {
  return analyzeGeometry(new STLLoader().parse(buffer), fileName, extractModelMetadata(buffer, fileName));
}

const transforms: Array<{id:string;label:string;map:(v:THREE.Vector3)=>THREE.Vector3}> = [
  {id:'as-imported',label:'As imported',map:v=>new THREE.Vector3(v.x,v.y,v.z)},
  {id:'flip-z',label:'Flip upside down',map:v=>new THREE.Vector3(v.x,-v.y,-v.z)},
  {id:'right-side',label:'Place right side down',map:v=>new THREE.Vector3(v.z,v.y,-v.x)},
  {id:'left-side',label:'Place left side down',map:v=>new THREE.Vector3(-v.z,v.y,v.x)},
  {id:'front-side',label:'Place front side down',map:v=>new THREE.Vector3(v.x,v.z,-v.y)},
  {id:'back-side',label:'Place back side down',map:v=>new THREE.Vector3(v.x,-v.z,v.y)}
];

function analyzeOrientations(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  return transforms.map(candidate => {
    const measured = measureGeometry(positions, candidate.map);
    return {
      id: candidate.id,
      label: candidate.label,
      heightMm: measured.size.z,
      bedContactAreaMm2: measured.bedContactArea,
      overhangRatio: measured.totalArea ? measured.overhangArea / measured.totalArea : 0,
      geometryRisk: measured.risk,
    };
  });
}

export function chooseOrientation(analysis: ModelAnalysis, priority: Questionnaire['priority']) {
  const maxContact=Math.max(...analysis.orientations.map(o=>o.bedContactAreaMm2),1);const maxHeight=Math.max(...analysis.orientations.map(o=>o.heightMm),1);
  const score=(o:ModelAnalysis['orientations'][number])=>{const contact=o.bedContactAreaMm2/maxContact,height=o.heightMm/maxHeight,clean=1-o.overhangRatio;
    if(priority==='finish')return clean*.65+contact*.2+(1-height)*.15;
    if(priority==='speed')return (1-height)*.5+clean*.35+contact*.15;
    if(priority==='accuracy')return contact*.5+clean*.35+(1-height)*.15;
    if(priority==='unknown')return contact*.4+clean*.4+(1-height)*.2;
    return contact*.45+clean*.3+(1-height)*.25;
  };
  return [...analysis.orientations].sort((a,b)=>score(b)-score(a))[0];
}
