import * as THREE from 'three';
import type {
  MeshRegionReference, ModelAxis, SpatialCandidateAnalysis, SpatialManufacturingIntent,
  SpatialRegion, SpatialRegionCandidate, SpatialRegionKind, Vec3,
} from '../types';

const vectorValue = (vector: THREE.Vector3): Vec3 => ({ x: vector.x, y: vector.y, z: vector.z });
const unknownAxis = (): SpatialManufacturingIntent['loadAxis'] => ({
  axis: 'unknown', status: 'hypothesized', confidence: 0, provenance: 'geometry-candidate', evidenceIds: [],
});

export function emptySpatialManufacturingIntent(): SpatialManufacturingIntent {
  return { schemaVersion: 1, coordinateSpace: 'source-model', loadAxis: unknownAxis(), regions: [], notApplicable: [], rejectedCandidateIds: [] };
}

export function normalizeSpatialManufacturingIntent(value?: Partial<SpatialManufacturingIntent>): SpatialManufacturingIntent {
  if (!value || value.schemaVersion !== 1 || value.coordinateSpace !== 'source-model') return emptySpatialManufacturingIntent();
  const validKinds = new Set<SpatialRegionKind>(['load-bearing', 'mating-surface', 'visible-surface', 'critical-thin']);
  const regions = Array.isArray(value.regions) ? value.regions.filter(region =>
    Boolean(region && validKinds.has(region.kind) && Array.isArray(region.mesh?.triangleIndices)),
  ) : [];
  return { schemaVersion: 1, coordinateSpace: 'source-model', loadAxis: value.loadAxis ?? unknownAxis(), regions, notApplicable: value.notApplicable?.filter(kind => validKinds.has(kind)) ?? [], rejectedCandidateIds: value.rejectedCandidateIds?.filter(id => typeof id === 'string') ?? [] };
}

function nonIndexedGeometry(geometry: THREE.BufferGeometry) {
  return geometry.index ? geometry.toNonIndexed() : geometry.clone();
}

interface TriangleRecord {
  index: number;
  vertices: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  area: number;
}

function trianglesForGeometry(geometry: THREE.BufferGeometry) {
  const prepared = nonIndexedGeometry(geometry);
  const positions = prepared.getAttribute('position');
  const records: TriangleRecord[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let offset = 0; offset + 2 < positions.count; offset += 3) {
    a.fromBufferAttribute(positions, offset); b.fromBufferAttribute(positions, offset + 1); c.fromBufferAttribute(positions, offset + 2);
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const area = normal.length() / 2;
    if (!area) continue;
    records.push({
      index: offset / 3,
      vertices: [a.clone(), b.clone(), c.clone()],
      normal: normal.clone().normalize(),
      centroid: a.clone().add(b).add(c).multiplyScalar(1 / 3),
      area,
    });
  }
  prepared.dispose();
  return records;
}

function regionReference(triangles: TriangleRecord[]): MeshRegionReference {
  const bounds = new THREE.Box3();
  const centroid = new THREE.Vector3(); const normal = new THREE.Vector3();
  let area = 0;
  triangles.forEach(triangle => {
    triangle.vertices.forEach(vertex => bounds.expandByPoint(vertex));
    centroid.addScaledVector(triangle.centroid, triangle.area);
    normal.addScaledVector(triangle.normal, triangle.area);
    area += triangle.area;
  });
  if (area) centroid.multiplyScalar(1 / area);
  if (normal.lengthSq()) normal.normalize();
  return {
    triangleIndices: triangles.map(triangle => triangle.index).sort((left, right) => left - right),
    centroid: vectorValue(centroid), normal: vectorValue(normal), areaMm2: area,
    bounds: { min: vectorValue(bounds.min), max: vectorValue(bounds.max) },
  };
}

function connectedPlanarPatches(triangles: TriangleRecord[]) {
  if (!triangles.length) return [];
  const bounds = new THREE.Box3(); triangles.forEach(triangle => triangle.vertices.forEach(vertex => bounds.expandByPoint(vertex)));
  const size = bounds.getSize(new THREE.Vector3());
  const quantization = Math.max(1e-6, Math.max(size.x, size.y, size.z, 1) * 1e-6);
  const key = (vertex: THREE.Vector3) => [vertex.x, vertex.y, vertex.z].map(value => Math.round(value / quantization)).join(',');
  const owners = new Map<string, number[]>();
  triangles.forEach((triangle, index) => triangle.vertices.forEach(vertex => {
    const vertexKey = key(vertex); const matches = owners.get(vertexKey) ?? []; matches.push(index); owners.set(vertexKey, matches);
  }));
  const visited = new Set<number>(); const patches: TriangleRecord[][] = [];
  triangles.forEach((triangle, start) => {
    if (visited.has(start)) return;
    const patch: TriangleRecord[] = []; const queue = [start]; visited.add(start);
    while (queue.length) {
      const current = queue.shift()!; const face = triangles[current]; patch.push(face);
      const neighbours = new Set(face.vertices.flatMap(vertex => owners.get(key(vertex)) ?? []));
      neighbours.forEach(neighbour => {
        if (visited.has(neighbour) || Math.abs(face.normal.dot(triangles[neighbour].normal)) < 0.965) return;
        visited.add(neighbour); queue.push(neighbour);
      });
    }
    patches.push(patch);
  });
  return patches;
}

function candidateFromPatch(patch: TriangleRecord[], index: number): SpatialRegionCandidate {
  const mesh = regionReference(patch);
  return {
    id: `planar-${index + 1}`,
    kind: 'visible-surface',
    label: `Planar surface candidate ${index + 1}`,
    status: 'hypothesized', confidence: 0.58, provenance: 'geometry-candidate',
    evidenceIds: [`geometry:planar-patch:${index + 1}`], mesh,
  };
}

function estimateThicknessCandidates(geometry: THREE.BufferGeometry, triangles: TriangleRecord[]) {
  if (!triangles.length) return { candidates: [] as SpatialRegionCandidate[], sampled: 0, measured: 0 };
  const prepared = nonIndexedGeometry(geometry);
  prepared.computeBoundingBox();
  const size = prepared.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
  const extent = size.length();
  if (triangles.length > 75_000) { prepared.dispose(); return { candidates: [] as SpatialRegionCandidate[], sampled: 0, measured: 0 }; }
  const epsilon = Math.max(extent * 1e-5, 1e-4);
  const mesh = new THREE.Mesh(prepared, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const step = Math.max(1, Math.ceil(triangles.length / 180));
  const measured: Array<{ triangle: TriangleRecord; thickness: number }> = [];
  let sampled = 0;
  for (let index = 0; index < triangles.length; index += step) {
    const triangle = triangles[index]; sampled += 1;
    const origin = triangle.centroid.clone().addScaledVector(triangle.normal, -epsilon);
    raycaster.set(origin, triangle.normal.clone().negate());
    const hit = raycaster.intersectObject(mesh, false).find(intersection => intersection.distance > epsilon * 2);
    if (hit && Number.isFinite(hit.distance)) measured.push({ triangle, thickness: hit.distance });
  }
  (mesh.material as THREE.Material).dispose(); prepared.dispose();
  if (!measured.length) return { candidates: [] as SpatialRegionCandidate[], sampled, measured: 0 };
  const sorted = measured.sort((left, right) => left.thickness - right.thickness);
  const thresholdIndex = Math.max(0, Math.floor(sorted.length * 0.12) - 1);
  const threshold = sorted[thresholdIndex]?.thickness ?? sorted[0].thickness;
  const criticalCutoff = Math.min(2.4, Math.max(0.4, Math.min(size.x, size.y, size.z) * 0.35));
  const candidates = sorted.filter(item => item.thickness <= threshold * 1.05 && item.thickness <= criticalCutoff).slice(0, 6).map((item, index): SpatialRegionCandidate => ({
    id: `thin-${item.triangle.index}`,
    kind: 'critical-thin', label: `Thin-region candidate ${index + 1}`,
    status: 'hypothesized', confidence: 0.52, provenance: 'geometry-candidate',
    evidenceIds: [`geometry:opposing-ray:${item.triangle.index}`],
    mesh: regionReference([item.triangle]), thicknessMm: item.thickness,
  }));
  return { candidates, sampled, measured: measured.length };
}

export function analyzeSpatialCandidates(geometry: THREE.BufferGeometry): SpatialCandidateAnalysis {
  const totalTriangles = Math.floor(geometry.getAttribute('position').count / 3);
  if (totalTriangles > 250_000) return {
    schemaVersion: 1,
    planarCandidates: [],
    thinCandidates: [],
    thicknessCoverage: { sampledTriangles: 0, measuredTriangles: 0, totalTriangles },
    notes: [
      'Automatic important-area suggestions were skipped to keep this high-detail model responsive.',
      'You can still identify important areas from the model and manufacturing context.',
    ],
  };
  const triangles = trianglesForGeometry(geometry);
  const patches = connectedPlanarPatches(triangles)
    .filter(patch => patch.length > 1)
    .sort((left, right) => regionReference(right).areaMm2 - regionReference(left).areaMm2)
    .slice(0, 8)
    .map(candidateFromPatch);
  const thickness = estimateThicknessCandidates(geometry, triangles);
  return {
    schemaVersion: 1,
    planarCandidates: patches,
    thinCandidates: thickness.candidates,
    thicknessCoverage: { sampledTriangles: thickness.sampled, measuredTriangles: thickness.measured, totalTriangles: triangles.length },
    notes: [
      'Planar candidates describe connected near-coplanar faces; they do not establish function.',
      triangles.length > 75_000
        ? 'Thickness screening was skipped because this mesh exceeds the bounded local sampling scope.'
        : 'Thickness is sampled with opposing surface rays and is not a complete volumetric wall-thickness field.',
    ],
  };
}

export function facePatchRegion(
  geometry: THREE.BufferGeometry,
  faceIndex: number,
  kind: SpatialRegionKind,
  label: string,
  evidenceIds: string[],
): SpatialRegion | undefined {
  const triangles = trianglesForGeometry(geometry);
  const patches = connectedPlanarPatches(triangles);
  const patch = patches.find(group => group.some(triangle => triangle.index === faceIndex));
  if (!patch) return undefined;
  return {
    id: `${kind}-${Date.now().toString(36)}-${faceIndex}`,
    kind, label, status: 'confirmed', confidence: 1, provenance: 'user-selection', evidenceIds,
    mesh: regionReference(patch),
  };
}

export function confirmCandidate(candidate: SpatialRegionCandidate, kind: SpatialRegionKind, evidenceIds: string[]): SpatialRegion {
  return { ...candidate, id: `${kind}-${candidate.id}`, kind, label: kind.replace('-', ' '), status: 'confirmed', confidence: 1, provenance: 'user-confirmation', evidenceIds: [...new Set([...candidate.evidenceIds, ...evidenceIds])] };
}

export function setConfirmedLoadAxis(spatial: SpatialManufacturingIntent, axis: ModelAxis | 'not-applicable', evidenceIds: string[]): SpatialManufacturingIntent {
  return {
    ...spatial,
    loadAxis: { axis, status: axis === 'not-applicable' ? 'not-applicable' : 'confirmed', confidence: 1, provenance: 'user-confirmation', evidenceIds },
  };
}

export function replaceSpatialRegion(spatial: SpatialManufacturingIntent, region: SpatialRegion): SpatialManufacturingIntent {
  return { ...spatial, regions: [...spatial.regions.filter(item => item.kind !== region.kind), region], notApplicable: spatial.notApplicable.filter(kind => kind !== region.kind) };
}

export function clearSpatialRegion(spatial: SpatialManufacturingIntent, kind: SpatialRegionKind): SpatialManufacturingIntent {
  return { ...spatial, regions: spatial.regions.filter(item => item.kind !== kind) };
}

export function setSpatialRegionNotApplicable(spatial: SpatialManufacturingIntent, kind: SpatialRegionKind): SpatialManufacturingIntent {
  return { ...spatial, regions: spatial.regions.filter(item => item.kind !== kind), notApplicable: [...new Set([...spatial.notApplicable, kind])] };
}

export function rejectSpatialCandidate(spatial: SpatialManufacturingIntent, kind: SpatialRegionKind, candidateId: string): SpatialManufacturingIntent {
  return { ...spatial, rejectedCandidateIds: [...new Set([...spatial.rejectedCandidateIds, `${kind}:${candidateId}`])] };
}

export function confirmedRegion(spatial: SpatialManufacturingIntent | undefined, kind: SpatialRegionKind) {
  return spatial?.regions.find(region => region.kind === kind && region.status === 'confirmed');
}

export function regionColor(kind: SpatialRegionKind) {
  return kind === 'load-bearing' ? '#e15b64' : kind === 'mating-surface' ? '#4f82df' : kind === 'visible-surface' ? '#a45ddb' : '#f2a13b';
}

export function applySpatialRegionColors(geometry: THREE.BufferGeometry, regions: SpatialRegion[]) {
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3); const base = new THREE.Color('#aeb8b4');
  for (let index = 0; index < positions.count; index += 1) colors.set(base.toArray(), index * 3);
  regions.filter(region => region.status === 'confirmed' || region.status === 'hypothesized').forEach(region => {
    const color = new THREE.Color(regionColor(region.kind));
    region.mesh.triangleIndices.forEach(triangleIndex => {
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const index = triangleIndex * 3 + vertex;
        if (index < positions.count) colors.set(color.toArray(), index * 3);
      }
    });
  });
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function spatialEvidenceIds(spatial?: SpatialManufacturingIntent) {
  if (!spatial) return [];
  return [...new Set([
    ...(spatial.loadAxis.status === 'confirmed' ? spatial.loadAxis.evidenceIds : []),
    ...spatial.regions.filter(region => region.status === 'confirmed' && (region.kind === 'mating-surface' || region.kind === 'visible-surface')).flatMap(region => region.evidenceIds),
  ])];
}
