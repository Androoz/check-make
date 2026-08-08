import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importModel, supportedModelExtensions } from './importModel';

describe('multi-format model import', () => {
  it('keeps the supported mesh formats explicit', () => {
    expect(supportedModelExtensions).toEqual(['stl', '3mf', 'obj']);
  });

  it('matches the reference OBJ analysis and creates a normalized STL', async () => {
    const file = readFileSync(new URL('../../test-fixtures/reference-box.obj', import.meta.url));
    const expected = JSON.parse(readFileSync(new URL('../../test-fixtures/reference-box.expected.json', import.meta.url), 'utf8'));
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const progress: Array<{ percent: number; phase: string }> = [];
    const imported = await importModel(buffer, 'reference-box.obj', { onProgress: update => progress.push(update) });

    expect(imported.analysis.metadata.format).toBe(expected.format);
    expect(imported.analysis.triangleCount).toBe(expected.triangleCount);
    expect(imported.analysis.boundingBox.size).toEqual(expected.sizeMm);
    expect(imported.normalizedStl?.byteLength).toBe(84 + expected.triangleCount * 50);
    expect(progress[0]).toEqual({ percent: 24, phase: 'Parsing OBJ geometry' });
    expect(progress.some(update => update.phase.startsWith('Comparing print orientations'))).toBe(true);
    expect(progress.at(-1)).toEqual({ percent: 90, phase: 'Preparing export geometry' });
    expect(progress.every((update, index) => index === 0 || update.percent >= progress[index - 1].percent)).toBe(true);
  });
});
