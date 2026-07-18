import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Bounds, Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { chooseOrientation } from './geometry/stl';
import { importModel } from './geometry/importModel';
import { evaluateRules } from './rules/engine';
import { ruleEvidenceById, rules } from './rules/load';
import { checkBuildVolume, checkMaterialCompatibility } from './material/compatibility';
import { getPrinter, printerFamilies } from './printers/profiles';
import { analyzeWithOpenAI, localModelAnalysis, questionnaireFromIntelligence, refineLocalIntelligence } from './ai/modelIntelligence';
import { packageFileName, serializeRecommendations } from './export/manufacturing';
import { adapterPlaceholders, mergeDetectedAdapters, supportsPrinter } from './export/adapters';
import type { AIConnection, ModelIntelligence } from './ai/modelIntelligence';
import type { ManufacturingPackageResult, Material, ModelAnalysis, PackageValidationReport, Recommendation, SlicerAdapterStatus, SlicerTarget } from './types';
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

function StepBar({ view, onSave, onOpen, canSave }: { view: View; onSave: () => void; onOpen: () => void; canSave: boolean }) {
  const views: View[] = ['import', 'analysis', 'export'];
  return <nav className="stepbar"><div className="project-actions"><button className="quiet" onClick={onOpen}>Open project…</button><button className="quiet" disabled={!canSave} onClick={onSave}>Save project…</button></div><div className="steps">{[
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
  const [adapters, setAdapters] = useState<SlicerAdapterStatus[]>(adapterPlaceholders);
  const fileInput = useRef<HTMLInputElement>(null);
  const printer = getPrinter(printerId);
  const questionnaire = useMemo(() => intelligence ? questionnaireFromIntelligence(intelligence, printer) : undefined, [intelligence, printer]);
  const orientation = useMemo(() => analysis && questionnaire ? chooseOrientation(analysis, questionnaire.priority) : undefined, [analysis, questionnaire]);
  const evaluated = useMemo(() => analysis ? { ...analysis, orientationLabel: orientation?.label ?? 'As imported' } : undefined, [analysis, orientation]);
  const recommendations = useMemo(() => evaluated && questionnaire ? evaluateRules(rules, evaluated, questionnaire, ruleEvidenceById) : [], [evaluated, questionnaire]);
  const material = recommendations.find(item => item.setting === 'material')?.value as Material | undefined;
  const notices = useMemo(() => material && analysis ? [...checkMaterialCompatibility(material, printer), ...checkBuildVolume(analysis, printer)] : [], [material, printer, analysis]);
  const nativeProjectTarget = packageTarget === 'bambu' || packageTarget === 'orca' || packageTarget === 'prusa' || packageTarget === 'cura' || packageTarget === 'creality';
  const nativeTargetLabel = packageTarget === 'bambu' ? 'Bambu Studio' : packageTarget === 'orca' ? 'OrcaSlicer' : packageTarget === 'prusa' ? 'PrusaSlicer' : packageTarget === 'cura' ? 'UltiMaker Cura' : 'Creality Print';
  const nativeValidationText = packageTarget === 'bambu' ? 'Check Make writes the Bambu project directly and verifies its structure and mapped settings before saving.' : packageTarget === 'orca' ? 'Check Make verifies both the project structure and OrcaSlicer’s effective settings before saving.' : packageTarget === 'prusa' ? 'Check Make lets PrusaSlicer build the project, then verifies both its embedded and effective settings before saving.' : packageTarget === 'cura' ? 'Check Make validates Cura’s workspace structure, installed profiles, and embedded process settings before saving.' : packageTarget === 'creality' ? 'Check Make validates Creality Print profile values and active project overrides before saving.' : 'The selected slicer can import the model, but process settings remain advisory metadata.';
  const selectedAdapter = adapters.find(item => item.target === packageTarget);
  const selectedPrinterSupported = supportsPrinter(selectedAdapter, printerId);
  const supportedPrinterNames = selectedAdapter?.supportedPrinterIds?.map(id => getPrinter(id).model).join(', ') ?? '';
  const unknownRequirements = questionnaire ? [
    ['environment', questionnaire.environment], ['load', questionnaire.load], ['impact', questionnaire.impact],
    ['heat', questionnaire.heat], ['priority', questionnaire.priority], ['support allowance', questionnaire.supportsAllowed],
  ].filter(([, value]) => value === 'unknown').map(([label]) => label) : [];

  const resetAnalysis = () => { setIntelligence(undefined); setFollowUps({}); setStatus(''); setValidationReport(undefined); };
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
    const contents = JSON.stringify({ product: 'Check Make', schemaVersion: 1, savedAt: new Date().toISOString(), sourcePath: sourceModelPath, view, intelligence, printerId, followUps, packageTarget }, null, 2);
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
      const project = JSON.parse(contents) as { sourcePath?: string; view?: View; intelligence?: ModelIntelligence; printerId?: string; followUps?: Record<string, string>; packageTarget?: SlicerTarget };
      if (!project.sourcePath) throw new Error('The project does not reference its source model.');
      if (!await loadPath(project.sourcePath)) return;
      setIntelligence(project.intelligence); setPrinterId(project.printerId ?? 'bambu-x1c'); setFollowUps(project.followUps ?? {}); setPackageTarget(project.packageTarget ?? 'generic'); setView(project.intelligence ? project.view ?? 'analysis' : 'import');
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
    setBusy(true); setError('');
    try {
      const metadata = JSON.stringify({ product: 'Check Make', schemaVersion: 2, intelligence, printer, recommendations, notices }, null, 2);
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
      <section className="brand-hero"><img className="brand-wordmark" src="/check-make-wordmark.svg" alt="CHECK / MAKE"/><div><h1>Let the model explain itself.</h1><p>Import a part first. Geometry analysis and optional AI will identify likely object types, intended use, uncertainties, and the parameters that matter.</p></div></section>
      <section className="import-grid">
        <div className={`dropzone ${analysis ? 'loaded' : ''} ${dropActive ? 'drag-active' : ''}`} onDragOver={event => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={event => { event.preventDefault(); setDropActive(false); void loadBrowserFile(event.dataTransfer.files[0]); }}>
          {analysis ? <><div className="file-icon">{analysis.metadata.format.toUpperCase()}</div><h2>{analysis.fileName}</h2><p>{analysis.boundingBox.size.x.toFixed(1)} × {analysis.boundingBox.size.y.toFixed(1)} × {analysis.heightMm.toFixed(1)} mm · {analysis.triangleCount.toLocaleString()} triangles</p><button className="secondary" onClick={() => void browse()}>Choose another model</button></>
            : <><div className="upload-icon">⇧</div><h2>{busy ? 'Reading model…' : dropActive ? 'Release to analyze' : 'Drop your 3D model here'}</h2><p>STL, 3MF, or OBJ · up to 100 MB</p><button className="primary" disabled={busy} onClick={() => void browse()}>Browse…</button></>}
          <input ref={fileInput} hidden type="file" accept=".stl,.3mf,.obj" onChange={event => void loadBrowserFile(event.target.files?.[0])}/>
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
      <section className="model-pane"><div className="pane-head"><div><span className="kicker">MODEL EVIDENCE</span><h2>{analysis.fileName}</h2></div><button className="quiet" onClick={() => setView('import')}>Replace…</button></div><Preview geometry={geometry} captureKey={analysis.fileName} onCapture={setPreviewImage}/><div className="metric-row"><div><b>{analysis.heightMm.toFixed(1)} mm</b><span>Height</span></div><div><b>{(analysis.geometryRisk.bedCoverageRatio * 100).toFixed(1)}%</b><span>Base coverage</span></div><div><b>{analysis.geometryRisk.overhangRegionCount}</b><span>Overhang regions</span></div></div><p className="geometry-caveat">Largest connected overhang: {analysis.geometryRisk.largestOverhangRegionAreaMm2.toFixed(0)} mm² · {analysis.geometryRisk.largestOverhangRegionSpanMm.toFixed(1)} mm projected span. Bridge behavior is not inferred from STL geometry alone.</p></section>
      <section className="intelligence-pane"><span className="kicker">{busy ? 'ANALYZING MODEL' : intelligence?.provider === 'openai' ? 'AI INTERPRETATION' : 'LOCAL PRELIMINARY INTERPRETATION'}</span>
        {busy && <div className="analysis-progress"><i/><h1>Looking for form, function, and uncertainty…</h1><p>Combining mesh measurements with the rendered model view.</p></div>}
        {!busy && intelligence && <><div className="finding-title"><div><h1>{intelligence.objectName}</h1><p>{intelligence.likelyPurpose}</p></div><strong>{intelligence.provider === 'local' ? 'PRELIMINARY' : 'AI HYPOTHESIS'}<small>status</small></strong></div>
          <details className="disclosure"><summary>Why Check Make thinks this</summary><ul className="evidence-list">{intelligence.evidence.map(item => <li key={item}>{item}</li>)}</ul></details>{unknownRequirements.length > 0 && <div className="notice warning">Unconfirmed requirements: {unknownRequirements.join(', ')}. Check Make will apply neutral baseline rules until you provide explicit evidence.</div>}
          {intelligence.questions.length > 0 && <div className="uncertainty"><span className="kicker">NEEDS YOUR INPUT</span><h2>{intelligence.questions.length} answer{intelligence.questions.length === 1 ? '' : 's'} could change the result</h2>{intelligence.questions.map(question => <label key={question.id}><b>{question.question}</b><small>{question.why}</small><textarea value={followUps[question.id] ?? ''} onChange={event => setFollowUps(current => ({ ...current, [question.id]: event.target.value }))} placeholder="Answer only what you know…"/></label>)}<button className="secondary" onClick={() => void refine()}>Refine analysis</button></div>}
          <div className="analysis-controls"><label>Target printer<select value={printerId} onChange={event => setPrinterId(event.target.value)}>{printerFamilies.map(group => <optgroup key={group.id} label={`${group.manufacturer} · ${group.family}`}>{group.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.model}</option>)}</optgroup>)}</select></label><label>Recommended orientation<select value={orientation?.id ?? 'as-imported'} onChange={() => undefined} disabled>{orientation?.label ?? 'As imported'}</select></label></div>
          {error && <p className="page-error">{error}</p>}
          <footer className="actions"><button className="secondary" onClick={() => setView('import')}>Back</button><span>{intelligence.questions.length ? 'You can continue with explicit assumptions or answer first' : 'Analysis is ready'}</span><button className="primary" onClick={() => setView('export')}>Review manufacturing package</button></footer></>}
      </section>
    </main>}

    {view === 'export' && analysis && intelligence && <main className="package-view">
      <header className="package-head"><div><span className="kicker">MANUFACTURING PACKAGE</span><h1>{analysis.fileName.replace(/\.(?:stl|3mf|obj)$/i, '')}</h1><p>Corrected, reoriented geometry plus a canonical Check Make print plan. Choose a portable file or a slicer-native project.</p></div><div><button className="secondary" onClick={() => setView('analysis')}>Edit analysis</button>{packageTarget === 'bambu' && <button className="secondary" disabled={busy || !sourcePath} onClick={() => void createPackage('save')}>Save project…</button>}<button className="primary" disabled={busy || !sourcePath || !selectedAdapter?.available || !selectedPrinterSupported} onClick={() => void createPackage(packageTarget === 'bambu' ? 'open' : 'save')}>{busy ? 'Creating…' : packageTarget === 'generic' ? 'Create Core 3MF…' : packageTarget === 'bambu' ? 'Open in Bambu Studio' : `Export for ${selectedAdapter?.label ?? packageTarget}…`}</button></div></header>
      <section className="adapter-picker">
        <div className="adapter-main"><span className="kicker">EXPORT FORMAT</span><h2>Where will you slice it?</h2><p>A project adapter applies settings in that slicer's own schema. Generic Core 3MF keeps recommendations as metadata.</p><label className="export-printer">Target printer<select value={printerId} onChange={event => setPrinterId(event.target.value)}>{printerFamilies.map(group => <optgroup key={group.id} label={`${group.manufacturer} · ${group.family}`}>{group.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.model}</option>)}</optgroup>)}</select></label></div>
        <div className="adapter-options">{adapters.map(adapter => { const compatible = supportsPrinter(adapter, printerId); return <button key={adapter.target} aria-pressed={packageTarget === adapter.target} className={`${packageTarget === adapter.target ? 'selected ' : ''}${!compatible ? 'needs-printer' : ''}`} disabled={!adapter.available} onClick={() => setPackageTarget(adapter.target)}><span><b>{adapter.label}</b><small>{adapter.capability === 'project-3mf' ? 'Project 3MF' : adapter.capability === 'core-3mf' ? 'Portable 3MF' : 'Adapter unavailable'}</small></span><em>{!adapter.available ? 'Not installed' : compatible ? 'Ready' : 'Choose printer'}</em><p>{adapter.detail}</p></button>; })}</div>
        {selectedAdapter?.available && !selectedPrinterSupported && <div className="adapter-warning"><b>{selectedAdapter.label} is installed, but the {printer.model} export profile is not implemented yet.</b><p>Choose a supported target printer above to use this native adapter: {supportedPrinterNames}.</p></div>}
      </section>
      <div className="package-grid"><section className="settings"><div className="object-summary"><img src="/check-make-logo.svg" alt=""/><div><span>Identified as</span><b>{intelligence.objectName}</b><p>{intelligence.likelyPurpose}</p></div></div>{unknownRequirements.length > 0 && <div className="notice warning">Baseline only for unconfirmed requirements: {unknownRequirements.join(', ')}.</div>}{notices.map((notice, index) => <div className={`notice ${notice.severity}`} key={index}>{notice.severity === 'warning' ? '⚠' : '✓'} {notice.message}</div>)}<h2>Recommended manufacturing parameters</h2>{recommendations.map((item: Recommendation) => <details className="setting-row" key={item.setting}><summary><b>{labels[item.setting]}</b><strong>{String(item.value)}</strong></summary><div><p>{item.reason}</p><small>{item.ruleIds.join(' · ')} · Evidence {item.evidenceLevel} · {item.validationStatus}</small><small>Decision trace: {item.trace.map(entry => `${entry.ruleId} ${entry.state}${entry.conflictsWithFinal ? ' conflict' : ''}`).join(' · ')}</small></div></details>)}</section><aside><Preview geometry={geometry}/><h3>Package contents</h3><ul><li>Core 3MF mesh in millimetres</li><li>Selected build orientation baked into geometry</li><li>Degenerate triangles removed</li><li>Check Make analysis and canonical settings metadata</li>{nativeProjectTarget && <li>{nativeTargetLabel} machine, process, and filament profiles with mapped settings</li>}</ul><div className="compatibility-note"><b>{nativeProjectTarget ? 'Native project validation' : 'Cross-slicer boundary'}</b><p>{nativeValidationText}</p></div></aside></div>
      {status && <p className="save-status">{status}</p>}{validationReport && <details className="validation-report"><summary>{validationReport.checks.length} export checks passed</summary><ul>{validationReport.checks.map(check => <li key={check.id}>{check.passed ? '✓' : '✕'} {check.label} — {check.detail}</li>)}</ul></details>}{error && <p className="page-error">{error}</p>}
    </main>}
  </div>;
}
