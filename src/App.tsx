import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BufferGeometry } from 'three';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { analysisForOrientation, chooseOrientation, compareOrientations } from './geometry/stl';
import {
  analyzeSpatialCandidates, confirmCandidate, confirmedRegion,
  emptySpatialManufacturingIntent, facePatchRegion, normalizeSpatialManufacturingIntent,
  rejectSpatialCandidate, replaceSpatialRegion, setConfirmedLoadAxis, setSpatialRegionNotApplicable,
} from './geometry/spatialIntent';
import { importModel } from './geometry/importModel';
import { evaluateRules } from './rules/engine';
import { ruleEvidenceById, rules } from './rules/load';
import { checkBuildVolume, checkMaterialCompatibility } from './material/compatibility';
import { assessMaterialCandidate, evaluateMaterialPlan, planForMaterial } from './material/catalog';
import { assessFilamentProduct, filamentProductProfile, filamentProductsForFamily, matchingCompatibleFilamentProduct, planForFilamentProduct, selectedFilamentProductMatchesPlan } from './material/products';
import { getPrinter, printerAgnosticProfile, printerProfiles } from './printers/profiles';
import { analyzeWithLocalSemanticAI, analyzeWithOpenAI, criticalDimensionQuestion, localModelAnalysis, prepareIntelligenceForReview, questionnaireFromIntelligence, refineLocalIntelligence } from './ai/modelIntelligence';
import { describeObjectUnderstanding } from './ai/objectUnderstanding';
import { packageFileName, serializeRecommendations } from './export/manufacturing';
import { adapterPlaceholders, mergeDetectedAdapters, suggestSlicerTarget, supportsPrinter } from './export/adapters';
import { PlanPreferenceControl, RecommendedKeySettings } from './results/RecommendationResults';
import { buildPlanPreferenceCandidates, isPlanPreference, planPreferenceDefinition, planPreferenceDefinitions } from './planning/preferences';
import { loadApplicationPreferences, saveApplicationPreferences } from './preferences/application';
import type { ApplicationPreferences } from './preferences/application';
import { OptionPicker } from './components/OptionPicker';
import { assessDecisionReadiness } from './decision/readiness';
import { deriveWorkflowStage, isPreparationComplete, prepareStatus } from './workflow/state';
import { analyzePurposeContext } from './workflow/decisionAutomation';
import { intentFactUsable } from './intent/manufacturingIntent';
import type { AIConnection, ModelIntelligence } from './ai/modelIntelligence';
import type { ChecklistField, CompatibilityNotice, ManufacturingPackageResult, Material, ModelAnalysis, PackageValidationReport, PlanPreference, Questionnaire, Recommendation, SlicerAdapterStatus, SlicerTarget, SpatialManufacturingIntent, SpatialRegion, SpatialRegionKind } from './types';
import './styles.css';
import './desktop-mvp.css';
import './workflow-v4.css';
import './accessibility-v5.css';

type View = 'import' | 'analysis' | 'export';
type PreviewMode = 'original' | 'recommended' | 'risk' | 'compare' | 'spatial' | 'mesh';
type UiIconName = 'model' | 'printer' | 'material' | 'orientation' | 'support' | 'layer' | 'walls' | 'infill' | 'package' | 'check' | 'lock' | 'settings' | 'folder' | 'info';
const LazyModelPreview = lazy(() => import('./components/ModelPreview'));

const slicerIcon: Partial<Record<SlicerTarget, string>> = {
  bambu: '/slicer-icons/bambu-studio.png',
  orca: '/slicer-icons/orca-slicer.png',
  prusa: '/slicer-icons/prusa-slicer.png',
  cura: '/slicer-icons/ultimaker-cura.png',
  creality: '/slicer-icons/creality-print.png',
};
const slicerAccent: Record<SlicerTarget, string> = {
  generic: '#1c8f70', bambu: '#00a846', orca: '#13a9ad', prusa: '#f26a21', cura: '#1769d2', creality: '#77b900',
};
const fileNameFromPath = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}
function UiIcon({ name }: { name: UiIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {name === 'model' && <><path d="m12 2.8 8 4.5v9.3l-8 4.6-8-4.6V7.3z"/><path d="m4.2 7.4 7.8 4.5 7.8-4.5M12 12v9"/></>}
    {name === 'printer' && <><path d="M5 8.5V4h14v4.5M5 17.5H3.5v-9h17v9H19"/><path d="M6 14h12v7H6zM16.5 11h.01"/></>}
    {name === 'material' && <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5c3.1 2.4 4.5 5.1 4.5 8.5S15.1 18.1 12 20.5"/></>}
    {name === 'orientation' && <><path d="M7 7h6V3l5 5-5 5V9H7a3 3 0 0 0-3 3"/><path d="M17 17h-6v4l-5-5 5-5v4h6a3 3 0 0 0 3-3"/></>}
    {name === 'support' && <><path d="M4 20h16M6 20V9h12v11M8 9l4-5 4 5M9 20l3-6 3 6"/></>}
    {name === 'layer' && <><path d="m12 3 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4"/></>}
    {name === 'walls' && <><path d="M4 20V4h16v16zM8 20V8h8v12M8 8l4-4 4 4"/></>}
    {name === 'infill' && <><path d="M4 4h16v16H4zM4 12l8-8 8 8-8 8zM4 4l16 16M20 4 4 20"/></>}
    {name === 'package' && <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/><path d="M8 5.2 16 10"/></>}
    {name === 'check' && <path d="m5 12.5 4.2 4.2L19 7"/>}
    {name === 'lock' && <><rect x="5.5" y="10" width="13" height="10" rx="2"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/></>}
    {name === 'settings' && <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.51-1H3v-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.51 1H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></>}
    {name === 'folder' && <><path d="M3.5 6.5h6l2 2h9v10.5h-17z"/><path d="M3.5 8.5v-3h6l2 2"/></>}
    {name === 'info' && <><circle cx="12" cy="12" r="9"/><path d="M12 10.5V17M12 7.2h.01"/></>}
  </svg>;
}

function PrinterPicker({ value, onChange, label, emptyLabel, emptyDescription }: { value: string; onChange: (value: string) => void; label: string; emptyLabel: string; emptyDescription: string }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number; maxHeight: number }>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const selected = printerProfiles.find(profile => profile.id === value);
  const manufacturers = useMemo(() => printerProfiles.reduce<Array<{ manufacturer: string; profiles: typeof printerProfiles }>>((groups, profile) => {
    const group = groups.find(item => item.manufacturer === profile.manufacturer);
    if (group) group.profiles.push(profile);
    else groups.push({ manufacturer: profile.manufacturer, profiles: [profile] });
    return groups;
  }, []), []);

  const positionMenu = () => {
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    const margin = 12;
    const width = Math.min(window.innerWidth - margin * 2, window.innerWidth < 720 ? 340 : window.innerWidth < 1080 ? 460 : 660);
    const preferredHeight = Math.min(520, window.innerHeight - margin * 2);
    const top = Math.max(margin, Math.min(bounds.bottom + 6, window.innerHeight - preferredHeight - margin));
    const left = Math.max(margin, Math.min(bounds.right - width, window.innerWidth - width - margin));
    setMenuPosition({ top, left, width, maxHeight: window.innerHeight - top - margin });
  };

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); setOpen(false); trigger.current?.focus();
    };
    const reposition = () => positionMenu();
    positionMenu();
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeWithEscape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeWithEscape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const choose = (id: string) => {
    onChange(id); setOpen(false); trigger.current?.focus();
  };

  const popup = open && menuPosition ? createPortal(<div ref={menu} className="printer-picker-menu" role="listbox" aria-label={label} style={menuPosition}>
    <button type="button" className={`printer-picker-option printer-picker-empty ${!value ? 'selected' : ''}`} role="option" aria-selected={!value} onClick={() => choose('')}>
      <span className="printer-picker-check">{!value && <UiIcon name="check"/>}</span><span><b>{emptyLabel}</b><small>{emptyDescription}</small></span>
    </button>
    <div className="printer-picker-groups">{manufacturers.map(group => <section className="printer-picker-group" role="group" aria-label={group.manufacturer} key={group.manufacturer}><div className="printer-picker-group-label">{group.manufacturer}</div>{group.profiles.map(profile => <button type="button" className={`printer-picker-option ${value === profile.id ? 'selected' : ''}`} role="option" aria-selected={value === profile.id} key={profile.id} onClick={() => choose(profile.id)}>
      <span className="printer-picker-check">{value === profile.id && <UiIcon name="check"/>}</span><span><b>{profile.model}</b><small>{profile.buildVolume.x} × {profile.buildVolume.y} × {profile.buildVolume.z} mm · {profile.enclosed ? 'Enclosed' : 'Open frame'}</small></span>
    </button>)}</section>)}</div>
  </div>, document.body) : null;

  return <>
    <div className="printer-picker" ref={root}><button ref={trigger} type="button" className="printer-picker-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => { if (!open) positionMenu(); setOpen(current => !current); }} onKeyDown={event => {
      if (event.key === 'ArrowDown' && !open) { event.preventDefault(); positionMenu(); setOpen(true); }
    }}>
      <span><b>{selected ? `${selected.manufacturer} · ${selected.model}` : emptyLabel}</b></span><span className="printer-picker-chevron" aria-hidden="true">⌄</span>
    </button></div>{popup}
  </>;
}
/*
 * The 3D preview implementation lives in components/ModelPreview and is loaded
 * only after a model reaches the analysis workspace. This legacy block remains
 * commented during the current dirty-branch integration and can be deleted
 * mechanically once the surrounding concurrent UI work is consolidated.
 *
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

function PreparedModel({ geometry, orientationId, risk = false, spatialRegions = [], color = '#b8bcba', position = [0, 0, 0], opacity = 1, onFaceSelect }: { geometry: THREE.BufferGeometry; orientationId: string; risk?: boolean; spatialRegions?: SpatialRegion[]; color?: string; position?: [number, number, number]; opacity?: number; onFaceSelect?: (faceIndex: number) => void }) {
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
      event.stopPropagation(); onFaceSelect(event.faceIndex);
    }}><meshStandardMaterial color={risk || spatialRegions.length ? '#ffffff' : color} vertexColors={risk || spatialRegions.length > 0} roughness={0.52} metalness={0.03} transparent={opacity < 1} opacity={opacity}/><Edges threshold={32} color={risk ? '#34413c' : '#63716b'}/></mesh>
    {!risk && spatialRegions.map(region => <SpatialRegionOverlay geometry={prepared} region={region} key={region.id}/>)}
  </group>;
}

function CameraPreset({ view, distance, targetY, resetKey }: { view: CameraView; distance: number; targetY: number; resetKey: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const pose = cameraPose(view, distance, targetY);
    camera.position.set(...pose.position); camera.up.set(...pose.up); camera.lookAt(...pose.target); camera.updateProjectionMatrix();
  }, [camera, distance, resetKey, targetY, view]);
  return null;
}

function BuildPlate({ width, depth, ghost, dark }: { width: number; depth: number; ghost: boolean; dark: boolean }) {
  const plateColor = dark ? '#0b2a3f' : '#e8efec';
  const cellColor = dark ? '#3d7898' : '#91bdd4';
  const sectionColor = dark ? '#75bce2' : '#0b5e91';
  return <group>
    <mesh position={[0, -0.85, 0]} receiveShadow><boxGeometry args={[width, 1.7, depth]}/><meshStandardMaterial color={plateColor} roughness={0.82} transparent opacity={ghost ? 0.13 : 0.96} depthWrite={!ghost}/></mesh>
    <Grid args={[width, depth]} position={[0, 0.03, 0]} cellSize={10} sectionSize={50} cellColor={cellColor} sectionColor={sectionColor} cellThickness={0.48} sectionThickness={0.9} fadeDistance={Math.max(width, depth) * 1.5} fadeStrength={0.5} infiniteGrid={false}/>
    <Html position={[-width / 2 + 8, 0.3, depth / 2 - 8]} center><span className="plate-origin">0,0</span></Html>
  </group>;
}

function PrinterAxes({ width, depth }: { width: number; depth: number }) {
  const origin = useMemo(() => new THREE.Vector3(-width / 2 + 16, 1.2, depth / 2 - 16), [depth, width]);
  const length = Math.max(18, Math.min(width, depth) * 0.14);
  return <group>
    <arrowHelper args={[new THREE.Vector3(1, 0, 0), origin, length, '#e77878', 5, 3]}/>
    <arrowHelper args={[new THREE.Vector3(0, 0, -1), origin, length, '#63c888', 5, 3]}/>
    <arrowHelper args={[new THREE.Vector3(0, 1, 0), origin, length, '#6f8fe8', 5, 3]}/>
    <Html position={[origin.x + length + 3, origin.y, origin.z]} center><span className="axis-label axis-x">X</span></Html>
    <Html position={[origin.x, origin.y, origin.z - length - 3]} center><span className="axis-label axis-y">Y</span></Html>
    <Html position={[origin.x, origin.y + length + 3, origin.z]} center><span className="axis-label axis-z">Z</span></Html>
  </group>;
}

function CapturePreview({ captureKey, onCapture, distance, targetY }: { captureKey: string; onCapture: (image: string) => void; distance: number; targetY: number }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const position = camera.position.clone(); const quaternion = camera.quaternion.clone(); const up = camera.up.clone();
      const views: CameraView[] = ['isometric', 'front', 'right', 'top'];
      const tileWidth = gl.domElement.width; const tileHeight = gl.domElement.height;
      const montage = document.createElement('canvas'); montage.width = tileWidth * 2; montage.height = tileHeight * 2;
      const context = montage.getContext('2d');
      views.forEach((view, index) => {
        const pose = cameraPose(view, distance, targetY);
        camera.position.set(...pose.position); camera.up.set(...pose.up); camera.lookAt(...pose.target); camera.updateProjectionMatrix();
        gl.render(scene, camera);
        const x = (index % 2) * tileWidth; const y = Math.floor(index / 2) * tileHeight;
        context?.drawImage(gl.domElement, x, y);
        if (context) { context.fillStyle = 'rgba(10,18,24,.72)'; context.fillRect(x + 12, y + 12, 92, 28); context.fillStyle = '#fff'; context.font = '16px sans-serif'; context.fillText(view, x + 22, y + 32); }
      });
      camera.position.copy(position); camera.quaternion.copy(quaternion); camera.up.copy(up); camera.updateProjectionMatrix(); gl.render(scene, camera);
      onCapture(montage.toDataURL('image/png'));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [captureKey, gl, scene, camera, onCapture, distance, targetY]);
  return null;
}

function Preview({ geometry, orientationId = 'as-imported', mode = 'original', plateSize = { x: 256, y: 256, z: 256 }, plateLabel = 'Build plate', overhangRegionCount = 0, spatialRegions = [], markingKind, onFaceSelect, captureKey, onCapture }: { geometry?: THREE.BufferGeometry; orientationId?: string; mode?: PreviewMode; plateSize?: { x: number; y: number; z: number }; plateLabel?: string; overhangRegionCount?: number; spatialRegions?: SpatialRegion[]; markingKind?: SpatialRegionKind; onFaceSelect?: (faceIndex: number) => void; captureKey?: string; onCapture?: (image: string) => void }) {
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
    prepared.dispose(); return size;
  }, [geometry, mode, orientationId]);
  const importedModelSize = useMemo(() => {
    if (!geometry) return new THREE.Vector3(1, 1, 1);
    const prepared = geometryForOrientation(geometry, 'as-imported');
    const size = prepared.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    prepared.dispose(); return size;
  }, [geometry]);
  const displayHeight = mode === 'compare' ? Math.max(modelSize.z, importedModelSize.z) : modelSize.z;
  const comparisonWidth = mode === 'compare' ? Math.max(modelSize.x, importedModelSize.x) + comparisonOffset * 2 : modelSize.x;
  const modelExtent = Math.max(comparisonWidth, modelSize.y, importedModelSize.y, displayHeight, 30);
  const cameraDistance = Math.max(68, modelExtent * (mode === 'compare' ? 1.35 : 1.55));
  const targetY = displayHeight / 2;
  const axesWidth = Math.max(modelSize.x * 1.4, 60);
  const axesDepth = Math.max(modelSize.y * 1.4, 60);
  return <div className="preview preview-analysis"><Canvas dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: Boolean(onCapture) }} camera={{ fov: 44, position: [cameraDistance, cameraDistance * 0.75, cameraDistance], near: 0.1, far: cameraDistance * 8 }} shadows>
    <color attach="background" args={[darkAppearance ? '#1b221f' : '#f7f7f2']}/><hemisphereLight args={[darkAppearance ? '#dce9e4' : '#ffffff', '#46554f', darkAppearance ? 1.6 : 1.25]}/><directionalLight castShadow position={[cameraDistance * .45, cameraDistance * .8, cameraDistance * .35]} intensity={2.25}/><directionalLight position={[-cameraDistance * .35, cameraDistance * .3, -cameraDistance * .25]} intensity={0.75}/>
    <CameraPreset view={cameraView} distance={cameraDistance} targetY={targetY} resetKey={cameraReset}/>
    {showPlate && <BuildPlate width={plateSize.x} depth={plateSize.y} ghost={cameraView === 'bottom'} dark={darkAppearance}/>}
    {showAxes && <PrinterAxes width={axesWidth} depth={axesDepth}/>}
    {geometry && <group rotation={[-Math.PI / 2, 0, 0]}>
      {mode === 'compare' ? <><PreparedModel geometry={geometry} orientationId="as-imported" color="#8a969c" opacity={0.72} position={[-comparisonOffset, 0, 0]}/><PreparedModel geometry={geometry} orientationId={orientationId} position={[comparisonOffset, 0, 0]}/></> : <PreparedModel geometry={geometry} orientationId={mode === 'original' ? 'as-imported' : orientationId} risk={mode === 'risk'} spatialRegions={mode === 'spatial' ? spatialRegions : []} onFaceSelect={mode === 'spatial' && markingKind ? onFaceSelect : undefined}/>}
    </group>}
    {showPlate && <ContactShadows position={[0, 0.05, 0]} scale={Math.max(plateSize.x, plateSize.y) * .8} opacity={darkAppearance ? .42 : .25} blur={2.6} far={Math.max(modelSize.z, 40) * 1.4}/>}
    <OrbitControls makeDefault target={[0, targetY, 0]}/>
    {geometry && captureKey && onCapture && <CapturePreview captureKey={captureKey} onCapture={onCapture} distance={cameraDistance} targetY={targetY}/>}
  </Canvas>
    {mode === 'spatial' && markingKind && <div className="spatial-selection-banner"><b>Select an area on the model</b><span>Click the surface where {markingKind === 'load-bearing' ? 'force is applied' : markingKind === 'mating-surface' ? 'another part must fit' : markingKind === 'visible-surface' ? 'surface quality matters most' : 'the thin feature matters'}.</span></div>}
    <div className="scene-controls"><div><button onClick={() => setCameraReset(current => current + 1)}>Fit model</button><button className={showPlate ? 'active' : ''} aria-pressed={showPlate} onClick={() => setShowPlate(current => !current)}>Build plate</button><button className={showAxes ? 'active' : ''} aria-pressed={showAxes} onClick={() => setShowAxes(current => !current)}>Axes</button></div><label>View<select value={cameraView} onChange={event => { setCameraView(event.target.value as CameraView); setCameraReset(current => current + 1); }}><option value="isometric">Isometric</option><option value="top">Top</option><option value="front">Front</option><option value="back">Back</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></label></div>
    {mode === 'risk' && <div className="risk-legend"><b>{overhangRegionCount ? `${overhangRegionCount} area${overhangRegionCount === 1 ? '' : 's'} may require support` : 'No angle-based overhangs found'}</b><span><i className="risk-normal"/>Model</span><span><i className="risk-bed"/>Bed contact</span><span><i className="risk-overhang"/>Support likely</span><span><i className="risk-severe"/>Downward face</span><small>Angle-based geometry check, not a print simulation.</small></div>}
    {mode === 'spatial' && <div className="spatial-legend"><b>Important areas</b><span><i className="spatial-load"/>Force applied</span><span><i className="spatial-mating"/>Must fit</span><span><i className="spatial-visible"/>Must look good</span><span><i className="spatial-thin"/>Functionally thin</span><small>{markingKind ? 'The selected connected surface will be used when the plan is recalculated.' : 'Bright overlays are the areas currently proposed or used by the plan.'}</small></div>}
    {mode === 'compare' && <div className="comparison-legend"><span>Imported</span><span>Preview orientation</span></div>}
    {showPlate && <div className="plate-size-label">{plateLabel} {plateSize.x} × {plateSize.y} mm</div>}
  </div>;
}
*/

function SpatialIntentPanel({ spatial, loadRequired, matingRequired, visibleRequired, planarCandidateId, thinCandidateId, thinCandidateMm, thicknessCoverage, markingKind, onLoadAxis, onShowArea, onMark, onUseCandidate, onRejectCandidate, onNotApplicable, onReset }: {
  spatial: SpatialManufacturingIntent; loadRequired: boolean; matingRequired: boolean; visibleRequired: boolean;
  planarCandidateId?: string; thinCandidateId?: string; thinCandidateMm?: number; thicknessCoverage?: { sampledTriangles: number; measuredTriangles: number; totalTriangles: number };
  markingKind?: SpatialRegionKind; onLoadAxis: (axis: 'x' | 'y' | 'z' | 'not-applicable') => void;
  onShowArea: (kind: SpatialRegionKind) => void; onMark: (kind: SpatialRegionKind) => void; onUseCandidate: (kind: SpatialRegionKind) => void; onRejectCandidate: (kind: SpatialRegionKind) => void; onNotApplicable: (kind: SpatialRegionKind) => void; onReset: () => void;
}) {
  const appliedDecisionCount = spatial.regions.filter(region => region.status === 'confirmed').length
    + (spatial.loadAxis.status === 'confirmed' || spatial.loadAxis.status === 'not-applicable' ? 1 : 0);
  const requiredReviewCount = [
    loadRequired && spatial.loadAxis.status !== 'confirmed' && spatial.loadAxis.status !== 'not-applicable',
    loadRequired && !confirmedRegion(spatial, 'load-bearing') && !spatial.notApplicable.includes('load-bearing'),
    matingRequired && !confirmedRegion(spatial, 'mating-surface') && !spatial.notApplicable.includes('mating-surface'),
    visibleRequired && !confirmedRegion(spatial, 'visible-surface') && !spatial.notApplicable.includes('visible-surface'),
  ].filter(Boolean).length;
  const hasChanges = spatial.regions.length > 0 || spatial.notApplicable.length > 0 || spatial.rejectedCandidateIds.length > 0 || spatial.loadAxis.status === 'confirmed' || spatial.loadAxis.status === 'not-applicable';
  const copy: Record<SpatialRegionKind, { question: string; confirmed: string; detected: string; applied: string; effect: string }> = {
    'load-bearing': {
      question: 'Where is force applied?',
      confirmed: 'Force application area confirmed',
      detected: 'A broad surface is available as a starting point, but geometry cannot identify the real load path.',
      applied: 'Check Make will account for this area when comparing strength-oriented build directions.',
      effect: 'Affects orientation and layer-direction reasoning.',
    },
    'mating-surface': {
      question: 'Which surface must fit another part?',
      confirmed: 'Fit-critical surface confirmed',
      detected: 'A broad surface is available as a starting point, but its mating role needs your confirmation.',
      applied: 'Check Make will protect fit and surface quality on this interface.',
      effect: 'Affects orientation, support contact and seam placement.',
    },
    'visible-surface': {
      question: 'Which surface must look best?',
      confirmed: 'Appearance-critical surface confirmed',
      detected: 'A broad surface is available as a starting point, but appearance importance cannot be measured.',
      applied: 'Check Make will avoid unnecessary support contact and poor finish on this surface.',
      effect: 'Affects orientation, supports and seam placement.',
    },
    'critical-thin': {
      question: 'Is this thin area important to the part’s function?',
      confirmed: 'Thin area marked as important',
      detected: thinCandidateMm
        ? `Check Make detected a locally thin area of approximately ${thinCandidateMm.toFixed(2)} mm.`
        : 'Check Make detected a locally thin area.',
      applied: 'Check Make will protect this area when choosing structure and process settings.',
      effect: 'Affects wall strategy and risk reporting; this is not a strength simulation.',
    },
  };
  const regionRow = (kind: SpatialRegionKind, required: boolean, candidateId?: string) => {
    const region = confirmedRegion(spatial, kind); const notApplicable = spatial.notApplicable.includes(kind);
    if (kind === 'critical-thin' && !candidateId && !region) return null;
    const candidateAvailable = Boolean(!notApplicable && candidateId && !spatial.rejectedCandidateIds.includes(`${kind}:${candidateId}`));
    const words = copy[kind];
    return <div className={`spatial-decision-row ${region || notApplicable ? 'resolved' : required ? 'required' : ''}`} key={kind}>
      <span><span className="spatial-row-title"><b>{region ? words.confirmed : words.question}</b><i>{required ? 'Needed for this plan' : 'Optional refinement'}</i></span><small>{region ? words.applied : notApplicable ? 'You marked this as not relevant to the part.' : candidateAvailable ? words.detected : 'No reliable automatic area was found. Select it on the model if it matters.'}</small><em><strong>Why it matters:</strong> {words.effect}</em></span>
      <div>
        {(candidateAvailable || region) && <button type="button" onClick={() => onShowArea(kind)}>Show on model</button>}
        {candidateAvailable && !region && <button type="button" className="primary-area-action" onClick={() => onUseCandidate(kind)}>Use suggestion</button>}
        <button type="button" className={markingKind === kind ? 'active' : ''} onClick={() => onMark(kind)}>{markingKind === kind ? 'Click a model surface…' : region ? 'Change area' : 'Pick on model'}</button>
        {!region && candidateAvailable && <button type="button" onClick={() => kind === 'critical-thin' ? onNotApplicable(kind) : onRejectCandidate(kind)}>Ignore</button>}
        {required && <button type="button" onClick={() => onNotApplicable(kind)}>{region ? 'Remove from plan' : 'No specific area'}</button>}
      </div>
    </div>;
  };
  return <section className="spatial-intent-panel" aria-labelledby="spatial-intent-title">
    <div className="spatial-intent-heading"><div><h2 id="spatial-intent-title">Important areas</h2><p>Check Make can suggest geometric candidates, but only an area you confirm affects the plan. Highlight a suggestion, accept it, or pick a different surface on the model.</p></div><span className={requiredReviewCount ? 'needs-review' : ''}>{requiredReviewCount ? `${requiredReviewCount} to review` : appliedDecisionCount ? `${appliedDecisionCount} used in plan` : 'Optional'}</span></div>
    <p className="spatial-guidance"><b>You choose the surface.</b> A force area influences orientation, a fit or visible surface is kept away from support and seams, and a critical thin area influences structural settings. These are consequences of your markings, not separate choices.</p>
    {loadRequired && <div className={`spatial-axis-row ${spatial.loadAxis.status === 'confirmed' || spatial.loadAxis.status === 'not-applicable' ? 'resolved' : 'required'}`}><span><span className="spatial-row-title"><b>Which model direction carries the main load?</b><i>Needed for this plan</i></span><small>{spatial.loadAxis.status === 'confirmed' ? `${spatial.loadAxis.axis.toUpperCase()} direction confirmed. Check Make will account for layer direction.` : spatial.loadAxis.status === 'not-applicable' ? 'You confirmed that no single direction applies.' : 'Choose X, Y or Z using the axes in the model view. If forces come from several directions, choose no single direction.'}</small><em><strong>Why it matters:</strong> Layer direction can change functional strength.</em></span><div>{(['x', 'y', 'z'] as const).map(axis => <button type="button" className={spatial.loadAxis.axis === axis && spatial.loadAxis.status === 'confirmed' ? 'active' : ''} onClick={() => onLoadAxis(axis)} key={axis}>{axis.toUpperCase()}</button>)}<button type="button" onClick={() => onLoadAxis('not-applicable')}>No single direction</button></div></div>}
    {regionRow('load-bearing', loadRequired, planarCandidateId)}
    {regionRow('mating-surface', matingRequired, planarCandidateId)}
    {regionRow('visible-surface', visibleRequired, planarCandidateId)}
    {regionRow('critical-thin', false, thinCandidateId)}
    {hasChanges && <div className="spatial-reset"><span><b>Changed the wrong area?</b><small>Restore the original geometry suggestions and review them again.</small></span><button type="button" onClick={onReset}>Reset important areas</button></div>}
    {thicknessCoverage && <details className="spatial-technical"><summary>Technical detection details</summary><p className="spatial-coverage">Thickness screening measured {thicknessCoverage.measuredTriangles} of {thicknessCoverage.sampledTriangles} sampled faces across {thicknessCoverage.totalTriangles} total triangles. Missing intersections remain unevaluated.</p></details>}
  </section>;
}

function InterpretationSummary({
  intelligence, purposeClarification, onPurposeClarification, onApplyPurposeClarification,
}: {
  intelligence: ModelIntelligence;
  purposeClarification: string;
  onPurposeClarification: (value: string) => void;
  onApplyPurposeClarification: () => void;
}) {
  const hypothesis = intelligence.objectHypothesis;
  if (!hypothesis) return null;
  const needsPurpose = !intelligence.purposeConfirmed && hypothesis.purpose.status !== 'hypothesized';
  const relevantEvidence = hypothesis.evidence
    .filter(item => item.source === 'user-statement' || item.source === 'language-match' || item.source === 'ai-hypothesis')
    .sort((left, right) => right.confidence - left.confidence);
  const evidence = (relevantEvidence.length ? relevantEvidence : hypothesis.evidence)
    .slice(0, 3);
  const clarificationApplied = Boolean(
    purposeClarification.trim()
    && intelligence.purposeConfirmed
    && intelligence.userEvidence.includes(purposeClarification.trim()),
  );
  return <section className="interpretation-summary">
    <div><span className="kicker">CHECK MAKE’S UNDERSTANDING</span><strong>{hypothesis.identity.value}</strong><p>{describeObjectUnderstanding(intelligence)}</p></div>
    <span>{clarificationApplied ? 'Updated' : 'Review'}</span>
    {needsPurpose && <div className="understanding-clarification"><b>What should this object do?</b><small>The model and Context did not establish a clear function. Add only the missing purpose here; Check Make waits until you apply the complete description.</small><textarea aria-label="Describe what the object should do" value={purposeClarification} onChange={event => onPurposeClarification(event.target.value)} placeholder="Example: Maintains the correct spacing in a parasol base."/><button type="button" className="primary apply-understanding" disabled={!purposeClarification.trim()} onClick={onApplyPurposeClarification}>Apply</button></div>}
    <details><summary>Why Check Make reached this understanding</summary><ul>{evidence.map(item => <li key={item.id}>{item.statement}</li>)}</ul><p>This is an interpretation of your Context and the measured geometry. Review the assumptions below before they affect the manufacturing plan.</p></details>
  </section>;
}

function ProcessBar({ stage, decisions, settingsOpen, onToggleSettings }: { stage: View; decisions: number; settingsOpen: boolean; onToggleSettings: () => void }) {
  const steps = [
    { id: 'import' as View, label: 'Inspect', detail: stage === 'import' ? 'Add model & context' : 'Complete' },
    { id: 'analysis' as View, label: 'Prepare', detail: stage === 'import' ? 'Waiting' : stage === 'analysis' ? prepareStatus(decisions) : 'Complete' },
    { id: 'export' as View, label: 'Export', detail: stage === 'export' ? 'Ready' : 'Locked' },
  ];
  const order = steps.map(step => step.id);
  const activeIndex = order.indexOf(stage);
  return <header className="workflow-header">
    <div className="workflow-brand" aria-label="CHECK / MAKE">
      <img className="workflow-brand-symbol" src="/check-make-symbol.svg" alt=""/>
      <span className="workflow-wordmark" aria-hidden="true"><b>CHECK</b><i>/</i><b>MAKE</b></span>
    </div>
    <div className="process-flow" aria-label="Check Make progress">{steps.map((step, index) => {
      const complete = index < activeIndex;
      const active = index === activeIndex;
      return <div className={`process-step ${complete ? 'complete' : ''} ${active ? 'active' : ''} ${index > activeIndex ? 'locked' : ''}`} key={step.id} aria-current={active ? 'step' : undefined}>
        {index > 0 && <i className="process-connector"/>}
        <span className="process-marker">{complete ? <UiIcon name="check"/> : index > activeIndex ? <UiIcon name="lock"/> : index + 1}</span>
        <span className="process-copy"><b>{step.label}</b><small>{step.detail}</small></span>
      </div>;
    })}</div>
    <button className={`settings-trigger ${settingsOpen ? 'active' : ''}`} aria-label="Application settings" aria-expanded={settingsOpen} onClick={onToggleSettings}><UiIcon name="settings"/></button>
  </header>;
}

export default function App() {
  const [preferences, setPreferences] = useState<ApplicationPreferences>(() => loadApplicationPreferences());
  const [inheritedPlanPreference, setInheritedPlanPreference] = useState<PlanPreference>(() => preferences.defaultPlanPreference);
  const [projectPlanPreference, setProjectPlanPreference] = useState<PlanPreference>();
  const [view, setView] = useState<View>('import');
  const [analysis, setAnalysis] = useState<ModelAnalysis>();
  const [geometry, setGeometry] = useState<BufferGeometry>();
  const [sourcePath, setSourcePath] = useState<string>();
  const [sourceModelPath, setSourceModelPath] = useState<string>();
  const [previewImage, setPreviewImage] = useState<string>();
  const [intelligence, setIntelligence] = useState<ModelIntelligence>();
  const [planQuestions, setPlanQuestions] = useState<ModelIntelligence['questions']>([]);
  const preserveBriefOnNextBrowserFile = useRef(true);
  const [connection, setConnection] = useState<AIConnection>(() => ({
    provider: preferences.defaultAnalysisMode === 'extended' ? preferences.extendedAIProvider : 'local',
    apiKey: '',
    model: 'gpt-5.4-mini',
    localEndpoint: 'http://localhost:8080',
    localModel: 'local-model',
    localTimeoutMs: 30_000,
  }));
  const [printerId, setPrinterId] = useState(() => preferences.defaultPrinterId);
  const [followUps, setFollowUps] = useState<Record<string, string>>({});
  const [autoFilledDecisions, setAutoFilledDecisions] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [status, setStatus] = useState('');
  const [packageResult, setPackageResult] = useState<ManufacturingPackageResult>();
  const [validationReport, setValidationReport] = useState<PackageValidationReport>();
  const [packageTarget, setPackageTarget] = useState<SlicerTarget>('generic');
  const [packageTargetManuallySelected, setPackageTargetManuallySelected] = useState(false);
  const [adapters, setAdapters] = useState<SlicerAdapterStatus[]>(adapterPlaceholders);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('recommended');
  const [previewOrientationId, setPreviewOrientationId] = useState('as-imported');
  const [spatialIntent, setSpatialIntent] = useState<SpatialManufacturingIntent>(() => emptySpatialManufacturingIntent());
  const [spatialMarkingKind, setSpatialMarkingKind] = useState<SpatialRegionKind>();
  const [spatialFocusKind, setSpatialFocusKind] = useState<SpatialRegionKind>();
  const [materialOverride, setMaterialOverride] = useState<Material>();
  const [filamentProductId, setFilamentProductId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modifyingPlan, setModifyingPlan] = useState(false);
  const [importantAreasOpen, setImportantAreasOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const modelPreview = useRef<HTMLDivElement>(null);
  const decisionPanel = useRef<HTMLElement>(null);
  const decisionInputs = useRef<Record<string, HTMLButtonElement | HTMLTextAreaElement | null>>({});
  const attemptedAutomaticFilamentSelection = useRef('');
  const manuallyAnsweredDecisions = useRef(new Set<string>());
  const automaticallyAnsweredDecisions = useRef(new Set<ChecklistField>());
  const printer = printerProfiles.find(profile => profile.id === printerId);
  const analysisPrinter = printer ?? printerAgnosticProfile;
  const previewPlate = printer?.buildVolume ?? { x: 250, y: 250, z: 250 };
  const previewOrientation = analysis?.orientations.find(candidate => candidate.id === previewOrientationId) ?? analysis?.orientations[0];
  const previewGeometryRisk = previewOrientation?.geometryRisk ?? analysis?.geometryRisk;
  const geometryWarnings = analysis?.findings?.filter(finding => finding.severity === 'warning') ?? [];
  const meshDecisionNeeded = Boolean(intelligence?.questions.some(question => question.id === 'mesh-repair') && !(followUps['mesh-repair'] ?? '').trim());
  const meshDecisionStatus = followUps['mesh-repair'] === 'closed-solid'
    ? 'Source model marked as needing repair'
    : followUps['mesh-repair'] === 'intentional'
      ? 'Separate or overlapping geometry confirmed as intentional'
      : followUps['mesh-repair'] === 'not-sure'
        ? 'Geometry remains unresolved; slicer repair may change it'
        : undefined;
  const suggestedPackageTarget = useMemo(() => suggestSlicerTarget(adapters, printerId), [adapters, printerId]);
  const suggestedPackageAdapter = adapters.find(adapter => adapter.target === suggestedPackageTarget) ?? adapterPlaceholders[0];
  const spatialCandidates = useMemo(() => geometry ? analyzeSpatialCandidates(geometry) : undefined, [geometry]);
  const questionnaire = useMemo(() => {
    if (!intelligence) return undefined;
    const answer = followUps[criticalDimensionQuestion.id];
    const criticalDimension: NonNullable<Questionnaire['criticalDimension']> =
      answer === 'xy' || answer === 'z' || answer === 'surface' ? answer : 'unknown';
    return { ...questionnaireFromIntelligence(intelligence, analysisPrinter), criticalDimension, spatialIntent };
  }, [followUps, intelligence, analysisPrinter, spatialIntent]);
  const recommendedOrientation = useMemo(() => analysis && questionnaire ? chooseOrientation(analysis, questionnaire.priority, questionnaire.manufacturingIntent, spatialIntent) : undefined, [analysis, questionnaire, spatialIntent]);
  const orientation = recommendedOrientation;
  const orientationPriority = questionnaire?.priority;
  const orientationComparisons = useMemo(() => analysis && orientationPriority ? compareOrientations(analysis, orientationPriority, questionnaire?.manufacturingIntent, spatialIntent) : [], [analysis, orientationPriority, questionnaire?.manufacturingIntent, spatialIntent]);
  const recommendedEvaluated = useMemo(() => analysisForOrientation(analysis, recommendedOrientation), [analysis, recommendedOrientation]);
  const checkMakeRecommendsSupports = (recommendedEvaluated?.overhangRatio ?? analysis?.overhangRatio ?? 0) > 0.08;
  const selectedSupportPreference = (followUps['support-preference'] ?? 'auto') as 'auto' | 'required' | 'forbidden';
  const supportOverridePreference: 'required' | 'forbidden' = checkMakeRecommendsSupports ? 'forbidden' : 'required';
  const supportRecommendationLabel = checkMakeRecommendsSupports ? 'Use removable supports where needed' : 'Print without removable supports';
  const supportOverrideLabel = checkMakeRecommendsSupports ? 'Avoid removable supports' : 'Use removable supports anyway';
  const supportRecommendationReason = checkMakeRecommendsSupports
    ? 'The selected orientation retains measured overhang exposure. Automatic supports improve reliability while limiting contact to areas the slicer identifies.'
    : 'The selected orientation is below Check Make’s support threshold, so supports would add time and surface cleanup without a measured need.';
  const supportOverrideReason = checkMakeRecommendsSupports
    ? 'Check Make will re-score orientation for support-free printing, but some overhang risk may remain.'
    : 'The slicer will generate automatic supports even though the current geometry assessment does not require them.';
  const recommendedPlan = useMemo(() => recommendedEvaluated && questionnaire ? evaluateRules(rules, recommendedEvaluated, questionnaire, ruleEvidenceById, 'recommended') : [], [questionnaire, recommendedEvaluated]);
  const preferencePlans = useMemo<Record<PlanPreference, Recommendation[]>>(() => {
    if (!recommendedEvaluated || !questionnaire) {
      return { balanced: [], faster: [], 'visual-quality': [], 'fit-accuracy': [], 'structural-margin': [] };
    }
    return Object.fromEntries(planPreferenceDefinitions.map(definition => [
      definition.id,
      definition.id === 'balanced'
        ? recommendedPlan
        : evaluateRules(rules, recommendedEvaluated, questionnaire, ruleEvidenceById, definition.objective),
    ])) as Record<PlanPreference, Recommendation[]>;
  }, [questionnaire, recommendedEvaluated, recommendedPlan]);
  const planPreferenceCandidates = useMemo(
    () => questionnaire ? buildPlanPreferenceCandidates(recommendedPlan, preferencePlans, questionnaire) : [],
    [preferencePlans, questionnaire, recommendedPlan],
  );
  const requestedPlanPreference = projectPlanPreference ?? inheritedPlanPreference;
  const requestedPlanCandidate = planPreferenceCandidates.find(candidate => candidate.id === requestedPlanPreference);
  const appliedPlanCandidate = requestedPlanCandidate?.available
    ? requestedPlanCandidate
    : planPreferenceCandidates.find(candidate => candidate.id === 'balanced');
  const preferencePlan = appliedPlanCandidate?.recommendations ?? recommendedPlan;
  const recommendedMaterial = preferencePlan.find(item => item.setting === 'material')?.value as Material | undefined;
  const materialDecision = useMemo(
    () => questionnaire && recommendedMaterial ? evaluateMaterialPlan(questionnaire, recommendedMaterial) : undefined,
    [questionnaire, recommendedMaterial],
  );
  const familyRecommendations = materialOverride ? planForMaterial(preferencePlan, materialOverride) : preferencePlan;
  const material = familyRecommendations.find(item => item.setting === 'material')?.value as Material | undefined;
  const selectedFilamentProduct = filamentProductProfile(filamentProductId);
  const productOptions = useMemo(
    () => material ? filamentProductsForFamily(material).map(profile => assessFilamentProduct(profile, printer)) : [],
    [material, printer],
  );
  const selectedProductAssessment = selectedFilamentProduct
    ? assessFilamentProduct(selectedFilamentProduct, printer)
    : undefined;
  const recommendations = selectedFilamentProduct
    && selectedFilamentProduct.family === material
    && selectedProductAssessment?.compatible
    ? planForFilamentProduct(familyRecommendations, selectedFilamentProduct)
    : familyRecommendations;
  const selectedMaterialAssessment = useMemo(
    () => questionnaire && material ? assessMaterialCandidate(questionnaire, material, materialDecision?.requirements) : undefined,
    [questionnaire, material, materialDecision?.requirements],
  );
  const materialPlanBlocked = Boolean(selectedMaterialAssessment
    && (!selectedMaterialAssessment.meetsRequirements || printer && !selectedMaterialAssessment.printerCompatible)
    || selectedProductAssessment && !selectedProductAssessment.compatible);
  const materialBlockReasons = selectedMaterialAssessment
    ? [
        ...selectedMaterialAssessment.missingRequirements.map(requirement => `${material} does not cover the confirmed ${requirement.label.toLocaleLowerCase('en-US')} requirement in Check Make’s current family-level model. ${requirement.reason}`),
        ...selectedMaterialAssessment.printerLimitations,
        ...(selectedProductAssessment?.limitations ?? []),
      ]
    : [];
  const notices = useMemo<CompatibilityNotice[]>(() => {
    if (!material || !analysis) return [];
    const loadCriticalNotice: CompatibilityNotice[] = intelligence?.manufacturingIntent
      && intentFactUsable(intelligence.manufacturingIntent.failureConsequence)
      && intelligence.manufacturingIntent.failureConsequence.value === 'safety-critical'
      ? [{ severity: 'info', message: 'Designer-stated load-critical use is included as a preparation requirement. Added print margins are not structural verification or a safety factor.' }]
      : [];
    if (!printer) return [
      { severity: 'warning', message: 'Target printer is not selected. Material capability and build volume have not yet been validated.' },
      ...(selectedProductAssessment?.warnings.map(message => ({ severity: 'info' as const, message })) ?? []),
      ...loadCriticalNotice,
    ];
    return [
      ...checkMaterialCompatibility(material, printer),
      ...(selectedProductAssessment?.warnings.map(message => ({ severity: 'info' as const, message })) ?? []),
      ...checkBuildVolume(analysis, printer),
      ...loadCriticalNotice,
    ];
  }, [material, printer, analysis, intelligence?.manufacturingIntent, selectedProductAssessment]);
  const nativeProjectTarget = packageTarget === 'bambu' || packageTarget === 'orca' || packageTarget === 'prusa' || packageTarget === 'cura' || packageTarget === 'creality';
  const nativeTargetLabel = packageTarget === 'bambu' ? 'Bambu Studio' : packageTarget === 'orca' ? 'OrcaSlicer' : packageTarget === 'prusa' ? 'PrusaSlicer' : packageTarget === 'cura' ? 'UltiMaker Cura' : 'Creality Print';
  const nativeValidationText = packageTarget === 'bambu' ? 'Check Make writes the Bambu project directly and verifies its structure and mapped settings before saving.' : packageTarget === 'orca' ? 'Check Make verifies both the project structure and OrcaSlicer’s effective settings before saving.' : packageTarget === 'prusa' ? 'Check Make lets PrusaSlicer build the project, then verifies both its embedded and effective settings before saving.' : packageTarget === 'cura' ? 'Check Make validates Cura’s workspace structure, installed profiles, and embedded process settings before saving.' : packageTarget === 'creality' ? 'Check Make validates Creality Print profile values and active project overrides before saving.' : 'The selected slicer can import the model, but process settings remain advisory metadata.';
  const selectedAdapter = adapters.find(item => item.target === packageTarget);
  const selectedPrinterSupported = packageTarget === 'generic' || Boolean(printer && supportsPrinter(selectedAdapter, printerId));
  const supportedPrinterNames = selectedAdapter?.supportedPrinterIds?.map(id => getPrinter(id).model).join(', ') ?? '';
  const readiness = useMemo(() => intelligence ? assessDecisionReadiness(intelligence, spatialIntent) : undefined, [intelligence, spatialIntent]);
  const importedBuildVolumeNotice = analysis && printer ? checkBuildVolume(analysis, printer)[0] : undefined;
  const unansweredQuestions = intelligence?.questions.filter(question => !(followUps[question.id] ?? '').trim()) ?? [];
  const editableQuestions = (modifyingPlan || readiness?.conservativePlan === 'unsupported') && planQuestions.length
    ? planQuestions
    : intelligence?.questions ?? [];
  const spatialGaps = readiness?.gaps.filter(gap => gap.id.startsWith('spatial-')) ?? [];
  const preparationComplete = isPreparationComplete(readiness?.conservativePlan === 'ready', unansweredQuestions.length + spatialGaps.length);
  const purposeNeedsContext = Boolean(intelligence && !intelligence.purposeConfirmed && !intelligence.questions.some(question => question.id === 'object-purpose'));
  const workflowStage: View = deriveWorkflowStage({ hasIntelligence: Boolean(intelligence), exportRequested: view === 'export', ready: preparationComplete });
  const intent = intelligence?.manufacturingIntent;
  const loadLocalizationRequired = Boolean(intent && intentFactUsable(intent.mechanical.loadDirections) && intent.mechanical.loadDirections.value.length);
  const matingLocalizationRequired = Boolean(intent && (
    intentFactUsable(intent.interface.fitType) && intent.interface.fitType.value !== 'unknown'
    || intentFactUsable(intent.interface.criticalSurfaces) && intent.interface.criticalSurfaces.value.includes('mating')
  ));
  const visibleLocalizationRequired = Boolean(intent && intentFactUsable(intent.interface.criticalSurfaces) && intent.interface.criticalSurfaces.value.includes('visible'));
  const spatialPreviewRegions = useMemo(() => {
    const confirmed = spatialIntent.regions.filter(region => region.status === 'confirmed');
    if (previewMode !== 'spatial') return confirmed;
    if (spatialFocusKind) {
      const confirmedFocus = confirmedRegion(spatialIntent, spatialFocusKind);
      if (confirmedFocus) return [confirmedFocus];
      const candidate = spatialFocusKind === 'critical-thin'
        ? spatialCandidates?.thinCandidates.find(item => !spatialIntent.rejectedCandidateIds.includes(`${spatialFocusKind}:${item.id}`))
        : spatialCandidates?.planarCandidates.find(item => !spatialIntent.rejectedCandidateIds.includes(`${spatialFocusKind}:${item.id}`));
      return candidate ? [{ ...candidate, kind: spatialFocusKind }] : [];
    }
    if (confirmed.length) return confirmed;
    return [
      spatialCandidates?.planarCandidates.find(candidate => !spatialIntent.rejectedCandidateIds.includes(`visible-surface:${candidate.id}`)),
      spatialCandidates?.thinCandidates.find(candidate => !spatialIntent.rejectedCandidateIds.includes(`critical-thin:${candidate.id}`)),
    ].filter(Boolean) as SpatialRegion[];
  }, [previewMode, spatialCandidates, spatialFocusKind, spatialIntent]);

  useEffect(() => {
    if (!orientation) return;
    setPreviewOrientationId(orientation.id);
  }, [orientation]);

  useEffect(() => {
    decisionPanel.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [preparationComplete, workflowStage]);

  useEffect(() => {
    if (!packageTargetManuallySelected) setPackageTarget(suggestedPackageTarget);
  }, [packageTargetManuallySelected, suggestedPackageTarget]);

  useEffect(() => {
    if (!materialOverride) return;
    if (!materialDecision?.candidates.some(candidate => candidate.material === materialOverride && candidate.selectable)) setMaterialOverride(undefined);
  }, [materialDecision, materialOverride]);

  useEffect(() => {
    if (!filamentProductId) return;
    const selected = filamentProductProfile(filamentProductId);
    const assessment = selected ? assessFilamentProduct(selected, printer) : undefined;
    if (!selected || selected.family !== material || !assessment?.compatible) setFilamentProductId(undefined);
  }, [filamentProductId, material, printer]);

  useEffect(() => {
    if (!intelligence) return;
    const contextRequiresCriticalDimension = Boolean(intelligence.manufacturingIntent?.compatibility.fitCritical);
    const needsCriticalDimension = requestedPlanPreference === 'fit-accuracy' || contextRequiresCriticalDimension;
    if (!needsCriticalDimension) {
      manuallyAnsweredDecisions.current.delete(criticalDimensionQuestion.id);
      setFollowUps(current => {
        if (!(criticalDimensionQuestion.id in current)) return current;
        const next = { ...current };
        delete next[criticalDimensionQuestion.id];
        return next;
      });
      setIntelligence(current => current?.questions.some(question => question.id === criticalDimensionQuestion.id)
        ? { ...current, questions: current.questions.filter(question => question.id !== criticalDimensionQuestion.id) }
        : current);
      setPlanQuestions(current => current.some(question => question.id === criticalDimensionQuestion.id)
        ? current.filter(question => question.id !== criticalDimensionQuestion.id)
        : current);
      return;
    }
    if (followUps[criticalDimensionQuestion.id]?.trim() || intelligence.questions.some(question => question.id === criticalDimensionQuestion.id)) return;
    setIntelligence(current => current ? { ...current, questions: [...current.questions, criticalDimensionQuestion] } : current);
    setPlanQuestions(current => current.some(question => question.id === criticalDimensionQuestion.id)
      ? current
      : [...current, criticalDimensionQuestion]);
    setModifyingPlan(true);
  }, [followUps, intelligence, requestedPlanPreference]);

  useEffect(() => {
    if (!preferences.preferMatchingFilamentProfiles) {
      attemptedAutomaticFilamentSelection.current = '';
      return;
    }
    if (!material || !printer || printer.id !== preferences.defaultPrinterId) return;
    const selectionKey = `${printer.id}:${material}`;
    if (attemptedAutomaticFilamentSelection.current === selectionKey) return;
    if (selectedFilamentProductMatchesPlan(filamentProductId, material, printer)) {
      attemptedAutomaticFilamentSelection.current = selectionKey;
      return;
    }
    if (filamentProductId) return;
    const matchingProduct = matchingCompatibleFilamentProduct(material, printer);
    attemptedAutomaticFilamentSelection.current = selectionKey;
    if (matchingProduct) setFilamentProductId(matchingProduct.id);
  }, [filamentProductId, material, preferences.defaultPrinterId, preferences.preferMatchingFilamentProfiles, printer]);

  const selectPrinter = (id: string) => {
    attemptedAutomaticFilamentSelection.current = '';
    setPrinterId(id); setMaterialOverride(undefined); setFilamentProductId(undefined); setPackageTargetManuallySelected(false);
    setPackageTarget(suggestSlicerTarget(adapters, id));
    if (intelligence) setView('analysis');
  };

  const updatePreferences = (changes: Partial<ApplicationPreferences>) => {
    setPreferences(current => {
      const next = { ...current, ...changes };
      saveApplicationPreferences(next);
      return next;
    });
  };
  const updateDefaultPlanPreference = (defaultPlanPreference: PlanPreference) => {
    updatePreferences({ defaultPlanPreference });
    if (!analysis) setInheritedPlanPreference(defaultPlanPreference);
  };
  const selectProjectPlanPreference = (preference: PlanPreference) => {
    attemptedAutomaticFilamentSelection.current = '';
    setProjectPlanPreference(preference === inheritedPlanPreference ? undefined : preference);
    setMaterialOverride(undefined);
    setFilamentProductId(undefined);
  };
  const selectAnalysisMode = (mode: ApplicationPreferences['defaultAnalysisMode']) => {
    setConnection(current => ({ ...current, provider: mode === 'local' ? 'local' : preferences.extendedAIProvider }));
  };
  const selectExtendedAIProvider = (provider: ApplicationPreferences['extendedAIProvider']) => {
    updatePreferences({ extendedAIProvider: provider });
    setConnection(current => current.provider === 'local' ? current : { ...current, provider });
  };

  const focusNextDecision = (currentId: string, answers: Record<string, string>) => {
    const questions = intelligence?.questions ?? [];
    const currentIndex = questions.findIndex(question => question.id === currentId);
    const next = [...questions.slice(currentIndex + 1), ...questions.slice(0, Math.max(0, currentIndex))]
      .find(question => !(answers[question.id] ?? '').trim());
    if (!next) return;
    window.setTimeout(() => {
      const input = decisionInputs.current[next.id];
      input?.focus();
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };
  const updatePurpose = (value: string) => {
    const suggestions = analyzePurposeContext(value).suggestions;
    const badges: Record<string, string[]> = {};
    setFollowUps(current => {
      const next: Record<string, string> = { ...current, purpose: value };
      automaticallyAnsweredDecisions.current.forEach(field => {
        if (!manuallyAnsweredDecisions.current.has(field)) delete next[field];
      });
      automaticallyAnsweredDecisions.current.clear();
      (Object.keys(suggestions) as ChecklistField[]).forEach(field => {
        const suggestion = suggestions[field];
        if (!suggestion || manuallyAnsweredDecisions.current.has(field)) return;
        next[field] = suggestion.value;
        badges[field] = suggestion.evidence;
        automaticallyAnsweredDecisions.current.add(field);
      });
      return next;
    });
    setAutoFilledDecisions(badges);
  };
  const updateProjectBrief = (value: string) => {
    if (intelligence) {
      attemptedAutomaticFilamentSelection.current = '';
      setIntelligence(undefined); setPlanQuestions([]); setView('import'); setStatus(''); setPackageResult(undefined); setValidationReport(undefined); setMaterialOverride(undefined); setFilamentProductId(undefined);
      manuallyAnsweredDecisions.current.clear(); automaticallyAnsweredDecisions.current.clear();
    }
    updatePurpose(value);
  };
  const updateDecision = (id: string, value: string) => {
    manuallyAnsweredDecisions.current.add(id);
    automaticallyAnsweredDecisions.current.delete(id as ChecklistField);
    setAutoFilledDecisions(current => { const next = { ...current }; delete next[id]; return next; });
    setFollowUps(current => {
      const next = { ...current, [id]: value };
      if (value) focusNextDecision(id, next);
      return next;
    });
  };
  const updatePurposeClarificationDraft = (value: string) => {
    setFollowUps(current => ({ ...current, 'object-purpose-description': value }));
  };
  const updateSupportPreference = (value: NonNullable<import('./types').Questionnaire['supportPreference']>) => {
    const next = { ...followUps, 'support-preference': value };
    manuallyAnsweredDecisions.current.add('supportsAllowed');
    setFollowUps(next);
    if (intelligence && preparationComplete) setIntelligence(refineLocalIntelligence(intelligence, next));
  };

  const spatialEvidenceFor = (kind: SpatialRegionKind) => {
    if (!intent) return [];
    if (kind === 'load-bearing') return intent.mechanical.loadDirections.evidenceIds;
    if (kind === 'mating-surface') return [...new Set([...intent.interface.fitType.evidenceIds, ...intent.interface.criticalSurfaces.evidenceIds])];
    if (kind === 'visible-surface') return intent.interface.criticalSurfaces.evidenceIds;
    return ['geometry:opposing-ray-screening'];
  };
  const beginSpatialMarking = (kind: SpatialRegionKind) => {
    setSpatialFocusKind(kind); setSpatialMarkingKind(kind); setPreviewMode('spatial');
    requestAnimationFrame(() => modelPreview.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const selectSpatialFace = (faceIndex: number) => {
    if (!geometry || !spatialMarkingKind) return;
    const labels: Record<SpatialRegionKind, string> = {
      'load-bearing': 'Confirmed load-bearing region', 'mating-surface': 'Confirmed mating surface',
      'visible-surface': 'Confirmed visible surface', 'critical-thin': 'Confirmed critical thin region',
    };
    const region = facePatchRegion(geometry, faceIndex, spatialMarkingKind, labels[spatialMarkingKind], spatialEvidenceFor(spatialMarkingKind));
    if (!region) { setError('That face could not be mapped to a stable surface patch.'); return; }
    setSpatialIntent(current => replaceSpatialRegion(current, region)); setSpatialFocusKind(spatialMarkingKind); setSpatialMarkingKind(undefined); setError('');
  };
  const useSpatialCandidate = (kind: SpatialRegionKind) => {
    const candidates = kind === 'critical-thin' ? spatialCandidates?.thinCandidates : spatialCandidates?.planarCandidates;
    const candidate = candidates?.find(item => !spatialIntent.rejectedCandidateIds.includes(`${kind}:${item.id}`));
    if (!candidate) return;
    setSpatialIntent(current => replaceSpatialRegion(current, confirmCandidate(candidate, kind, spatialEvidenceFor(kind))));
    setSpatialFocusKind(kind); setSpatialMarkingKind(undefined); setPreviewMode('spatial');
  };
  const showSpatialArea = (kind: SpatialRegionKind) => {
    setSpatialFocusKind(kind); setSpatialMarkingKind(undefined); setPreviewMode('spatial');
    requestAnimationFrame(() => modelPreview.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const showImportantAreas = () => {
    setImportantAreasOpen(true); setSpatialFocusKind(undefined); setSpatialMarkingKind(undefined); setPreviewMode('spatial');
    requestAnimationFrame(() => modelPreview.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const showMeshIssues = () => {
    setSpatialFocusKind(undefined);
    setSpatialMarkingKind(undefined);
    setPreviewMode('mesh');
    requestAnimationFrame(() => requestAnimationFrame(() => modelPreview.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
  };
  const markSpatialNotApplicable = (kind: SpatialRegionKind) => {
    setSpatialIntent(current => setSpatialRegionNotApplicable(current, kind)); setSpatialFocusKind(undefined); setSpatialMarkingKind(undefined);
  };
  const dismissSpatialCandidate = (kind: SpatialRegionKind) => {
    const candidates = kind === 'critical-thin' ? spatialCandidates?.thinCandidates : spatialCandidates?.planarCandidates;
    const candidate = candidates?.find(item => !spatialIntent.rejectedCandidateIds.includes(`${kind}:${item.id}`));
    if (candidate) setSpatialIntent(current => rejectSpatialCandidate(current, kind, candidate.id));
    setSpatialFocusKind(undefined);
  };
  const resetImportantAreas = () => {
    setSpatialIntent(emptySpatialManufacturingIntent());
    setSpatialFocusKind(undefined);
    setSpatialMarkingKind(undefined);
    setPreviewMode('recommended');
  };

  const resetAnalysis = (preserveBrief = false) => {
    const brief = preserveBrief ? followUps.purpose ?? '' : '';
    attemptedAutomaticFilamentSelection.current = '';
    setIntelligence(undefined); setPlanQuestions([]); setStatus(''); setPackageResult(undefined); setValidationReport(undefined); setMaterialOverride(undefined); setFilamentProductId(undefined); setModifyingPlan(false);
    manuallyAnsweredDecisions.current.clear(); automaticallyAnsweredDecisions.current.clear();
    if (brief) updatePurpose(brief);
    else { setFollowUps({}); setAutoFilledDecisions({}); }
  };
  const resetProjectForReplacement = () => {
    resetAnalysis(false);
    setAnalysis(undefined); setGeometry(undefined); setSourcePath(undefined); setSourceModelPath(undefined); setPreviewImage(undefined);
    setPrinterId(preferences.defaultPrinterId); setPackageTarget('generic'); setPackageTargetManuallySelected(false);
    setInheritedPlanPreference(preferences.defaultPlanPreference); setProjectPlanPreference(undefined);
    setPreviewMode('recommended'); setPreviewOrientationId('as-imported'); setSpatialIntent(emptySpatialManufacturingIntent());
    setSpatialFocusKind(undefined); setSpatialMarkingKind(undefined); setImportantAreasOpen(false); setView('import'); setError('');
    setConnection(current => ({
      ...current,
      provider: preferences.defaultAnalysisMode === 'extended' ? preferences.extendedAIProvider : 'local',
    }));
  };
  const loadBrowserFile = async (file?: File, preserveBrief = true) => {
    if (!file) return;
    setBusy(true); setError(''); resetAnalysis(preserveBrief);
    try {
      const result = await importModel(await file.arrayBuffer(), file.name);
      setAnalysis(result.analysis); setGeometry(result.geometry); setSourcePath(undefined); setSourceModelPath(undefined); setPreviewImage(undefined); setSpatialIntent(emptySpatialManufacturingIntent()); setSpatialFocusKind(undefined); setSpatialMarkingKind(undefined);
    } catch (reason) { setError(`The model could not be read. ${String(reason)}`); }
    finally { setBusy(false); setDropActive(false); }
  };
  const loadPath = async (path: string, preserveBrief = true) => {
    setBusy(true); setError(''); resetAnalysis(preserveBrief);
    try {
      const raw = await invoke<ArrayBuffer | Uint8Array | number[]>('read_model_bytes', { path });
      const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw);
      const fileName = path.split(/[\\/]/).at(-1) ?? 'model.stl';
      const imported = await importModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, fileName);
      const native = imported.analysis.metadata.format === 'stl' ? await invoke<ModelAnalysis>('analyze_stl_native', { path }) : imported.analysis;
      const exportPath = imported.normalizedStl
        ? await invoke<string>('cache_normalized_stl', { originalPath: path, bytes: Array.from(imported.normalizedStl) })
        : path;
      const analysisWithP1Metrics = imported.analysis.metadata.format === 'stl'
        ? { ...imported.analysis, metadata: native.metadata }
        : imported.analysis;
      setAnalysis(analysisWithP1Metrics); setGeometry(imported.geometry); setSourcePath(exportPath); setSourceModelPath(path); setPreviewImage(undefined); setSpatialIntent(emptySpatialManufacturingIntent()); setSpatialFocusKind(undefined); setSpatialMarkingKind(undefined); setView('import');
      return true;
    } catch (reason) { setError(String(reason)); return false; }
    finally { setBusy(false); setDropActive(false); }
  };
  const browse = async (preserveBrief = true) => {
    if (isTauri()) { const path = await invoke<string | null>('pick_model_path'); if (path) await loadPath(path, preserveBrief); }
    else if (fileInput.current) {
      preserveBriefOnNextBrowserFile.current = preserveBrief;
      fileInput.current.value = '';
      fileInput.current.click();
    }
  };
  const replaceModel = async () => {
    resetProjectForReplacement();
    await browse(false);
  };

  const saveProject = async () => {
    if (!analysis || !sourceModelPath) return;
    const contents = JSON.stringify({
      product: 'Check Make',
      schemaVersion: 5,
      savedAt: new Date().toISOString(),
      sourcePath: sourceModelPath,
      view,
      intelligence,
      planQuestions,
      spatialIntent,
      printerId,
      followUps,
      packageTarget,
      planPolicy: {
        inheritedPreference: inheritedPlanPreference,
        projectOverride: projectPlanPreference ?? null,
        requestedPreference: requestedPlanPreference,
        appliedPreference: appliedPlanCandidate?.id ?? 'balanced',
      },
      materialOverride,
      filamentProductId,
    }, null, 2);
    const stem = analysis.fileName.replace(/\.(?:stl|3mf|obj)$/i, '');
    try {
      const saved = await invoke<string | null>('save_check_make_project', { defaultName: `${stem}.checkmake`, contents });
      if (saved) {
        setPackageResult(undefined);
        setValidationReport(undefined);
        setStatus(`Project saved: ${saved}`);
      }
    } catch (reason) { setError(String(reason)); }
  };

  const openProject = async () => {
    setError('');
    try {
      const contents = await invoke<string | null>('open_check_make_project');
      if (!contents) return;
      const project = JSON.parse(contents) as {
        sourcePath?: string;
        view?: View;
        intelligence?: ModelIntelligence;
        planQuestions?: ModelIntelligence['questions'];
        spatialIntent?: SpatialManufacturingIntent;
        printerId?: string;
        followUps?: Record<string, string>;
        packageTarget?: SlicerTarget;
        materialOverride?: Material;
        filamentProductId?: string;
        planObjective?: string;
        planPolicy?: { inheritedPreference?: PlanPreference; projectOverride?: PlanPreference | null };
      };
      if (!project.sourcePath) throw new Error('The project does not reference its source model.');
      if (!await loadPath(project.sourcePath)) return;
      const restoredIntelligence = project.intelligence ? prepareIntelligenceForReview(project.intelligence) : undefined;
      const inheritedPreference = isPlanPreference(project.planPolicy?.inheritedPreference)
        ? project.planPolicy.inheritedPreference
        : preferences.defaultPlanPreference;
      const legacyOverride: PlanPreference | undefined = project.planObjective === 'time'
        ? 'faster'
        : project.planObjective === 'performance'
          ? 'structural-margin'
          : undefined;
      const restoredOverride = isPlanPreference(project.planPolicy?.projectOverride)
        ? project.planPolicy.projectOverride
        : legacyOverride;
      setIntelligence(restoredIntelligence); setPlanQuestions(project.planQuestions ?? restoredIntelligence?.questions ?? []); setSpatialIntent(normalizeSpatialManufacturingIntent(project.spatialIntent)); setPrinterId(project.printerId ?? ''); setFollowUps(project.followUps ?? {}); setPackageTarget(project.packageTarget ?? 'generic'); setPackageTargetManuallySelected(Boolean(project.packageTarget)); setMaterialOverride(project.materialOverride); setFilamentProductId(project.filamentProductId); setInheritedPlanPreference(inheritedPreference); setProjectPlanPreference(restoredOverride); setModifyingPlan(false); setView(project.intelligence ? project.view ?? 'analysis' : 'import');
      setStatus('Check Make project reopened.');
    } catch (reason) { setError(`Could not open project. ${String(reason)}`); }
  };

  useEffect(() => {
    const handleProjectShortcut = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 'o') { event.preventDefault(); void openProject(); }
      if (event.key.toLowerCase() === 's' && analysis && sourceModelPath) { event.preventDefault(); void saveProject(); }
    };
    window.addEventListener('keydown', handleProjectShortcut);
    return () => window.removeEventListener('keydown', handleProjectShortcut);
  }, [analysis, sourceModelPath, intelligence, planQuestions, spatialIntent, printerId, followUps, packageTarget, materialOverride, filamentProductId, inheritedPlanPreference, projectPlanPreference, requestedPlanPreference, appliedPlanCandidate, settingsOpen, view]);

  useEffect(() => {
    if (!isTauri()) return;
    let stopOpen: (() => void) | undefined;
    let stopSave: (() => void) | undefined;
    let disposed = false;
    void Promise.all([
      listen('project-open-requested', () => void openProject()),
      listen('project-save-requested', () => void saveProject()),
    ]).then(([openListener, saveListener]) => {
      if (disposed) { openListener(); saveListener(); }
      else { stopOpen = openListener; stopSave = saveListener; }
    });
    return () => { disposed = true; stopOpen?.(); stopSave?.(); };
  }, [analysis, sourceModelPath, intelligence, spatialIntent, printerId, followUps, packageTarget, materialOverride, filamentProductId, inheritedPlanPreference, projectPlanPreference, requestedPlanPreference, appliedPlanCandidate, view]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined; let disposed = false;
    void getCurrentWindow().onDragDropEvent(event => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') setDropActive(true);
      if (event.payload.type === 'leave') setDropActive(false);
      if (event.payload.type === 'drop') { setDropActive(false); const path = event.payload.paths[0]; if (path) void loadPath(path); }
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(reason => setError(`Native drag-and-drop could not start: ${String(reason)}`));
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void invoke<SlicerAdapterStatus[]>('detect_slicer_adapters').then(detected => setAdapters(mergeDetectedAdapters(detected))).catch(reason => {
      setAdapters(adapterPlaceholders.map(adapter => adapter.target === 'generic' ? adapter : { ...adapter, detail: `Detection failed: ${String(reason)}` }));
      setError(`Slicer detection failed: ${String(reason)}`);
    });
  }, []);

  const runIntelligence = async () => {
    if (!analysis) return;
    setBusy(true); setError(''); setView('analysis');
    const brief = followUps.purpose?.trim() ?? '';
    const baseline = localModelAnalysis(analysis, brief);
    const prepareInitialReview = (result: ModelIntelligence): ModelIntelligence => {
      if (!brief) return result;
      const purposeEstablished = result.objectHypothesis?.purpose.status === 'user-stated' || result.objectHypothesis?.purpose.status === 'confirmed';
      return {
        ...result,
        purposeConfirmed: purposeEstablished || (!result.objectHypothesis && result.purposeConfirmed),
        userEvidence: [brief],
        questions: result.questions.filter(question => question.id !== 'purpose'),
      };
    };
    const prefillReview = (result: ModelIntelligence) => {
      const reviewFields: ChecklistField[] = ['environment', 'load', 'impact', 'heat', 'priority'];
      setFollowUps(current => {
        const next = { ...current };
        reviewFields.forEach(field => {
          const value = result.requirements[field].value;
          if (!next[field] && value !== 'unknown') next[field] = String(value);
        });
        if (!next['support-preference']) {
          next['support-preference'] = result.supportPreference ?? (result.requirements.supportsAllowed.value === false ? 'forbidden' : 'auto');
        }
        return next;
      });
      setAutoFilledDecisions(current => {
        const next = { ...current };
        reviewFields.forEach(field => {
          const requirement = result.requirements[field];
          if (requirement.value !== 'unknown' && !manuallyAnsweredDecisions.current.has(field)) next[field] = requirement.evidence;
        });
        return next;
      });
    };
    try {
      const result = connection.provider === 'openai'
        ? await analyzeWithOpenAI(connection, analysis, previewImage, followUps)
        : connection.provider === 'llama'
          ? await analyzeWithLocalSemanticAI(connection, analysis, followUps)
          : baseline;
      const prepared = prepareInitialReview(result);
      prefillReview(prepared);
      setPlanQuestions(prepared.questions);
      setIntelligence(prepared);
    } catch (reason) {
      const prepared = prepareInitialReview(baseline);
      prefillReview(prepared);
      setPlanQuestions(prepared.questions);
      setIntelligence(prepared);
      setError(`${String(reason)} Showing Local Analysis instead.`);
    } finally { setBusy(false); }
  };
  const refine = async () => {
    if (!analysis || !intelligence) return;
    setView('analysis');
    setIntelligence(refineLocalIntelligence(intelligence, followUps));
    setModifyingPlan(false);
  };
  const applyPurposeClarification = () => {
    const clarification = followUps['object-purpose-description']?.trim();
    if (!clarification || !intelligence) return;
    manuallyAnsweredDecisions.current.add('object-purpose-description');
    const refined = refineLocalIntelligence(intelligence, {
      ...followUps,
      'object-purpose-description': clarification,
    });
    setPlanQuestions(current => {
      const byId = new Map([...current, ...refined.questions].map(question => [question.id, question]));
      return [...byId.values()];
    });
    setIntelligence(refined);
    setModifyingPlan(true);
  };
  const createPackage = async (mode: 'save' | 'open' = 'save') => {
    if (!sourcePath || !analysis || !intelligence || !orientation) { setError('3MF creation requires a model imported by the desktop app.'); return; }
    if (readiness?.conservativePlan !== 'ready') { setError('Check Make cannot export until every decision-changing requirement has been resolved.'); setView('analysis'); return; }
    if (materialPlanBlocked) { setError(`Check Make cannot export this material and printer combination. ${materialBlockReasons.join(' ')}`); setView('analysis'); return; }
    setBusy(true); setError(''); setStatus(''); setPackageResult(undefined); setValidationReport(undefined);
    try {
      const appliedPreference = appliedPlanCandidate?.id ?? 'balanced';
      const metadata = JSON.stringify({
        product: 'Check Make',
        schemaVersion: 5,
        intelligence,
        spatialIntent,
        printer: printer ?? null,
        filamentProduct: selectedFilamentProduct ?? null,
        planPreference: {
          requested: requestedPlanPreference,
          applied: appliedPreference,
          source: projectPlanPreference ? 'project' : 'application-default',
          objective: planPreferenceDefinition(appliedPreference).objective,
          changesFromBalanced: appliedPlanCandidate?.changes ?? [],
          blockers: requestedPlanCandidate?.blockers ?? [],
        },
        recommendations,
        notices,
      }, null, 2);
      const args = {
        path: sourcePath, orientationId: orientation.id, metadataJson: metadata,
        defaultName: packageFileName(analysis.fileName, packageTarget), printerId: printerId || 'unselected',
        recommendationsJson: serializeRecommendations(recommendations),
      };
      const result = mode === 'open'
        ? await invoke<ManufacturingPackageResult>('create_and_open_bambu_project', args)
        : await invoke<ManufacturingPackageResult | null>('create_manufacturing_package', { ...args, target: packageTarget });
      if (result) {
        const report = await invoke<PackageValidationReport>('validate_manufacturing_package', { path: result.path, target: result.target });
        setValidationReport(report);
        if (!report.valid) throw new Error('The exported 3MF failed Check Make validation and should not be used.');
        setPackageResult(result);
      }
      setStatus(result ? `${mode === 'open' ? 'Created and opened' : 'Validated and created'} ${result.path}${result.warnings.length ? ` — ${result.warnings.join(' ')}` : ''}` : 'Export cancelled');
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  const revealExportedFile = async (path: string) => {
    setError('');
    try {
      await invoke('reveal_file_in_folder', { path });
    } catch (reason) {
      setError(`Could not show the exported file: ${String(reason)}`);
    }
  };

  const assumptionReviewCount = intelligence
    ? (['environment', 'load', 'impact', 'heat', 'priority'] as ChecklistField[]).filter(field => intelligence.requirements[field].status === 'assumed').length
    : 0;
  const unresolvedDecisionCount = unansweredQuestions.length + spatialGaps.length + (purposeNeedsContext ? 1 : 0);
  const decisionCount = unresolvedDecisionCount + assumptionReviewCount;
  const unsupportedPlan = readiness?.conservativePlan === 'unsupported';
  const showPlanReview = !preparationComplete || modifyingPlan;
  useEffect(() => {
    if (!showPlanReview && previewMode === 'spatial') {
      setPreviewMode('recommended');
      setSpatialFocusKind(undefined);
      setSpatialMarkingKind(undefined);
    }
  }, [previewMode, showPlanReview]);
  const primaryPrepareLabel = purposeNeedsContext
    ? (followUps['object-purpose-description']?.trim() ? 'Apply purpose and review plan' : 'Describe the object’s purpose')
    : unsupportedPlan
    ? 'Apply answers and re-check'
    : modifyingPlan
    ? 'Apply changes and review plan'
    : preparationComplete
    ? 'Continue to export'
    : assumptionReviewCount > 0 && unresolvedDecisionCount === 0
      ? `Accept ${assumptionReviewCount} assumption${assumptionReviewCount === 1 ? '' : 's'} and recalculate`
    : decisionCount > 0
      ? `Resolve ${decisionCount} decision${decisionCount === 1 ? '' : 's'}`
      : 'Apply answers and re-check';

  const prepareReadyLabel = printer ? 'Plan ready' : 'Plan ready · printer not validated';
  const prepareReadySummary = printer ? 'Ready for export' : 'Portable export ready';
  const fileManagerActionLabel = /Mac/i.test(navigator.platform)
    ? 'Show in Finder'
    : /Win/i.test(navigator.platform) ? 'Show in Explorer' : 'Show in folder';

  return <div className="window workflow-window">
    <ProcessBar stage={workflowStage} decisions={decisionCount} settingsOpen={settingsOpen} onToggleSettings={() => setSettingsOpen(current => !current)}/>
    {settingsOpen && <aside className="settings-popover" role="dialog" aria-modal="false" aria-labelledby="settings-title">
      <div><span className="kicker">APPLICATION SETTINGS</span><h2 id="settings-title">Project defaults</h2><button className="popover-close" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button></div>
      <div className="settings-group default-printer-settings"><b className="settings-label">Default printer</b><PrinterPicker value={preferences.defaultPrinterId} onChange={defaultPrinterId => updatePreferences({ defaultPrinterId })} label="Default printer" emptyLabel="No default printer" emptyDescription="New projects start without a printer"/><small>Used when a new project starts. Printer selection remains optional.</small><div className="filament-profile-default"><b className="settings-label">Filament product profiles</b><label className="provider-option"><input type="checkbox" checked={preferences.preferMatchingFilamentProfiles} onChange={event => updatePreferences({ preferMatchingFilamentProfiles: event.target.checked })}/><span><b>Preselect matching filament profiles</b><small>When a project uses the default printer, preselect one reviewed and compatible filament profile from the same manufacturer. You can still choose the family fallback or another compatible product.</small></span></label></div></div>
      <div className="settings-group plan-default-setting"><b className="settings-label">Default plan preference</b><OptionPicker label="Default plan preference" value={preferences.defaultPlanPreference} options={planPreferenceDefinitions.map(definition => ({ value: definition.id, label: definition.label, description: definition.shortDescription }))} onChange={updateDefaultPlanPreference}/><small>{planPreferenceDefinition(preferences.defaultPlanPreference).shortDescription} Applied to new projects only and never allowed to override confirmed part requirements.</small></div>
      <div className="settings-group"><b className="settings-label">Default analysis</b>
        <label className="provider-option"><input type="radio" checked={preferences.defaultAnalysisMode === 'local'} onChange={() => { updatePreferences({ defaultAnalysisMode: 'local' }); selectAnalysisMode('local'); }}/><span><b>Local Analysis</b><small>Fast, private geometry and deterministic Context interpretation.</small></span></label>
        <label className="provider-option"><input type="radio" checked={preferences.defaultAnalysisMode === 'extended'} onChange={() => { updatePreferences({ defaultAnalysisMode: 'extended' }); selectAnalysisMode('extended'); }}/><span><b>Extended AI Analysis</b><small>Adds an AI-generated understanding of the object and its use before deterministic rules run.</small></span></label>
        {preferences.defaultAnalysisMode === 'extended' && <div className="extended-ai-settings">
          <b className="settings-label">Extended AI location</b>
          <label className="provider-option"><input type="radio" checked={preferences.extendedAIProvider === 'llama'} onChange={() => selectExtendedAIProvider('llama')}/><span><b>Local AI</b><small>Private semantic analysis through a llama.cpp server running on this computer.</small></span></label>
          <label className="provider-option"><input type="radio" checked={preferences.extendedAIProvider === 'openai'} onChange={() => selectExtendedAIProvider('openai')}/><span><b>Cloud AI</b><small>OpenAI analyzes Context, mesh measurements, and rendered model views.</small></span></label>
          {preferences.extendedAIProvider === 'llama' && <div className="api-fields"><label>Local llama.cpp endpoint<input value={connection.localEndpoint} onChange={event => setConnection(current => ({ ...current, localEndpoint: event.target.value }))} placeholder="http://localhost:8080"/></label><label>Loaded model alias<input value={connection.localModel} onChange={event => setConnection(current => ({ ...current, localModel: event.target.value }))} placeholder="local-model"/></label><label>Timeout (seconds)<input type="number" min="1" max="120" value={Math.round(connection.localTimeoutMs / 1000)} onChange={event => setConnection(current => ({ ...current, localTimeoutMs: Math.max(1, Math.min(120, Number(event.target.value) || 30)) * 1000 }))}/></label><p>Only loopback endpoints are accepted. Check Make does not download a model or send this request to the internet.</p></div>}
          {preferences.extendedAIProvider === 'openai' && <div className="api-fields"><label>OpenAI API key<input type="password" autoComplete="off" value={connection.apiKey} onChange={event => setConnection(current => ({ ...current, apiKey: event.target.value }))} placeholder="sk-…"/></label><label>Model<input value={connection.model} onChange={event => setConnection(current => ({ ...current, model: event.target.value }))}/></label><p>The key remains in memory for this session.</p></div>}
        </div>}
      </div>
      <p className="settings-note">Defaults are stored on this Mac and applied when Check Make starts a new session. Current project choices are changed in the project panel.</p>
    </aside>}

    <main className="workflow-layout">
      <aside className="project-context">
        <span className="context-title">PROJECT</span>
        <section className="context-card model-context"><span>MODEL</span>{analysis ? <><div className="context-glyph context-model-icon"><UiIcon name="model"/><small>{analysis.metadata.format.toUpperCase()}</small></div><div><b>{analysis.fileName}</b><small>{analysis.boundingBox.size.x.toFixed(1)} × {analysis.boundingBox.size.y.toFixed(1)} × {analysis.heightMm.toFixed(1)} mm</small><button className="context-link" onClick={() => void replaceModel()}>Replace</button></div></> : <button className="context-empty" onClick={() => void browse()}><b>Add model</b><small>STL, 3MF, or OBJ</small></button>}</section>
        <section className="context-card purpose-context"><span>CONTEXT</span><label><textarea value={followUps.purpose ?? ''} onChange={event => updateProjectBrief(event.target.value)} placeholder="Example: Load-critical camping-chair spacer under repeated outdoor use."/><small>Describe the object, its use, known loads, environment, and designer-defined constraints. Check Make uses them as planning inputs; it does not validate structural safety.</small></label></section>
        <section className="context-card printer-context"><span>PRINTER · OPTIONAL</span><div className="context-glyph printer-glyph"><UiIcon name="printer"/></div><div className="printer-control"><PrinterPicker value={printerId} onChange={selectPrinter} label="Target printer" emptyLabel="No printer selected" emptyDescription="Validate compatibility later"/><small>{printer ? `${printer.buildVolume.x} × ${printer.buildVolume.y} × ${printer.buildVolume.z} mm · ${printer.enclosed ? 'Enclosed' : 'Open frame'}` : 'Compatibility will be checked when selected.'}</small></div></section>
        <section className="context-card analysis-context"><span>ANALYSIS</span><div className="analysis-options">
          <label><input type="radio" checked={connection.provider === 'local'} onChange={() => selectAnalysisMode('local')}/><span><b>Local Analysis</b><small>Private · geometry + deterministic interpretation</small></span></label>
          <label><input type="radio" checked={connection.provider !== 'local'} onChange={() => selectAnalysisMode('extended')}/><span><b>Extended AI Analysis</b><small>{preferences.extendedAIProvider === 'llama' ? 'Local AI · configured in Settings' : 'Cloud AI · configured in Settings'}</small></span></label>
          {connection.provider === 'openai' && !connection.apiKey.trim() && <small className="analysis-credential-note">Cloud AI needs an API key. Configure it in Application Settings.</small>}
          {connection.provider === 'llama' && <small className="analysis-credential-note">Local AI uses {connection.localEndpoint}. Configure the provider in Application Settings.</small>}
        </div></section>
        {importedBuildVolumeNotice && <p className="context-warning">{importedBuildVolumeNotice.message}</p>}
      </aside>

      <section className="model-workspace">
        <header className="model-workspace-head"><div><span className="kicker">MODEL</span><h1>{analysis?.fileName ?? 'No model loaded'}</h1>{analysis && <span className="model-measured"><UiIcon name="check"/> Geometry measured</span>}</div>{analysis && <div className="preview-toolbar" role="group" aria-label="Model preview mode">{([['recommended', 'Model'], ['risk', 'Overhangs'], ...(geometryWarnings.length ? [['mesh', 'Mesh issues'] as [PreviewMode, string]] : [])] as Array<[PreviewMode, string]>).map(([id, label]) => <button key={id} className={previewMode === id ? 'active' : ''} aria-pressed={previewMode === id} onClick={() => setPreviewMode(id)}>{label}</button>)}</div>}</header>
        {analysis ? <>
          <div ref={modelPreview} className={`workflow-preview ${spatialMarkingKind ? 'marking-spatial-region' : ''}`}><Suspense fallback={<div className="preview preview-loading" role="status">Loading 3D preview…</div>}><LazyModelPreview geometry={geometry} orientationId={previewOrientationId} mode={previewMode} plateSize={previewPlate} plateLabel={printer ? 'Build plate' : 'Reference plate'} overhangRegionCount={previewGeometryRisk?.overhangRegionCount ?? 0} spatialRegions={spatialPreviewRegions} markingKind={spatialMarkingKind} meshTopology={analysis.topology} onFaceSelect={selectSpatialFace} captureKey={`${analysis.fileName}:${previewOrientationId}:${previewMode}`} onCapture={setPreviewImage}/></Suspense></div>
          <div className="workflow-metrics"><div><b>{(previewOrientation?.heightMm ?? analysis.heightMm).toFixed(1)} mm</b><span>Height</span></div><div><b>{analysis.topology?.componentCount ?? 1}</b><span>Mesh bodies</span></div><button className={previewMode === 'risk' ? 'active' : ''} aria-pressed={previewMode === 'risk'} onClick={() => setPreviewMode('risk')}><b>{previewGeometryRisk?.overhangRegionCount ?? 0}</b><span>Overhangs</span></button><div><b>{((previewGeometryRisk?.bedCoverageRatio ?? 0) * 100).toFixed(1)}%</b><span>Bed contact</span></div></div>
          <details className="model-evidence-drawer" open={showPlanReview && (spatialGaps.length > 0 || meshDecisionNeeded) ? true : undefined}><summary><span>Model checks</span><em className={geometryWarnings.length || spatialGaps.length ? 'warning' : 'ready'}>{meshDecisionNeeded ? '1 decision needed' : spatialGaps.length ? `${spatialGaps.length} area decision${spatialGaps.length === 1 ? '' : 's'}` : geometryWarnings.length ? `${geometryWarnings.length} issue${geometryWarnings.length === 1 ? '' : 's'}` : 'Mesh ready'}</em></summary>
            <div className="model-checks">
              <details className="model-check-detail mesh-integrity-check" open={previewMode === 'mesh' ? true : undefined}><summary><span className={`check-indicator ${geometryWarnings.length ? 'warning' : 'ready'}`}>{geometryWarnings.length ? '!' : <UiIcon name="check"/>}</span><span><b>Mesh integrity</b><small>{meshDecisionNeeded ? 'A geometry decision is required before the plan is ready' : meshDecisionStatus ?? (geometryWarnings.length ? `${geometryWarnings.length} finding${geometryWarnings.length === 1 ? '' : 's'} reviewed` : 'Closed printable mesh detected')}</small></span><em>{geometryWarnings.length ? 'Review ›' : ''}</em></summary>{geometryWarnings.length > 0 && <div className="mesh-integrity-body"><p>Check Make found edges a slicer may interpret or repair. Review the highlighted areas and confirm whether they are intentional.</p><div className="geometry-warnings">{geometryWarnings.map(finding => <div key={finding.id}><b>{finding.label}</b><p>{finding.detail}</p></div>)}</div><div className="mesh-integrity-actions"><button type="button" onClick={showMeshIssues}>Show affected areas</button>{meshDecisionNeeded && <button type="button" onClick={() => document.getElementById('decision-mesh-repair')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Review decision</button>}</div></div>}</details>
              <div><span className="check-indicator neutral">%</span><span><b>Bed contact</b><small>{((previewGeometryRisk?.bedCoverageRatio ?? 0) * 100).toFixed(1)}% of the bounding footprint</small></span></div>
              <button type="button" onClick={() => { setPreviewMode('risk'); requestAnimationFrame(() => modelPreview.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })); }}><span className={`check-indicator ${previewGeometryRisk?.overhangRegionCount ? 'attention' : 'ready'}`}>{previewGeometryRisk?.overhangRegionCount ?? 0}</span><span><b>Overhangs</b><small>{previewGeometryRisk?.overhangRegionCount ? `${previewGeometryRisk.overhangRegionCount} region${previewGeometryRisk.overhangRegionCount === 1 ? '' : 's'} · largest ${previewGeometryRisk.largestOverhangRegionAreaMm2.toFixed(0)} mm²` : 'No angle-based regions detected'}</small></span><em>Show ›</em></button>
              {orientationComparisons.length > 0 && <details className="model-check-detail orientation-check"><summary><span className="check-indicator neutral">↻</span><span><b>Orientation</b><small>{previewOrientation?.label ?? 'As imported'} · select to test alternatives</small></span><em>Review ›</em></summary><div className="orientation-comparison embedded"><p>Compare six axis-aligned orientations using bed contact, overhang exposure, and height. Selecting one updates the 3D model immediately.</p>{orientationComparisons[0].constraintsApplied?.map(note => <p className="orientation-constraint applied" key={note}>Applied: {note}</p>)}{orientationComparisons[0].constraintsUnresolved?.map(note => <p className="orientation-constraint unresolved" key={note}>Not localized: {note}</p>)}{previewOrientationId !== 'as-imported' && <button type="button" className={`compare-orientation ${previewMode === 'compare' ? 'active' : ''}`} aria-pressed={previewMode === 'compare'} onClick={() => { setPreviewMode(previewMode === 'compare' ? 'recommended' : 'compare'); requestAnimationFrame(() => modelPreview.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })); }}>{previewMode === 'compare' ? 'Show selected orientation' : 'Compare with imported orientation'}</button>}<div>{orientationComparisons.map((item, index) => <button className={`${previewOrientationId === item.candidate.id ? 'selected ' : ''}${index === 0 ? 'recommended' : ''}`} aria-pressed={previewOrientationId === item.candidate.id} key={item.candidate.id} onClick={() => { setPreviewOrientationId(item.candidate.id); setPreviewMode('recommended'); requestAnimationFrame(() => modelPreview.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })); }}><span><b>{item.candidate.label}</b><small>{index === 0 ? 'Recommended for current objective' : 'Preview this orientation'}</small></span><span className="orientation-measures">{item.candidate.heightMm.toFixed(1)} mm high · {item.candidate.bedContactAreaMm2.toFixed(0)} mm² contact · {(item.candidate.overhangRatio * 100).toFixed(1)}% overhang</span></button>)}</div></div></details>}
              {showPlanReview && intelligence && <div className="important-areas-check">
                <button type="button" className="model-check-toggle" aria-expanded={importantAreasOpen} onClick={() => setImportantAreasOpen(open => !open)}><span className={`check-indicator ${spatialGaps.length ? 'attention' : spatialIntent.regions.some(region => region.status === 'confirmed') ? 'ready' : 'neutral'}`}>{spatialGaps.length || spatialIntent.regions.filter(region => region.status === 'confirmed').length}</span><span><b>Important areas</b><small>{spatialGaps.length ? `${spatialGaps.length} location decision${spatialGaps.length === 1 ? '' : 's'} to review` : spatialIntent.regions.some(region => region.status === 'confirmed') ? 'Confirmed areas are used in the plan' : 'Optional · Check Make suggestions need your confirmation'}</small></span><em>{importantAreasOpen ? 'Hide' : 'Review'} ›</em></button>
                <button type="button" className="model-check-show" onClick={showImportantAreas}>Show ›</button>
                {importantAreasOpen && <div className="model-check-expanded"><SpatialIntentPanel
                  spatial={spatialIntent} loadRequired={loadLocalizationRequired} matingRequired={matingLocalizationRequired} visibleRequired={visibleLocalizationRequired}
                  planarCandidateId={spatialCandidates?.planarCandidates[0]?.id} thinCandidateId={spatialCandidates?.thinCandidates[0]?.id} thinCandidateMm={spatialCandidates?.thinCandidates[0]?.thicknessMm} thicknessCoverage={spatialCandidates?.thicknessCoverage}
                  markingKind={spatialMarkingKind}
                  onLoadAxis={axis => setSpatialIntent(current => setConfirmedLoadAxis(current, axis, intent?.mechanical.loadDirections.evidenceIds ?? []))}
                  onShowArea={showSpatialArea} onMark={beginSpatialMarking} onUseCandidate={useSpatialCandidate} onRejectCandidate={dismissSpatialCandidate} onNotApplicable={markSpatialNotApplicable} onReset={resetImportantAreas}
                /></div>}
              </div>}
            </div>
            <details className="technical-geometry"><summary>Technical geometry details</summary><dl><div><dt>Triangles</dt><dd>{analysis.triangleCount.toLocaleString()}</dd></div><div><dt>Largest overhang</dt><dd>{previewGeometryRisk?.largestOverhangRegionAreaMm2.toFixed(0) ?? 0} mm² · {previewGeometryRisk?.largestOverhangRegionSpanMm.toFixed(1) ?? '0.0'} mm span</dd></div><div><dt>Mesh boundaries</dt><dd>{analysis.topology?.boundaryEdgeCount ?? 0}</dd></div><div><dt>Non-manifold edges</dt><dd>{analysis.topology?.nonManifoldEdgeCount ?? 0}</dd></div></dl><p>Preliminary geometric measurements. These values are not calibrated failure probabilities.</p></details>
            <details className="analysis-limits"><summary>Analysis limits</summary><div>{analysis.analysisLimits?.map(limit => <div key={limit.id}><span>{limit.status === 'requires-input' ? 'Needs input' : limit.status === 'evaluated' ? 'Screened' : 'Not evaluated'}</span><p><b>{limit.label}</b>{limit.detail}</p></div>)}</div><p className="analysis-limit-note">No structural simulation is performed. Load paths and stress are not inferred from appearance; thickness screening is partial and geometric only.</p></details>
          </details>
        </> : <div className={`workspace-dropzone ${dropActive ? 'drag-active' : ''}`} onDragOver={event => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={event => { event.preventDefault(); setDropActive(false); void loadBrowserFile(event.dataTransfer.files[0]); }}><img src="/check-make-symbol.svg" alt=""/><h2>{busy ? 'Reading model…' : dropActive ? 'Release to inspect' : 'Drop a 3D model to begin'}</h2><p>Check Make starts from geometry, then asks only for decisions that can change the print plan.</p><button className="primary" disabled={busy} onClick={() => void browse()}>Choose model…</button></div>}
        <input ref={fileInput} hidden type="file" accept=".stl,.3mf,.obj" onChange={event => {
          const preserveBrief = preserveBriefOnNextBrowserFile.current;
          preserveBriefOnNextBrowserFile.current = true;
          void loadBrowserFile(event.target.files?.[0], preserveBrief);
        }}/>
      </section>

      <aside className="decision-panel" ref={decisionPanel}>
        {workflowStage === 'import' && <section className="inspect-panel"><span className="kicker">INSPECT</span><h1>{busy ? 'Inspecting the model…' : !analysis ? 'Add a model' : followUps.purpose?.trim() ? 'Ready to inspect' : 'Add context'}</h1><p>{analysis ? 'Describe what the part does and where it will be used. A printer is optional at this stage and, when selected, adds capability and build-volume checks.' : 'Add or load a 3D model first. Then describe its context; you can select a printer now or validate compatibility later.'}</p>
          <div className="inspect-checklist"><div className={analysis ? 'done' : ''}><i>{analysis ? <UiIcon name="check"/> : '1'}</i><span><b>Model geometry</b><small>{analysis ? `${analysis.triangleCount.toLocaleString()} triangles measured` : 'Waiting for STL, 3MF, or OBJ'}</small></span></div><div className={followUps.purpose?.trim() ? 'done' : ''}><i>{followUps.purpose?.trim() ? <UiIcon name="check"/> : '2'}</i><span><b>Context</b><small>{followUps.purpose?.trim() ? 'Included in analysis' : 'Describe the part and its use'}</small></span></div><div className={printer ? 'done' : 'optional'}><i>{printer ? <UiIcon name="check"/> : <UiIcon name="printer"/>}</i><span><b>Target printer <em>Optional</em></b><small>{printer ? `${printer.manufacturer} ${printer.model}` : 'No printer selected · validate later'}</small></span></div><div><i>3</i><span><b>Analysis</b><small>{connection.provider === 'local' ? 'Local geometry + deterministic interpretation' : `Extended AI · ${connection.provider === 'llama' ? 'local provider' : 'cloud provider'} + deterministic rules`}</small></span></div></div>
          <button className="primary workflow-primary" disabled={!analysis || !followUps.purpose?.trim() || busy || (connection.provider === 'openai' && !connection.apiKey.trim())} onClick={() => void runIntelligence()}>{busy ? 'Inspecting…' : connection.provider === 'local' ? 'Run Local Analysis' : 'Run Extended AI Analysis'}</button>
        </section>}

        {workflowStage === 'analysis' && intelligence && <section className={`prepare-panel ${showPlanReview ? 'review-mode' : 'result-mode'}`}>
          {!showPlanReview ? <>
            <div className="prepare-result-heading"><div><span className="kicker">RECOMMENDED PLAN</span><h1>Key settings</h1><p>{intelligence.objectName} · {prepareReadySummary}</p></div><span className="ready-pill">{prepareReadyLabel}</span></div>
            {planPreferenceCandidates.length > 0 && <PlanPreferenceControl
              candidates={planPreferenceCandidates}
              selected={requestedPlanPreference}
              applied={appliedPlanCandidate?.id ?? 'balanced'}
              inherited={inheritedPlanPreference}
              overridden={Boolean(projectPlanPreference)}
              onChange={selectProjectPlanPreference}
              onUseDefault={() => { attemptedAutomaticFilamentSelection.current = ''; setProjectPlanPreference(undefined); setMaterialOverride(undefined); setFilamentProductId(undefined); }}
            />}
            {recommendations.length > 0 && <RecommendedKeySettings recommendations={recommendations} notices={notices} materialOptions={recommendedMaterial ? {
              candidates: materialDecision?.candidates ?? [],
              selected: materialOverride ?? recommendedMaterial,
              recommended: recommendedMaterial,
              decisionReason: materialDecision?.decisionReason ?? 'The deterministic Recommended plan selected this material.',
              printerSelected: Boolean(printer),
              productOptions,
              selectedProduct: selectedFilamentProduct,
              onSelectProduct: setFilamentProductId,
              onSelect: selected => { attemptedAutomaticFilamentSelection.current = ''; setMaterialOverride(selected === recommendedMaterial ? undefined : selected); setFilamentProductId(undefined); },
            } : undefined}/>}
            {materialPlanBlocked && <div className="context-warning unsupported-guidance" role="alert"><b>Material and printer combination is not exportable</b>{materialBlockReasons.map(reason => <p key={reason}>{reason}</p>)}<p>Select a compatible material option or modify the confirmed requirements.</p></div>}
            <div className="plan-result-actions"><button type="button" className="modify-plan" onClick={() => setModifyingPlan(true)}>Modify plan</button><button type="button" className="primary" disabled={materialPlanBlocked} onClick={() => setView('export')}>Continue to export</button></div>
          </> : <>
            <span className="kicker">PREPARE</span><div className="prepare-heading"><div><h1>{unsupportedPlan ? 'Review unsupported requirement' : modifyingPlan ? 'Modify plan' : 'Review assumptions'}</h1><p>{intelligence.objectName}</p></div><span className="review-pill">{unsupportedPlan ? 'Unsupported use' : 'Review required'}</span></div><div className="readiness-summary"><i style={{ '--readiness': `${Math.max(16, 100 - Math.max(1, decisionCount) * 12)}%` } as React.CSSProperties}/><div><b>{unsupportedPlan ? 'Export is paused for this requirement' : decisionCount ? `${decisionCount} item${decisionCount === 1 ? '' : 's'} to review` : 'Review the interpreted plan inputs'}</b><small>{intelligence.likelyPurpose}</small></div></div>
            {readiness?.unsupportedReasons.map(reason => <div className="context-warning unsupported-guidance" role="alert" key={reason}><b>Export paused for this requirement</b><p>{reason}</p><p>Correct the related answer below if the requirement was misunderstood. If it is accurate, Check Make does not yet have a qualified dataset for this use.</p></div>)}
            <InterpretationSummary intelligence={intelligence} purposeClarification={followUps['object-purpose-description'] ?? ''} onPurposeClarification={updatePurposeClarificationDraft} onApplyPurposeClarification={applyPurposeClarification}/>
            {editableQuestions.length > 0 && <div className="workflow-questions"><div className="decision-heading"><div><h2>{unsupportedPlan ? 'Review the answer that paused export' : modifyingPlan ? 'Edit plan decisions' : 'Review Check Make’s assumptions'}</h2><p>{unsupportedPlan ? 'Change the answer only if Check Make misunderstood the requirement, then re-check the complete plan.' : modifyingPlan ? 'Your earlier answers remain editable. Changes are re-applied to the complete plan.' : 'Context statements and world-model assumptions are prefilled. Change only what Check Make misunderstood.'}</p></div><span>{unansweredQuestions.length ? `${unansweredQuestions.length} missing` : assumptionReviewCount ? `${assumptionReviewCount} to review` : 'Complete'}</span></div>{editableQuestions.map(question => {
              const inferredEvidence = autoFilledDecisions[question.id];
              const requirement = question.field && ['environment', 'load', 'impact', 'heat', 'priority', 'supportsAllowed'].includes(question.field)
                ? intelligence.requirements[question.field as ChecklistField]
                : undefined;
              const input = question.kind === 'single' && question.options
                ? <OptionPicker
                    label={question.question}
                    value={followUps[question.id] ?? ''}
                    options={[{ value: '', label: 'Choose…' }, ...question.options]}
                    onChange={value => updateDecision(question.id, value)}
                    triggerRef={element => { decisionInputs.current[question.id] = element; }}
                  />
                : <textarea ref={element => { decisionInputs.current[question.id] = element; }} value={followUps[question.id] ?? ''} onChange={event => question.id === 'purpose' ? updatePurpose(event.target.value) : setFollowUps(current => ({ ...current, [question.id]: event.target.value }))} onBlur={() => { manuallyAnsweredDecisions.current.add(question.id); focusNextDecision(question.id, followUps); }} placeholder="Describe only what you know…"/>;
              const interpretationLabel = requirement?.status === 'assumed'
                ? 'Assumed by Check Make · review'
                : requirement?.status === 'inferred'
                  ? 'Interpreted from Context · review if needed'
                  : inferredEvidence ? 'Prefilled · review if needed' : '';
              return <label id={`decision-${question.id}`} onFocusCapture={() => { if (question.id === 'mesh-repair') setPreviewMode('mesh'); }} className={`${(followUps[question.id] ?? '').trim() ? 'answered ' : ''}${inferredEvidence ? 'inferred' : ''}${question.id === 'mesh-repair' ? ' mesh-decision' : ''}`} key={question.id}><span className="decision-state">{(followUps[question.id] ?? '').trim() ? '✓' : editableQuestions.findIndex(item => item.id === question.id) + 1}</span><span className="decision-copy"><b>{question.question}</b><small>{question.why}</small>{question.id === 'mesh-repair' && <button type="button" className="show-question-geometry" onClick={event => { event.preventDefault(); event.stopPropagation(); showMeshIssues(); }}>Show highlighted areas in 3D</button>}{input}{interpretationLabel && <em title={requirement?.evidence.join(', ') ?? inferredEvidence?.join(', ')}>{interpretationLabel}</em>}</span></label>;
            })}</div>}
            <section className="support-assessment"><div className="support-heading"><span className="kicker">SUPPORT RECOMMENDATION</span><h2>{supportRecommendationLabel}</h2><p>{selectedSupportPreference === 'auto' ? supportRecommendationReason : supportOverrideReason}</p></div><div className="support-choices" role="group" aria-label="Support recommendation">
              <button type="button" className={selectedSupportPreference === 'auto' ? 'selected' : ''} aria-pressed={selectedSupportPreference === 'auto'} onClick={() => updateSupportPreference('auto')}><b>Follow Check Make</b><small>{supportRecommendationLabel}</small></button>
              <button type="button" className={selectedSupportPreference !== 'auto' ? 'selected' : ''} aria-pressed={selectedSupportPreference !== 'auto'} onClick={() => updateSupportPreference(supportOverridePreference)}><b>Use the alternative</b><small>{supportOverrideLabel}</small></button>
            </div></section>
            <button className="primary workflow-primary" disabled={busy || unresolvedDecisionCount > 0 && !(purposeNeedsContext && followUps['object-purpose-description']?.trim() && unresolvedDecisionCount === 1)} onClick={() => void refine()}>{primaryPrepareLabel}</button>
          </>}
        </section>}

        {workflowStage === 'export' && intelligence && <section className="export-panel"><span className="kicker">EXPORT</span><h1>Export project</h1><p>The preparation is complete. Choose a portable Core 3MF or a compatible slicer-native project.</p><button className="quiet back-to-prepare" onClick={() => setView('analysis')}>← Return to Prepare</button>
          <div className="workflow-adapters">{adapters.map(adapter => { const compatible = adapter.target === 'generic' || Boolean(printer && supportsPrinter(adapter, printerId)); const icon = slicerIcon[adapter.target]; return <button key={adapter.target} data-target={adapter.target} style={{ '--adapter-accent': slicerAccent[adapter.target] } as React.CSSProperties} aria-pressed={packageTarget === adapter.target} className={packageTarget === adapter.target ? 'selected' : ''} disabled={!adapter.available || (adapter.target !== 'generic' && !printer)} onClick={() => { setPackageTarget(adapter.target); setPackageTargetManuallySelected(true); }}><span className="adapter-icon" aria-hidden="true">{icon ? <img src={icon} alt=""/> : <UiIcon name="package"/>}</span><span><b>{adapter.label}</b><small>{!adapter.available ? 'Not installed' : !printer && adapter.target !== 'generic' ? 'Select a printer for native export' : compatible ? adapter.capability === 'core-3mf' ? 'Portable 3MF' : 'Native project · Ready' : 'Choose a compatible printer'}</small></span><em>{packageTarget === adapter.target ? '✓' : '›'}</em></button>; })}</div>
          {selectedAdapter?.available && !selectedPrinterSupported && <div className="context-warning"><b>{printer ? `${selectedAdapter.label} does not yet support ${printer.model}.` : 'Select a printer for slicer-native export.'}</b>{printer && <p>Supported profiles: {supportedPrinterNames}.</p>}</div>}
          <details className="workflow-evidence"><summary>Package contents & validation</summary><ul><li>Core 3MF geometry in millimetres</li><li>Selected orientation baked into geometry</li><li>Degenerate triangles removed</li><li>Check Make analysis and canonical settings metadata</li>{nativeProjectTarget && <li>{nativeTargetLabel} native profiles and mapped settings</li>}</ul><p>{nativeValidationText}</p></details>
          {materialPlanBlocked && <div className="context-warning unsupported-guidance" role="alert"><b>Export blocked by material compatibility</b>{materialBlockReasons.map(reason => <p key={reason}>{reason}</p>)}</div>}
          <div className="export-actions"><button type="button" className="export-save-project" disabled={!sourceModelPath || busy} onClick={() => void saveProject()}>Save Check Make project…</button><button className="primary" disabled={busy || materialPlanBlocked || !sourcePath || !selectedAdapter?.available || !selectedPrinterSupported} onClick={() => void createPackage(packageTarget === 'bambu' ? 'open' : 'save')}>{busy ? 'Creating…' : packageTarget === 'generic' ? 'Create Core 3MF…' : packageTarget === 'bambu' ? 'Open in Bambu Studio' : `Export for ${selectedAdapter?.label ?? packageTarget}…`}</button></div>
          {status && <p className="save-status">{status.startsWith('Project saved:') ? 'Check Make project saved.' : status === 'Export cancelled' ? status : 'Export completed successfully.'}</p>}
          {(packageResult || status.startsWith('Project saved:') || validationReport) && <details className="export-details"><summary><span>{packageResult || validationReport ? 'Export details & checks' : 'Saved project details'}</span><em>{validationReport ? `${validationReport.checks.length} checks` : 'Details'}</em></summary><div className="export-detail-content">
            {(packageResult?.path || status.startsWith('Project saved:')) && <section className="export-detail-section export-location"><h3>{packageResult ? 'Exported file' : 'Saved project'}</h3><div className="export-location-row"><p title={packageResult?.path ?? status.slice('Project saved:'.length).trim()}>{fileNameFromPath(packageResult?.path ?? status.slice('Project saved:'.length).trim())}</p>{packageResult && <button type="button" className="export-reveal-file" onClick={() => void revealExportedFile(packageResult.path)}><UiIcon name="folder"/><span>{fileManagerActionLabel}</span></button>}</div></section>}
            {packageResult && packageResult.warnings.length > 0 && <section className="export-detail-section export-notes"><h3>Export notes</h3><ul>{packageResult.warnings.map(warning => <li key={warning}><span className="export-note-icon" aria-hidden="true"><UiIcon name="info"/></span><span>{warning}</span></li>)}</ul></section>}
            {validationReport && <section className="export-detail-section export-validation"><div className="export-validation-heading"><h3>Validation checks</h3><span>{validationReport.checks.filter(check => check.passed).length} of {validationReport.checks.length} passed</span></div><ul>{validationReport.checks.map(check => <li className={check.passed ? 'passed' : 'failed'} key={check.id}><span>{check.passed ? '✓' : '!'}</span><p><b>{check.label}</b>{check.detail}</p></li>)}</ul></section>}
          </div></details>}
        </section>}
        {error && <p className="page-error workflow-error" role="alert">{error}</p>}
      </aside>
    </main>
  </div>;
}
