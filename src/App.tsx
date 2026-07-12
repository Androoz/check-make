import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { analyzeStl } from './geometry/stl';
import { evaluateRules } from './rules/engine';
import { rules } from './rules/load';
import type { ModelAnalysis, Questionnaire } from './types';
import './styles.css';

const defaults: Questionnaire = { printer:'X1C', material:'PLA', priority:'strength', impact:'medium', fitCritical:false, outdoor:false, supportsAllowed:true };
const labels: Record<string,string> = {orientation:'Orientering',layer_height:'Lagerhöjd',wall_loops:'Väggslingor',top_layers:'Topplager',bottom_layers:'Bottenlager',infill_type:'Fyllnadstyp',infill_percent:'Fyllnadsgrad',support:'Support',brim:'Brim',wall_generator:'Vägggenerator',wall_order:'Väggordning',seam:'Söm',speed_preset:'Hastighetsprofil'};

function Model({geometry}:{geometry:THREE.BufferGeometry}) { return <mesh geometry={geometry}><meshStandardMaterial color="#67d6bd" roughness={0.58}/></mesh> }
export default function App(){
  const [analysis,setAnalysis]=useState<ModelAnalysis>(); const [geometry,setGeometry]=useState<THREE.BufferGeometry>(); const [answers,setAnswers]=useState(defaults); const [error,setError]=useState('');
  const recommendations=useMemo(()=>analysis?evaluateRules(rules,analysis,answers):[],[analysis,answers]);
  const load=async(file?:File)=>{if(!file)return; if(!file.name.toLowerCase().endsWith('.stl')){setError('Det första vertikala snittet stöder STL. 3MF kommer i nästa milstolpe.');return} try{const result=analyzeStl(await file.arrayBuffer(),file.name);setAnalysis(result.analysis);setGeometry(result.geometry);setError('')}catch{setError('STL-filen kunde inte läsas. Kontrollera att den är binär eller ASCII STL.')}};
  const answer=<K extends keyof Questionnaire>(key:K,value:Questionnaire[K])=>setAnswers(a=>({...a,[key]:value}));
  return <main>
    <header><div><span className="eyebrow">INTELLIGENT 3D PRINT ASSISTANT</span><h1>OptimusPrint</h1></div><span className="local">● Lokal analys</span></header>
    {!analysis?<section className="drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void load(e.dataTransfer.files[0])}}><div className="cube">⬡</div><h2>Dra in din STL-modell</h2><p>Modellen lämnar inte datorn. OptimusPrint analyserar geometri och ger transparenta Bambu Studio-förslag.</p><label className="button">Välj STL<input type="file" accept=".stl" hidden onChange={e=>void load(e.target.files?.[0])}/></label>{error&&<p className="error">{error}</p>}</section>:
    <div className="workspace">
      <section className="viewer"><div className="section-title"><span>01 · MODELL</span><button className="link" onClick={()=>{setAnalysis(undefined);setGeometry(undefined)}}>Byt modell</button></div>{geometry&&<Canvas camera={{position:[80,80,80]}}><ambientLight intensity={1.5}/><directionalLight position={[5,8,5]} intensity={2}/><Bounds fit clip observe margin={1.25}><Model geometry={geometry}/></Bounds><OrbitControls makeDefault/></Canvas>}<div className="metrics"><b>{analysis.fileName}</b><span>{analysis.boundingBox.size.x.toFixed(1)} × {analysis.boundingBox.size.y.toFixed(1)} × {analysis.heightMm.toFixed(1)} mm</span><span>{analysis.triangleCount.toLocaleString('sv-SE')} trianglar</span><span>Plattkontakt ≈ {analysis.bedContactAreaMm2.toFixed(0)} mm²</span><span>Kritiska överhäng ≈ {(analysis.overhangRatio*100).toFixed(1)} %</span></div></section>
      <section className="questions"><div className="section-title"><span>02 · KONTEXT</span><small>7 frågor</small></div>
        <Field label="Skrivare"><select value={answers.printer} onChange={e=>answer('printer',e.target.value as Questionnaire['printer'])}><option>X1C</option><option>P1S</option></select></Field>
        <Field label="Material"><select value={answers.material} onChange={e=>answer('material',e.target.value as Questionnaire['material'])}><option>PLA</option><option>PETG</option></select></Field>
        <Field label="Viktigast"><select value={answers.priority} onChange={e=>answer('priority',e.target.value as Questionnaire['priority'])}><option value="strength">Styrka</option><option value="accuracy">Måttnoggrannhet</option><option value="finish">Ytfinish</option><option value="speed">Tid</option></select></Field>
        <Field label="Slagbelastning"><select value={answers.impact} onChange={e=>answer('impact',e.target.value as Questionnaire['impact'])}><option value="none">Ingen</option><option value="medium">Måttlig</option><option value="high">Hög</option></select></Field>
        <Check label="Kritisk passning" value={answers.fitCritical} set={v=>answer('fitCritical',v)}/><Check label="Utomhusbruk" value={answers.outdoor} set={v=>answer('outdoor',v)}/><Check label="Support är tillåtet" value={answers.supportsAllowed} set={v=>answer('supportsAllowed',v)}/>
      </section>
      <section className="results"><div className="section-title"><span>03 · UTSKRIFTSPLAN</span><small>{recommendations.length} beslut</small></div>{recommendations.map(r=><article key={r.setting}><div><h3>{labels[r.setting]}</h3><p>{r.reason}</p><code>{r.ruleIds.join(' · ')}</code></div><div className="value">{String(r.value)}<small>{Math.round(r.confidence*100)} %</small></div></article>)}</section>
    </div>}
  </main>
}
function Field({label,children}:{label:string,children:React.ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
function Check({label,value,set}:{label:string,value:boolean,set:(v:boolean)=>void}){return <label className="check"><span>{label}</span><input type="checkbox" checked={value} onChange={e=>set(e.target.checked)}/></label>}
