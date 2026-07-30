import { useMemo, useState } from 'react';
import type { CompatibilityNotice, PlanPreference, Recommendation } from '../types';
import type { Material } from '../types';
import type { MaterialAlternativeCandidate } from '../material/catalog';
import type { FilamentProductAssessment, FilamentProductProfile } from '../material/products';
import type { PlanPreferenceCandidate } from '../planning/preferences';
import { OptionPicker } from '../components/OptionPicker';
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
  decisionReason: string;
  onSelect: (material: Material) => void;
  productOptions: FilamentProductAssessment[];
  selectedProduct?: FilamentProductProfile;
  onSelectProduct: (productId?: string) => void;
}

export const compatibleMaterialAlternatives = (candidates: MaterialAlternativeCandidate[]) =>
  candidates.filter(candidate => !candidate.recommended && candidate.selectable);

function MaterialOptions({
  candidates, selected, printerSelected, recommended, decisionReason, onSelect,
  productOptions, selectedProduct, onSelectProduct,
}: MaterialOptionsProps) {
  const alternatives = compatibleMaterialAlternatives(candidates);
  const compatibleProducts = productOptions.filter(option => option.compatible);
  return <div className="inline-material-options">
    <div className="material-decision-reason"><b>Why Check Make selected {recommended}</b><p>{decisionReason}</p></div>
    <div className="filament-product-picker">
      <div><b>Filament product profile</b><p>A reviewed product profile replaces the family-level starting temperatures. It does not prove suitability for a specific load, wear, or chemical exposure.</p></div>
      <OptionPicker
        label="Filament product profile"
        value={selectedProduct?.id ?? ''}
        options={[
          { value: '', label: `${selected} family fallback`, description: 'Uses conservative family-level starting values.' },
          ...productOptions.map(option => ({
            value: option.profile.id,
            label: option.profile.product,
            description: option.compatible
              ? `${option.profile.nozzleTemperatureC.starting} °C nozzle · ${option.profile.bedTemperatureC.starting} °C build plate`
              : option.limitations.join(' '),
            disabled: !option.compatible,
          })),
        ]}
        onChange={value => onSelectProduct(value || undefined)}
      />
      {!selectedProduct && compatibleProducts.length > 0 && <small className="filament-product-availability">{compatibleProducts.length} compatible reviewed product profile{compatibleProducts.length === 1 ? '' : 's'} available{compatibleProducts.length === 1 ? `: ${compatibleProducts[0].profile.product}` : ''}. The family fallback remains selected until you confirm the filament product.</small>}
      {selectedProduct && <div className="selected-filament-product">
        <b>{selectedProduct.manufacturer} · {selectedProduct.product}</b>
        <p>{selectedProduct.nozzleTemperatureC.minimum}–{selectedProduct.nozzleTemperatureC.maximum} °C nozzle · {selectedProduct.bedTemperatureC.minimum}–{selectedProduct.bedTemperatureC.maximum} °C build plate · Reviewed {selectedProduct.source.reviewedAt} · Review due {selectedProduct.lifecycle.reviewDueAt}</p>
        <p>Variant: {selectedProduct.variant.name} · Product performance upgrades: {selectedProduct.upgradeEvidence.status === 'qualified' ? 'qualified' : 'not yet qualified'}</p>
        <a href={selectedProduct.source.url} target="_blank" rel="noreferrer">Manufacturer source</a>
      </div>}
    </div>
    {!printerSelected
      ? <div className="inline-material-options empty"><b>Alternative materials require a target printer.</b><p>Select a printer so Check Make can validate temperature, enclosure, and nozzle requirements.</p></div>
      : !alternatives.length
        ? <div className="inline-material-options empty"><b>No compatible material alternative is established.</b><p>No other evaluated material family preserves the confirmed requirements for the selected printer.</p></div>
        : <>
    <div className="inline-material-heading"><div><b>{alternatives.length} compatible alternative{alternatives.length === 1 ? '' : 's'}</b><p>Only material families that preserve the confirmed requirements and match the selected printer are shown.</p></div>{selected !== recommended && <button type="button" className="quiet" onClick={() => onSelect(recommended)}>Restore {recommended}</button>}</div>
    <div className="inline-material-list">{alternatives.map(candidate => <article className={`inline-material-option ${selected === candidate.material ? 'selected' : ''}`} key={candidate.material}>
      <div className="inline-material-summary"><span className="inline-material-title"><b>{candidate.material}</b><small>{candidate.status === 'compatible' ? candidate.fitLabels.join(' · ') : candidate.status === 'printer-incompatible' ? 'Printer limitation' : candidate.status === 'specialist-review' ? 'Product-specific evidence required' : 'Does not preserve all requirements'}</small></span><button type="button" disabled={!candidate.selectable} aria-pressed={selected === candidate.material} onClick={() => onSelect(candidate.material)}>{selected === candidate.material ? 'Selected' : candidate.selectable ? `Use ${candidate.material}` : 'Unavailable'}</button></div>
      <p className="material-description">{candidate.improvement}</p>
      <p className="material-not-recommended"><b>{candidate.status === 'compatible' ? 'Why not recommended:' : 'Why unavailable:'}</b> {candidate.whyNotRecommended}</p>
      <details className="material-profile-details"><summary>Profile & compatibility</summary>
        <dl className="material-profile">
          <div><dt>Starting profile</dt><dd>{candidate.nozzleTemperature} nozzle · {candidate.bedTemperature} build plate</dd></div>
          <div><dt>Printing considerations</dt><dd>{candidate.disadvantages.join(' · ')}</dd></div>
          <div><dt>Requirement coverage</dt><dd>{candidate.missingRequirements.length ? `Missing: ${candidate.missingRequirements.join(' · ')}` : 'Covers the confirmed family-level material requirements.'}{candidate.unmetPreferences.length ? ` Preferred properties not covered: ${candidate.unmetPreferences.join(' · ')}.` : ''}</dd></div>
          <div><dt>Printer compatibility</dt><dd>{candidate.printerLimitations.length ? candidate.printerLimitations.join(' · ') : candidate.printerRequirements.join(' · ')}</dd></div>
          <div><dt>Evidence scope</dt><dd>{candidate.evidenceScope}</dd></div>
        </dl>
      </details>
    </article>)}</div></>}
  </div>;
}

export function RecommendedKeySettings({ recommendations, notices, materialOptions }: { recommendations: Recommendation[]; notices: CompatibilityNotice[]; materialOptions?: MaterialOptionsProps }) {
  const [scope, setScope] = useState<ResultScope>('essential');
  const [showTechnicalEvidence, setShowTechnicalEvidence] = useState(false);
  const groups = useMemo(() => groupRecommendations(recommendations, scope), [recommendations, scope]);
  const materialAlternativeCount = materialOptions?.candidates.filter(candidate => !candidate.recommended && candidate.selectable).length ?? 0;

  return <section className="recommended-key-settings result-plan">
    <div className="result-heading"><div><h2>Recommended Key Settings</h2><p>{scope === 'essential' ? 'Key settings from this same complete manufacturing plan.' : 'Every setting in this same complete manufacturing plan.'}</p></div><div className="result-options"><div className="scope-picker" role="group" aria-label="Result detail"><button className={scope === 'essential' ? 'active' : ''} aria-pressed={scope === 'essential'} onClick={() => setScope('essential')}>Key settings</button><button className={scope === 'all' ? 'active' : ''} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All settings</button></div><label><input type="checkbox" checked={showTechnicalEvidence} onChange={event => setShowTechnicalEvidence(event.target.checked)}/> Technical evidence</label></div></div>
    <div className="result-notices">{notices.map((notice, index) => <div className={`notice ${notice.severity}`} role={notice.severity === 'warning' ? 'alert' : 'status'} key={`${notice.message}-${index}`}><span className="notice-symbol" aria-hidden="true">{notice.severity === 'warning' ? '!' : notice.severity === 'success' ? '✓' : 'i'}</span><span>{notice.message}</span></div>)}</div>
    <div className="recommendation-groups">{groups.map(group => <section className="recommendation-group" key={group.id}><header><h3>{group.label}</h3><p>{group.description}</p></header>{group.recommendations.map(item => <details className="setting-row" key={item.setting}><summary><b>{labels[item.setting]}</b><span className="setting-result-value"><strong>{displayedValue(item)}</strong>{item.setting === 'material' && materialAlternativeCount > 0 && <em>{materialAlternativeCount} alternative{materialAlternativeCount === 1 ? '' : 's'}</em>}</span></summary><div><p>{recommendationExplanation(item, recommendations)}</p>{item.setting === 'material' && materialOptions && <MaterialOptions {...materialOptions}/>} {showTechnicalEvidence && <div className="technical-evidence"><small>{item.ruleIds.join(' · ')} · Evidence {item.evidenceLevel} · {item.validationStatus}</small><small>Decision trace: {item.trace.map(entry => `${entry.ruleId} ${entry.state}${entry.conflictsWithFinal ? ' conflict' : ''}`).join(' · ')}</small><small>Interpretation evidence: {item.inputEvidenceIds?.length ? item.inputEvidenceIds.join(' · ') : 'No semantic input required'}</small></div>}</div></details>)}</section>)}</div>
  </section>;
}

export function PlanPreferenceControl({
  candidates,
  selected,
  applied,
  inherited,
  overridden,
  onChange,
  onUseDefault,
}: {
  candidates: PlanPreferenceCandidate[];
  selected: PlanPreference;
  applied: PlanPreference;
  inherited: PlanPreference;
  overridden: boolean;
  onChange: (preference: PlanPreference) => void;
  onUseDefault: () => void;
}) {
  const requestedCandidate = candidates.find(item => item.id === selected) ?? candidates[0];
  const candidate = candidates.find(item => item.id === applied) ?? candidates[0];
  const fellBackToBalanced = selected !== applied;
  const changeLabel = candidate.available
    ? candidate.id === 'balanced' ? 'Baseline' : `${candidate.changes.length} change${candidate.changes.length === 1 ? '' : 's'}`
    : 'Unavailable';
  return <details className="plan-preference-card">
    <summary className="plan-preference-summary">
      <span><small>PLAN PREFERENCE</small><b>{candidate.label}</b></span>
      <span><em>{fellBackToBalanced ? 'Applied' : overridden ? 'Project override' : 'App default'}</em><small>{fellBackToBalanced ? `${requestedCandidate.label} unavailable` : changeLabel}</small></span>
    </summary>
    <div className="plan-preference-content">
      <p className="plan-preference-description">{candidate.description}</p>
    <div className="plan-preference-picker">
      <label><span>Optimize this plan for</span><OptionPicker
        label="Optimize this plan for"
        value={applied}
        options={candidates.map(option => ({
          value: option.id,
          label: option.label,
          description: option.available ? option.description : option.blockers.join(' '),
          disabled: !option.available,
        }))}
        onChange={onChange}
      /></label>
      {overridden && <button type="button" className="quiet" onClick={onUseDefault}>Use app default · {candidates.find(item => item.id === inherited)?.label ?? 'Balanced'}</button>}
    </div>
    {candidate.available
      ? candidate.changes.length > 0
        ? <div className="plan-preference-applied" role="status"><b>{candidate.changes.length} setting{candidate.changes.length === 1 ? '' : 's'} changed from Balanced</b><p>{candidate.changes.map(change => `${labels[change.setting]} ${String(change.from)} → ${String(change.to)}`).join(' · ')}</p></div>
        : <div className="plan-preference-applied neutral" role="status"><b>Baseline</b><p>No preference-specific settings are added.</p></div>
      : <div className="plan-preference-blocked" role="status"><b>Preference not applied</b><p>{candidate.blockers.join(' ')}</p></div>}
    <details className="plan-preference-comparison"><summary>Compare plan preferences</summary><div>{candidates.map(option => <details className={`plan-preference-option ${option.id === applied ? 'selected' : ''}`} key={option.id}>
      <summary><span><b>{option.label}</b><small>{option.description}</small></span><em>{option.available ? option.id === 'balanced' ? 'Baseline' : `${option.changes.length} change${option.changes.length === 1 ? '' : 's'}` : 'Unavailable'}</em></summary>
      <div className="plan-preference-option-detail">
        {option.changes.length > 0 && <dl>{option.changes.map(change => <div key={change.setting}><dt>{labels[change.setting]}</dt><dd><span>{String(change.from)}</span><i>→</i><strong>{String(change.to)}</strong></dd></div>)}</dl>}
        {option.id === 'balanced' && <p>Uses the rule-backed baseline without preference-specific changes.</p>}
        {option.blockers.length > 0 && <p className="plan-preference-option-blocker">{option.blockers.join(' ')}</p>}
        {option.available && option.id !== applied && <button type="button" onClick={() => onChange(option.id)}>Use {option.label}</button>}
      </div>
    </details>)}</div></details>
    </div>
  </details>;
}
