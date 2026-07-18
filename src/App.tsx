import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { chooseOrientation, compareOrientations, geometryForOrientation, riskVisualizationGeometry } from './geometry/stl';
import { cameraPose } from './geometry/previewScene';
import type { CameraView } from './geometry/previewScene';
import { importModel } from './geometry/importModel';
import { evaluateRules } from './rules/engine';
import { ruleEvidenceById, rules } from './rules/load';
import { checkBuildVolume, checkMaterialCompatibility } from './material/compatibility';
import { getPrinter, printerFamilies } from './printers/profiles';
import { analyzeWithOpenAI, localModelAnalysis, prepareIntelligenceForReview, questionnaireFromIntelligence, refineLocalIntelligence } from './ai/modelIntelligence';
import { packageFileName, serializeRecommendations } from './export/manufacturing';
import { adapterPlaceholders, mergeDetectedAdapters, suggestSlicerTarget, supportsPrinter } from './export/adapters';
import { RecommendationResults } from './results/RecommendationResults';
import { buildPlanAlternatives } from './results/alternatives';
import type { PlanObjective } from './results/alternatives';
import { assessDecisionReadiness } from './decision/readiness';
import type { AIConnection, ModelIntelligence } from './ai/modelIntelligence';
import type { ManufacturingPackageResult, Material, ModelAnalysis, PackageValidationReport, SlicerAdapterStatus, SlicerTarget } from './types';
import './styles.css';
import './desktop-mvp.css';

type View = 'import' | 'analysis' | 'export';
type PreviewMode = 'original' | 'recommended' | 'risk' | 'compare';
function PreparedModel({ geometry, orientationId, risk = false, color = '#35c98b', position = [0, 0, 0], opacity = 1 }: { geometry: THREE.BufferGeometry; orientationId: string; risk?: boolean; color?: string; position?: [number, number, number]; opacity?: number }) {
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
    <mesh position={[0, -0.85, 0]} receiveShadow><boxGeometry args={[width, 1.7, depth]}/><meshStandardMaterial color="#465258" roughness={0.85} transparent opacity={ghost ? 0.13 : 0.9} depthWrite={!ghost}/></mesh>
    <Grid args={[width, depth]} position={[0, 0.03, 0]} cellSize={10} sectionSize={50} cellColor="#829097" sectionColor="#c3ced2" cellThickness={0.6} sectionThickness={1.1} fadeDistance={Math.max(width, depth) * 1.5} fadeStrength={0.5} infiniteGrid={false}/>
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

function Preview({ geometry, orientationId = 'as-imported', mode = 'original', plateSize = { x: 256, y: 256, z: 256 }, captureKey, onCapture }: { geometry?: THREE.BufferGeometry; orientationId?: string; mode?: PreviewMode; plateSize?: { x: number; y: number; z: number }; captureKey?: string; onCapture?: (image: string) => void }) {
  const [showPlate, setShowPlate] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [cameraView, setCameraView] = useState<CameraView>('isometric');
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
    <color attach="background" args={['#eef1f3']}/><ambientLight intensity={1.5}/><directionalLight position={[8, 12, 6]} intensity={2}/>
    <CameraPreset view={cameraView} distance={cameraDistance} targetY={targetY}/>
    {showPlate && <BuildPlate width={plateSize.x} depth={plateSize.y} ghost={cameraView === 'bottom'}/>}
    {showAxes && <PrinterAxes width={axesWidth} depth={axesDepth}/>}
    {geometry && <group rotation={[-Math.PI / 2, 0, 0]}>
      {mode === 'compare' ? <><PreparedModel geometry={geometry} orientationId="as-imported" color="#8a969c" opacity={0.72} position={[-comparisonOffset, 0, 0]}/><PreparedModel geometry={geometry} orientationId={orientationId} position={[comparisonOffset, 0, 0]}/></> : <PreparedModel geometry={geometry} orientationId={mode === 'original' ? 'as-imported' : orientationId} risk={mode === 'risk'}/>}
    </group>}
    <OrbitControls makeDefault target={[0, targetY, 0]}/>
    {geometry && captureKey && onCapture && <CapturePreview captureKey={captureKey} onCapture={onCapture} distance={cameraDistance} targetY={targetY}/>}
  </Canvas><div className="scene-controls"><div><button className={showPlate ? 'active' : ''} aria-pressed={showPlate} onClick={() => setShowPlate(current => !current)}>Build plate</button><button className={showAxes ? 'active' : ''} aria-pressed={showAxes} onClick={() => setShowAxes(current => !current)}>XYZ axes</button></div><label>View<select value={cameraView} onChange={event => setCameraView(event.target.value as CameraView)}><option value="isometric">Isometric</option><option value="top">Top</option><option value="front">Front</option><option value="back">Back</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></label></div>{mode === 'risk' && <div className="risk-legend"><span><i className="risk-normal"/>Regular surface</span><span><i className="risk-bed"/>Bed contact</span><span><i className="risk-overhang"/>Overhang</span><span><i className="risk-severe"/>Downward face</span></div>}{mode === 'compare' && <div className="comparison-legend"><span>Original</span><span>Selected orientation</span></div>}{showPlate && <div className="plate-size-label">Build plate {plateSize.x} × {plateSize.y} mm</div>}</div>;
}

function StepBar({ view, onSave, onOpen, canSave }: { view: View; onSave: () => void; onOpen: () => void; canSave: boolean }) {
  const views: View[] = ['import', 'analysis', 'export'];
  return <nav className="stepbar"><div className="app-identity"><img src="/check-make-symbol.png" alt=""/><span>Check Make</span></div><div className="project-actions"><button className="quiet" onClick={onOpen}>Open project…</button><button className="quiet" disabled={!canSave} onClick={onSave}>Save project…</button></div><div className="steps">{[
    ['import', '1', 'Import model'], ['analysis', '2', 'AI analysis'], ['export', '3', 'Create 3MF'],
  ].map(([id, number, label]) => <div className={`${view === id ? 'active ' : ''}${views.indexOf(view) > views.indexOf(id as View) ? 'done' : ''}`} key={id}>
    <b>{number}</b><span>{label}</span>
  </div>)}</div></nav>;
}

export default function App() {
  const [view, setView] = useState<View>('import');
  const [analysis, setAnalysis] = useState<ModelAnalysis>();
  const [geometry, setGeometry] = useState<THREE.BufferGeometry>();
  const [sourcePath, setSourcePath] = useState<string>();
  const [sourceModelPath, setSourceModelPath] = useState<string>();
  const [previewImage, setPreviewImage] = useState<string>();
  const [intelligence, setIntelligence] = useState<ModelIntelligence>();
  const [connection, setConnection] = useState<AIConnection>({ provider: 'local', apiKey: '', model: 'gpt-5.4-mini' });
  const [printerId, setPrinterId] = useState('bambu-x1c');
  const [followUps, setFollowUps] = useState<Record<string, string>>({});
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
  const fileInput = useRef<HTMLInputElement>(null);
  const printer = getPrinter(printerId);
  const suggestedPackageTarget = useMemo(() => suggestSlicerTarget(adapters, printerId), [adapters, printerId]);
  const suggestedPackageAdapter = adapters.find(adapter => adapter.target === suggestedPackageTarget) ?? adapterPlaceholders[0];
  const questionnaire = useMemo(() => intelligence ? questionnaireFromIntelligence(intelligence, printer) : undefined, [intelligence, printer]);
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
  const notices = useMemo(() => material && analysis ? [...checkMaterialCompatibility(material, printer), ...checkBuildVolume(analysis, printer)] : [], [material, printer, analysis]);
  const nativeProjectTarget = packageTarget === 'bambu' || packageTarget === 'orca' || packageTarget === 'prusa' || packageTarget === 'cura' || packageTarget === 'creality';
  const nativeTargetLabel = packageTarget === 'bambu' ? 'Bambu Studio' : packageTarget === 'orca' ? 'OrcaSlicer' : packageTarget === 'prusa' ? 'PrusaSlicer' : packageTarget === 'cura' ? 'UltiMaker Cura' : 'Creality Print';
  const nativeValidationText = packageTarget === 'bambu' ? 'Check Make writes the Bambu project directly and verifies its structure and mapped settings before saving.' : packageTarget === 'orca' ? 'Check Make verifies both the project structure and OrcaSlicer’s effective settings before saving.' : packageTarget === 'prusa' ? 'Check Make lets PrusaSlicer build the project, then verifies both its embedded and effective settings before saving.' : packageTarget === 'cura' ? 'Check Make validates Cura’s workspace structure, installed profiles, and embedded process settings before saving.' : packageTarget === 'creality' ? 'Check Make validates Creality Print profile values and active project overrides before saving.' : 'The selected slicer can import the model, but process settings remain advisory metadata.';
  const selectedAdapter = adapters.find(item => item.target === packageTarget);
  const selectedPrinterSupported = supportsPrinter(selectedAdapter, printerId);
  const supportedPrinterNames = selectedAdapter?.supportedPrinterIds?.map(id => getPrinter(id).model).join(', ') ?? '';
  const readiness = useMemo(() => intelligence ? assessDecisionReadiness(intelligence) : undefined, [intelligence]);
  const decisionGaps = readiness?.gaps.map(gap => ({ id: gap.id, label: gap.label, why: gap.reason })) ?? [];
  const importedBuildVolumeNotice = analysis ? checkBuildVolume(analysis, printer)[0] : undefined;

  useEffect(() => {
    if (!orientation) return;
    setPreviewOrientationId(orientation.id);
  }, [orientation]);

  useEffect(() => {
    if (!packageTargetManuallySelected) setPackageTarget(suggestedPackageTarget);
  }, [packageTargetManuallySelected, suggestedPackageTarget]);

  useEffect(() => {
    if (planObjective !== 'recommended' && !planAlternatives.find(item => item.id === planObjective)?.available) setPlanObjective('recommended');
  }, [planAlternatives, planObjective]);

  const selectPrinter = (id: string) => {
    setPrinterId(id); setPackageTargetManuallySelected(false);
    setPackageTarget(suggestSlicerTarget(adapters, id));
  };

  const resetAnalysis = () => { setIntelligence(undefined); setFollowUps({}); setStatus(''); setValidationReport(undefined); setPlanObjective('recommended'); };
  const loadBrowserFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(''); resetAnalysis();
    try {
      const result = await importModel(await file.arrayBuffer(), file.name);
      setAnalysis(result.analysis); setGeometry(result.geometry); setSourcePath(undefined); setSourceModelPath(undefined); setPreviewImage(undefined);
    } catch (reason) { setError(`The model could not be read. ${String(reason)}`); }
    finally { setBusy(false); setDropActive(false); }
  };
  const loadPath = async (path: string) => {
    setBusy(true); setError(''); resetAnalysis();
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
      setIntelligence(project.intelligence ? prepareIntelligenceForReview(project.intelligence) : undefined); setPrinterId(project.printerId ?? 'bambu-x1c'); setFollowUps(project.followUps ?? {}); setPackageTarget(project.packageTarget ?? 'generic'); setPackageTargetManuallySelected(Boolean(project.packageTarget)); setPlanObjective(project.planObjective === 'time' || project.planObjective === 'performance' ? project.planObjective : 'recommended'); setView(project.intelligence ? project.view ?? 'analysis' : 'import');
      setStatus('Check Make project reopened.');
    } catch (reason) { setError(`Could not open project. ${String(reason)}`); }
  };

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
    try {
      const result = connection.provider === 'openai'
        ? await analyzeWithOpenAI(connection, analysis, previewImage, followUps)
        : localModelAnalysis(analysis);
      setIntelligence(result);
    } catch (reason) {
      setIntelligence(localModelAnalysis(analysis));
      setError(`${String(reason)} Showing local preliminary analysis instead.`);
    } finally { setBusy(false); }
  };
  const refine = async () => {
    if (!analysis || !intelligence) return;
    if (connection.provider === 'openai') { await runIntelligence(); return; }
    setIntelligence(refineLocalIntelligence(intelligence, followUps));
  };
  const createPackage = async (mode: 'save' | 'open' = 'save') => {
    if (!sourcePath || !analysis || !intelligence || !orientation) { setError('3MF creation requires a model imported by the desktop app.'); return; }
    if (readiness?.conservativePlan !== 'ready') { setError('Check Make cannot export until every decision-changing requirement has been resolved.'); setView('analysis'); return; }
    setBusy(true); setError('');
    try {
      const metadata = JSON.stringify({ product: 'Check Make', schemaVersion: 2, intelligence, printer, planObjective, recommendations, notices }, null, 2);
      const args = {
        path: sourcePath, orientationId: orientation.id, metadataJson: metadata,
        defaultName: packageFileName(analysis.fileName, packageTarget), printerId,
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

  return <div className="window">
    <StepBar view={view} onSave={() => void saveProject()} onOpen={() => void openProject()} canSave={Boolean(analysis && sourceModelPath)}/>
    {view === 'import' && <main className="import-view">
      <section className="brand-hero"><img className="brand-wordmark" src="/check-make-wordmark.png" alt="CHECK / MAKE"/><div><h1>Let the model explain itself.</h1><p>Import a part first. Geometry analysis and optional AI will identify likely object types, intended use, uncertainties, and the parameters that matter.</p></div></section>
      <section className="import-grid">
        <div className={`dropzone ${analysis ? 'loaded' : ''} ${dropActive ? 'drag-active' : ''}`} onDragOver={event => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={event => { event.preventDefault(); setDropActive(false); void loadBrowserFile(event.dataTransfer.files[0]); }}>
          {analysis ? <><div className="file-icon">{analysis.metadata.format.toUpperCase()}</div><h2>{analysis.fileName}</h2><p>{analysis.boundingBox.size.x.toFixed(1)} × {analysis.boundingBox.size.y.toFixed(1)} × {analysis.heightMm.toFixed(1)} mm · {analysis.triangleCount.toLocaleString()} triangles</p><button className="secondary" onClick={() => void browse()}>Choose another model</button></>
            : <><div className="upload-icon">⇧</div><h2>{busy ? 'Reading model…' : dropActive ? 'Release to analyze' : 'Drop your 3D model here'}</h2><p>STL, 3MF, or OBJ · up to 100 MB</p><button className="primary" disabled={busy} onClick={() => void browse()}>Browse…</button></>}
          <input ref={fileInput} hidden type="file" accept=".stl,.3mf,.obj" onChange={event => void loadBrowserFile(event.target.files?.[0])}/>
        </div>
        <aside className="analysis-engine"><section className="printer-setup"><span className="kicker">PRINT SETUP</span><h2>Choose your target printer</h2><label>3D printer<select value={printerId} onChange={event => selectPrinter(event.target.value)}>{printerFamilies.map(group => <optgroup key={group.id} label={`${group.manufacturer} · ${group.family}`}>{group.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.model}</option>)}</optgroup>)}</select></label><div className="printer-facts"><span><b>{printer.buildVolume.x} × {printer.buildVolume.y} × {printer.buildVolume.z} mm</b>Build volume</span><span><b>{printer.enclosed ? 'Enclosed' : 'Open frame'}</b>Printer type</span></div><div className="export-suggestion"><span>Suggested export</span><b>{suggestedPackageAdapter.label}</b><p>{suggestedPackageTarget === 'generic' ? 'No compatible installed native slicer was detected. Core 3MF remains portable.' : `Installed and compatible with ${printer.model}. You can change this in the export step.`}</p></div>{importedBuildVolumeNotice ? <div className="printer-fit warning">{importedBuildVolumeNotice.message}</div> : analysis ? <div className="printer-fit good">The imported orientation fits the selected printer's build volume.</div> : <p className="printer-help">This selection controls compatibility recommendations, export defaults, and the preview build plate.</p>}</section><div className="engine-divider"/><span className="kicker">ANALYSIS ENGINE</span><h2>Choose how deeply to analyze</h2>
          <label className="provider-option"><input type="radio" checked={connection.provider === 'local'} onChange={() => setConnection(current => ({ ...current, provider: 'local' }))}/><span><b>Local preliminary analysis</b><small>Private and instant. Uses deterministic geometry heuristics and asks for clarification.</small></span></label>
          <label className="provider-option"><input type="radio" checked={connection.provider === 'openai'} onChange={() => setConnection(current => ({ ...current, provider: 'openai' }))}/><span><b>OpenAI vision analysis</b><small>Sends a four-view model montage and deterministic mesh measurements for deeper object and purpose analysis.</small></span></label>
          {connection.provider === 'openai' && <div className="api-fields"><label>OpenAI API key<input type="password" autoComplete="off" value={connection.apiKey} onChange={event => setConnection(current => ({ ...current, apiKey: event.target.value }))} placeholder="sk-…"/></label><label>Model<input value={connection.model} onChange={event => setConnection(current => ({ ...current, model: event.target.value }))}/></label><p>The key stays in memory for this session and is sent only to OpenAI when you analyze.</p></div>}
          <div className="engine-note"><b>No up-front questionnaire</b><p>Check Make asks questions only when missing information could materially change the result.</p></div>
        </aside>
      </section>
      {error && <p className="page-error">{error}</p>}
      <footer className="actions"><span>{analysis ? 'Model ready for analysis' : 'Choose or drop a model to continue'}</span><button className="primary" disabled={!analysis || busy || (connection.provider === 'openai' && !connection.apiKey.trim())} onClick={() => void runIntelligence()}>{connection.provider === 'openai' ? 'Analyze with AI' : 'Run preliminary analysis'}</button></footer>
    </main>}

    {view === 'analysis' && analysis && <main className="analysis-view">
      <section className="model-pane"><div className="pane-head"><div><span className="kicker">MODEL EVIDENCE</span><h2>{analysis.fileName}</h2></div><button className="quiet" onClick={() => setView('import')}>Replace…</button></div>
        <div className="preview-toolbar" role="group" aria-label="Model preview mode">{([['original', 'Original'], ['recommended', 'Selected'], ['risk', 'Risk map'], ['compare', 'Compare']] as const).map(([id, label]) => <button key={id} className={previewMode === id ? 'active' : ''} aria-pressed={previewMode === id} onClick={() => setPreviewMode(id)}>{label}</button>)}</div>
        <Preview geometry={geometry} orientationId={previewOrientationId} mode={previewMode} plateSize={printer.buildVolume} captureKey={`${analysis.fileName}:${previewOrientationId}:${previewMode}`} onCapture={setPreviewImage}/>
        <div className="metric-row"><div><b>{analysis.heightMm.toFixed(1)} mm</b><span>Imported height</span></div><div><b>{(analysis.geometryRisk.bedCoverageRatio * 100).toFixed(1)}%</b><span>Base coverage</span></div><div><b>{analysis.topology?.componentCount ?? 1}</b><span>Mesh parts</span></div><div><b>{analysis.geometryRisk.overhangRegionCount}</b><span>Overhang regions</span></div></div>
        <div className="geometry-findings">{analysis.findings?.map(finding => <div className={finding.severity} key={finding.id}><b>{finding.label}</b><p>{finding.detail}</p><small>{Math.round(finding.confidence * 100)}% measurement confidence</small></div>)}</div>
        {orientationComparisons.length > 0 && <details className="orientation-comparison" open><summary>Compare build orientations</summary><p>Relative geometry scores only. Select a row to preview it; export still uses the rule engine's top recommendation.</p><div>{orientationComparisons.map((item, index) => <button className={`${previewOrientationId === item.candidate.id ? 'selected ' : ''}${index === 0 ? 'recommended' : ''}`} key={item.candidate.id} onClick={() => { setPreviewOrientationId(item.candidate.id); setPreviewMode('recommended'); }}><span><b>{item.candidate.label}</b><small>{index === 0 ? 'Recommended · ' : ''}{item.candidate.heightMm.toFixed(1)} mm tall</small></span><strong>{item.overallScore.toFixed(0)}</strong><span className="score-breakdown">Stability {item.stabilityScore.toFixed(0)} · Support {item.supportScore.toFixed(0)} · Height {item.heightScore.toFixed(0)}</span></button>)}</div></details>}
        <details className="analysis-limits"><summary>What this analysis cannot determine</summary><ul>{analysis.analysisLimits?.map(limit => <li key={limit.id}><b>{limit.label}</b><span>{limit.detail}</span></li>)}</ul></details>
        <p className="geometry-caveat">Largest connected overhang: {analysis.geometryRisk.largestOverhangRegionAreaMm2.toFixed(0)} mm² · {analysis.geometryRisk.largestOverhangRegionSpanMm.toFixed(1)} mm projected span. These measurements are not FEM, load-path, wall-thickness, or print-failure predictions.</p>
      </section>
      <section className="intelligence-pane"><span className="kicker">{busy ? 'ANALYZING MODEL' : intelligence?.provider === 'openai' ? 'AI INTERPRETATION' : 'LOCAL PRELIMINARY INTERPRETATION'}</span>
        {busy && <div className="analysis-progress"><i/><h1>Looking for form, function, and uncertainty…</h1><p>Combining mesh measurements with the rendered model view.</p></div>}
        {!busy && intelligence && <><div className="finding-title"><div><h1>{intelligence.objectName}</h1><p>{intelligence.likelyPurpose}</p></div><strong>{intelligence.provider === 'local' ? 'PRELIMINARY' : 'AI HYPOTHESIS'}<small>status</small></strong></div>
          <details className="disclosure"><summary>Why Check Make thinks this</summary><ul className="evidence-list">{intelligence.evidence.map(item => <li key={item}>{item}</li>)}</ul></details>{decisionGaps.length > 0 && <div className="notice warning"><b>{decisionGaps.length} decision{decisionGaps.length === 1 ? '' : 's'} could change the plan.</b> {decisionGaps.map(item => item.label).join(' · ')}</div>}
          {intelligence.questions.length > 0 && <div className="uncertainty">
            <span className="kicker">NEEDS YOUR INPUT</span><h2>{intelligence.questions.length} detail{intelligence.questions.length === 1 ? '' : 's'} must be resolved</h2>
            {intelligence.questions.map(question => <label key={question.id}><b>{question.question}</b><small>{question.why}</small>{question.kind === 'single' && question.options
              ? <select value={followUps[question.id] ?? ''} onChange={event => setFollowUps(current => ({ ...current, [question.id]: event.target.value }))}><option value="">Choose…</option>{question.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              : <textarea value={followUps[question.id] ?? ''} onChange={event => setFollowUps(current => ({ ...current, [question.id]: event.target.value }))} placeholder="Describe only what you know…"/>}</label>)}
            <button className="secondary" disabled={intelligence.questions.some(question => !(followUps[question.id] ?? '').trim())} onClick={() => void refine()}>Apply answers and re-check</button>
          </div>}
          <div className="analysis-controls"><label>Target printer<select value={printerId} onChange={event => selectPrinter(event.target.value)}>{printerFamilies.map(group => <optgroup key={group.id} label={`${group.manufacturer} · ${group.family}`}>{group.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.model}</option>)}</optgroup>)}</select></label><label>Recommended orientation<select value={orientation?.id ?? 'as-imported'} onChange={() => undefined} disabled>{orientation?.label ?? 'As imported'}</select></label></div>
          {error && <p className="page-error">{error}</p>}
          <footer className="actions"><button className="secondary" onClick={() => setView('import')}>Back</button><span>{readiness?.conservativePlan === 'ready' ? 'All decision-changing requirements are resolved' : 'Answer the required details before review'}</span><button className="primary" disabled={readiness?.conservativePlan !== 'ready'} onClick={() => setView('export')}>Review manufacturing package</button></footer></>}
      </section>
    </main>}

    {view === 'export' && analysis && intelligence && <main className="package-view">
      <header className="package-head"><div><span className="kicker">MANUFACTURING PACKAGE</span><h1>{analysis.fileName.replace(/\.(?:stl|3mf|obj)$/i, '')}</h1><p>Corrected, reoriented geometry plus a canonical Check Make print plan. Choose a portable file or a slicer-native project.</p></div><div><button className="secondary" onClick={() => setView('analysis')}>Edit analysis</button>{packageTarget === 'bambu' && <button className="secondary" disabled={busy || !sourcePath || readiness?.conservativePlan !== 'ready'} onClick={() => void createPackage('save')}>Save project…</button>}<button className="primary" disabled={busy || !sourcePath || !selectedAdapter?.available || !selectedPrinterSupported || readiness?.conservativePlan !== 'ready'} onClick={() => void createPackage(packageTarget === 'bambu' ? 'open' : 'save')}>{busy ? 'Creating…' : packageTarget === 'generic' ? 'Create Core 3MF…' : packageTarget === 'bambu' ? 'Open in Bambu Studio' : `Export for ${selectedAdapter?.label ?? packageTarget}…`}</button></div></header>
      <section className="adapter-picker">
        <div className="adapter-main"><span className="kicker">EXPORT FORMAT</span><h2>Where will you slice it?</h2><p>A project adapter applies settings in that slicer's own schema. Generic Core 3MF keeps recommendations as metadata.</p><label className="export-printer">Target printer<select value={printerId} onChange={event => selectPrinter(event.target.value)}>{printerFamilies.map(group => <optgroup key={group.id} label={`${group.manufacturer} · ${group.family}`}>{group.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.model}</option>)}</optgroup>)}</select></label></div>
        <div className="adapter-options">{adapters.map(adapter => { const compatible = supportsPrinter(adapter, printerId); return <button key={adapter.target} aria-pressed={packageTarget === adapter.target} className={`${packageTarget === adapter.target ? 'selected ' : ''}${!compatible ? 'needs-printer' : ''}`} disabled={!adapter.available} onClick={() => { setPackageTarget(adapter.target); setPackageTargetManuallySelected(true); }}><span><b>{adapter.label}</b><small>{adapter.capability === 'project-3mf' ? 'Project 3MF' : adapter.capability === 'core-3mf' ? 'Portable 3MF' : 'Adapter unavailable'}</small></span><em>{!adapter.available ? 'Not installed' : compatible ? 'Ready' : 'Choose printer'}</em><p>{adapter.detail}</p></button>; })}</div>
        {selectedAdapter?.available && !selectedPrinterSupported && <div className="adapter-warning"><b>{selectedAdapter.label} is installed, but the {printer.model} export profile is not implemented yet.</b><p>Choose a supported target printer above to use this native adapter: {supportedPrinterNames}.</p></div>}
      </section>
      <div className="package-grid"><section className="settings"><RecommendationResults objectName={intelligence.objectName} likelyPurpose={intelligence.likelyPurpose} recommendations={recommendations} decisionGaps={decisionGaps} notices={notices} alternatives={planAlternatives} objective={planObjective} onObjectiveChange={setPlanObjective}/></section><aside><Preview geometry={geometry} orientationId={orientation?.id} mode="recommended" plateSize={printer.buildVolume}/><h3>Package contents</h3><ul><li>Core 3MF mesh in millimetres</li><li>Selected build orientation baked into geometry</li><li>Degenerate triangles removed</li><li>Check Make analysis and canonical settings metadata</li>{nativeProjectTarget && <li>{nativeTargetLabel} machine, process, and filament profiles with mapped settings</li>}</ul><div className="compatibility-note"><b>{nativeProjectTarget ? 'Native project validation' : 'Cross-slicer boundary'}</b><p>{nativeValidationText}</p></div></aside></div>
      {status && <p className="save-status">{status}</p>}{validationReport && <details className="validation-report"><summary>{validationReport.checks.length} export checks passed</summary><ul>{validationReport.checks.map(check => <li key={check.id}>{check.passed ? '✓' : '✕'} {check.label} — {check.detail}</li>)}</ul></details>}{error && <p className="page-error">{error}</p>}
    </main>}
  </div>;
}
