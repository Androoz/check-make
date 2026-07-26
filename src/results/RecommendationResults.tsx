import { useMemo, useState } from 'react';
import type { CompatibilityNotice, PlanPreference, Recommendation } from '../types';
import type { Material } from '../types';
import type { MaterialAlternativeCandidate } from '../material/catalog';
import type { PlanPreferenceCandidate } from '../planning/preferences';
import { groupRecommendations, recommendationExplanation } from './presentation';
import type { ResultScope } from './presentation';

const labels: Record<Recommendation['setting'], string> = {
  material: 'Material', nozzle_temperature: 'Nozzle temperature', bed_temperature: 'Build plate temperature',
  orientation: 'Build orientation', layer_height: 'Layer height', wall_loops: 'Wall loops', top_layers: 'Top shell layers',
  bottom_layers: 'Bottom shell layers', infill_type: 'Infill pattern', infill_percent: 'Infill density', support: 'Supports',
  brim: 'Brim', wall_generator: 'Wall generator', wall_order: 'Wall order', seam: 'Seam position', speed_preset: 'Speed preset',
};
const displayedValue = (item: Recommendation) =>
  item.setting === 'support' && String(item.value).toLocaleLowerCase('en-US') === 'auto'
    ? 'Removable supports · Auto'
    : String(item.value);

interface MaterialOptionsProps {
  candidates: MaterialAlternativeCandidate[];
  selected: Material;
  printerSelected: boolean;
  recommended: Material;
  onSelect: (material: Material) => void;
}

function MaterialOptions({ candidates, selected, printerSelected, recommended, onSelect }: MaterialOptionsProps) {
  const alternatives = candidates.filter(candidate => !candidate.recommended);
  if (!printerSelected) return <div className="inline-material-options empty"><b>Alternative materials require a target printer.</b><p>Select a printer so Check Make can validate temperature, enclosure, and nozzle requirements.</p></div>;
  if (!alternatives.length) return <div className="inline-material-options empty"><b>No equally compatible alternative is established.</b><p>Check Make keeps {recommended} because the current printer and confirmed requirements do not support a safer family-level alternative.</p></div>;
  return <div className="inline-material-options">
    <div className="inline-material-heading"><div><b>{alternatives.length} compatible alternative{alternatives.length === 1 ? '' : 's'}</b><p>These materials preserve the confirmed requirements but add trade-offs the Recommended baseline does not need.</p></div>{selected !== recommended && <button type="button" className="quiet" onClick={() => onSelect(recommended)}>Restore {recommended}</button>}</div>
    <div className="inline-material-list">{alternatives.map(candidate => <article className={`inline-material-option ${selected === candidate.material ? 'selected' : ''}`} key={candidate.material}>
      <div className="inline-material-summary"><span className="inline-material-title"><b>{candidate.material}</b><small>{candidate.fitLabels.join(' · ')}</small></span><button type="button" aria-pressed={selected === candidate.material} onClick={() => onSelect(candidate.material)}>{selected === candidate.material ? 'Selected' : `Use ${candidate.material}`}</button></div>
      <p className="material-description">{candidate.improvement}</p>
      <p className="material-not-recommended"><b>Why not recommended:</b> The confirmed requirements are already met by {recommended}. {candidate.disadvantages[0] ?? 'This option adds printing complexity without a required benefit.'}</p>
      <details className="material-profile-details"><summary>Profile & compatibility</summary>
        <dl className="material-profile">
          <div><dt>Starting profile</dt><dd>{candidate.nozzleTemperature} nozzle · {candidate.bedTemperature} build plate</dd></div>
          <div><dt>Printing considerations</dt><dd>{candidate.disadvantages.join(' · ')}</dd></div>
          <div><dt>Printer compatibility</dt><dd>{candidate.printerRequirements.join(' · ')}</dd></div>
          <div><dt>Evidence scope</dt><dd>{candidate.evidenceScope}</dd></div>
        </dl>
      </details>
    </article>)}</div>
  </div>;
}

export function RecommendedKeySettings({ recommendations, notices, materialOptions }: { recommendations: Recommendation[]; notices: CompatibilityNotice[]; materialOptions?: MaterialOptionsProps }) {
  const [scope, setScope] = useState<ResultScope>('essential');
  const [showTechnicalEvidence, setShowTechnicalEvidence] = useState(false);
  const groups = useMemo(() => groupRecommendations(recommendations, scope), [recommendations, scope]);
  const materialAlternativeCount = materialOptions?.candidates.filter(candidate => !candidate.recommended).length ?? 0;

  return <section className="recommended-key-settings result-plan">
    <div className="result-heading"><div><h2>Recommended Key Settings</h2><p>{scope === 'essential' ? 'Key settings from this same complete manufacturing plan.' : 'Every setting in this same complete manufacturing plan.'}</p></div><div className="result-options"><div className="scope-picker" role="group" aria-label="Result detail"><button className={scope === 'essential' ? 'active' : ''} aria-pressed={scope === 'essential'} onClick={() => setScope('essential')}>Key settings</button><button className={scope === 'all' ? 'active' : ''} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All settings</button></div><label><input type="checkbox" checked={showTechnicalEvidence} onChange={event => setShowTechnicalEvidence(event.target.checked)}/> Technical evidence</label></div></div>
    <div className="result-notices">{notices.map((notice, index) => <div className={`notice ${notice.severity}`} role={notice.severity === 'warning' ? 'alert' : 'status'} key={`${notice.message}-${index}`}>{notice.severity === 'warning' ? '⚠' : '✓'} {notice.message}</div>)}</div>
    <div className="recommendation-groups">{groups.map(group => <section className="recommendation-group" key={group.id}><header><h3>{group.label}</h3><p>{group.description}</p></header>{group.recommendations.map(item => <details className="setting-row" key={item.setting}><summary><b>{labels[item.setting]}</b><span className="setting-result-value"><strong>{displayedValue(item)}</strong>{item.setting === 'material' && materialAlternativeCount > 0 && <em>{materialAlternativeCount} alternative{materialAlternativeCount === 1 ? '' : 's'}</em>}</span></summary><div><p>{recommendationExplanation(item, recommendations)}</p>{item.setting === 'material' && materialOptions && <MaterialOptions {...materialOptions}/>} {showTechnicalEvidence && <div className="technical-evidence"><small>{item.ruleIds.join(' · ')} · Evidence {item.evidenceLevel} · {item.validationStatus}</small><small>Decision trace: {item.trace.map(entry => `${entry.ruleId} ${entry.state}${entry.conflictsWithFinal ? ' conflict' : ''}`).join(' · ')}</small><small>Interpretation evidence: {item.inputEvidenceIds?.length ? item.inputEvidenceIds.join(' · ') : 'No semantic input required'}</small></div>}</div></details>)}</section>)}</div>
  </section>;
}

export function PlanPreferenceControl({
  candidates,
  selected,
  inherited,
  overridden,
  onChange,
  onUseDefault,
}: {
  candidates: PlanPreferenceCandidate[];
  selected: PlanPreference;
  inherited: PlanPreference;
  overridden: boolean;
  onChange: (preference: PlanPreference) => void;
  onUseDefault: () => void;
}) {
  const candidate = candidates.find(item => item.id === selected) ?? candidates[0];
  return <section className="plan-preference-card">
    <div className="plan-preference-heading"><div><span className="kicker">PLAN PREFERENCE</span><h2>{candidate.label}</h2><p>{candidate.description}</p></div><em>{overridden ? 'Project override' : 'App default'}</em></div>
    <div className="plan-preference-picker">
      <label><span>Optimize this plan for</span><select aria-label="Plan preference" value={selected} onChange={event => onChange(event.target.value as PlanPreference)}>{candidates.map(option => <option key={option.id} value={option.id} disabled={!option.available}>{option.label}{option.available ? '' : ' · unavailable'}</option>)}</select></label>
      {overridden && <button type="button" className="quiet" onClick={onUseDefault}>Use app default · {candidates.find(item => item.id === inherited)?.label ?? 'Balanced'}</button>}
    </div>
    {candidate.available
      ? candidate.changes.length > 0
        ? <div className="plan-preference-applied" role="status"><b>{candidate.changes.length} setting{candidate.changes.length === 1 ? '' : 's'} changed from Balanced</b><p>{candidate.changes.map(change => `${labels[change.setting]} ${String(change.from)} → ${String(change.to)}`).join(' · ')}</p></div>
        : <div className="plan-preference-applied neutral" role="status"><b>Balanced baseline</b><p>No preference-specific settings are added.</p></div>
      : <div className="plan-preference-blocked" role="status"><b>Preference not applied</b><p>{candidate.blockers.join(' ')}</p></div>}
    <details className="plan-preference-comparison"><summary>Compare plan preferences</summary><div>{candidates.map(option => <article className={option.id === selected ? 'selected' : ''} key={option.id}><span><b>{option.label}</b><small>{option.description}</small></span><em>{option.available ? option.id === 'balanced' ? 'Baseline' : `${option.changes.length} change${option.changes.length === 1 ? '' : 's'}` : 'Unavailable'}</em>{option.blockers.length > 0 && <p>{option.blockers.join(' ')}</p>}</article>)}</div></details>
  </section>;
}
