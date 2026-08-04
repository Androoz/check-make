import * as THREE from 'three';
import { analyzeGeometry, analyzeStl } from './stl';
import type { IndexedMeshTopology, ModelAnalysis, ModelDocumentSummary, ModelFormat, ModelMetadata, ModelTopologyReport } from '../types';

export interface ImportedModel {
  analysis: ModelAnalysis;
  geometry: THREE.BufferGeometry;
  normalizedStl?: Uint8Array;
  repairParts: THREE.BufferGeometry[];
}

interface SourceStructure {
  topology: IndexedMeshTopology;
  document: ModelDocumentSummary;
}

export const supportedModelExtensions = ['stl', '3mf', 'obj'] as const;

function extensionOf(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function formatOf(fileName: string): ModelFormat {
  const extension = extensionOf(fileName);
  if (extension === '3mf') return '3mf';
  if (extension === 'obj') return 'obj';
  return 'stl';
}

function semanticFileName(fileName: string) {
  const stem = fileName.replace(/\.(?:stl|3mf|obj)$/i, '').replace(/[_-]+/g, ' ').trim();
  return stem && !/^(?:model|part|object|untitled)$/i.test(stem) ? stem.slice(0, 96) : undefined;
}

function metadataFor(fileName: string, names: string[] = []): ModelMetadata {
  const format = formatOf(fileName);
  const values = [...names, semanticFileName(fileName)].filter((value): value is string => Boolean(value?.trim()));
  return {
    format,
    encoding: format === '3mf' ? 'archive' : 'ascii',
    clues: [...new Set(values)].slice(0, 8).map((value, index) => ({ source: index < names.length ? 'model-name' : 'file-name', value })),
  };
}

async function geometryFromObject(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh) || !child.geometry?.getAttribute('position')) return;
    let geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    if (geometry.index) geometry = geometry.toNonIndexed();
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('color');
    parts.push(geometry);
  });
  if (!parts.length) throw new Error('The file contains no printable triangle mesh.');
  const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  if (!merged) throw new Error('The model meshes could not be combined.');
  return merged;
}

function indexedPartsFromObject(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh) || !child.geometry?.getAttribute('position')) return;
    const geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    geometry.deleteAttribute('uv'); geometry.deleteAttribute('color'); geometry.deleteAttribute('normal');
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, index) => index));
    parts.push(geometry);
  });
  return parts;
}

function sourceStructureFromObject(root: THREE.Object3D, format: ModelFormat): SourceStructure {
  root.updateMatrixWorld(true);
  let partCount = 0;
  let vertexCount = 0;
  let edgeCount = 0;
  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  let shellCount = 0;
  const partNames: string[] = [];
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh) || !child.geometry?.getAttribute('position')) return;
    const position = child.geometry.getAttribute('position');
    const index = child.geometry.index;
    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
    if (!triangleCount) return;
    partCount += 1;
    vertexCount += position.count;
    partNames.push(child.name || `Part ${partCount}`);
    const parents = Array.from({ length: triangleCount }, (_, triangle) => triangle);
    const find = (triangle: number): number => parents[triangle] === triangle ? triangle : (parents[triangle] = find(parents[triangle]));
    const edgeOwners = new Map<string, number[]>();
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const vertices = [0, 1, 2].map(offset => index ? index.getX(triangle * 3 + offset) : triangle * 3 + offset);
      for (const [left, right] of [[0, 1], [1, 2], [2, 0]] as const) {
        const edge = [vertices[left], vertices[right]].sort((a, b) => a - b).join('|');
        const owners = edgeOwners.get(edge) ?? [];
        owners.forEach(owner => {
          const leftRoot = find(triangle); const rightRoot = find(owner);
          if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
        });
        owners.push(triangle); edgeOwners.set(edge, owners);
      }
    }
    edgeCount += edgeOwners.size;
    boundaryEdgeCount += [...edgeOwners.values()].filter(owners => owners.length === 1).length;
    nonManifoldEdgeCount += [...edgeOwners.values()].filter(owners => owners.length > 2).length;
    shellCount += new Set(Array.from({ length: triangleCount }, (_, triangle) => find(triangle))).size;
  });
  return {
    topology: { partCount, shellCount, vertexCount, edgeCount, boundaryEdgeCount, nonManifoldEdgeCount },
    document: {
      sourceFormat: format,
      exportSource: format === '3mf' ? 'original' : 'normalized-stl',
      preservesSourceTopology: format === '3mf',
      partCount,
      partNames,
    },
  };
}

function topologyReport(source: SourceStructure, spatial: ModelAnalysis['topology']): ModelTopologyReport | undefined {
  if (!spatial) return undefined;
  const mergedShells = Math.max(0, source.topology.shellCount - spatial.componentCount);
  return {
    indexed: source.topology,
    spatial,
    coincidentEdgeCount: spatial.nonManifoldEdgeCount,
    relations: mergedShells ? [{
      kind: 'touching-or-overlapping',
      shellCount: source.topology.shellCount,
      spatialComponentCount: spatial.componentCount,
      detail: `${source.topology.shellCount} indexed shells become ${spatial.componentCount} component${spatial.componentCount === 1 ? '' : 's'} when coincident coordinates are treated as connected.`,
    }] : [{
      kind: 'separate',
      shellCount: source.topology.shellCount,
      spatialComponentCount: spatial.componentCount,
      detail: 'Indexed and spatial connectivity agree.',
    }],
  };
}

async function normalizedStl(geometry: THREE.BufferGeometry) {
  const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
  const data = new STLExporter().parse(new THREE.Mesh(geometry), { binary: true });
  const view = data instanceof DataView ? data : new DataView(data as ArrayBuffer);
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export async function importModel(buffer: ArrayBuffer, fileName: string): Promise<ImportedModel> {
  const extension = extensionOf(fileName);
  if (!supportedModelExtensions.includes(extension as typeof supportedModelExtensions[number])) {
    throw new Error('Supported formats are STL, 3MF, and OBJ.');
  }
  if (extension === 'stl') {
    const result = analyzeStl(buffer, fileName);
    return { ...result, repairParts: [result.geometry.clone()] };
  }

  let geometry: THREE.BufferGeometry;
  let names: string[] = [];
  if (extension === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    const root = new OBJLoader().parse(new TextDecoder().decode(buffer));
    names = root.children.map(child => child.name).filter(Boolean);
    const repairParts = indexedPartsFromObject(root);
    const source = sourceStructureFromObject(root, 'obj');
    geometry = await geometryFromObject(root);
    const result = analyzeGeometry(geometry, fileName, metadataFor(fileName, names));
    return { ...result, analysis: { ...result.analysis, topologyReport: topologyReport(source, result.analysis.topology), document: source.document }, normalizedStl: await normalizedStl(result.geometry), repairParts };
  } else if (extension === '3mf') {
    const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
    const root = new ThreeMFLoader().parse(buffer);
    names = root.children.map(child => child.name).filter(Boolean);
    const repairParts = indexedPartsFromObject(root);
    const source = sourceStructureFromObject(root, '3mf');
    geometry = await geometryFromObject(root);
    const result = analyzeGeometry(geometry, fileName, metadataFor(fileName, names));
    return { ...result, analysis: { ...result.analysis, topologyReport: topologyReport(source, result.analysis.topology), document: source.document }, normalizedStl: await normalizedStl(result.geometry), repairParts };
  } else throw new Error('Unsupported model format.');
}
