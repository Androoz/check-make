import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { AnalysisLimit, GeometryFinding, GeometryRiskMetrics, MeshComponent, MeshTopology, ModelAnalysis, ModelClue, ModelMetadata, OrientationComparison, OverhangRegion, Questionnaire, SpatialManufacturingIntent, Vec3 } from '../types';
import type { ManufacturingIntent } from '../intent/manufacturingIntent';
import { intentFactUsable } from '../intent/manufacturingIntent';
import { confirmedRegion, spatialEvidenceIds } from './spatialIntent';

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

function vectorValue(vector: THREE.Vector3): Vec3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function analyzeMeshTopology(positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): { topology: MeshTopology; components: MeshComponent[] } {
  const triangleCount = Math.floor(positions.count / 3);
  const parents = Array.from({ length: triangleCount }, (_, index) => index);
  const ranks = Array.from({ length: triangleCount }, () => 0);
  const find = (index: number) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) { const next = parents[index]; parents[index] = root; index = next; }
    return root;
  };
  const join = (left: number, right: number) => {
    const leftRoot = find(left); const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (ranks[leftRoot] < ranks[rightRoot]) parents[leftRoot] = rightRoot;
    else if (ranks[leftRoot] > ranks[rightRoot]) parents[rightRoot] = leftRoot;
    else { parents[rightRoot] = leftRoot; ranks[leftRoot] += 1; }
  };
  const bounds = new THREE.Box3(); const boundsVertex = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) bounds.expandByPoint(boundsVertex.fromBufferAttribute(positions, index));
  const size = new THREE.Vector3(); bounds.getSize(size);
  const quantization = Math.max(1e-6, Math.max(size.x, size.y, size.z, 1) * 1e-6);
  const vertexKey = (vertex: THREE.Vector3) => [vertex.x, vertex.y, vertex.z].map(value => Math.round(value / quantization)).join(',');
  const edgeOwners = new Map<string, number[]>();
  const faces: Array<{ triangleIndex: number; area: number; min: THREE.Vector3; max: THREE.Vector3 }> = [];
  let degenerateTriangleCount = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const offset = triangleIndex * 3;
    a.fromBufferAttribute(positions, offset); b.fromBufferAttribute(positions, offset + 1); c.fromBufferAttribute(positions, offset + 2);
    const area = normal.crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a)).length() / 2;
    if (area <= 1e-12) { degenerateTriangleCount += 1; continue; }
    const keys = [vertexKey(a), vertexKey(b), vertexKey(c)];
    for (const [left, right] of [[0, 1], [1, 2], [2, 0]] as const) {
      const edge = [keys[left], keys[right]].sort().join('|');
      const owners = edgeOwners.get(edge) ?? [];
      owners.forEach(owner => join(triangleIndex, owner)); owners.push(triangleIndex); edgeOwners.set(edge, owners);
    }
    faces.push({ triangleIndex, area, min: new THREE.Vector3().copy(a).min(b).min(c), max: new THREE.Vector3().copy(a).max(b).max(c) });
  }
  const componentFaces = new Map<number, typeof faces>();
  faces.forEach(face => { const root = find(face.triangleIndex); componentFaces.set(root, [...(componentFaces.get(root) ?? []), face]); });
  const components = [...componentFaces.values()].map(group => {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity); const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    let surfaceAreaMm2 = 0;
    group.forEach(face => { min.min(face.min); max.max(face.max); surfaceAreaMm2 += face.area; });
    return { id: 0, triangleCount: group.length, surfaceAreaMm2, boundingBox: { min: vectorValue(min), max: vectorValue(max), size: vectorValue(new THREE.Vector3().subVectors(max, min)) } };
  }).sort((left, right) => right.surfaceAreaMm2 - left.surfaceAreaMm2).map((component, index) => ({ ...component, id: index + 1 }));
  const boundaryEdgeCount = [...edgeOwners.values()].filter(owners => owners.length === 1).length;
  const nonManifoldEdgeCount = [...edgeOwners.values()].filter(owners => owners.length > 2).length;
  return {
    topology: { componentCount: components.length, boundaryEdgeCount, nonManifoldEdgeCount, degenerateTriangleCount, watertight: boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0 && components.length > 0 },
    components,
  };
}

function geometryFindings(measured: GeometryMeasurement, topology: MeshTopology): GeometryFinding[] {
  const findings: GeometryFinding[] = [];
  if (topology.componentCount > 1) findings.push({ id: 'multiple-components', severity: 'warning', label: `${topology.componentCount} disconnected parts detected`, detail: 'The parts may need separate orientations or process settings. Check Make currently exports them as one combined mesh.', confidence: 0.98 });
  if (topology.boundaryEdgeCount > 0) findings.push({ id: 'open-mesh', severity: 'warning', label: 'Open mesh boundaries detected', detail: `${topology.boundaryEdgeCount} boundary edges indicate holes or non-closed surfaces. Slicer repair may change the result.`, confidence: 0.95 });
  if (topology.nonManifoldEdgeCount > 0) findings.push({ id: 'non-manifold', severity: 'warning', label: 'Non-manifold edges detected', detail: `${topology.nonManifoldEdgeCount} edges belong to more than two triangles. The intended solid is ambiguous.`, confidence: 0.97 });
  if (topology.degenerateTriangleCount > 0) findings.push({ id: 'degenerate', severity: 'info', label: 'Degenerate triangles detected', detail: `${topology.degenerateTriangleCount} zero-area triangles will be removed during export.`, confidence: 1 });
  if (measured.risk.overhangRegionCount > 0) findings.push({ id: 'overhang-regions', severity: 'info', label: `${measured.risk.overhangRegionCount} connected overhang region(s)`, detail: `Largest region is ${measured.risk.largestOverhangRegionAreaMm2.toFixed(0)} mm² with a ${measured.risk.largestOverhangRegionSpanMm.toFixed(1)} mm projected span.`, confidence: 0.78 });
  findings.push({ id: 'bed-contact', severity: 'info', label: `${(measured.risk.bedCoverageRatio * 100).toFixed(1)}% base coverage`, detail: measured.risk.heightToContactWidthRatio === null ? 'No reliable planar bed contact was measured.' : `Height-to-contact-width proxy: ${measured.risk.heightToContactWidthRatio.toFixed(2)}. This is a geometric observation, not a failure probability.`, confidence: 0.68 });
  return findings;
}

const analysisLimits: AnalysisLimit[] = [
  { id: 'wall-thickness', label: 'Local wall thickness', status: 'evaluated', detail: 'A bounded opposing-ray screen proposes thin-region candidates and reports coverage; it is not a complete volumetric thickness field.' },
  { id: 'load-path', label: 'Load direction and structural stress', status: 'requires-input', detail: 'Geometry alone cannot establish where force is applied.' },
  { id: 'bridges', label: 'True bridge classification', status: 'not-evaluated', detail: 'Requires layer direction, attachment, material, cooling, and process context.' },
  { id: 'surface-priority', label: 'Critical visible or mating surfaces', status: 'requires-input', detail: 'The user or AI interpretation must identify which surfaces matter.' },
];

export function analyzeGeometry(geometry: THREE.BufferGeometry, fileName: string, metadata: ModelMetadata): { analysis: ModelAnalysis; geometry: THREE.BufferGeometry } {
  if (geometry.index) geometry = geometry.toNonIndexed();
  geometry.computeBoundingBox(); geometry.computeVertexNormals();
  const positions = geometry.getAttribute('position');
  const measured = measureGeometry(positions);
  const { topology, components } = analyzeMeshTopology(positions);
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
    topology,
    components,
    findings: geometryFindings(measured, topology),
    analysisLimits,
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

function orientationTransform(id: string) {
  return transforms.find(candidate => candidate.id === id) ?? transforms[0];
}

export function geometryForOrientation(geometry: THREE.BufferGeometry, orientationId: string) {
  let result = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const positions = result.getAttribute('position'); const source = new THREE.Vector3(); const mapped = new THREE.Vector3();
  const transform = orientationTransform(orientationId).map;
  let minZ = Infinity;
  for (let index = 0; index < positions.count; index += 1) { source.fromBufferAttribute(positions, index); mapped.copy(transform(source)); positions.setXYZ(index, mapped.x, mapped.y, mapped.z); minZ = Math.min(minZ, mapped.z); }
  result.translate(0, 0, -minZ); result.computeBoundingBox(); result.computeVertexNormals();
  return result;
}

export function riskVisualizationGeometry(geometry: THREE.BufferGeometry, orientationId: string) {
  const result = geometryForOrientation(geometry, orientationId);
  const positions = result.getAttribute('position'); const colors = new Float32Array(positions.count * 3);
  const box = result.boundingBox?.clone() ?? new THREE.Box3(); const size = new THREE.Vector3(); box.getSize(size);
  const bedEpsilon = Math.max(0.05, size.z * 0.002);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  const regular = new THREE.Color('#aeb8b4'), bed = new THREE.Color('#3f9fc2'), overhang = new THREE.Color('#f0a34a'), severe = new THREE.Color('#df6559');
  for (let index = 0; index < positions.count; index += 3) {
    a.fromBufferAttribute(positions, index); b.fromBufferAttribute(positions, index + 1); c.fromBufferAttribute(positions, index + 2);
    normal.crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a)).normalize();
    const touchesBed = Math.max(a.z, b.z, c.z) <= box.min.z + bedEpsilon && Math.abs(normal.z) > 0.9;
    const color = touchesBed ? bed : normal.z < -0.9 ? severe : normal.z < -Math.SQRT1_2 ? overhang : regular;
    for (let vertex = 0; vertex < 3; vertex += 1) colors.set(color.toArray(), (index + vertex) * 3);
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return result;
}

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

function orientationIntentConstraints(intent?: ManufacturingIntent, spatial?: SpatialManufacturingIntent) {
  const applied: string[] = [];
  const unresolved: string[] = [];
  const supportFree = Boolean(intent && intentFactUsable(intent.preferences.supportsAllowed) && intent.preferences.supportsAllowed.value === false);
  if (supportFree) applied.push('Support-free printing increases the support-exposure weight.');
  const loadKnown = Boolean(intent && intentFactUsable(intent.mechanical.loadDirections) && intent.mechanical.loadDirections.value.length);
  if (loadKnown && spatial?.loadAxis.status === 'confirmed') applied.push(`Confirmed model-space ${spatial.loadAxis.axis.toUpperCase()} load axis affects layer-orientation scoring.`);
  else if (loadKnown && spatial?.loadAxis.status !== 'not-applicable') unresolved.push(
    `Load type (${intent!.mechanical.loadDirections.value.join(', ')}) is known, but no model-space load axis is confirmed.`,
  );
  const matingRequired = Boolean(intent && intentFactUsable(intent.interface.fitType) && intent.interface.fitType.value !== 'unknown'
    || intent && intentFactUsable(intent.interface.criticalSurfaces) && intent.interface.criticalSurfaces.value.includes('mating'));
  if (matingRequired && confirmedRegion(spatial, 'mating-surface')) applied.push('A confirmed mating surface affects support and surface-orientation scoring.');
  else if (matingRequired) unresolved.push(`The ${intent?.interface.fitType.value ?? 'mating'} interface is known, but its mating geometry is not localized on the mesh.`);
  const visibleRequired = Boolean(intent && intentFactUsable(intent.interface.criticalSurfaces) && intent.interface.criticalSurfaces.value.includes('visible'));
  if (visibleRequired && confirmedRegion(spatial, 'visible-surface')) applied.push('A confirmed visible surface affects support and surface-orientation scoring.');
  else if (visibleRequired) unresolved.push('Critical visible surfaces are known, but their faces are not localized on the mesh.');
  return { supportFree, applied, unresolved, evidenceIds: spatialEvidenceIds(spatial) };
}

export function chooseOrientation(analysis: ModelAnalysis, priority: Questionnaire['priority'], intent?: ManufacturingIntent, spatial?: SpatialManufacturingIntent) {
  return compareOrientations(analysis, priority, intent, spatial)[0]?.candidate ?? analysis.orientations[0];
}

export function compareOrientations(analysis: ModelAnalysis, priority: Questionnaire['priority'], intent?: ManufacturingIntent, spatial?: SpatialManufacturingIntent): OrientationComparison[] {
  const maxHeight = Math.max(...analysis.orientations.map(candidate => candidate.heightMm), 1);
  const maxContact = Math.max(...analysis.orientations.map(candidate => candidate.bedContactAreaMm2), 1);
  const constraints = orientationIntentConstraints(intent, spatial);
  const weights = constraints.supportFree ? [0.25, 0.65, 0.1]
    : priority === 'finish' ? [0.2, 0.65, 0.15] : priority === 'speed' ? [0.2, 0.3, 0.5] : priority === 'accuracy' ? [0.5, 0.35, 0.15] : priority === 'strength' ? [0.45, 0.3, 0.25] : [0.4, 0.4, 0.2];
  return analysis.orientations.map(candidate => {
    const leverage = candidate.geometryRisk?.heightToContactWidthRatio;
    const offset = candidate.geometryRisk?.surfaceCentroidOffsetRatio;
    const stability = candidate.geometryRisk
      ? (candidate.geometryRisk.bedCoverageRatio + 1 / (1 + (leverage ?? 20)) + 1 / (1 + (offset ?? 10))) / 3
      : candidate.bedContactAreaMm2 / maxContact;
    const support = candidate.geometryRisk
      ? ((1 - candidate.overhangRatio) + 1 / (1 + candidate.geometryRisk.overhangRegionCount * 0.1)) / 2
      : 1 - candidate.overhangRatio;
    const height = 1 - candidate.heightMm / maxHeight;
    let overall = stability * weights[0] + support * weights[1] + height * weights[2];
    const transform = orientationTransform(candidate.id).map;
    const mapDirection = (value: Vec3) => transform(new THREE.Vector3(value.x, value.y, value.z)).sub(transform(new THREE.Vector3())).normalize();
    if (spatial?.loadAxis.status === 'confirmed' && spatial.loadAxis.axis !== 'unknown' && spatial.loadAxis.axis !== 'not-applicable') {
      const sourceAxis = spatial.loadAxis.axis === 'x' ? { x: 1, y: 0, z: 0 } : spatial.loadAxis.axis === 'y' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
      const buildAlignment = Math.abs(mapDirection(sourceAxis).z);
      overall += (1 - buildAlignment) * 0.12;
    }
    const surfaceRegions = [confirmedRegion(spatial, 'mating-surface'), confirmedRegion(spatial, 'visible-surface')].filter(Boolean);
    surfaceRegions.forEach(region => {
      const z = mapDirection(region!.mesh.normal).z;
      const surfaceScore = z < -0.2 ? 0 : 0.55 + (1 - Math.abs(z)) * 0.45;
      overall += surfaceScore * 0.06;
    });
    const metrics = [{ label: 'stability', value: stability }, { label: 'support exposure', value: support }, { label: 'height', value: height }].sort((left, right) => right.value - left.value);
    return {
      candidate, overallScore: overall * 100, stabilityScore: stability * 100, supportScore: support * 100, heightScore: height * 100,
      reason: `Best relative contribution: ${metrics[0].label}. Scores compare only the six axis-aligned candidates.${constraints.unresolved.length ? ` ${constraints.unresolved.length} confirmed intent constraint${constraints.unresolved.length === 1 ? ' is' : 's are'} not geometrically localized.` : ''}`,
      constraintsApplied: constraints.applied,
      constraintsUnresolved: constraints.unresolved,
      spatialEvidenceIds: constraints.evidenceIds,
    };
  }).sort((left, right) => right.overallScore - left.overallScore);
}
