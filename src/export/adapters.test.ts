import { describe, expect, it } from 'vitest';
import { adapterPlaceholders, mergeDetectedAdapters, suggestSlicerTarget, supportsPrinter } from './adapters';

describe('slicer adapter presentation', () => {
  it('always exposes every export target in a stable order', () => {
    expect(adapterPlaceholders.map(adapter => adapter.target)).toEqual(['generic', 'bambu', 'orca', 'prusa', 'cura', 'creality']);
  });

  it('preserves placeholders if native detection returns an incomplete list', () => {
    const merged = mergeDetectedAdapters([adapterPlaceholders[0]]);
    expect(merged.map(adapter => adapter.target)).toContain('prusa');
    expect(merged.map(adapter => adapter.target)).toContain('cura');
  });

  it('distinguishes slicer availability from printer-profile support', () => {
    const prusa = adapterPlaceholders.find(adapter => adapter.target === 'prusa');
    expect(supportsPrinter(prusa, 'prusa-mk4s')).toBe(true);
    expect(supportsPrinter(prusa, 'bambu-x1c')).toBe(false);
  });

  it('suggests an installed native adapter in printer-family order', () => {
    const available = adapterPlaceholders.map(adapter => ({ ...adapter, available: adapter.target === 'generic' || adapter.target === 'bambu' || adapter.target === 'orca' || adapter.target === 'prusa' }));
    expect(suggestSlicerTarget(available, 'bambu-x1c')).toBe('bambu');
    expect(suggestSlicerTarget(available, 'prusa-mk4s')).toBe('prusa');
  });

  it('falls back to portable Core 3MF when no compatible native adapter is installed', () => {
    expect(suggestSlicerTarget(adapterPlaceholders, 'anycubic-kobra3')).toBe('generic');
  });
});
