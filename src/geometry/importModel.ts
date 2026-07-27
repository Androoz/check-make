import * as THREE from 'three';
import { analyzeGeometry, analyzeStl } from './stl';
import type { ModelAnalysis, ModelFormat, ModelMetadata } from '../types';

export interface ImportedModel {
  analysis: ModelAnalysis;
  geometry: THREE.BufferGeometry;
  normalizedStl?: Uint8Array;
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
  if (extension === 'stl') return analyzeStl(buffer, fileName);

  let geometry: THREE.BufferGeometry;
  let names: string[] = [];
  if (extension === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    const root = new OBJLoader().parse(new TextDecoder().decode(buffer));
    names = root.children.map(child => child.name).filter(Boolean);
    geometry = await geometryFromObject(root);
  } else if (extension === '3mf') {
    const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
    const root = new ThreeMFLoader().parse(buffer);
    names = root.children.map(child => child.name).filter(Boolean);
    geometry = await geometryFromObject(root);
  } else throw new Error('Unsupported model format.');
  const result = analyzeGeometry(geometry, fileName, metadataFor(fileName, names));
  return { ...result, normalizedStl: await normalizedStl(result.geometry) };
}
