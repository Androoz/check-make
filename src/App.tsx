import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { chooseOrientation, compareOrientations, geometryForOrientation, riskVisualizationGeometry } from './geometry/stl';
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
import type { ContextClarificationOption, ContextInterpretationIssue } from './workflow/decisionAutomation';
import type { AIConnection, ModelIntelligence } from './ai/modelIntelligence';
import type { ChecklistField, CompatibilityNotice, ManufacturingPackageResult, Material, ModelAnalysis, PackageValidationReport, SlicerAdapterStatus, SlicerTarget } from './types';
import './styles.css';
import './desktop-mvp.css';
import './workflow-v4.css';
import './accessibility-v5.css';

type View = 'import' | 'analysis' | 'export';
type PreviewMode = 'original' | 'recommended' | 'risk' | 'compare';
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
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = printerProfiles.find(profile => profile.id === value);
  const manufacturers = useMemo(() => printerProfiles.reduce<Array<{ manufacturer: string; profiles: typeof printerProfiles }>>((groups, profile) => {
    const group = groups.find(item => item.manufacturer === profile.manufacturer);
    if (group) group.profiles.push(profile);
    else groups.push({ manufacturer: profile.manufacturer, profiles: [profile] });
    return groups;
  }, []), []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); setOpen(false); trigger.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  const choose = (id: string) => {
    onChange(id); setOpen(false); trigger.current?.focus();
  };

  return <div className="printer-picker" ref={root}>
    <button ref={trigger} type="button" className="printer-picker-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} onKeyDown={event => {
      if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); }
    }}>
      <span><b>{selected ? `${selected.manufacturer} · ${selected.model}` : emptyLabel}</b></span><span className="printer-picker-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="printer-picker-menu" role="listbox" aria-label={label}>
      <button type="button" className={`printer-picker-option printer-picker-empty ${!value ? 'selected' : ''}`} role="option" aria-selected={!value} onClick={() => choose('')}>
        <span className="printer-picker-check">{!value && <UiIcon name="check"/>}</span><span><b>{emptyLabel}</b><small>{emptyDescription}</small></span>
      </button>
      {manufacturers.map(group => <section className="printer-picker-group" role="group" aria-label={group.manufacturer} key={group.manufacturer}><div className="printer-picker-group-label">{group.manufacturer}</div>{group.profiles.map(profile => <button type="button" className={`printer-picker-option ${value === profile.id ? 'selected' : ''}`} role="option" aria-selected={value === profile.id} key={profile.id} onClick={() => choose(profile.id)}>
        <span className="printer-picker-check">{value === profile.id && <UiIcon name="check"/>}</span><span><b>{profile.model}</b><small>{profile.buildVolume.x} × {profile.buildVolume.y} × {profile.buildVolume.z} mm · {profile.enclosed ? 'Enclosed' : 'Open frame'}</small></span>
      </button>)}</section>)}
    </div>}
  </div>;
}
function PreparedModel({ geometry, orientationId, risk = false, color = '#b8bcba', position = [0, 0, 0], opacity = 1 }: { geometry: THREE.BufferGeometry; orientationId: string; risk?: boolean; color?: string; position?: [number, number, number]; opacity?: number }) {
  const prepared = useMemo(() => risk ? riskVisualizationGeometry(geometry, orientationId) : geometryForOrientation(geometry, orientationId), [geometry, orientationId, risk]);
  const centeredPosition = useMemo(() => {
    prepared.computeBoundingBox();
    const center = prepared.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    return [position[0] - center.x, position[1] - center.y, position[2]] as [number, number, number];
  }, [position, prepared]);
  useEffect(() => () => prepared.dispose(), [prepared]);
  return <mesh geometry={prepared} position={centeredPosition}><meshStandardMaterial color={risk ? '#ffffff' : color} vertexColors={risk} roughness={0.62} metalness={0.05} transparent={opacity < 1} opacity={opacity}/></mesh>;
}

function CameraPreset({ view, distance, targetY }: { view: CameraView; distance: number; targetY: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const pose = cameraPose(view, distance, targetY);
    camera.position.set(...pose.position); camera.up.set(...pose.up); camera.lookAt(...pose.target); camera.updateProjectionMatrix();
  }, [camera, distance, targetY, view]);
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

function Preview({ geometry, orientationId = 'as-imported', mode = 'original', plateSize = { x: 256, y: 256, z: 256 }, plateLabel = 'Build plate', captureKey, onCapture }: { geometry?: THREE.BufferGeometry; orientationId?: string; mode?: PreviewMode; plateSize?: { x: number; y: number; z: number }; plateLabel?: string; captureKey?: string; onCapture?: (image: string) => void }) {
  const [showPlate, setShowPlate] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [cameraView, setCameraView] = useState<CameraView>('isometric');
  const darkAppearance = useMediaQuery('(prefers-color-scheme: dark)');
  const comparisonOffset = geometry ? Math.max(geometry.boundingBox?.getSize(new THREE.Vector3()).x ?? 0, 30) * 0.72 : 40;
  const modelSize = useMemo(() => {
    if (!geometry) return new THREE.Vector3(1, 1, 1);
    const prepared = geometryForOrientation(geometry, mode === 'original' ? 'as-imported' : orientationId);
    const size = prepared.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    prepared.dispose(); return size;
  }, [geometry, mode, orientationId]);
  const modelExtent = Math.max(modelSize.x * (mode === 'compare' ? 2.5 : 1), modelSize.y, modelSize.z, 30);
  const cameraDistance = showPlate ? Math.max(plateSize.x, plateSize.y, modelSize.z * 1.8) * 1.18 : modelExtent * 1.6;
  const targetY = modelSize.z / 2;
  const axesWidth = showPlate ? plateSize.x : Math.max(modelSize.x * 1.4, 60);
  const axesDepth = showPlate ? plateSize.y : Math.max(modelSize.y * 1.4, 60);
  return <div className="preview preview-analysis"><Canvas gl={{ preserveDrawingBuffer: Boolean(onCapture) }} camera={{ position: [cameraDistance, cameraDistance * 0.75, cameraDistance], near: 0.1, far: cameraDistance * 8 }} shadows>
    <color attach="background" args={[darkAppearance ? '#1b221f' : '#f7f7f2']}/><ambientLight intensity={darkAppearance ? 1.8 : 1.5}/><directionalLight position={[8, 12, 6]} intensity={2}/>
    <CameraPreset view={cameraView} distance={cameraDistance} targetY={targetY}/>
    {showPlate && <BuildPlate width={plateSize.x} depth={plateSize.y} ghost={cameraView === 'bottom'}/>}
    {showAxes && <PrinterAxes width={axesWidth} depth={axesDepth}/>}
    {geometry && <group rotation={[-Math.PI / 2, 0, 0]}>
      {mode === 'compare' ? <><PreparedModel geometry={geometry} orientationId="as-imported" color="#8a969c" opacity={0.72} position={[-comparisonOffset, 0, 0]}/><PreparedModel geometry={geometry} orientationId={orientationId} position={[comparisonOffset, 0, 0]}/></> : <PreparedModel geometry={geometry} orientationId={mode === 'original' ? 'as-imported' : orientationId} risk={mode === 'risk'}/>}
    </group>}
    <OrbitControls makeDefault target={[0, targetY, 0]}/>
    {geometry && captureKey && onCapture && <CapturePreview captureKey={captureKey} onCapture={onCapture} distance={cameraDistance} targetY={targetY}/>}
  </Canvas><div className="scene-controls"><div><button className={showPlate ? 'active' : ''} aria-pressed={showPlate} onClick={() => setShowPlate(current => !current)}>Build plate</button><button className={showAxes ? 'active' : ''} aria-pressed={showAxes} onClick={() => setShowAxes(current => !current)}>XYZ axes</button></div><label>View<select value={cameraView} onChange={event => setCameraView(event.target.value as CameraView)}><option value="isometric">Isometric</option><option value="top">Top</option><option value="front">Front</option><option value="back">Back</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></label></div>{mode === 'risk' && <div className="risk-legend"><span><i className="risk-normal"/>Regular surface</span><span><i className="risk-bed"/>Bed contact</span><span><i className="risk-overhang"/>Overhang</span><span><i className="risk-severe"/>Downward face</span></div>}{mode === 'compare' && <div className="comparison-legend"><span>Original</span><span>Selected orientation</span></div>}{showPlate && <div className="plate-size-label">{plateLabel} {plateSize.x} × {plateSize.y} mm</div>}</div>;
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
    <div className="workflow-brand"><img src="/check-make-wordmark.png" alt="CHECK / MAKE"/></div>
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
  const suggestedPackageTarget = useMemo(() => suggestSlicerTarget(adapters, printerId), [adapters, printerId]);
  const suggestedPackageAdapter = adapters.find(adapter => adapter.target === suggestedPackageTarget) ?? adapterPlaceholders[0];
  const questionnaire = useMemo(() => intelligence ? questionnaireFromIntelligence(intelligence, analysisPrinter) : undefined, [intelligence, analysisPrinter]);
  const recommendedOrientation = useMemo(() => analysis && questionnaire ? chooseOrientation(analysis, questionnaire.priority) : undefined, [analysis, questionnaire]);
  const fasterOrientation = useMemo(() => analysis && questionnaire ? chooseOrientation(analysis, 'speed') : undefined, [analysis, questionnaire]);
  const performanceOrientation = useMemo(() => analysis && questionnaire ? chooseOrientation(analysis, 'strength') : undefined, [analysis, questionnaire]);
  const orientation = planObjective === 'time' ? fasterOrientation : planObjective === 'performance' ? performanceOrientation : recommendedOrientation;
  const orientationPriority = planObjective === 'time' ? 'speed' : planObjective === 'performance' ? 'strength' : questionnaire?.priority;
  const orientationComparisons = useMemo(() => analysis && orientationPriority ? compareOrientations(analysis, orientationPriority) : [], [analysis, orientationPriority]);
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
  const readiness = useMemo(() => intelligence ? assessDecisionReadiness(intelligence) : undefined, [intelligence]);
  const importedBuildVolumeNotice = analysis && printer ? checkBuildVolume(analysis, printer)[0] : undefined;
  const unansweredQuestions = intelligence?.questions.filter(question => !(followUps[question.id] ?? '').trim()) ?? [];
  const preparationComplete = isPreparationComplete(readiness?.conservativePlan === 'ready', intelligence?.questions.length ?? 0);
  const workflowStage: View = deriveWorkflowStage({ hasIntelligence: Boolean(intelligence), exportRequested: view === 'export', ready: preparationComplete });
  const contextAnalysis = useMemo(() => analyzePurposeContext(followUps.purpose ?? '', followUps), [followUps]);
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
      setAnalysis(result.analysis); setGeometry(result.geometry); setSourcePath(undefined); setSourceModelPath(undefined); setPreviewImage(undefined);
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
      setAnalysis(analysisWithP1Metrics); setGeometry(imported.geometry); setSourcePath(exportPath); setSourceModelPath(path); setPreviewImage(undefined); setView('import');
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
    const contents = JSON.stringify({ product: 'Check Make', schemaVersion: 2, savedAt: new Date().toISOString(), sourcePath: sourceModelPath, view, intelligence, printerId, followUps, packageTarget, planObjective }, null, 2);
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
      const project = JSON.parse(contents) as { sourcePath?: string; view?: View; intelligence?: ModelIntelligence; printerId?: string; followUps?: Record<string, string>; packageTarget?: SlicerTarget; planObjective?: PlanObjective };
      if (!project.sourcePath) throw new Error('The project does not reference its source model.');
      if (!await loadPath(project.sourcePath)) return;
      setIntelligence(project.intelligence ? prepareIntelligenceForReview(project.intelligence) : undefined); setPrinterId(project.printerId ?? ''); setFollowUps(project.followUps ?? {}); setPackageTarget(project.packageTarget ?? 'generic'); setPackageTargetManuallySelected(Boolean(project.packageTarget)); setPlanObjective(project.planObjective === 'time' || project.planObjective === 'performance' ? project.planObjective : 'recommended'); setView(project.intelligence ? project.view ?? 'analysis' : 'import');
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
  }, [analysis, sourceModelPath, intelligence, printerId, followUps, packageTarget, planObjective, settingsOpen, view]);

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
  }, [analysis, sourceModelPath, intelligence, printerId, followUps, packageTarget, planObjective, view]);

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
    const baseline = localModelAnalysis(analysis);
    const brief = followUps.purpose?.trim() ?? '';
    const prepareInitialReview = (result: ModelIntelligence): ModelIntelligence => brief ? {
      ...result,
      likelyPurpose: brief,
      purposeConfirmed: true,
      userEvidence: [brief],
      questions: baseline.questions.filter(question => question.id !== 'purpose'),
    } : result;
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
      const metadata = JSON.stringify({ product: 'Check Make', schemaVersion: 2, intelligence, printer: printer ?? null, planObjective, recommendations, notices }, null, 2);
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

  const decisionCount = unansweredQuestions.length;
  const primaryPrepareLabel = preparationComplete
    ? 'Continue to export'
    : unansweredQuestions.length > 0
      ? `Answer ${unansweredQuestions.length} decision${unansweredQuestions.length === 1 ? '' : 's'}`
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
          {contextAnalysis.specialistPrompts.slice(0, 1).map(prompt => <div className="context-specialist" key={prompt.id}><b>{prompt.question}</b><small>{prompt.message}</small></div>)}
        </section>
        <section className="context-card printer-context"><span>PRINTER · OPTIONAL</span><div className="context-glyph printer-glyph"><UiIcon name="printer"/></div><div className="printer-control"><PrinterPicker value={printerId} onChange={selectPrinter} label="Target printer" emptyLabel="No printer selected" emptyDescription="Validate compatibility later"/><small>{printer ? `${printer.buildVolume.x} × ${printer.buildVolume.y} × ${printer.buildVolume.z} mm · ${printer.enclosed ? 'Enclosed' : 'Open frame'}` : 'Compatibility will be checked when selected.'}</small></div></section>
        <section className="context-card analysis-context"><span>ANALYSIS</span><div className="analysis-options"><label><input type="radio" checked={connection.provider === 'local'} onChange={() => setConnection(current => ({ ...current, provider: 'local' }))}/><span><b>Local preliminary analysis</b><small>Private · geometry + deterministic rules</small></span></label><label><input type="radio" checked={connection.provider === 'openai'} onChange={() => setConnection(current => ({ ...current, provider: 'openai' }))}/><span><b>OpenAI vision analysis</b><small>Rendered views + deterministic rules</small></span></label>{connection.provider === 'openai' && !connection.apiKey.trim() && <small className="analysis-credential-note">Add an API key in Settings to use this provider.</small>}</div></section>
        {importedBuildVolumeNotice && <p className="context-warning">{importedBuildVolumeNotice.message}</p>}
      </aside>

      <section className="model-workspace">
        <header className="model-workspace-head"><div><span className="kicker">MODEL</span><h1>{analysis?.fileName ?? 'No model loaded'}</h1></div>{analysis && <div className="preview-toolbar" role="group" aria-label="Model preview mode">{([['recommended', 'Selected'], ['risk', 'Risk map'], ['compare', 'Compare']] as const).map(([id, label]) => <button key={id} className={previewMode === id ? 'active' : ''} aria-pressed={previewMode === id} onClick={() => setPreviewMode(id)}>{label}</button>)}</div>}</header>
        {analysis ? <>
          <div className="workflow-preview"><Preview geometry={geometry} orientationId={previewOrientationId} mode={previewMode} plateSize={previewPlate} plateLabel={printer ? 'Build plate' : 'Reference plate'} captureKey={`${analysis.fileName}:${previewOrientationId}:${previewMode}`} onCapture={setPreviewImage}/></div>
          <div className="workflow-metrics"><div><b>{analysis.heightMm.toFixed(1)} mm</b><span>Height</span></div><div><b>{analysis.topology?.componentCount ?? 1}</b><span>Mesh parts</span></div><div><b>{analysis.geometryRisk.overhangRegionCount}</b><span>Overhang regions</span></div><div><b>{(analysis.geometryRisk.bedCoverageRatio * 100).toFixed(1)}%</b><span>Base coverage</span></div></div>
          <details className="model-evidence-drawer"><summary>Geometry findings and orientation evidence</summary>
            <div className="geometry-findings">{analysis.findings?.map(finding => <div className={finding.severity} key={finding.id}><b>{finding.label}</b><p>{finding.detail}</p><small>{Math.round(finding.confidence * 100)}% measurement confidence</small></div>)}</div>
            {orientationComparisons.length > 0 && <div className="orientation-comparison"><p>Relative geometry scores only. Select an orientation to preview it.</p><div>{orientationComparisons.map((item, index) => <button className={`${previewOrientationId === item.candidate.id ? 'selected ' : ''}${index === 0 ? 'recommended' : ''}`} key={item.candidate.id} onClick={() => { setPreviewOrientationId(item.candidate.id); setPreviewMode('recommended'); }}><span><b>{item.candidate.label}</b><small>{index === 0 ? 'Recommended · ' : ''}{item.candidate.heightMm.toFixed(1)} mm tall</small></span><strong>{item.overallScore.toFixed(0)}</strong><span className="score-breakdown">Stability {item.stabilityScore.toFixed(0)} · Support {item.supportScore.toFixed(0)} · Height {item.heightScore.toFixed(0)}</span></button>)}</div></div>}
            <p className="geometry-caveat">Largest connected overhang: {analysis.geometryRisk.largestOverhangRegionAreaMm2.toFixed(0)} mm² · {analysis.geometryRisk.largestOverhangRegionSpanMm.toFixed(1)} mm projected span. These measurements are not FEM, load-path, wall-thickness, or print-failure predictions.</p>
          </details>
        </> : <div className={`workspace-dropzone ${dropActive ? 'drag-active' : ''}`} onDragOver={event => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={event => { event.preventDefault(); setDropActive(false); void loadBrowserFile(event.dataTransfer.files[0]); }}><img src="/check-make-symbol.svg" alt=""/><h2>{busy ? 'Reading model…' : dropActive ? 'Release to inspect' : 'Drop a 3D model to begin'}</h2><p>Check Make starts from geometry, then asks only for decisions that can change the print plan.</p><button className="primary" disabled={busy} onClick={() => void browse()}>Choose model…</button></div>}
        <input ref={fileInput} hidden type="file" accept=".stl,.3mf,.obj" onChange={event => void loadBrowserFile(event.target.files?.[0])}/>
      </section>

      <aside className="decision-panel" ref={decisionPanel}>
        {workflowStage === 'import' && <section className="inspect-panel"><span className="kicker">INSPECT</span><h1>{busy ? 'Inspecting the model…' : !analysis ? 'Add a model' : followUps.purpose?.trim() ? 'Ready to inspect' : 'Add context'}</h1><p>{analysis ? 'Describe what the part does and where it will be used. A printer is optional at this stage and, when selected, adds capability and build-volume checks.' : 'Add or load a 3D model first. Then describe its context; you can select a printer now or validate compatibility later.'}</p>
          <div className="inspect-checklist"><div className={analysis ? 'done' : ''}><i>{analysis ? <UiIcon name="check"/> : '1'}</i><span><b>Model geometry</b><small>{analysis ? `${analysis.triangleCount.toLocaleString()} triangles measured` : 'Waiting for STL, 3MF, or OBJ'}</small></span></div><div className={followUps.purpose?.trim() ? 'done' : ''}><i>{followUps.purpose?.trim() ? <UiIcon name="check"/> : '2'}</i><span><b>Context</b><small>{followUps.purpose?.trim() ? 'Included in analysis' : 'Describe the part and its use'}</small></span></div><div className={printer ? 'done' : 'optional'}><i>{printer ? <UiIcon name="check"/> : <UiIcon name="printer"/>}</i><span><b>Target printer <em>Optional</em></b><small>{printer ? `${printer.manufacturer} ${printer.model}` : 'No printer selected · validate later'}</small></span></div><div><i>3</i><span><b>Analysis</b><small>{connection.provider === 'openai' ? 'Context + vision + deterministic rules' : 'Context + geometry + deterministic rules'}</small></span></div></div>
          <button className="primary workflow-primary" disabled={!analysis || !followUps.purpose?.trim() || busy || (connection.provider === 'openai' && !connection.apiKey.trim())} onClick={() => void runIntelligence()}>{busy ? 'Inspecting…' : connection.provider === 'openai' ? 'Inspect with AI' : 'Inspect model'}</button>
        </section>}

        {workflowStage === 'analysis' && intelligence && <section className="prepare-panel"><span className="kicker">PREPARE</span><div className="prepare-heading"><div><h1>Prepare print</h1><p>{intelligence.objectName}</p></div><span className={preparationComplete ? 'ready-pill' : 'review-pill'}>{preparationComplete ? prepareReadyLabel : 'Review required'}</span></div><div className="readiness-summary"><i style={{ '--readiness': `${preparationComplete ? 100 : Math.max(16, 100 - Math.max(1, decisionCount) * 12)}%` } as React.CSSProperties}/><div><b>{preparationComplete ? prepareReadySummary : decisionCount ? `Ready after ${decisionCount} decision${decisionCount === 1 ? '' : 's'}` : 'Review and apply the prefilled decisions'}</b><small>{intelligence.likelyPurpose}</small></div></div>
          {intelligence.questions.length > 0 && <div className="workflow-questions"><div className="decision-heading"><div><h2>Decisions that affect this plan</h2><p>Review the values prefilled from the Inspect description and complete any remaining decisions.</p></div><span>{unansweredQuestions.length} left</span></div>{intelligence.questions.map(question => {
            const inferredEvidence = autoFilledDecisions[question.id];
            const input = question.kind === 'single' && question.options
              ? <select ref={element => { decisionInputs.current[question.id] = element; }} value={followUps[question.id] ?? ''} onChange={event => updateDecision(question.id, event.target.value)}><option value="">Choose…</option>{question.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              : <textarea ref={element => { decisionInputs.current[question.id] = element; }} value={followUps[question.id] ?? ''} onChange={event => question.id === 'purpose' ? updatePurpose(event.target.value) : setFollowUps(current => ({ ...current, [question.id]: event.target.value }))} onBlur={() => { manuallyAnsweredDecisions.current.add(question.id); focusNextDecision(question.id, followUps); }} placeholder="Describe only what you know…"/>;
            return <label className={`${(followUps[question.id] ?? '').trim() ? 'answered ' : ''}${inferredEvidence ? 'inferred' : ''}`} key={question.id}><span className="decision-state">{(followUps[question.id] ?? '').trim() ? '✓' : intelligence.questions.findIndex(item => item.id === question.id) + 1}</span><span className="decision-copy"><b>{question.question}</b><small>{question.why}</small>{input}{inferredEvidence && <em title={inferredEvidence.join(', ')}>Filled from description · review if needed</em>}</span></label>;
          })}</div>}
          {preparationComplete && recommendations.length > 0 && <RecommendedKeySettings recommendations={recommendations} notices={notices}/>}
          <button className="primary workflow-primary" disabled={busy || (!preparationComplete && unansweredQuestions.length > 0)} onClick={() => preparationComplete ? setView('export') : void refine()}>{primaryPrepareLabel}</button>
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
    <footer className="workflow-status" aria-live="polite"><span>{analysis ? '✓ Local geometry measured' : '○ Geometry waiting'}</span><span>{intelligence ? '✓ Evidence available' : '○ Evidence pending'}</span><span>✓ No structural simulation</span></footer>
  </div>;
}
