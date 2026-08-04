import * as THREE from 'three';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { ModelAnalysis } from '../types';
import { analyzeStl } from './stl';

export interface BooleanRepairEvidence {
  engine: 'Manifold';
  operation: 'union';
  inputPartCount: number;
  inputTriangleCount: number;
  outputTriangleCount: number;
  outputBoundaryEdgeCount: number;
  outputNonManifoldEdgeCount: number;
  boundingBoxDeltaMm: number;
}

export interface BooleanRepairResult {
  stl: Uint8Array;
  analysis: ModelAnalysis;
  evidence: BooleanRepairEvidence;
}

let modulePromise: Promise<Awaited<ReturnType<typeof import('manifold-3d')['default']>>> | undefined;

async function manifoldModule() {
  if (!modulePromise) modulePromise = import('manifold-3d').then(async ({ default: Module }) => {
    const module = typeof window === 'undefined' ? await Module() : await Module({ locateFile: () => wasmUrl });
    module.setup();
    return module;
  });
  return modulePromise;
}

function manifoldInput(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  if (!position) throw new Error('A boolean repair part has no vertex positions.');
  const vertices = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    vertices[index * 3] = position.getX(index);
    vertices[index * 3 + 1] = position.getY(index);
    vertices[index * 3 + 2] = position.getZ(index);
  }
  const indices = geometry.index
    ? Uint32Array.from(geometry.index.array)
    : Uint32Array.from({ length: position.count }, (_, index) => index);
  return { vertices, indices };
}

function boundsDelta(left: THREE.Box3, right: THREE.Box3) {
  return Math.max(
    Math.abs(left.min.x - right.min.x), Math.abs(left.min.y - right.min.y), Math.abs(left.min.z - right.min.z),
    Math.abs(left.max.x - right.max.x), Math.abs(left.max.y - right.max.y), Math.abs(left.max.z - right.max.z),
  );
}

export async function createSingleSolid(parts: THREE.BufferGeometry[]): Promise<BooleanRepairResult> {
  if (!parts.length) throw new Error('No source parts are available for boolean repair.');
  const module = await manifoldModule();
  const inputBounds = new THREE.Box3();
  let inputTriangleCount = 0;
  const solids = parts.map(part => {
    part.computeBoundingBox();
    if (part.boundingBox) inputBounds.union(part.boundingBox);
    const { vertices, indices } = manifoldInput(part);
    inputTriangleCount += indices.length / 3;
    const mesh = new module.Mesh({ numProp: 3, vertProperties: vertices, triVerts: indices });
    mesh.merge();
    return new module.Manifold(mesh);
  });
  let solid: InstanceType<typeof module.Manifold> | undefined;
  try {
    solid = solids.length === 1 ? solids[0] : module.Manifold.union(solids);
    const mesh = solid.getMesh();
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let vertex = 0; vertex < mesh.numVert; vertex += 1) {
      positions[vertex * 3] = mesh.vertProperties[vertex * mesh.numProp];
      positions[vertex * 3 + 1] = mesh.vertProperties[vertex * mesh.numProp + 1];
      positions[vertex * 3 + 2] = mesh.vertProperties[vertex * mesh.numProp + 2];
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(mesh.triVerts), 1));
    geometry.computeBoundingBox();
    const delta = boundsDelta(inputBounds, geometry.boundingBox ?? new THREE.Box3());
    const scale = new THREE.Vector3(); inputBounds.getSize(scale);
    const tolerance = Math.max(1e-5, Math.max(scale.x, scale.y, scale.z, 1) * 1e-5);
    if (delta > tolerance) throw new Error(`Boolean repair changed the model bounds by ${delta.toFixed(4)} mm, above the ${tolerance.toFixed(4)} mm limit.`);
    const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
    const data = new STLExporter().parse(new THREE.Mesh(geometry), { binary: true });
    const view = data instanceof DataView ? data : new DataView(data as ArrayBuffer);
    const stl = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
    const analyzed = analyzeStl(stl.buffer as ArrayBuffer, 'check-make-single-solid.stl');
    if (!analyzed.analysis.topology?.watertight) {
      throw new Error(`Boolean repair did not produce a watertight result (${analyzed.analysis.topology?.boundaryEdgeCount ?? 0} boundaries, ${analyzed.analysis.topology?.nonManifoldEdgeCount ?? 0} non-manifold edges).`);
    }
    return {
      stl,
      analysis: analyzed.analysis,
      evidence: {
        engine: 'Manifold', operation: 'union', inputPartCount: parts.length, inputTriangleCount,
        outputTriangleCount: mesh.numTri,
        outputBoundaryEdgeCount: analyzed.analysis.topology.boundaryEdgeCount,
        outputNonManifoldEdgeCount: analyzed.analysis.topology.nonManifoldEdgeCount,
        boundingBoxDeltaMm: delta,
      },
    };
  } finally {
    if (solid && !solids.includes(solid)) solid.delete();
    solids.forEach(item => item.delete());
  }
}
