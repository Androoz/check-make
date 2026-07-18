import { useMemo, useState } from 'react';
import type { CompatibilityNotice, Recommendation } from '../types';
import { groupRecommendations, summarizeResult } from './presentation';
import type { ResultScope } from './presentation';
import type { PlanAlternative, PlanObjective } from './alternatives';

const labels: Record<Recommendation['setting'], string> = {
  material: 'Material', nozzle_temperature: 'Nozzle temperature', bed_temperature: 'Build plate temperature',
  orientation: 'Build orientation', layer_height: 'Layer height', wall_loops: 'Wall loops', top_layers: 'Top shell layers',
  bottom_layers: 'Bottom shell layers', infill_type: 'Infill pattern', infill_percent: 'Infill density', support: 'Supports',
  brim: 'Brim', wall_generator: 'Wall generator', wall_order: 'Wall order', seam: 'Seam position', speed_preset: 'Speed preset',
};

interface RecommendationResultsProps {
  objectName: string;
  likelyPurpose: string;
  recommendations: Recommendation[];
  decisionGaps: Array<{ id: string; label: string; why: string }>;
  notices: CompatibilityNotice[];
  alternatives: PlanAlternative[];
  objective: PlanObjective;
  onObjectiveChange: (objective: PlanObjective) => void;
}

export function RecommendationResults({ objectName, likelyPurpose, recommendations, decisionGaps, notices, alternatives, objective, onObjectiveChange }: RecommendationResultsProps) {
  const [scope, setScope] = useState<ResultScope>('essential');
  const [showTechnicalEvidence, setShowTechnicalEvidence] = useState(false);
  const summary = useMemo(() => summarizeResult(decisionGaps, notices), [notices, decisionGaps]);
  const groups = useMemo(() => groupRecommendations(recommendations, scope), [recommendations, scope]);
  const selectedAlternative = alternatives.find(alternative => alternative.id === objective);

  return <>
    <div className="object-summary"><img src="/check-make-symbol.png" alt="Check Make verified model symbol"/><div><span>Identified as</span><b>{objectName}</b><p>{likelyPurpose}</p></div></div>
    <section className="plan-objectives">
      <div><span className="kicker">FINE-TUNE</span><h2>What should this plan optimize?</h2><p>The recommended plan stays available. Alternatives are re-run through deterministic rules before they can be selected.</p></div>
      <div className="objective-options">{alternatives.map(alternative => <button key={alternative.id} disabled={!alternative.available} className={objective === alternative.id ? 'selected' : ''} aria-pressed={objective === alternative.id} onClick={() => onObjectiveChange(alternative.id)}><span><b>{alternative.label}</b><small>{alternative.description}</small></span>{alternative.changes.length > 0 && <em>{alternative.changes.length} change{alternative.changes.length === 1 ? '' : 's'}</em>}{alternative.limitation && <p>{alternative.limitation}</p>}</button>)}</div>
      <p className="optimization-boundary"><b>Cost and weight estimates are temporarily unavailable.</b> A reliable value requires actual toolpaths, including walls, infill, shells, support, and brim. Check Make no longer launches an external slicer for these estimates.</p>
    </section>
    <section className={`result-plan ${summary.reviewState}`}>
      <header className="result-summary"><div className="result-status"><i/>{summary.eyebrow}</div><h2>{summary.title}</h2><p>{objective !== 'recommended' ? `${selectedAlternative?.label ?? 'Alternative'} selected. Every changed setting below has been re-evaluated from the same requirements; review the trade-off before export.` : summary.message}</p>{objective !== 'recommended' && <button className="quiet reset-objective" onClick={() => onObjectiveChange('recommended')}>Restore recommended plan</button>}</header>
      <div className="result-notices">{decisionGaps.length > 0 && <div className="notice warning"><b>{decisionGaps.length} decision{decisionGaps.length === 1 ? '' : 's'} need review</b><ul>{decisionGaps.map(gap => <li key={gap.id}><span>{gap.label}</span><small>{gap.why}</small></li>)}</ul></div>}{notices.map((notice, index) => <div className={`notice ${notice.severity}`} key={`${notice.message}-${index}`}>{notice.severity === 'warning' ? '⚠' : '✓'} {notice.message}</div>)}</div>
      <div className="result-heading"><div><h2>Recommended manufacturing parameters</h2><p>{scope === 'essential' ? 'Key settings from this same complete plan.' : 'Every setting in this same complete plan.'}</p></div><div className="result-options"><div className="scope-picker" role="group" aria-label="Result detail"><button className={scope === 'essential' ? 'active' : ''} aria-pressed={scope === 'essential'} onClick={() => setScope('essential')}>Key settings</button><button className={scope === 'all' ? 'active' : ''} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All settings</button></div><label><input type="checkbox" checked={showTechnicalEvidence} onChange={event => setShowTechnicalEvidence(event.target.checked)}/> Technical evidence</label></div></div>
      <div className="recommendation-groups">{groups.map(group => <section className="recommendation-group" key={group.id}><header><h3>{group.label}</h3><p>{group.description}</p></header>{group.recommendations.map(item => <details className="setting-row" key={item.setting}><summary><b>{labels[item.setting]}</b><strong>{String(item.value)}</strong></summary><div><p>{item.reason}</p>{showTechnicalEvidence && <div className="technical-evidence"><small>{item.ruleIds.join(' · ')} · Evidence {item.evidenceLevel} · {item.validationStatus}</small><small>Decision trace: {item.trace.map(entry => `${entry.ruleId} ${entry.state}${entry.conflictsWithFinal ? ' conflict' : ''}`).join(' · ')}</small></div>}</div></details>)}</section>)}</div>
    </section>
  </>;
}
