import { describe, expect, it } from 'vitest';
import { adapterPlaceholders, mergeDetectedAdapters, supportsPrinter } from './adapters';

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
});
