import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../accessibility-v5.css', import.meta.url), 'utf8');

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
