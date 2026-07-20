import { useMemo, useState } from 'react';
import type { CompatibilityNotice, Recommendation } from '../types';
import { groupRecommendations, recommendationExplanation } from './presentation';
import type { ResultScope } from './presentation';
import type { PlanAlternative, PlanObjective } from './alternatives';

const labels: Record<Recommendation['setting'], string> = {
  material: 'Material', nozzle_temperature: 'Nozzle temperature', bed_temperature: 'Build plate temperature',
  orientation: 'Build orientation', layer_height: 'Layer height', wall_loops: 'Wall loops', top_layers: 'Top shell layers',
  bottom_layers: 'Bottom shell layers', infill_type: 'Infill pattern', infill_percent: 'Infill density', support: 'Supports',
  brim: 'Brim', wall_generator: 'Wall generator', wall_order: 'Wall order', seam: 'Seam position', speed_preset: 'Speed preset',
};

export function RecommendedKeySettings({ recommendations, notices }: { recommendations: Recommendation[]; notices: CompatibilityNotice[] }) {
  const [scope, setScope] = useState<ResultScope>('essential');
  const [showTechnicalEvidence, setShowTechnicalEvidence] = useState(false);
  const groups = useMemo(() => groupRecommendations(recommendations, scope), [recommendations, scope]);

  return <section className="recommended-key-settings result-plan">
    <div className="result-heading"><div><h2>Recommended Key Settings</h2><p>{scope === 'essential' ? 'Key settings from this same complete manufacturing plan.' : 'Every setting in this same complete manufacturing plan.'}</p></div><div className="result-options"><div className="scope-picker" role="group" aria-label="Result detail"><button className={scope === 'essential' ? 'active' : ''} aria-pressed={scope === 'essential'} onClick={() => setScope('essential')}>Key settings</button><button className={scope === 'all' ? 'active' : ''} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All settings</button></div><label><input type="checkbox" checked={showTechnicalEvidence} onChange={event => setShowTechnicalEvidence(event.target.checked)}/> Technical evidence</label></div></div>
    <div className="result-notices">{notices.map((notice, index) => <div className={`notice ${notice.severity}`} role={notice.severity === 'warning' ? 'alert' : 'status'} key={`${notice.message}-${index}`}>{notice.severity === 'warning' ? '⚠' : '✓'} {notice.message}</div>)}</div>
    <div className="recommendation-groups">{groups.map(group => <section className="recommendation-group" key={group.id}><header><h3>{group.label}</h3><p>{group.description}</p></header>{group.recommendations.map(item => <details className="setting-row" key={item.setting}><summary><b>{labels[item.setting]}</b><strong>{String(item.value)}</strong></summary><div><p>{recommendationExplanation(item, recommendations)}</p>{showTechnicalEvidence && <div className="technical-evidence"><small>{item.ruleIds.join(' · ')} · Evidence {item.evidenceLevel} · {item.validationStatus}</small><small>Decision trace: {item.trace.map(entry => `${entry.ruleId} ${entry.state}${entry.conflictsWithFinal ? ' conflict' : ''}`).join(' · ')}</small></div>}</div></details>)}</section>)}</div>
  </section>;
}

export function TradeOffAlternatives({ alternatives, objective, onObjectiveChange }: { alternatives: PlanAlternative[]; objective: PlanObjective; onObjectiveChange: (objective: PlanObjective) => void }) {
  return <section className="plan-objectives trade-off-plan">
    <div><span className="kicker">FINE-TUNE</span><h2>What should this plan optimize?</h2><p>The recommended plan stays available. Alternatives are re-run through deterministic rules before they can be selected.</p></div>
    <div className="objective-options">{alternatives.map(alternative => <button key={alternative.id} disabled={!alternative.available} className={objective === alternative.id ? 'selected' : ''} aria-pressed={objective === alternative.id} onClick={() => onObjectiveChange(alternative.id)}><span><b>{alternative.label}</b><small>{alternative.description}</small></span>{alternative.changes.length > 0 && <em>{alternative.changes.length} change{alternative.changes.length === 1 ? '' : 's'}</em>}{alternative.limitation && <p>{alternative.limitation}</p>}</button>)}</div>
    <p className="optimization-boundary"><b>Cost and weight estimates are temporarily unavailable.</b> A reliable value requires actual toolpaths, including walls, infill, shells, support, and brim. Check Make no longer launches an external slicer for these estimates.</p>
  </section>;
}
