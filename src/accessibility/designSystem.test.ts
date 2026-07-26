import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../accessibility-v5.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const results = readFileSync(new URL('../results/RecommendationResults.tsx', import.meta.url), 'utf8');
const applicationPreferences = readFileSync(new URL('../preferences/application.ts', import.meta.url), 'utf8');

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('accessible Check Make design system', () => {
  it('keeps critical light and dark text pairs at WCAG AA contrast', () => {
    expect(contrast('#0f7357', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#4f5b57', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#5f6a66', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#10251d', '#67d9ad')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#171a19', '#faf9f5')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#0b5e91', '#faf9f5')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#35c98b', '#161d1a')).toBeGreaterThanOrEqual(4.5);
  });

  it('harmonizes the app with the Check Make web brand in both appearances', () => {
    expect(css).toContain('--brand-paper: #faf9f5');
    expect(css).toContain('--brand-dark: #161d1a');
    expect(css).toContain('--brand-emerald: #14916c');
    expect(css).toContain('--info: #0b5e91');
    expect(css).toMatch(/\.workflow-header \{[\s\S]*background-color: var\(--brand-dark\)/);
    expect(app).toContain("const plateColor = dark ? '#0b2a3f' : '#e8efec'");
  });

  it('uses the technical grid and translucent controls without sacrificing dense content surfaces', () => {
    expect(css).toContain('--technical-grid-line: #35c98b12');
    expect(css).toMatch(/\.workflow-header \{[\s\S]*background-image:[\s\S]*linear-gradient/);
    expect(css).toMatch(/\.process-marker \{[^}]*background: #ffffff0a/);
    expect(css).toMatch(/\.settings-trigger \{[^}]*background: #ffffff08/);
    expect(css).toMatch(/\.workflow-layout \{[\s\S]*background-image:[\s\S]*linear-gradient/);
    expect(css).toMatch(/\.project-context, \.model-workspace, \.decision-panel \{[^}]*color-mix/);
  });

  it('uses the same symbol in the top bar and model drop zone with a compact wordmark', () => {
    expect(app).toContain('<img className="workflow-brand-symbol" src="/check-make-symbol.svg"');
    expect(app).toContain('<img src="/check-make-symbol.svg" alt=""/>');
    expect(app).not.toContain('check-make-wordmark.svg');
    expect(css).toMatch(/\.workflow-brand \{[^}]*gap: 9px/);
    expect(css).toMatch(/\.workflow-wordmark i \{[^}]*margin: 0 6px/);
  });

  it('does not introduce sub-11px text in the v5 workflow layer', () => {
    const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map(match => Number(match[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });

  it('keeps technical evidence at a readable text size', () => {
    expect(css).toMatch(/\.recommended-key-settings \.result-options > label \{[^}]*font-size: 13px/);
    expect(css).toMatch(/\.recommended-key-settings \.technical-evidence small \{[^}]*font-size: 13px/);
  });

  it('applies the v5 surface and typography tokens to trade-off alternatives', () => {
    expect(css).toMatch(/\.trade-off-plan\.plan-objectives \{[^}]*background: var\(--surface\)/);
    expect(css).toMatch(/\.objective-options b \{[^}]*font-size: 13px/);
    expect(css).toMatch(/\.objective-options small \{[^}]*font-size: 12px/);
    expect(css).toMatch(/\.optimization-boundary \{[^}]*background: var\(--warning-bg\)/);
  });

  it('styles the grouped printer picker as an accessible themed popup', () => {
    expect(css).toContain('.printer-picker-trigger[aria-expanded="true"]');
    expect(css).toMatch(/\.printer-picker-menu \{[^}]*background: var\(--surface-raised\)/);
    expect(css).toMatch(/\.printer-picker-option b \{[^}]*font-size: 13px/);
    expect(css).toMatch(/\.printer-picker-option small \{[^}]*font-size: 11px/);
    expect(css).toMatch(/\.printer-picker-menu \{[^}]*position: fixed/);
    expect(css).toMatch(/\.printer-picker-groups \{[^}]*grid-template-columns: repeat\(3/);
  });

  it('uses the simplified model review workflow', () => {
    expect(app).toContain("['recommended', 'Model'], ['risk', 'Overhangs']");
    expect(app).not.toContain("['spatial', 'Important areas']");
    expect(app).toContain('<span>Model checks</span>');
    expect(app).toContain('className="important-areas-check"');
    expect(app).toContain('className="model-check-detail orientation-check"');
    expect(app).toContain('Compare with imported orientation');
    expect(app).toContain("setPreviewMode(previewMode === 'compare' ? 'recommended' : 'compare'); requestAnimationFrame(() => modelPreview.current?.scrollIntoView");
    expect(app).toContain('No structural simulation is performed.');
    expect(app).not.toContain('<footer className="workflow-status"');
    expect(app).not.toContain("['compare', 'Compare']");
    expect(app).toContain('>Build plate</button>');
  });

  it('uses two analysis modes and keeps the Extended AI provider in settings', () => {
    expect(app).toContain('<b>Local Analysis</b>');
    expect(app).toContain('<b>Extended AI Analysis</b>');
    expect(app).toContain('Extended AI location');
    expect(app).toContain('<b>Local AI</b>');
    expect(app).toContain('<b>Cloud AI</b>');
    expect(app).not.toContain('Local preliminary analysis');
    expect(app).not.toContain('Functional regions');
  });

  it('makes important-area consequences and model highlighting visible', () => {
    expect(app).toContain('You choose the surface.');
    expect(app).toContain('only an area you confirm affects the plan');
    expect(app).toContain('onClick={showImportantAreas}>Show ›');
    expect(app).toContain('Why it matters:');
    expect(app).toContain('Show on model');
    expect(css).toContain('.spatial-callout');
    expect(css).toMatch(/\.spatial-decision-row > div \{[^}]*grid-template-columns: repeat\(2/);
    expect(css).toMatch(/\.spatial-decision-row button \{[^}]*min-height: 36px/);
  });

  it('separates plan review from the final key-settings result', () => {
    expect(app).toContain("showPlanReview ? 'review-mode' : 'result-mode'");
    expect(app).toContain('Modify plan');
    expect(app).toContain('Apply changes and review plan');
    expect(app).toContain('editableQuestions.map');
    expect(app).toContain('Your earlier answers remain editable.');
    expect(app).toContain('Reset important areas');
    expect(app).not.toContain('Interface density');
    expect(app).not.toContain('Trade-off alternatives');
  });

  it('exposes versioned plan defaults and project-level preference comparison', () => {
    expect(applicationPreferences).toContain('defaultPlanPreference: PlanPreference');
    expect(applicationPreferences).toContain('schemaVersion: 1');
    expect(applicationPreferences).toContain('normalizeApplicationPreferences');
    expect(app).toContain('Default plan preference');
    expect(app).toContain('<PlanPreferenceControl');
    expect(app).toContain('inheritedPlanPreference');
    expect(app).toContain('projectPlanPreference');
    expect(app).toContain('schemaVersion: 4');
    expect(app).toContain('changesFromBalanced');
    expect(results).toContain('Compare plan preferences');
    expect(results).toContain('Project override');
    expect(results).not.toContain('Lower cost');
    expect(results).not.toContain('Lower weight');
    expect(css).toContain('.plan-preference-card');
    expect(css).toContain('.plan-preference-blocked');
  });

  it('keeps Context neutral and explains the interpretation in Prepare', () => {
    expect(app).toContain('CHECK MAKE’S UNDERSTANDING');
    expect(app).toContain('describeObjectUnderstanding');
    expect(app).toContain('Check Make will show its interpretation in the next step.');
    expect(app).toContain('What should this object do?');
    expect(app).not.toContain('Add what the object does');
    expect(app).not.toContain('Requirements understood from context');
    expect(app).not.toContain('Add function to Context');
    expect(app).not.toContain('Object hypothesis');
  });

  it('integrates compatible material alternatives into the Material setting', () => {
    expect(results).toContain("item.setting === 'material' && materialOptions");
    expect(results).toContain('Why not recommended:');
    expect(results).toContain('className={`inline-material-option');
    expect(results).toContain('`Use ${candidate.material}`');
    expect(results).toContain('Profile & compatibility');
    expect(results).not.toContain('Trade-offs and printer requirements');
    expect(results).toContain('Restore {recommended}');
    expect(app).not.toContain('<MaterialAlternatives');
  });

  it('uses a two-choice support decision with an explained consequence', () => {
    expect(app).toContain('SUPPORT RECOMMENDATION');
    expect(app).toContain('aria-label="Support recommendation"');
    expect(app).toContain('Follow Check Make');
    expect(app).toContain('Use the alternative');
    expect(app).toContain('supportOverridePreference');
    expect(app).not.toContain('Override Check Make');
  });

  it('keeps export diagnostics optional and exposes project saving', () => {
    expect(app).toContain('Save Check Make project…');
    expect(app).toContain('Export details & checks');
    expect(app).toContain("status.startsWith('Project saved:') ? 'Check Make project saved.'");
    expect(css).toContain('.export-details > summary');
    expect(css).toContain('.export-path-detail');
    expect(css).toContain('.export-actions');
  });

  it('starts a fresh project when replacing the model', () => {
    expect(app).toContain('const resetProjectForReplacement = () =>');
    expect(app).toContain('setPackageTarget(\'generic\')');
    expect(app).toContain('setPreviewOrientationId(\'as-imported\')');
    expect(app).toContain('onClick={() => void replaceModel()}');
  });

  it('includes keyboard, appearance, contrast, reflow, and motion accommodations', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('--control-height: 34px');
    expect(css).toContain('.process-step.locked .process-marker');
    expect(css).toContain('.printer-glyph, .spool-glyph');
    expect(css).toContain('.back-to-prepare');
    expect(css).toContain('.orientation-comparison button small');
    expect(css).toContain('.objective-options small');
    expect(css).toContain('.workflow-evidence li');
  });
});
