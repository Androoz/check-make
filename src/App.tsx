import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Edges, Grid, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { chooseOrientation, compareOrientations, geometryForOrientation, riskVisualizationGeometry } from './geometry/stl';
import {
  analyzeSpatialCandidates, applySpatialRegionColors, confirmCandidate, confirmedRegion,
  emptySpatialManufacturingIntent, facePatchRegion, normalizeSpatialManufacturingIntent,
  rejectSpatialCandidate, replaceSpatialRegion, setConfirmedLoadAxis, setSpatialRegionNotApplicable,
} from './geometry/spatialIntent';
import { cameraPose } from './geometry/previewScene';
import type { CameraView } from './geometry/previewScene';
import { importModel } from './geometry/importModel';
import { evaluateRules } from './rules/engine';
import { ruleEvidenceById, rules } from './rules/load';
import { checkBuildVolume, checkMaterialCompatibility } from './material/compatibility';
import { getPrinter, printerAgnosticProfile, printerProfiles } from './printers/profiles';
import { analyzeWithOpenAI, localModelAnalysis, prepareIntelligenceForReview, questionnaireFromIntelligence, refineLocalIntelligence } from './ai/modelIntelligence';
import { packageFileName, serializeRecommendations } from './export/manufacturing';
import { adapterPlaceholders, mergeDetectedAdapters, suggestSlicerTarget, supportsPrinter } from './export/adapters';
import { RecommendedKeySettings, TradeOffAlternatives } from './results/RecommendationResults';
import { buildPlanAlternatives } from './results/alternatives';
import type { PlanObjective } from './results/alternatives';
import { assessDecisionReadiness } from './decision/readiness';
import { deriveWorkflowStage, isPreparationComplete, prepareStatus } from './workflow/state';
import { analyzePurposeContext } from './workflow/decisionAutomation';
import { intentFactUsable } from './intent/manufacturingIntent';
import type { ContextClarificationOption, ContextInterpretationIssue } from './workflow/decisionAutomation';
import type { AIConnection, ModelIntelligence } from './ai/modelIntelligence';
import type { ChecklistField, CompatibilityNotice, ManufacturingPackageResult, Material, ModelAnalysis, PackageValidationReport, SlicerAdapterStatus, SlicerTarget, SpatialManufacturingIntent, SpatialRegion, SpatialRegionKind } from './types';
import './styles.css';
import './desktop-mvp.css';
import './workflow-v4.css';
import './accessibility-v5.css';

type View = 'import' | 'analysis' | 'export';
type PreviewMode = 'original' | 'recommended' | 'risk' | 'compare' | 'spatial';
type UiIconName = 'model' | 'printer' | 'material' | 'orientation' | 'support' | 'layer' | 'walls' | 'infill' | 'package' | 'check' | 'lock' | 'settings';

const slicerIconPath: Partial<Record<SlicerTarget, string>> = {
  bambu: '/slicer-icons/bambu.png', orca: '/slicer-icons/orca.png', prusa: '/slicer-icons/prusa.png',
  cura: '/slicer-icons/cura.png', creality: '/slicer-icons/creality.png',
};
const slicerAccent: Record<SlicerTarget, string> = {
  generic: '#1c8f70', bambu: '#00a846', orca: '#13a9ad', prusa: '#f26a21', cura: '#1769d2', creality: '#77b900',
};

interface AppPreferences {
  defaultPrinterId: string;
  defaultAnalysisProvider: AIConnection['provider'];
  density: 'comfortable' | 'compact';
}

const preferenceStorageKey = 'check-make.application-preferences';
const initialPreferences: AppPreferences = { defaultPrinterId: '', defaultAnalysisProvider: 'local', density: 'comfortable' };

function loadPreferences(): AppPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(preferenceStorageKey) ?? '{}') as Partial<AppPreferences>;
    return {
      defaultPrinterId: printerProfiles.some(profile => profile.id === stored.defaultPrinterId) ? stored.defaultPrinterId! : '',
      defaultAnalysisProvider: stored.defaultAnalysisProvider === 'openai' ? 'openai' : 'local',
      density: stored.density === 'compact' ? 'compact' : 'comfortable',
    };
  } catch { return initialPreferences; }
}

function savePreferences(preferences: AppPreferences) {
  try { localStorage.setItem(preferenceStorageKey, JSON.stringify(preferences)); } catch { /* Preferences remain session-local. */ }
}

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
  return <mesh geometry={prepared} position={centeredPosition} castShadow receiveShadow onPointerDown={event => {
    if (!onFaceSelect || event.faceIndex == null) return;
    event.stopPropagation(); onFaceSelect(event.faceIndex);
  }}><meshStandardMaterial color={risk || spatialRegions.length ? '#ffffff' : color} vertexColors={risk || spatialRegions.length > 0} roughness={0.52} metalness={0.03} transparent={opacity < 1} opacity={opacity}/><Edges threshold={32} color={risk ? '#34413c' : '#63716b'}/></mesh>;
}

function CameraPreset({ view, distance, targetY, resetKey }: { view: CameraView; distance: number; targetY: number; resetKey: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const pose = cameraPose(view, distance, targetY);
    camera.position.set(...pose.position); camera.up.set(...pose.up); camera.lookAt(...pose.target); camera.updateProjectionMatrix();
  }, [camera, distance, resetKey, targetY, view]);
  return null;
}

function BuildPlate({ width, depth, ghost }: { width: number; depth: number; ghost: boolean }) {
  return <group>
    <mesh position={[0, -0.85, 0]} receiveShadow><boxGeometry args={[width, 1.7, depth]}/><meshStandardMaterial color="#073a60" roughness={0.82} transparent opacity={ghost ? 0.13 : 0.94} depthWrite={!ghost}/></mesh>
    <Grid args={[width, depth]} position={[0, 0.03, 0]} cellSize={10} sectionSize={50} cellColor="#4b9bc0" sectionColor="#8ddcff" cellThickness={0.55} sectionThickness={1} fadeDistance={Math.max(width, depth) * 1.5} fadeStrength={0.5} infiniteGrid={false}/>
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
    {showPlate && <BuildPlate width={plateSize.x} depth={plateSize.y} ghost={cameraView === 'bottom'}/>}
    {showAxes && <PrinterAxes width={axesWidth} depth={axesDepth}/>}
    {geometry && <group rotation={[-Math.PI / 2, 0, 0]}>
      {mode === 'compare' ? <><PreparedModel geometry={geometry} orientationId="as-imported" color="#8a969c" opacity={0.72} position={[-comparisonOffset, 0, 0]}/><PreparedModel geometry={geometry} orientationId={orientationId} position={[comparisonOffset, 0, 0]}/></> : <PreparedModel geometry={geometry} orientationId={mode === 'original' ? 'as-imported' : orientationId} risk={mode === 'risk'} spatialRegions={mode === 'spatial' ? spatialRegions : []} onFaceSelect={mode === 'spatial' && markingKind ? onFaceSelect : undefined}/>}
    </group>}
    {showPlate && <ContactShadows position={[0, 0.05, 0]} scale={Math.max(plateSize.x, plateSize.y) * .8} opacity={darkAppearance ? .42 : .25} blur={2.6} far={Math.max(modelSize.z, 40) * 1.4}/>}
    <OrbitControls makeDefault target={[0, targetY, 0]}/>
    {geometry && captureKey && onCapture && <CapturePreview captureKey={captureKey} onCapture={onCapture} distance={cameraDistance} targetY={targetY}/>}
  </Canvas><div className="scene-controls"><div><button onClick={() => setCameraReset(current => current + 1)}>Fit model</button><button className={showPlate ? 'active' : ''} aria-pressed={showPlate} onClick={() => setShowPlate(current => !current)}>Build plate</button><button className={showAxes ? 'active' : ''} aria-pressed={showAxes} onClick={() => setShowAxes(current => !current)}>Axes</button></div><label>View<select value={cameraView} onChange={event => { setCameraView(event.target.value as CameraView); setCameraReset(current => current + 1); }}><option value="isometric">Isometric</option><option value="top">Top</option><option value="front">Front</option><option value="back">Back</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></label></div>{mode === 'risk' && <div className="risk-legend"><b>{overhangRegionCount ? `${overhangRegionCount} area${overhangRegionCount === 1 ? '' : 's'} may require support` : 'No angle-based overhangs found'}</b><span><i className="risk-normal"/>Model</span><span><i className="risk-bed"/>Bed contact</span><span><i className="risk-overhang"/>Support likely</span><span><i className="risk-severe"/>Downward face</span><small>Angle-based geometry check, not a print simulation.</small></div>}{mode === 'spatial' && <div className="spatial-legend"><b>{markingKind ? `Select a ${markingKind.replaceAll('-', ' ')}` : 'Functional geometry'}</b><span><i className="spatial-load"/>Load-bearing</span><span><i className="spatial-mating"/>Mating</span><span><i className="spatial-visible"/>Visible</span><span><i className="spatial-thin"/>Critical thin</span><small>{markingKind ? 'Click a connected surface patch on the model.' : 'Only confirmed regions affect decisions.'}</small></div>}{mode === 'compare' && <div className="comparison-legend"><span>Imported</span><span>Preview orientation</span></div>}{showPlate && <div className="plate-size-label">{plateLabel} {plateSize.x} × {plateSize.y} mm</div>}</div>;
}

function SpatialIntentPanel({ spatial, loadRequired, matingRequired, visibleRequired, planarCandidateId, thinCandidateId, thinCandidateMm, thicknessCoverage, markingKind, onLoadAxis, onMark, onUseCandidate, onRejectCandidate, onNotApplicable }: {
  spatial: SpatialManufacturingIntent; loadRequired: boolean; matingRequired: boolean; visibleRequired: boolean;
  planarCandidateId?: string; thinCandidateId?: string; thinCandidateMm?: number; thicknessCoverage?: { sampledTriangles: number; measuredTriangles: number; totalTriangles: number };
  markingKind?: SpatialRegionKind; onLoadAxis: (axis: 'x' | 'y' | 'z' | 'not-applicable') => void;
  onMark: (kind: SpatialRegionKind) => void; onUseCandidate: (kind: SpatialRegionKind) => void; onRejectCandidate: (kind: SpatialRegionKind) => void; onNotApplicable: (kind: SpatialRegionKind) => void;
}) {
  const regionRow = (kind: SpatialRegionKind, label: string, required: boolean, candidateId?: string) => {
    if (!required && kind !== 'critical-thin') return null;
    const region = confirmedRegion(spatial, kind); const notApplicable = spatial.notApplicable.includes(kind);
    const candidateAvailable = Boolean(candidateId && !spatial.rejectedCandidateIds.includes(`${kind}:${candidateId}`));
    return <div className={`spatial-decision-row ${region || notApplicable ? 'resolved' : required ? 'required' : ''}`} key={kind}>
      <span><b>{label}</b><small>{region ? `${region.mesh.triangleIndices.length} faces confirmed` : notApplicable ? 'Marked not applicable' : required ? 'Required by confirmed Context' : thinCandidateMm ? `Candidate estimate ${thinCandidateMm.toFixed(2)} mm` : 'No usable candidate found'}</small></span>
      <div>{candidateAvailable && !region && <><button type="button" onClick={() => onUseCandidate(kind)}>Use candidate</button><button type="button" onClick={() => onRejectCandidate(kind)}>Dismiss suggestion</button></>}<button type="button" className={markingKind === kind ? 'active' : ''} onClick={() => onMark(kind)}>{markingKind === kind ? 'Click model…' : region ? 'Replace' : 'Select on model'}</button>{required && <button type="button" onClick={() => onNotApplicable(kind)}>Not applicable</button>}</div>
    </div>;
  };
  return <section className="spatial-intent-panel" aria-labelledby="spatial-intent-title">
    <div className="spatial-intent-heading"><div><h2 id="spatial-intent-title">Functional geometry</h2><p>Connect confirmed requirements to the model. Geometry candidates remain hypotheses until you confirm them.</p></div><span>{spatial.regions.filter(region => region.status === 'confirmed').length} marked</span></div>
    {loadRequired && <div className={`spatial-axis-row ${spatial.loadAxis.status === 'confirmed' || spatial.loadAxis.status === 'not-applicable' ? 'resolved' : 'required'}`}><span><b>Model-space load axis</b><small>{spatial.loadAxis.status === 'confirmed' ? `${spatial.loadAxis.axis.toUpperCase()} axis confirmed` : spatial.loadAxis.status === 'not-applicable' ? 'No single axis applies' : 'Required by the described mechanical load'}</small></span><div>{(['x', 'y', 'z'] as const).map(axis => <button type="button" className={spatial.loadAxis.axis === axis && spatial.loadAxis.status === 'confirmed' ? 'active' : ''} onClick={() => onLoadAxis(axis)} key={axis}>{axis.toUpperCase()}</button>)}<button type="button" onClick={() => onLoadAxis('not-applicable')}>No single axis</button></div></div>}
    {regionRow('load-bearing', 'Load-bearing region', loadRequired, planarCandidateId)}
    {regionRow('mating-surface', 'Mating surface', matingRequired, planarCandidateId)}
    {regionRow('visible-surface', 'Appearance-critical surface', visibleRequired, planarCandidateId)}
    {regionRow('critical-thin', 'Critical thin region', false, thinCandidateId)}
    {thicknessCoverage && <p className="spatial-coverage">Thickness screening measured {thicknessCoverage.measuredTriangles} of {thicknessCoverage.sampledTriangles} sampled faces across {thicknessCoverage.totalTriangles} total triangles. Missing intersections remain unevaluated.</p>}
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
    <div className="workflow-brand"><img src="/check-make-wordmark.svg" alt="CHECK / MAKE"/></div>
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
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());
  const [view, setView] = useState<View>('import');
  const [analysis, setAnalysis] = useState<ModelAnalysis>();
  const [geometry, setGeometry] = useState<THREE.BufferGeometry>();
  const [sourcePath, setSourcePath] = useState<string>();
  const [sourceModelPath, setSourceModelPath] = useState<string>();
  const [previewImage, setPreviewImage] = useState<string>();
  const [intelligence, setIntelligence] = useState<ModelIntelligence>();
  const [connection, setConnection] = useState<AIConnection>(() => ({ provider: preferences.defaultAnalysisProvider, apiKey: '', model: 'gpt-5.4-mini' }));
  const [printerId, setPrinterId] = useState(() => preferences.defaultPrinterId);
  const [followUps, setFollowUps] = useState<Record<string, string>>({});
  const [autoFilledDecisions, setAutoFilledDecisions] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [status, setStatus] = useState('');
  const [validationReport, setValidationReport] = useState<PackageValidationReport>();
  const [packageTarget, setPackageTarget] = useState<SlicerTarget>('generic');
  const [packageTargetManuallySelected, setPackageTargetManuallySelected] = useState(false);
  const [adapters, setAdapters] = useState<SlicerAdapterStatus[]>(adapterPlaceholders);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('recommended');
  const [previewOrientationId, setPreviewOrientationId] = useState('as-imported');
  const [spatialIntent, setSpatialIntent] = useState<SpatialManufacturingIntent>(() => emptySpatialManufacturingIntent());
  const [spatialMarkingKind, setSpatialMarkingKind] = useState<SpatialRegionKind>();
  const [planObjective, setPlanObjective] = useState<PlanObjective>('recommended');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const decisionPanel = useRef<HTMLElement>(null);
  const decisionInputs = useRef<Record<string, HTMLSelectElement | HTMLTextAreaElement | null>>({});
  const manuallyAnsweredDecisions = useRef(new Set<string>());
  const automaticallyAnsweredDecisions = useRef(new Set<ChecklistField>());
  const printer = printerProfiles.find(profile => profile.id === printerId);
  const analysisPrinter = printer ?? printerAgnosticProfile;
  const previewPlate = printer?.buildVolume ?? { x: 250, y: 250, z: 250 };
  const previewOrientation = analysis?.orientations.find(candidate => candidate.id === previewOrientationId) ?? analysis?.orientations[0];
  const previewGeometryRisk = previewOrientation?.geometryRisk ?? analysis?.geometryRisk;
  const geometryWarnings = analysis?.findings?.filter(finding => finding.severity === 'warning') ?? [];
  const suggestedPackageTarget = useMemo(() => suggestSlicerTarget(adapters, printerId), [adapters, printerId]);
  const suggestedPackageAdapter = adapters.find(adapter => adapter.target === suggestedPackageTarget) ?? adapterPlaceholders[0];
  const spatialCandidates = useMemo(() => geometry ? analyzeSpatialCandidates(geometry) : undefined, [geometry]);
  const questionnaire = useMemo(() => intelligence ? { ...questionnaireFromIntelligence(intelligence, analysisPrinter), spatialIntent } : undefined, [intelligence, analysisPrinter, spatialIntent]);
  const recommendedOrientation = useMemo(() => analysis && questionnaire ? chooseOrientation(analysis, questionnaire.priority, questionnaire.manufacturingIntent, spatialIntent) : undefined, [analysis, questionnaire, spatialIntent]);
  const fasterOrientation = useMemo(() => analysis && questionnaire ? chooseOrientation(analysis, 'speed', questionnaire.manufacturingIntent, spatialIntent) : undefined, [analysis, questionnaire, spatialIntent]);
  const performanceOrientation = useMemo(() => analysis && questionnaire ? chooseOrientation(analysis, 'strength', questionnaire.manufacturingIntent, spatialIntent) : undefined, [analysis, questionnaire, spatialIntent]);
  const orientation = planObjective === 'time' ? fasterOrientation : planObjective === 'performance' ? performanceOrientation : recommendedOrientation;
  const orientationPriority = planObjective === 'time' ? 'speed' : planObjective === 'performance' ? 'strength' : questionnaire?.priority;
  const orientationComparisons = useMemo(() => analysis && orientationPriority ? compareOrientations(analysis, orientationPriority, questionnaire?.manufacturingIntent, spatialIntent) : [], [analysis, orientationPriority, questionnaire?.manufacturingIntent, spatialIntent]);
  const recommendedEvaluated = useMemo(() => analysis ? { ...analysis, orientationLabel: recommendedOrientation?.label ?? 'As imported' } : undefined, [analysis, recommendedOrientation]);
  const fasterEvaluated = useMemo(() => analysis ? { ...analysis, orientationLabel: fasterOrientation?.label ?? 'As imported' } : undefined, [analysis, fasterOrientation]);
  const performanceEvaluated = useMemo(() => analysis ? { ...analysis, orientationLabel: performanceOrientation?.label ?? 'As imported' } : undefined, [analysis, performanceOrientation]);
  const recommendedPlan = useMemo(() => recommendedEvaluated && questionnaire ? evaluateRules(rules, recommendedEvaluated, questionnaire, ruleEvidenceById, 'recommended') : [], [questionnaire, recommendedEvaluated]);
  const fasterPlan = useMemo(() => fasterEvaluated && questionnaire ? evaluateRules(rules, fasterEvaluated, questionnaire, ruleEvidenceById, 'time') : [], [fasterEvaluated, questionnaire]);
  const performancePlan = useMemo(() => performanceEvaluated && questionnaire ? evaluateRules(rules, performanceEvaluated, questionnaire, ruleEvidenceById, 'performance') : [], [performanceEvaluated, questionnaire]);
  const planAlternatives = useMemo(() => buildPlanAlternatives(recommendedPlan, fasterPlan, performancePlan), [fasterPlan, performancePlan, recommendedPlan]);
  const recommendations = planObjective === 'time' ? fasterPlan : planObjective === 'performance' ? performancePlan : recommendedPlan;
  const material = recommendations.find(item => item.setting === 'material')?.value as Material | undefined;
  const notices = useMemo<CompatibilityNotice[]>(() => {
    if (!material || !analysis) return [];
    if (!printer) return [{ severity: 'warning', message: 'Target printer is not selected. Material capability and build volume have not yet been validated.' }];
    return [...checkMaterialCompatibility(material, printer), ...checkBuildVolume(analysis, printer)];
  }, [material, printer, analysis]);
  const nativeProjectTarget = packageTarget === 'bambu' || packageTarget === 'orca' || packageTarget === 'prusa' || packageTarget === 'cura' || packageTarget === 'creality';
  const nativeTargetLabel = packageTarget === 'bambu' ? 'Bambu Studio' : packageTarget === 'orca' ? 'OrcaSlicer' : packageTarget === 'prusa' ? 'PrusaSlicer' : packageTarget === 'cura' ? 'UltiMaker Cura' : 'Creality Print';
  const nativeValidationText = packageTarget === 'bambu' ? 'Check Make writes the Bambu project directly and verifies its structure and mapped settings before saving.' : packageTarget === 'orca' ? 'Check Make verifies both the project structure and OrcaSlicer’s effective settings before saving.' : packageTarget === 'prusa' ? 'Check Make lets PrusaSlicer build the project, then verifies both its embedded and effective settings before saving.' : packageTarget === 'cura' ? 'Check Make validates Cura’s workspace structure, installed profiles, and embedded process settings before saving.' : packageTarget === 'creality' ? 'Check Make validates Creality Print profile values and active project overrides before saving.' : 'The selected slicer can import the model, but process settings remain advisory metadata.';
  const selectedAdapter = adapters.find(item => item.target === packageTarget);
  const selectedPrinterSupported = packageTarget === 'generic' || Boolean(printer && supportsPrinter(selectedAdapter, printerId));
  const supportedPrinterNames = selectedAdapter?.supportedPrinterIds?.map(id => getPrinter(id).model).join(', ') ?? '';
  const readiness = useMemo(() => intelligence ? assessDecisionReadiness(intelligence, spatialIntent) : undefined, [intelligence, spatialIntent]);
  const importedBuildVolumeNotice = analysis && printer ? checkBuildVolume(analysis, printer)[0] : undefined;
  const unansweredQuestions = intelligence?.questions.filter(question => !(followUps[question.id] ?? '').trim()) ?? [];
  const spatialGaps = readiness?.gaps.filter(gap => gap.id.startsWith('spatial-')) ?? [];
  const preparationComplete = isPreparationComplete(readiness?.conservativePlan === 'ready', unansweredQuestions.length + spatialGaps.length);
  const purposeNeedsContext = Boolean(intelligence && !intelligence.purposeConfirmed && !intelligence.questions.some(question => question.id === 'object-purpose'));
  const workflowStage: View = deriveWorkflowStage({ hasIntelligence: Boolean(intelligence), exportRequested: view === 'export', ready: preparationComplete });
  const contextAnalysis = useMemo(() => analyzePurposeContext(followUps.purpose ?? '', followUps), [followUps]);
  const contextFunctionKnown = contextAnalysis.facets.some(facet => facet.category === 'object-function');
  const contextNeedsFunction = Boolean(followUps.purpose?.trim()) && !contextFunctionKnown;
  const intent = intelligence?.manufacturingIntent;
  const loadLocalizationRequired = Boolean(intent && intentFactUsable(intent.mechanical.loadDirections) && intent.mechanical.loadDirections.value.length);
  const matingLocalizationRequired = Boolean(intent && (
    intentFactUsable(intent.interface.fitType) && intent.interface.fitType.value !== 'unknown'
    || intentFactUsable(intent.interface.criticalSurfaces) && intent.interface.criticalSurfaces.value.includes('mating')
  ));
  const visibleLocalizationRequired = Boolean(intent && intentFactUsable(intent.interface.criticalSurfaces) && intent.interface.criticalSurfaces.value.includes('visible'));
  const spatialPreviewRegions = useMemo(() => {
    const confirmed = spatialIntent.regions.filter(region => region.status === 'confirmed');
    if (confirmed.length || previewMode !== 'spatial') return confirmed;
    return [
      spatialCandidates?.planarCandidates.find(candidate => !spatialIntent.rejectedCandidateIds.includes(`visible-surface:${candidate.id}`)),
      spatialCandidates?.thinCandidates.find(candidate => !spatialIntent.rejectedCandidateIds.includes(`critical-thin:${candidate.id}`)),
    ].filter(Boolean) as SpatialRegion[];
  }, [previewMode, spatialCandidates, spatialIntent]);
  const contextSignals = useMemo(() => {
    const signals = [
      ...Object.entries(contextAnalysis.suggestions).map(([field, suggestion]) => ({
        id: `decision-${field}`, label: field, value: suggestion?.value ?? '',
      })),
      ...contextAnalysis.facets.map(facet => ({ id: facet.id, label: facet.label, value: facet.value })),
    ];
    const seen = new Set<string>();
    return signals.filter(signal => {
      const key = `${signal.label}:${signal.value}`;
      if (!signal.value || seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 8);
  }, [contextAnalysis.facets, contextAnalysis.suggestions]);

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
    if (planObjective !== 'recommended' && !planAlternatives.find(item => item.id === planObjective)?.available) setPlanObjective('recommended');
  }, [planAlternatives, planObjective]);

  const selectPrinter = (id: string) => {
    setPrinterId(id); setPackageTargetManuallySelected(false);
    setPackageTarget(suggestSlicerTarget(adapters, id));
    if (intelligence) setView('analysis');
  };

  const updatePreferences = (changes: Partial<AppPreferences>) => {
    setPreferences(current => {
      const next = { ...current, ...changes };
      savePreferences(next);
      return next;
    });
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
      setIntelligence(undefined); setView('import'); setStatus(''); setValidationReport(undefined);
      manuallyAnsweredDecisions.current.clear(); automaticallyAnsweredDecisions.current.clear();
    }
    updatePurpose(value);
  };
  const applyContextClarification = (issue: ContextInterpretationIssue, option: ContextClarificationOption) => {
    const current = (followUps.purpose ?? '').trim();
    const separator = current && !/[.!?]$/.test(current) ? '. ' : current ? ' ' : '';
    updateProjectBrief(`${current}${separator}${option.statement}`);
    updateDecision(issue.field, option.value);
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

  const spatialEvidenceFor = (kind: SpatialRegionKind) => {
    if (!intent) return [];
    if (kind === 'load-bearing') return intent.mechanical.loadDirections.evidenceIds;
    if (kind === 'mating-surface') return [...new Set([...intent.interface.fitType.evidenceIds, ...intent.interface.criticalSurfaces.evidenceIds])];
    if (kind === 'visible-surface') return intent.interface.criticalSurfaces.evidenceIds;
    return ['geometry:opposing-ray-screening'];
  };
  const beginSpatialMarking = (kind: SpatialRegionKind) => {
    setSpatialMarkingKind(kind); setPreviewMode('spatial');
  };
  const selectSpatialFace = (faceIndex: number) => {
    if (!geometry || !spatialMarkingKind) return;
    const labels: Record<SpatialRegionKind, string> = {
      'load-bearing': 'Confirmed load-bearing region', 'mating-surface': 'Confirmed mating surface',
      'visible-surface': 'Confirmed visible surface', 'critical-thin': 'Confirmed critical thin region',
    };
    const region = facePatchRegion(geometry, faceIndex, spatialMarkingKind, labels[spatialMarkingKind], spatialEvidenceFor(spatialMarkingKind));
    if (!region) { setError('That face could not be mapped to a stable surface patch.'); return; }
    setSpatialIntent(current => replaceSpatialRegion(current, region)); setSpatialMarkingKind(undefined); setError('');
  };
  const useSpatialCandidate = (kind: SpatialRegionKind) => {
    const candidates = kind === 'critical-thin' ? spatialCandidates?.thinCandidates : spatialCandidates?.planarCandidates;
    const candidate = candidates?.find(item => !spatialIntent.rejectedCandidateIds.includes(`${kind}:${item.id}`));
    if (!candidate) return;
    setSpatialIntent(current => replaceSpatialRegion(current, confirmCandidate(candidate, kind, spatialEvidenceFor(kind))));
    setSpatialMarkingKind(undefined); setPreviewMode('spatial');
  };
  const markSpatialNotApplicable = (kind: SpatialRegionKind) => {
    setSpatialIntent(current => setSpatialRegionNotApplicable(current, kind)); setSpatialMarkingKind(undefined);
  };
  const dismissSpatialCandidate = (kind: SpatialRegionKind) => {
    const candidates = kind === 'critical-thin' ? spatialCandidates?.thinCandidates : spatialCandidates?.planarCandidates;
    const candidate = candidates?.find(item => !spatialIntent.rejectedCandidateIds.includes(`${kind}:${item.id}`));
    if (candidate) setSpatialIntent(current => rejectSpatialCandidate(current, kind, candidate.id));
  };

  const resetAnalysis = (preserveBrief = false) => {
    const brief = preserveBrief ? followUps.purpose ?? '' : '';
    setIntelligence(undefined); setStatus(''); setValidationReport(undefined); setPlanObjective('recommended');
    manuallyAnsweredDecisions.current.clear(); automaticallyAnsweredDecisions.current.clear();
    if (brief) updatePurpose(brief);
    else { setFollowUps({}); setAutoFilledDecisions({}); }
  };
  const loadBrowserFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(''); resetAnalysis(true);
    try {
      const result = await importModel(await file.arrayBuffer(), file.name);
      setAnalysis(result.analysis); setGeometry(result.geometry); setSourcePath(undefined); setSourceModelPath(undefined); setPreviewImage(undefined); setSpatialIntent(emptySpatialManufacturingIntent()); setSpatialMarkingKind(undefined);
    } catch (reason) { setError(`The model could not be read. ${String(reason)}`); }
    finally { setBusy(false); setDropActive(false); }
  };
  const loadPath = async (path: string) => {
    setBusy(true); setError(''); resetAnalysis(true);
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
      setAnalysis(analysisWithP1Metrics); setGeometry(imported.geometry); setSourcePath(exportPath); setSourceModelPath(path); setPreviewImage(undefined); setSpatialIntent(emptySpatialManufacturingIntent()); setSpatialMarkingKind(undefined); setView('import');
      return true;
    } catch (reason) { setError(String(reason)); return false; }
    finally { setBusy(false); setDropActive(false); }
  };
  const browse = async () => {
    if (isTauri()) { const path = await invoke<string | null>('pick_model_path'); if (path) await loadPath(path); }
    else fileInput.current?.click();
  };

  const saveProject = async () => {
    if (!analysis || !sourceModelPath) return;
    const contents = JSON.stringify({ product: 'Check Make', schemaVersion: 3, savedAt: new Date().toISOString(), sourcePath: sourceModelPath, view, intelligence, spatialIntent, printerId, followUps, packageTarget, planObjective }, null, 2);
    const stem = analysis.fileName.replace(/\.(?:stl|3mf|obj)$/i, '');
    try {
      const saved = await invoke<string | null>('save_check_make_project', { defaultName: `${stem}.checkmake`, contents });
      if (saved) setStatus(`Project saved: ${saved}`);
    } catch (reason) { setError(String(reason)); }
  };

  const openProject = async () => {
    setError('');
    try {
      const contents = await invoke<string | null>('open_check_make_project');
      if (!contents) return;
      const project = JSON.parse(contents) as { sourcePath?: string; view?: View; intelligence?: ModelIntelligence; spatialIntent?: SpatialManufacturingIntent; printerId?: string; followUps?: Record<string, string>; packageTarget?: SlicerTarget; planObjective?: PlanObjective };
      if (!project.sourcePath) throw new Error('The project does not reference its source model.');
      if (!await loadPath(project.sourcePath)) return;
      setIntelligence(project.intelligence ? prepareIntelligenceForReview(project.intelligence) : undefined); setSpatialIntent(normalizeSpatialManufacturingIntent(project.spatialIntent)); setPrinterId(project.printerId ?? ''); setFollowUps(project.followUps ?? {}); setPackageTarget(project.packageTarget ?? 'generic'); setPackageTargetManuallySelected(Boolean(project.packageTarget)); setPlanObjective(project.planObjective === 'time' || project.planObjective === 'performance' ? project.planObjective : 'recommended'); setView(project.intelligence ? project.view ?? 'analysis' : 'import');
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
  }, [analysis, sourceModelPath, intelligence, spatialIntent, printerId, followUps, packageTarget, planObjective, settingsOpen, view]);

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
  }, [analysis, sourceModelPath, intelligence, spatialIntent, printerId, followUps, packageTarget, planObjective, view]);

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
    try {
      const result = connection.provider === 'openai'
        ? await analyzeWithOpenAI(connection, analysis, previewImage, followUps)
        : baseline;
      setIntelligence(prepareInitialReview(result));
    } catch (reason) {
      setIntelligence(prepareInitialReview(baseline));
      setError(`${String(reason)} Showing local preliminary analysis instead.`);
    } finally { setBusy(false); }
  };
  const refine = async () => {
    if (!analysis || !intelligence) return;
    setView('analysis');
    setIntelligence(refineLocalIntelligence(intelligence, followUps));
  };
  const createPackage = async (mode: 'save' | 'open' = 'save') => {
    if (!sourcePath || !analysis || !intelligence || !orientation) { setError('3MF creation requires a model imported by the desktop app.'); return; }
    if (readiness?.conservativePlan !== 'ready') { setError('Check Make cannot export until every decision-changing requirement has been resolved.'); setView('analysis'); return; }
    setBusy(true); setError('');
    try {
      const metadata = JSON.stringify({ product: 'Check Make', schemaVersion: 3, intelligence, spatialIntent, printer: printer ?? null, planObjective, recommendations, notices }, null, 2);
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
      }
      setStatus(result ? `${mode === 'open' ? 'Created and opened' : 'Validated and created'} ${result.path}${result.warnings.length ? ` — ${result.warnings.join(' ')}` : ''}` : 'Export cancelled');
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };

  const decisionCount = unansweredQuestions.length + spatialGaps.length;
  const unsupportedPlan = readiness?.conservativePlan === 'unsupported';
  const primaryPrepareLabel = purposeNeedsContext
    ? 'Return to Context'
    : unsupportedPlan
    ? 'Export unavailable for this use'
    : preparationComplete
    ? 'Continue to export'
    : decisionCount > 0
      ? `Resolve ${decisionCount} decision${decisionCount === 1 ? '' : 's'}`
      : 'Apply answers and re-check';

  const prepareReadyLabel = printer ? 'Plan ready' : 'Plan ready · printer not validated';
  const prepareReadySummary = printer ? 'Ready for export' : 'Portable export ready';

  return <div className={`window workflow-window density-${preferences.density}`}>
    <ProcessBar stage={workflowStage} decisions={decisionCount} settingsOpen={settingsOpen} onToggleSettings={() => setSettingsOpen(current => !current)}/>
    {settingsOpen && <aside className="settings-popover" role="dialog" aria-modal="false" aria-labelledby="settings-title">
      <div><span className="kicker">APPLICATION SETTINGS</span><h2 id="settings-title">Project defaults</h2><button className="popover-close" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button></div>
      <div className="settings-group"><span className="settings-label">Default printer</span><PrinterPicker value={preferences.defaultPrinterId} onChange={defaultPrinterId => updatePreferences({ defaultPrinterId })} label="Default printer" emptyLabel="No default printer" emptyDescription="New projects start without a printer"/><small>Used when a new project starts. Printer selection remains optional.</small></div>
      <div className="settings-group"><b className="settings-label">Default analysis provider</b>
        <label className="provider-option"><input type="radio" checked={preferences.defaultAnalysisProvider === 'local'} onChange={() => updatePreferences({ defaultAnalysisProvider: 'local' })}/><span><b>Local preliminary analysis</b><small>Private, instant geometry heuristics.</small></span></label>
        <label className="provider-option"><input type="radio" checked={preferences.defaultAnalysisProvider === 'openai'} onChange={() => updatePreferences({ defaultAnalysisProvider: 'openai' })}/><span><b>OpenAI vision analysis</b><small>Four rendered views plus mesh measurements.</small></span></label>
      </div>
      <div className="settings-group"><label className="settings-select">Interface density<select value={preferences.density} onChange={event => updatePreferences({ density: event.target.value as AppPreferences['density'] })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><small>Comfortable improves readability and target size. Compact keeps more technical information visible.</small></div>
      {(preferences.defaultAnalysisProvider === 'openai' || connection.provider === 'openai') && <div className="api-fields"><label>OpenAI API key<input type="password" autoComplete="off" value={connection.apiKey} onChange={event => setConnection(current => ({ ...current, apiKey: event.target.value }))} placeholder="sk-…"/></label><label>Model<input value={connection.model} onChange={event => setConnection(current => ({ ...current, model: event.target.value }))}/></label><p>The key remains in memory for this session.</p></div>}
      <p className="settings-note">Defaults are stored on this Mac and applied when Check Make starts a new session. Current project choices are changed in the project panel.</p>
    </aside>}

    <main className="workflow-layout">
      <aside className="project-context">
        <span className="context-title">PROJECT</span>
        <section className="context-card model-context"><span>MODEL</span>{analysis ? <><div className="context-glyph context-model-icon"><UiIcon name="model"/><small>{analysis.metadata.format.toUpperCase()}</small></div><div><b>{analysis.fileName}</b><small>{analysis.boundingBox.size.x.toFixed(1)} × {analysis.boundingBox.size.y.toFixed(1)} × {analysis.heightMm.toFixed(1)} mm</small><button className="context-link" onClick={() => void browse()}>Replace</button></div></> : <button className="context-empty" onClick={() => void browse()}><b>Add model</b><small>STL, 3MF, or OBJ</small></button>}</section>
        <section className="context-card purpose-context"><span>CONTEXT</span><label><textarea value={followUps.purpose ?? ''} onChange={event => updateProjectBrief(event.target.value)} placeholder="Example: Outdoor mounting bracket in direct sun, holds 5 kg, occasional impacts, maximum 55 °C, accurate fit."/><small>Include function, environment, load, heat or impact, and what matters most. Check Make asks only for missing details.</small></label>
          {contextSignals.length > 0 && <div className="context-signals" aria-label="Requirements understood from context"><b>Understood</b>{contextSignals.map(signal => <span key={signal.id}>{signal.label}: {signal.value}</span>)}</div>}
          {contextAnalysis.issues.slice(0, 2).map(issue => <div className="context-clarification" key={`${issue.field}:${issue.evidence.join('-')}`}><b>{issue.question}</b><small>{issue.field === 'heat' ? 'Sun or “heat” alone does not establish the part temperature. Choose the hottest realistic condition.' : issue.message}</small><div>{issue.options.map(option => <button type="button" key={option.value} onClick={() => applyContextClarification(issue, option)}>{option.label}</button>)}</div></div>)}
          {contextAnalysis.specialistPrompts.slice(0, 3).map(prompt => <div className="context-specialist" key={prompt.id}><b>{prompt.question}</b><small>{prompt.message}</small></div>)}
          {contextNeedsFunction && <div className="context-warning"><b>Add what the object does</b><p>Describe its function in this same Context field—for example “creates spacing in a parasol base”, “holds a sensor”, or “protects a connector”.</p></div>}
        </section>
        <section className="context-card printer-context"><span>PRINTER · OPTIONAL</span><div className="context-glyph printer-glyph"><UiIcon name="printer"/></div><div className="printer-control"><PrinterPicker value={printerId} onChange={selectPrinter} label="Target printer" emptyLabel="No printer selected" emptyDescription="Validate compatibility later"/><small>{printer ? `${printer.buildVolume.x} × ${printer.buildVolume.y} × ${printer.buildVolume.z} mm · ${printer.enclosed ? 'Enclosed' : 'Open frame'}` : 'Compatibility will be checked when selected.'}</small></div></section>
        <section className="context-card analysis-context"><span>ANALYSIS</span><div className="analysis-options"><label><input type="radio" checked={connection.provider === 'local'} onChange={() => setConnection(current => ({ ...current, provider: 'local' }))}/><span><b>Local preliminary analysis</b><small>Private · geometry + deterministic rules</small></span></label><label><input type="radio" checked={connection.provider === 'openai'} onChange={() => setConnection(current => ({ ...current, provider: 'openai' }))}/><span><b>OpenAI vision analysis</b><small>Rendered views + deterministic rules</small></span></label>{connection.provider === 'openai' && !connection.apiKey.trim() && <small className="analysis-credential-note">Add an API key in Settings to use this provider.</small>}</div></section>
        {importedBuildVolumeNotice && <p className="context-warning">{importedBuildVolumeNotice.message}</p>}
      </aside>

      <section className="model-workspace">
        <header className="model-workspace-head"><div><span className="kicker">MODEL</span><h1>{analysis?.fileName ?? 'No model loaded'}</h1>{analysis && <span className="model-measured"><UiIcon name="check"/> Geometry measured</span>}</div>{analysis && <div className="preview-toolbar" role="group" aria-label="Model preview mode">{([['recommended', 'Model'], ['risk', 'Overhangs'], ['spatial', 'Functional regions']] as const).map(([id, label]) => <button key={id} className={previewMode === id ? 'active' : ''} aria-pressed={previewMode === id} onClick={() => setPreviewMode(id)}>{label}</button>)}</div>}</header>
        {analysis ? <>
          <div className={`workflow-preview ${spatialMarkingKind ? 'marking-spatial-region' : ''}`}><Preview geometry={geometry} orientationId={previewOrientationId} mode={previewMode} plateSize={previewPlate} plateLabel={printer ? 'Build plate' : 'Reference plate'} overhangRegionCount={previewGeometryRisk?.overhangRegionCount ?? 0} spatialRegions={spatialPreviewRegions} markingKind={spatialMarkingKind} onFaceSelect={selectSpatialFace} captureKey={`${analysis.fileName}:${previewOrientationId}:${previewMode}`} onCapture={setPreviewImage}/></div>
          <div className="workflow-metrics"><div><b>{(previewOrientation?.heightMm ?? analysis.heightMm).toFixed(1)} mm</b><span>Height</span></div><div><b>{analysis.topology?.componentCount ?? 1}</b><span>Mesh bodies</span></div><button className={previewMode === 'risk' ? 'active' : ''} aria-pressed={previewMode === 'risk'} onClick={() => setPreviewMode('risk')}><b>{previewGeometryRisk?.overhangRegionCount ?? 0}</b><span>Overhangs</span></button><div><b>{((previewGeometryRisk?.bedCoverageRatio ?? 0) * 100).toFixed(1)}%</b><span>Bed contact</span></div></div>
          <details className="model-evidence-drawer"><summary><span>Model checks</span><em className={geometryWarnings.length ? 'warning' : 'ready'}>{geometryWarnings.length ? `${geometryWarnings.length} issue${geometryWarnings.length === 1 ? '' : 's'}` : 'Mesh ready'}</em></summary>
            <div className="model-checks">
              <div><span className={`check-indicator ${geometryWarnings.length ? 'warning' : 'ready'}`}>{geometryWarnings.length ? '!' : <UiIcon name="check"/>}</span><span><b>Mesh integrity</b><small>{geometryWarnings.length ? `${geometryWarnings.length} issue${geometryWarnings.length === 1 ? '' : 's'} needs review` : 'Closed printable mesh detected'}</small></span></div>
              <div><span className="check-indicator neutral">%</span><span><b>Bed contact</b><small>{((previewGeometryRisk?.bedCoverageRatio ?? 0) * 100).toFixed(1)}% of the bounding footprint</small></span></div>
              <button type="button" onClick={() => setPreviewMode('risk')}><span className={`check-indicator ${previewGeometryRisk?.overhangRegionCount ? 'attention' : 'ready'}`}>{previewGeometryRisk?.overhangRegionCount ?? 0}</span><span><b>Overhangs</b><small>{previewGeometryRisk?.overhangRegionCount ? `${previewGeometryRisk.overhangRegionCount} region${previewGeometryRisk.overhangRegionCount === 1 ? '' : 's'} · largest ${previewGeometryRisk.largestOverhangRegionAreaMm2.toFixed(0)} mm²` : 'No angle-based regions detected'}</small></span><em>Show ›</em></button>
              <div><span className="check-indicator neutral">↻</span><span><b>Orientation</b><small>{previewOrientation?.label ?? 'As imported'}</small></span></div>
            </div>
            {geometryWarnings.length > 0 && <div className="geometry-warnings">{geometryWarnings.map(finding => <div key={finding.id}><b>{finding.label}</b><p>{finding.detail}</p></div>)}</div>}
            <details className="technical-geometry"><summary>Technical geometry details</summary><dl><div><dt>Triangles</dt><dd>{analysis.triangleCount.toLocaleString()}</dd></div><div><dt>Largest overhang</dt><dd>{previewGeometryRisk?.largestOverhangRegionAreaMm2.toFixed(0) ?? 0} mm² · {previewGeometryRisk?.largestOverhangRegionSpanMm.toFixed(1) ?? '0.0'} mm span</dd></div><div><dt>Mesh boundaries</dt><dd>{analysis.topology?.boundaryEdgeCount ?? 0}</dd></div><div><dt>Non-manifold edges</dt><dd>{analysis.topology?.nonManifoldEdgeCount ?? 0}</dd></div></dl><p>Preliminary geometric measurements. These values are not calibrated failure probabilities.</p></details>
            {orientationComparisons.length > 0 && <details className="orientation-comparison"><summary>Orientation alternatives</summary><p>Six axis-aligned orientations are compared using bed contact, overhang exposure, and height.</p>{orientationComparisons[0].constraintsApplied?.map(note => <p className="orientation-constraint applied" key={note}>Applied: {note}</p>)}{orientationComparisons[0].constraintsUnresolved?.map(note => <p className="orientation-constraint unresolved" key={note}>Not localized: {note}</p>)}{previewOrientationId !== 'as-imported' && <button type="button" className={`compare-orientation ${previewMode === 'compare' ? 'active' : ''}`} aria-pressed={previewMode === 'compare'} onClick={() => setPreviewMode(previewMode === 'compare' ? 'recommended' : 'compare')}>{previewMode === 'compare' ? 'Show selected orientation' : 'Compare with imported orientation'}</button>}<div>{orientationComparisons.map((item, index) => <button className={`${previewOrientationId === item.candidate.id ? 'selected ' : ''}${index === 0 ? 'recommended' : ''}`} aria-pressed={previewOrientationId === item.candidate.id} key={item.candidate.id} onClick={() => { setPreviewOrientationId(item.candidate.id); setPreviewMode('recommended'); }}><span><b>{item.candidate.label}</b><small>{index === 0 ? 'Recommended for current objective' : 'Preview this orientation'}</small></span><span className="orientation-measures">{item.candidate.heightMm.toFixed(1)} mm high · {item.candidate.bedContactAreaMm2.toFixed(0)} mm² contact · {(item.candidate.overhangRatio * 100).toFixed(1)}% overhang</span></button>)}</div></details>}
            <details className="analysis-limits"><summary>Analysis limits</summary><div>{analysis.analysisLimits?.map(limit => <div key={limit.id}><span>{limit.status === 'requires-input' ? 'Needs input' : limit.status === 'evaluated' ? 'Screened' : 'Not evaluated'}</span><p><b>{limit.label}</b>{limit.detail}</p></div>)}</div><p className="analysis-limit-note">No structural simulation is performed. Load paths and stress are not inferred from appearance; thickness screening is partial and geometric only.</p></details>
          </details>
        </> : <div className={`workspace-dropzone ${dropActive ? 'drag-active' : ''}`} onDragOver={event => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={event => { event.preventDefault(); setDropActive(false); void loadBrowserFile(event.dataTransfer.files[0]); }}><img src="/check-make-symbol.svg" alt=""/><h2>{busy ? 'Reading model…' : dropActive ? 'Release to inspect' : 'Drop a 3D model to begin'}</h2><p>Check Make starts from geometry, then asks only for decisions that can change the print plan.</p><button className="primary" disabled={busy} onClick={() => void browse()}>Choose model…</button></div>}
        <input ref={fileInput} hidden type="file" accept=".stl,.3mf,.obj" onChange={event => void loadBrowserFile(event.target.files?.[0])}/>
      </section>

      <aside className="decision-panel" ref={decisionPanel}>
        {workflowStage === 'import' && <section className="inspect-panel"><span className="kicker">INSPECT</span><h1>{busy ? 'Inspecting the model…' : !analysis ? 'Add a model' : followUps.purpose?.trim() ? 'Ready to inspect' : 'Add context'}</h1><p>{analysis ? 'Describe what the part does and where it will be used. A printer is optional at this stage and, when selected, adds capability and build-volume checks.' : 'Add or load a 3D model first. Then describe its context; you can select a printer now or validate compatibility later.'}</p>
          <div className="inspect-checklist"><div className={analysis ? 'done' : ''}><i>{analysis ? <UiIcon name="check"/> : '1'}</i><span><b>Model geometry</b><small>{analysis ? `${analysis.triangleCount.toLocaleString()} triangles measured` : 'Waiting for STL, 3MF, or OBJ'}</small></span></div><div className={followUps.purpose?.trim() ? 'done' : ''}><i>{followUps.purpose?.trim() ? <UiIcon name="check"/> : '2'}</i><span><b>Context</b><small>{followUps.purpose?.trim() ? 'Included in analysis' : 'Describe the part and its use'}</small></span></div><div className={printer ? 'done' : 'optional'}><i>{printer ? <UiIcon name="check"/> : <UiIcon name="printer"/>}</i><span><b>Target printer <em>Optional</em></b><small>{printer ? `${printer.manufacturer} ${printer.model}` : 'No printer selected · validate later'}</small></span></div><div><i>3</i><span><b>Analysis</b><small>{connection.provider === 'openai' ? 'Context + vision + deterministic rules' : 'Context + geometry + deterministic rules'}</small></span></div></div>
          <button className="primary workflow-primary" disabled={!analysis || !followUps.purpose?.trim() || busy || (connection.provider === 'openai' && !connection.apiKey.trim()) || (connection.provider === 'local' && contextNeedsFunction)} onClick={() => void runIntelligence()}>{busy ? 'Inspecting…' : connection.provider === 'local' && contextNeedsFunction ? 'Add function to Context' : connection.provider === 'openai' ? 'Inspect with AI' : 'Inspect model'}</button>
        </section>}

        {workflowStage === 'analysis' && intelligence && <section className="prepare-panel"><span className="kicker">PREPARE</span><div className="prepare-heading"><div><h1>Prepare print</h1><p>{intelligence.objectName}</p></div><span className={preparationComplete ? 'ready-pill' : 'review-pill'}>{preparationComplete ? prepareReadyLabel : unsupportedPlan ? 'Unsupported use' : 'Review required'}</span></div><div className="readiness-summary"><i style={{ '--readiness': `${preparationComplete ? 100 : Math.max(16, 100 - Math.max(1, decisionCount) * 12)}%` } as React.CSSProperties}/><div><b>{preparationComplete ? prepareReadySummary : unsupportedPlan ? 'Check Make must abstain from this print plan' : decisionCount ? `Ready after ${decisionCount} decision${decisionCount === 1 ? '' : 's'}` : 'Review and apply the prefilled decisions'}</b><small>{intelligence.likelyPurpose}</small></div></div>
          {readiness?.unsupportedReasons.map(reason => <div className="context-warning" role="alert" key={reason}><b>Recommendation withheld</b><p>{reason}</p></div>)}
          {purposeNeedsContext && <div className="context-warning"><b>Purpose is not established</b><p>Return to the original Context field and add what the object does. Check Make will not ask for the same description in a second text field.</p></div>}
          {intelligence.objectHypothesis && <details className="object-hypothesis"><summary><span><b>Object hypothesis</b><small>{intelligence.objectHypothesis.identity.value} · {intelligence.objectHypothesis.purpose.value}</small></span><em>{Math.round(intelligence.objectHypothesis.identity.confidence * 100)}% identity confidence</em></summary><div className="hypothesis-body"><div className="hypothesis-assertions">{[intelligence.objectHypothesis.identity, intelligence.objectHypothesis.purpose].map(item => <div key={item.id}><span><b>{item.label}</b><small>{item.status.replace('-', ' ')}</small></span><strong>{item.value}</strong></div>)}</div>{intelligence.objectHypothesis.features.length > 0 && <div className="hypothesis-features"><b>Context-linked features</b>{intelligence.objectHypothesis.features.map(feature => <span key={feature.id}><small>{feature.label}</small><strong>{feature.value}</strong><em>{feature.status.replace('-', ' ')}</em></span>)}</div>}<details className="hypothesis-evidence"><summary>Evidence and provenance</summary><ul>{intelligence.objectHypothesis.evidence.map(item => <li key={item.id}><span>{item.source.replaceAll('-', ' ')}</span><p>{item.statement}</p><em>{Math.round(item.confidence * 100)}%</em></li>)}</ul></details><details className="hypothesis-limits"><summary>What is not established</summary><ul>{intelligence.objectHypothesis.limits.map(limit => <li key={limit}>{limit}</li>)}</ul></details><p className="hypothesis-boundary">Only confirmed user requirements feed the manufacturing rules. Unconfirmed object hypotheses remain explanatory evidence.</p></div></details>}
          {(loadLocalizationRequired || matingLocalizationRequired || visibleLocalizationRequired || Boolean(spatialCandidates?.thinCandidates.length)) && <SpatialIntentPanel
            spatial={spatialIntent} loadRequired={loadLocalizationRequired} matingRequired={matingLocalizationRequired} visibleRequired={visibleLocalizationRequired}
            planarCandidateId={spatialCandidates?.planarCandidates[0]?.id} thinCandidateId={spatialCandidates?.thinCandidates[0]?.id} thinCandidateMm={spatialCandidates?.thinCandidates[0]?.thicknessMm} thicknessCoverage={spatialCandidates?.thicknessCoverage}
            markingKind={spatialMarkingKind}
            onLoadAxis={axis => setSpatialIntent(current => setConfirmedLoadAxis(current, axis, intent?.mechanical.loadDirections.evidenceIds ?? []))}
            onMark={beginSpatialMarking} onUseCandidate={useSpatialCandidate} onRejectCandidate={dismissSpatialCandidate} onNotApplicable={markSpatialNotApplicable}
          />}
          {intelligence.questions.length > 0 && <div className="workflow-questions"><div className="decision-heading"><div><h2>Decisions that affect this plan</h2><p>Review the values prefilled from the Inspect description and complete any remaining decisions.</p></div><span>{unansweredQuestions.length} left</span></div>{intelligence.questions.map(question => {
            const inferredEvidence = autoFilledDecisions[question.id];
            const input = question.kind === 'single' && question.options
              ? <select ref={element => { decisionInputs.current[question.id] = element; }} value={followUps[question.id] ?? ''} onChange={event => updateDecision(question.id, event.target.value)}><option value="">Choose…</option>{question.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              : <textarea ref={element => { decisionInputs.current[question.id] = element; }} value={followUps[question.id] ?? ''} onChange={event => question.id === 'purpose' ? updatePurpose(event.target.value) : setFollowUps(current => ({ ...current, [question.id]: event.target.value }))} onBlur={() => { manuallyAnsweredDecisions.current.add(question.id); focusNextDecision(question.id, followUps); }} placeholder="Describe only what you know…"/>;
            return <label className={`${(followUps[question.id] ?? '').trim() ? 'answered ' : ''}${inferredEvidence ? 'inferred' : ''}`} key={question.id}><span className="decision-state">{(followUps[question.id] ?? '').trim() ? '✓' : intelligence.questions.findIndex(item => item.id === question.id) + 1}</span><span className="decision-copy"><b>{question.question}</b><small>{question.why}</small>{input}{inferredEvidence && <em title={inferredEvidence.join(', ')}>Filled from description · review if needed</em>}</span></label>;
          })}</div>}
          {preparationComplete && recommendations.length > 0 && <RecommendedKeySettings recommendations={recommendations} notices={notices}/>}
          <button className="primary workflow-primary" disabled={busy || unsupportedPlan || (!purposeNeedsContext && !preparationComplete && decisionCount > 0)} onClick={() => purposeNeedsContext ? resetAnalysis(true) : preparationComplete ? setView('export') : void refine()}>{primaryPrepareLabel}</button>
          {preparationComplete && <details className="full-plan trade-off-alternatives"><summary>Trade-off alternatives</summary><TradeOffAlternatives alternatives={planAlternatives} objective={planObjective} onObjectiveChange={setPlanObjective}/></details>}
        </section>}

        {workflowStage === 'export' && intelligence && <section className="export-panel"><span className="kicker">EXPORT</span><h1>Export project</h1><p>The preparation is complete. Choose a portable Core 3MF or a compatible slicer-native project.</p><button className="quiet back-to-prepare" onClick={() => setView('analysis')}>← Return to Prepare</button>
          <div className="workflow-adapters">{adapters.map(adapter => { const compatible = adapter.target === 'generic' || Boolean(printer && supportsPrinter(adapter, printerId)); const iconPath = slicerIconPath[adapter.target]; return <button key={adapter.target} data-target={adapter.target} style={{ '--adapter-accent': slicerAccent[adapter.target] } as React.CSSProperties} aria-pressed={packageTarget === adapter.target} className={packageTarget === adapter.target ? 'selected' : ''} disabled={!adapter.available || (adapter.target !== 'generic' && !printer)} onClick={() => { setPackageTarget(adapter.target); setPackageTargetManuallySelected(true); }}><span className="adapter-icon">{iconPath ? <img src={iconPath} alt=""/> : <UiIcon name="package"/>}</span><span><b>{adapter.label}</b><small>{!adapter.available ? 'Not installed' : !printer && adapter.target !== 'generic' ? 'Select a printer for native export' : compatible ? adapter.capability === 'core-3mf' ? 'Portable 3MF' : 'Native project · Ready' : 'Choose a compatible printer'}</small></span><em>{packageTarget === adapter.target ? '✓' : '›'}</em></button>; })}</div>
          {selectedAdapter?.available && !selectedPrinterSupported && <div className="context-warning"><b>{printer ? `${selectedAdapter.label} does not yet support ${printer.model}.` : 'Select a printer for slicer-native export.'}</b>{printer && <p>Supported profiles: {supportedPrinterNames}.</p>}</div>}
          <details className="workflow-evidence"><summary>Package contents & validation</summary><ul><li>Core 3MF geometry in millimetres</li><li>Selected orientation baked into geometry</li><li>Degenerate triangles removed</li><li>Check Make analysis and canonical settings metadata</li>{nativeProjectTarget && <li>{nativeTargetLabel} native profiles and mapped settings</li>}</ul><p>{nativeValidationText}</p></details>
          <button className="primary workflow-primary" disabled={busy || !sourcePath || !selectedAdapter?.available || !selectedPrinterSupported} onClick={() => void createPackage(packageTarget === 'bambu' ? 'open' : 'save')}>{busy ? 'Creating…' : packageTarget === 'generic' ? 'Create Core 3MF…' : packageTarget === 'bambu' ? 'Open in Bambu Studio' : `Export for ${selectedAdapter?.label ?? packageTarget}…`}</button>
          {status && <p className="save-status">{status}</p>}{validationReport && <details className="validation-report"><summary>{validationReport.checks.length} export checks</summary><ul>{validationReport.checks.map(check => <li key={check.id}>{check.passed ? '✓' : '✕'} {check.label} — {check.detail}</li>)}</ul></details>}
        </section>}
        {error && <p className="page-error workflow-error" role="alert">{error}</p>}
      </aside>
    </main>
  </div>;
}
