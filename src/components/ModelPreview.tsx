import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Edges, Grid, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { applySpatialRegionColors, regionColor } from '../geometry/spatialIntent';
import { geometryForOrientation, riskVisualizationGeometry } from '../geometry/stl';
import { cameraPose } from '../geometry/previewScene';
import type { CameraView } from '../geometry/previewScene';
import type { MeshTopology, SpatialRegion, SpatialRegionKind } from '../types';

export type PreviewMode = 'original' | 'recommended' | 'risk' | 'compare' | 'spatial' | 'mesh';

export interface ModelPreviewProps {
  geometry?: THREE.BufferGeometry;
  orientationId?: string;
  mode?: PreviewMode;
  plateSize?: { x: number; y: number; z: number };
  plateLabel?: string;
  overhangRegionCount?: number;
  spatialRegions?: SpatialRegion[];
  markingKind?: SpatialRegionKind;
  meshTopology?: MeshTopology;
  onFaceSelect?: (faceIndex: number) => void;
  captureKey?: string;
  onCapture?: (image: string) => void;
}

function TriangleOverlay({ geometry, triangleIndices, color }: { geometry: THREE.BufferGeometry; triangleIndices: number[]; color: string }) {
  const overlay = useMemo(() => {
    const source = geometry.getAttribute('position');
    const values: number[] = [];
    triangleIndices.forEach(triangleIndex => {
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const index = triangleIndex * 3 + vertex;
        if (index < source.count) values.push(source.getX(index), source.getY(index), source.getZ(index));
      }
    });
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    result.computeVertexNormals();
    return result;
  }, [geometry, triangleIndices]);
  useEffect(() => () => overlay.dispose(), [overlay]);
  if (!overlay.getAttribute('position').count) return null;
  return <mesh geometry={overlay} renderOrder={6}>
    <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.88} polygonOffset polygonOffsetFactor={-5} polygonOffsetUnits={-5}/>
    <Edges threshold={1} color="#fff4e8"/>
  </mesh>;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function SpatialRegionOverlay({ geometry, region }: { geometry: THREE.BufferGeometry; region: SpatialRegion }) {
  const overlay = useMemo(() => {
    const source = geometry.getAttribute('position');
    const values: number[] = [];
    region.mesh.triangleIndices.forEach(triangleIndex => {
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const index = triangleIndex * 3 + vertex;
        if (index < source.count) values.push(source.getX(index), source.getY(index), source.getZ(index));
      }
    });
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    result.computeVertexNormals();
    result.computeBoundingBox();
    return result;
  }, [geometry, region]);
  const center = useMemo(() => overlay.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3(), [overlay]);
  useEffect(() => () => overlay.dispose(), [overlay]);
  if (!overlay.getAttribute('position').count) return null;
  return <group>
    <mesh geometry={overlay} renderOrder={5}>
      <meshBasicMaterial color={regionColor(region.kind)} side={THREE.DoubleSide} transparent opacity={0.96} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4}/>
      <Edges threshold={1} color="#ffffff"/>
    </mesh>
    <Html position={center} center zIndexRange={[12, 0]}>
      <span className="spatial-callout" style={{ '--region-color': regionColor(region.kind) } as React.CSSProperties}>{region.label}</span>
    </Html>
  </group>;
}

function PreparedModel({ geometry, orientationId, risk = false, spatialRegions = [], meshTopology, color = '#b8bcba', position = [0, 0, 0], opacity = 1, onFaceSelect }: {
  geometry: THREE.BufferGeometry; orientationId: string; risk?: boolean; spatialRegions?: SpatialRegion[];
  meshTopology?: MeshTopology;
  color?: string; position?: [number, number, number]; opacity?: number; onFaceSelect?: (faceIndex: number) => void;
}) {
  const prepared = useMemo(() => {
    const result = risk ? riskVisualizationGeometry(geometry, orientationId) : geometryForOrientation(geometry, orientationId);
    return !risk && spatialRegions.length ? applySpatialRegionColors(result, spatialRegions) : result;
  }, [geometry, orientationId, risk, spatialRegions]);
  const centeredPosition = useMemo(() => {
    prepared.computeBoundingBox();
    const center = prepared.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    return [position[0] - center.x, position[1] - center.y, position[2]] as [number, number, number];
  }, [position, prepared]);
  useEffect(() => () => prepared.dispose(), [prepared]);
  return <group position={centeredPosition}>
    <mesh geometry={prepared} castShadow receiveShadow onPointerDown={event => {
      if (!onFaceSelect || event.faceIndex == null) return;
      event.stopPropagation();
      onFaceSelect(event.faceIndex);
    }}>
      <meshStandardMaterial color={risk || spatialRegions.length ? '#ffffff' : color} vertexColors={risk || spatialRegions.length > 0} roughness={0.52} metalness={0.03} transparent={opacity < 1} opacity={opacity}/>
      <Edges threshold={32} color={risk ? '#34413c' : '#63716b'}/>
    </mesh>
    {!risk && spatialRegions.map(region => <SpatialRegionOverlay geometry={prepared} region={region} key={region.id}/>)}
    {meshTopology && <>
      <TriangleOverlay geometry={prepared} triangleIndices={meshTopology.boundaryTriangleIndices ?? []} color="#f3a24f"/>
      <TriangleOverlay geometry={prepared} triangleIndices={meshTopology.nonManifoldTriangleIndices ?? []} color="#ef704d"/>
    </>}
  </group>;
}

function CameraPreset({ view, distance, targetY, resetKey }: { view: CameraView; distance: number; targetY: number; resetKey: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const pose = cameraPose(view, distance, targetY);
    camera.position.set(...pose.position);
    camera.up.set(...pose.up);
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
  }, [camera, distance, resetKey, targetY, view]);
  return null;
}

function BuildPlate({ width, depth, ghost, dark }: { width: number; depth: number; ghost: boolean; dark: boolean }) {
  return <group>
    <mesh position={[0, -0.85, 0]} receiveShadow>
      <boxGeometry args={[width, 1.7, depth]}/>
      <meshStandardMaterial color={dark ? '#0b2a3f' : '#e8efec'} roughness={0.82} transparent opacity={ghost ? 0.13 : 0.96} depthWrite={!ghost}/>
    </mesh>
    <Grid args={[width, depth]} position={[0, 0.03, 0]} cellSize={10} sectionSize={50} cellColor={dark ? '#3d7898' : '#91bdd4'} sectionColor={dark ? '#75bce2' : '#0b5e91'} cellThickness={0.48} sectionThickness={0.9} fadeDistance={Math.max(width, depth) * 1.5} fadeStrength={0.5} infiniteGrid={false}/>
    <Html position={[-width / 2 + 8, 0.3, depth / 2 - 8]} center zIndexRange={[12, 0]}><span className="plate-origin">0,0</span></Html>
  </group>;
}

function PrinterAxes({ width, depth }: { width: number; depth: number }) {
  const origin = useMemo(() => new THREE.Vector3(-width / 2 + 16, 1.2, depth / 2 - 16), [depth, width]);
  const length = Math.max(18, Math.min(width, depth) * 0.14);
  return <group>
    <arrowHelper args={[new THREE.Vector3(1, 0, 0), origin, length, '#e77878', 5, 3]}/>
    <arrowHelper args={[new THREE.Vector3(0, 0, -1), origin, length, '#63c888', 5, 3]}/>
    <arrowHelper args={[new THREE.Vector3(0, 1, 0), origin, length, '#6f8fe8', 5, 3]}/>
    <Html position={[origin.x + length + 3, origin.y, origin.z]} center zIndexRange={[12, 0]}><span className="axis-label axis-x">X</span></Html>
    <Html position={[origin.x, origin.y, origin.z - length - 3]} center zIndexRange={[12, 0]}><span className="axis-label axis-y">Y</span></Html>
    <Html position={[origin.x, origin.y + length + 3, origin.z]} center zIndexRange={[12, 0]}><span className="axis-label axis-z">Z</span></Html>
  </group>;
}

function CapturePreview({ captureKey, onCapture, distance, targetY }: { captureKey: string; onCapture: (image: string) => void; distance: number; targetY: number }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const position = camera.position.clone();
      const quaternion = camera.quaternion.clone();
      const up = camera.up.clone();
      const views: CameraView[] = ['isometric', 'front', 'right', 'top'];
      const tileWidth = gl.domElement.width;
      const tileHeight = gl.domElement.height;
      const montage = document.createElement('canvas');
      montage.width = tileWidth * 2;
      montage.height = tileHeight * 2;
      const context = montage.getContext('2d');
      views.forEach((view, index) => {
        const pose = cameraPose(view, distance, targetY);
        camera.position.set(...pose.position);
        camera.up.set(...pose.up);
        camera.lookAt(...pose.target);
        camera.updateProjectionMatrix();
        gl.render(scene, camera);
        const x = (index % 2) * tileWidth;
        const y = Math.floor(index / 2) * tileHeight;
        context?.drawImage(gl.domElement, x, y);
        if (context) {
          context.fillStyle = 'rgba(10,18,24,.72)';
          context.fillRect(x + 12, y + 12, 92, 28);
          context.fillStyle = '#fff';
          context.font = '16px sans-serif';
          context.fillText(view, x + 22, y + 32);
        }
      });
      camera.position.copy(position);
      camera.quaternion.copy(quaternion);
      camera.up.copy(up);
      camera.updateProjectionMatrix();
      gl.render(scene, camera);
      onCapture(montage.toDataURL('image/png'));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [captureKey, gl, scene, camera, onCapture, distance, targetY]);
  return null;
}

export default function ModelPreview({
  geometry, orientationId = 'as-imported', mode = 'original',
  plateSize = { x: 256, y: 256, z: 256 }, plateLabel = 'Build plate',
  overhangRegionCount = 0, spatialRegions = [], markingKind, meshTopology, onFaceSelect, captureKey, onCapture,
}: ModelPreviewProps) {
  const [showPlate, setShowPlate] = useState(true);
  const [showAxes, setShowAxes] = useState(false);
  const [cameraView, setCameraView] = useState<CameraView>('isometric');
  const [cameraReset, setCameraReset] = useState(0);
  const darkAppearance = useMediaQuery('(prefers-color-scheme: dark)');
  const comparisonOffset = geometry ? Math.max(geometry.boundingBox?.getSize(new THREE.Vector3()).x ?? 0, 30) * 0.72 : 40;
  const modelSize = useMemo(() => {
    if (!geometry) return new THREE.Vector3(1, 1, 1);
    const prepared = geometryForOrientation(geometry, mode === 'original' ? 'as-imported' : orientationId);
    const size = prepared.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    prepared.dispose();
    return size;
  }, [geometry, mode, orientationId]);
  const importedModelSize = useMemo(() => {
    if (!geometry) return new THREE.Vector3(1, 1, 1);
    const prepared = geometryForOrientation(geometry, 'as-imported');
    const size = prepared.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    prepared.dispose();
    return size;
  }, [geometry]);
  const displayHeight = mode === 'compare' ? Math.max(modelSize.z, importedModelSize.z) : modelSize.z;
  const comparisonOffsetWidth = mode === 'compare' ? Math.max(modelSize.x, importedModelSize.x) + comparisonOffset * 2 : modelSize.x;
  const modelExtent = Math.max(comparisonOffsetWidth, modelSize.y, importedModelSize.y, displayHeight, 30);
  const cameraDistance = Math.max(68, modelExtent * (mode === 'compare' ? 1.35 : 1.55));
  const targetY = displayHeight / 2;
  return <div className="preview preview-analysis">
    <Canvas dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: Boolean(onCapture) }} camera={{ fov: 44, position: [cameraDistance, cameraDistance * 0.75, cameraDistance], near: 0.1, far: cameraDistance * 8 }} shadows>
      <color attach="background" args={[darkAppearance ? '#1b221f' : '#f7f7f2']}/>
      <hemisphereLight args={[darkAppearance ? '#dce9e4' : '#ffffff', '#46554f', darkAppearance ? 1.6 : 1.25]}/>
      <directionalLight castShadow position={[cameraDistance * .45, cameraDistance * .8, cameraDistance * .35]} intensity={2.25}/>
      <directionalLight position={[-cameraDistance * .35, cameraDistance * .3, -cameraDistance * .25]} intensity={0.75}/>
      <CameraPreset view={cameraView} distance={cameraDistance} targetY={targetY} resetKey={cameraReset}/>
      {showPlate && <BuildPlate width={plateSize.x} depth={plateSize.y} ghost={cameraView === 'bottom'} dark={darkAppearance}/>}
      {showAxes && <PrinterAxes width={Math.max(modelSize.x * 1.4, 60)} depth={Math.max(modelSize.y * 1.4, 60)}/>}
      {geometry && <group rotation={[-Math.PI / 2, 0, 0]}>
        {mode === 'compare'
          ? <><PreparedModel geometry={geometry} orientationId="as-imported" color="#8a969c" opacity={0.72} position={[-comparisonOffset, 0, 0]}/><PreparedModel geometry={geometry} orientationId={orientationId} position={[comparisonOffset, 0, 0]}/></>
          : <PreparedModel geometry={geometry} orientationId={mode === 'original' ? 'as-imported' : orientationId} risk={mode === 'risk'} spatialRegions={mode === 'spatial' ? spatialRegions : []} meshTopology={mode === 'mesh' ? meshTopology : undefined} onFaceSelect={mode === 'spatial' && markingKind ? onFaceSelect : undefined}/>}
      </group>}
      {showPlate && <ContactShadows position={[0, 0.05, 0]} scale={Math.max(plateSize.x, plateSize.y) * .8} opacity={darkAppearance ? .42 : .25} blur={2.6} far={Math.max(modelSize.z, 40) * 1.4}/>}
      <OrbitControls makeDefault target={[0, targetY, 0]}/>
      {geometry && captureKey && onCapture && <CapturePreview captureKey={captureKey} onCapture={onCapture} distance={cameraDistance} targetY={targetY}/>}
    </Canvas>
    {mode === 'spatial' && markingKind && <div className="spatial-selection-banner"><b>Select an area on the model</b><span>Click the surface where {markingKind === 'load-bearing' ? 'force is applied' : markingKind === 'mating-surface' ? 'another part must fit' : markingKind === 'visible-surface' ? 'surface quality matters most' : 'the thin feature matters'}.</span></div>}
    <div className="scene-controls"><div><button onClick={() => setCameraReset(current => current + 1)}>Fit model</button><button className={showPlate ? 'active' : ''} aria-pressed={showPlate} onClick={() => setShowPlate(current => !current)}>Build plate</button><button className={showAxes ? 'active' : ''} aria-pressed={showAxes} onClick={() => setShowAxes(current => !current)}>Axes</button></div><label>View<select value={cameraView} onChange={event => { setCameraView(event.target.value as CameraView); setCameraReset(current => current + 1); }}><option value="isometric">Isometric</option><option value="top">Top</option><option value="front">Front</option><option value="back">Back</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></label></div>
    {mode === 'risk' && <div className="risk-legend"><b>{overhangRegionCount ? `${overhangRegionCount} area${overhangRegionCount === 1 ? '' : 's'} may require support` : 'No angle-based overhangs found'}</b><span><i className="risk-normal"/>Model</span><span><i className="risk-bed"/>Bed contact</span><span><i className="risk-overhang"/>Support likely</span><span><i className="risk-severe"/>Downward face</span><small>Angle-based geometry check, not a print simulation.</small></div>}
    {mode === 'spatial' && <div className="spatial-legend"><b>Important areas</b><span><i className="spatial-load"/>Force applied</span><span><i className="spatial-mating"/>Must fit</span><span><i className="spatial-visible"/>Must look good</span><span><i className="spatial-thin"/>Functionally thin</span><small>{markingKind ? 'The selected connected surface will be used when the plan is recalculated.' : 'Bright overlays are the areas currently proposed or used by the plan.'}</small></div>}
    {mode === 'mesh' && <div className="mesh-legend"><b>Mesh integrity review</b><span><i className="mesh-boundary"/>Open edge area</span><span><i className="mesh-non-manifold"/>Shared or overlapping edge area</span><small>The highlight is diagnostic only. It does not change the model or plan.</small></div>}
    {mode === 'compare' && <div className="comparison-legend"><span>Imported</span><span>Preview orientation</span></div>}
    {showPlate && <div className="plate-size-label">{plateLabel} {plateSize.x} × {plateSize.y} mm</div>}
  </div>;
}
