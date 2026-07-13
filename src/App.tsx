import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Bounds, Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { analyzeStl, chooseOrientation } from './geometry/stl';
import { evaluateRules } from './rules/engine';
import { rules } from './rules/load';
import { checkBuildVolume, checkMaterialCompatibility } from './material/compatibility';
import { getPrinter, printerProfiles } from './printers/profiles';
import { analyzeWithOpenAI, localModelAnalysis, questionnaireFromIntelligence } from './ai/modelIntelligence';
import { packageFileName, serializeRecommendations } from './export/manufacturing';
import type { AIConnection, ModelIntelligence } from './ai/modelIntelligence';
import type { ManufacturingPackageResult, Material, ModelAnalysis, Recommendation, SlicerAdapterStatus, SlicerTarget } from './types';
import './styles.css';
import './desktop-mvp.css';

type View = 'import' | 'analysis' | 'export';
const labels: Record<string, string> = {
  material: 'Material', nozzle_temperature: 'Nozzle temperature', bed_temperature: 'Build plate temperature',
  orientation: 'Build orientation', layer_height: 'Layer height', wall_loops: 'Wall loops', top_layers: 'Top shell layers',
  bottom_layers: 'Bottom shell layers', infill_type: 'Infill pattern', infill_percent: 'Infill density', support: 'Supports',
  brim: 'Brim', wall_generator: 'Wall generator', wall_order: 'Wall order', seam: 'Seam position', speed_preset: 'Speed preset',
};

function Model({ geometry }: { geometry: THREE.BufferGeometry }) {
  return <mesh geometry={geometry}><meshStandardMaterial color="#35c98b" roughness={0.62} metalness={0.05}/></mesh>;
}

function CapturePreview({ captureKey, onCapture }: { captureKey: string; onCapture: (image: string) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      gl.render(scene, camera);
      onCapture(gl.domElement.toDataURL('image/png'));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [captureKey, gl, scene, camera, onCapture]);
  return null;
}

function Preview({ geometry, captureKey, onCapture }: { geometry?: THREE.BufferGeometry; captureKey?: string; onCapture?: (image: string) => void }) {
  return <div className="preview"><Canvas gl={{ preserveDrawingBuffer: Boolean(onCapture) }} camera={{ position: [85, 75, 85] }}>
    <color attach="background" args={['#eef1f3']}/><ambientLight intensity={1.5}/><directionalLight position={[8, 12, 6]} intensity={2}/>
    {geometry && <Bounds fit clip observe margin={1.3}><Model geometry={geometry}/></Bounds>}
    <Grid infiniteGrid fadeDistance={180} cellColor="#a9b1b5" sectionColor="#879195" position={[0, -0.1, 0]}/><OrbitControls makeDefault/>
    {geometry && captureKey && onCapture && <CapturePreview captureKey={captureKey} onCapture={onCapture}/>}
  </Canvas></div>;
}

function StepBar({ view }: { view: View }) {
  const views: View[] = ['import', 'analysis', 'export'];
  return <nav className="stepbar">{[
    ['import', '1', 'Import model'], ['analysis', '2', 'AI analysis'], ['export', '3', 'Create 3MF'],
  ].map(([id, number, label]) => <div className={`${view === id ? 'active ' : ''}${views.indexOf(view) > views.indexOf(id as View) ? 'done' : ''}`} key={id}>
    <b>{number}</b><span>{label}</span>
  </div>)}</nav>;
}

export default function App() {
  const [view, setView] = useState<View>('import');
  const [analysis, setAnalysis] = useState<ModelAnalysis>();
  const [geometry, setGeometry] = useState<THREE.BufferGeometry>();
  const [sourcePath, setSourcePath] = useState<string>();
  const [previewImage, setPreviewImage] = useState<string>();
  const [intelligence, setIntelligence] = useState<ModelIntelligence>();
  const [connection, setConnection] = useState<AIConnection>({ provider: 'local', apiKey: '', model: 'gpt-5.4-mini' });
  const [printerId, setPrinterId] = useState('bambu-x1c');
  const [followUps, setFollowUps] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [status, setStatus] = useState('');
  const [packageTarget, setPackageTarget] = useState<SlicerTarget>('generic');
  const [adapters, setAdapters] = useState<SlicerAdapterStatus[]>([{ target: 'generic', label: 'Generic Core 3MF', available: true, capability: 'core-3mf', detail: 'Portable corrected mesh and Check Make metadata.' }]);
  const fileInput = useRef<HTMLInputElement>(null);
  const printer = getPrinter(printerId);
  const questionnaire = useMemo(() => intelligence ? questionnaireFromIntelligence(intelligence, printer) : undefined, [intelligence, printer]);
  const orientation = useMemo(() => analysis && questionnaire ? chooseOrientation(analysis, questionnaire.priority) : undefined, [analysis, questionnaire]);
  const evaluated = useMemo(() => analysis ? { ...analysis, orientationLabel: orientation?.label ?? 'As imported' } : undefined, [analysis, orientation]);
  const recommendations = useMemo(() => evaluated && questionnaire ? evaluateRules(rules, evaluated, questionnaire) : [], [evaluated, questionnaire]);
  const material = recommendations.find(item => item.setting === 'material')?.value as Material | undefined;
  const notices = useMemo(() => material && analysis ? [...checkMaterialCompatibility(material, printer), ...checkBuildVolume(analysis, printer)] : [], [material, printer, analysis]);

  const resetAnalysis = () => { setIntelligence(undefined); setFollowUps({}); setStatus(''); };
  const loadBrowserFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.stl')) { setError('Check Make currently accepts STL files for analysis.'); return; }
    setBusy(true); setError(''); resetAnalysis();
    try {
      const result = analyzeStl(await file.arrayBuffer(), file.name);
      setAnalysis(result.analysis); setGeometry(result.geometry); setSourcePath(undefined); setPreviewImage(undefined);
    } catch { setError('The STL could not be read. Verify that it is a valid binary or ASCII STL.'); }
    finally { setBusy(false); setDropActive(false); }
  };
  const loadPath = async (path: string) => {
    setBusy(true); setError(''); resetAnalysis();
    try {
      const native = await invoke<ModelAnalysis>('analyze_stl_native', { path });
      const raw = await invoke<ArrayBuffer | Uint8Array | number[]>('read_model_bytes', { path });
      const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw);
      const preview = analyzeStl(bytes.buffer as ArrayBuffer, native.fileName);
      setAnalysis(native); setGeometry(preview.geometry); setSourcePath(path); setPreviewImage(undefined); setView('import');
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); setDropActive(false); }
  };
  const browse = async () => {
    if (isTauri()) { const path = await invoke<string | null>('pick_model_path'); if (path) await loadPath(path); }
    else fileInput.current?.click();
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
    void invoke<SlicerAdapterStatus[]>('detect_slicer_adapters').then(setAdapters).catch(reason => setError(`Slicer detection failed: ${String(reason)}`));
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
    const detail = Object.values(followUps).filter(Boolean).join(' ');
    setIntelligence({ ...intelligence, likelyPurpose: detail || intelligence.likelyPurpose, confidence: detail ? 0.62 : intelligence.confidence, questions: detail ? [] : intelligence.questions, assumptions: detail ? [...intelligence.assumptions, 'User-provided clarification was interpreted by the local fallback.'] : intelligence.assumptions });
  };
  const createPackage = async () => {
    if (!sourcePath || !analysis || !intelligence || !orientation) { setError('3MF creation requires a model imported by the desktop app.'); return; }
    setBusy(true); setError('');
    try {
      const metadata = JSON.stringify({ product: 'Check Make', schemaVersion: 2, intelligence, printer, recommendations, notices }, null, 2);
      const result = await invoke<ManufacturingPackageResult | null>('create_manufacturing_package', {
        path: sourcePath, target: packageTarget, orientationId: orientation.id, metadataJson: metadata,
        defaultName: packageFileName(analysis.fileName, packageTarget), printerId,
        recommendationsJson: serializeRecommendations(recommendations),
      });
      setStatus(result ? `${result.validated ? 'Validated and created' : 'Created'} ${result.path}${result.warnings.length ? ` — ${result.warnings.join(' ')}` : ''}` : 'Export cancelled');
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };

  return <div className="window">
    <StepBar view={view}/>
    {view === 'import' && <main className="import-view">
      <section className="brand-hero"><img className="brand-wordmark" src="/check-make-wordmark.svg" alt="CHECK / MAKE"/><div><h1>Let the model explain itself.</h1><p>Import a part first. Geometry analysis and optional AI will identify likely object types, intended use, uncertainties, and the parameters that matter.</p></div></section>
      <section className="import-grid">
        <div className={`dropzone ${analysis ? 'loaded' : ''} ${dropActive ? 'drag-active' : ''}`} onDragOver={event => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={event => { event.preventDefault(); setDropActive(false); void loadBrowserFile(event.dataTransfer.files[0]); }}>
          {analysis ? <><div className="file-icon">STL</div><h2>{analysis.fileName}</h2><p>{analysis.boundingBox.size.x.toFixed(1)} × {analysis.boundingBox.size.y.toFixed(1)} × {analysis.heightMm.toFixed(1)} mm · {analysis.triangleCount.toLocaleString()} triangles</p><button className="secondary" onClick={() => void browse()}>Choose another model</button></>
            : <><div className="upload-icon">⇧</div><h2>{busy ? 'Reading model…' : dropActive ? 'Release to analyze' : 'Drop your 3D model here'}</h2><p>Native drag-and-drop or file browser · STL up to 100 MB</p><button className="primary" disabled={busy} onClick={() => void browse()}>Browse…</button></>}
          <input ref={fileInput} hidden type="file" accept=".stl" onChange={event => void loadBrowserFile(event.target.files?.[0])}/>
        </div>
        <aside className="analysis-engine"><span className="kicker">ANALYSIS ENGINE</span><h2>Choose how deeply to analyze</h2>
          <label className="provider-option"><input type="radio" checked={connection.provider === 'local'} onChange={() => setConnection(current => ({ ...current, provider: 'local' }))}/><span><b>Local preliminary analysis</b><small>Private and instant. Uses deterministic geometry heuristics and asks for clarification.</small></span></label>
          <label className="provider-option"><input type="radio" checked={connection.provider === 'openai'} onChange={() => setConnection(current => ({ ...current, provider: 'openai' }))}/><span><b>OpenAI vision analysis</b><small>Sends one rendered view and mesh measurements for deeper object and purpose analysis.</small></span></label>
          {connection.provider === 'openai' && <div className="api-fields"><label>OpenAI API key<input type="password" autoComplete="off" value={connection.apiKey} onChange={event => setConnection(current => ({ ...current, apiKey: event.target.value }))} placeholder="sk-…"/></label><label>Model<input value={connection.model} onChange={event => setConnection(current => ({ ...current, model: event.target.value }))}/></label><p>The key stays in memory for this session and is sent only to OpenAI when you analyze.</p></div>}
          <div className="engine-note"><b>No up-front questionnaire</b><p>Check Make asks questions only when missing information could materially change the result.</p></div>
        </aside>
      </section>
      {error && <p className="page-error">{error}</p>}
      <footer className="actions"><span>{analysis ? 'Model ready for analysis' : 'Choose or drop a model to continue'}</span><button className="primary" disabled={!analysis || busy || (connection.provider === 'openai' && !connection.apiKey.trim())} onClick={() => void runIntelligence()}>{connection.provider === 'openai' ? 'Analyze with AI' : 'Run preliminary analysis'}</button></footer>
    </main>}

    {view === 'analysis' && analysis && <main className="analysis-view">
      <section className="model-pane"><div className="pane-head"><div><span className="kicker">MODEL EVIDENCE</span><h2>{analysis.fileName}</h2></div><button className="quiet" onClick={() => setView('import')}>Replace…</button></div><Preview geometry={geometry} captureKey={analysis.fileName} onCapture={setPreviewImage}/><div className="metric-row"><div><b>{analysis.heightMm.toFixed(1)} mm</b><span>Height</span></div><div><b>{analysis.bedContactAreaMm2.toFixed(0)} mm²</b><span>Bed contact</span></div><div><b>{(analysis.overhangRatio * 100).toFixed(1)}%</b><span>Overhang</span></div></div></section>
      <section className="intelligence-pane"><span className="kicker">{busy ? 'ANALYZING MODEL' : intelligence?.provider === 'openai' ? 'AI INTERPRETATION' : 'LOCAL PRELIMINARY INTERPRETATION'}</span>
        {busy && <div className="analysis-progress"><i/><h1>Looking for form, function, and uncertainty…</h1><p>Combining mesh measurements with the rendered model view.</p></div>}
        {!busy && intelligence && <><div className="finding-title"><div><h1>{intelligence.objectName}</h1><p>{intelligence.likelyPurpose}</p></div><strong>{Math.round(intelligence.confidence * 100)}%<small>confidence</small></strong></div>
          <h3>Why Check Make thinks this</h3><ul className="evidence-list">{intelligence.evidence.map(item => <li key={item}>{item}</li>)}</ul>
          {intelligence.questions.length > 0 && <div className="uncertainty"><span className="kicker">NEEDS YOUR INPUT</span><h2>{intelligence.questions.length} answer{intelligence.questions.length === 1 ? '' : 's'} could change the result</h2>{intelligence.questions.map(question => <label key={question.id}><b>{question.question}</b><small>{question.why}</small><textarea value={followUps[question.id] ?? ''} onChange={event => setFollowUps(current => ({ ...current, [question.id]: event.target.value }))} placeholder="Answer only what you know…"/></label>)}<button className="secondary" onClick={() => void refine()}>Refine analysis</button></div>}
          <div className="analysis-controls"><label>Target printer<select value={printerId} onChange={event => setPrinterId(event.target.value)}>{printerProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.manufacturer} {profile.model}</option>)}</select></label><label>Recommended orientation<select value={orientation?.id ?? 'as-imported'} onChange={() => undefined} disabled>{orientation?.label ?? 'As imported'}</select></label></div>
          {error && <p className="page-error">{error}</p>}
          <footer className="actions"><button className="secondary" onClick={() => setView('import')}>Back</button><span>{intelligence.questions.length ? 'You can continue with explicit assumptions or answer first' : 'Analysis is ready'}</span><button className="primary" onClick={() => setView('export')}>Review manufacturing package</button></footer></>}
      </section>
    </main>}

    {view === 'export' && analysis && intelligence && <main className="package-view">
      <header className="package-head"><div><span className="kicker">MANUFACTURING PACKAGE</span><h1>{analysis.fileName.replace(/\.stl$/i, '')}</h1><p>Corrected, reoriented geometry plus a canonical Check Make print plan. Choose a portable file or a slicer-native project.</p></div><div><button className="secondary" onClick={() => setView('analysis')}>Edit analysis</button><button className="primary" disabled={busy || !sourcePath || !adapters.find(item => item.target === packageTarget)?.available} onClick={() => void createPackage()}>{busy ? 'Creating…' : packageTarget === 'generic' ? 'Create Core 3MF…' : `Create ${adapters.find(item => item.target === packageTarget)?.label ?? 'project'}…`}</button></div></header>
      <section className="adapter-picker"><div><span className="kicker">EXPORT FORMAT</span><h2>Where will you slice it?</h2><p>A project adapter applies settings in that slicer's own schema. Generic Core 3MF keeps recommendations as metadata.</p></div><div className="adapter-options">{adapters.map(adapter => <button key={adapter.target} className={`${packageTarget === adapter.target ? 'selected' : ''}`} disabled={!adapter.available} onClick={() => setPackageTarget(adapter.target)}><span><b>{adapter.label}</b><small>{adapter.capability === 'project-3mf' ? 'Project 3MF' : adapter.capability === 'core-3mf' ? 'Portable 3MF' : 'Adapter planned'}</small></span><em>{adapter.available ? 'Available' : 'Unavailable'}</em><p>{adapter.detail}</p></button>)}</div></section>
      <div className="package-grid"><section className="settings"><div className="object-summary"><img src="/check-make-logo.svg" alt=""/><div><span>Identified as</span><b>{intelligence.objectName}</b><p>{intelligence.likelyPurpose}</p></div></div>{notices.map((notice, index) => <div className={`notice ${notice.severity}`} key={index}>{notice.severity === 'warning' ? '⚠' : '✓'} {notice.message}</div>)}<h2>Recommended manufacturing parameters</h2>{recommendations.map((item: Recommendation) => <article key={item.setting}><div><b>{labels[item.setting]}</b><p>{item.reason}</p><small>{item.ruleIds.join(' · ')} · {Math.round(item.confidence * 100)}% deterministic confidence</small></div><strong>{String(item.value)}</strong></article>)}</section><aside><Preview geometry={geometry}/><h3>Package contents</h3><ul><li>Core 3MF mesh in millimetres</li><li>Selected build orientation baked into geometry</li><li>Degenerate triangles removed</li><li>Check Make analysis and canonical settings metadata</li>{packageTarget === 'bambu' && <li>Bambu machine, process, and filament profiles with mapped settings</li>}</ul><div className="compatibility-note"><b>{packageTarget === 'generic' ? 'Cross-slicer boundary' : 'Native project validation'}</b><p>{packageTarget === 'generic' ? 'Every compatible slicer can import the model, but process settings remain advisory.' : 'Check Make asks the installed slicer to create the project and then reopen it before reporting success.'}</p></div></aside></div>
      {status && <p className="save-status">{status}</p>}{error && <p className="page-error">{error}</p>}
    </main>}
  </div>;
}
