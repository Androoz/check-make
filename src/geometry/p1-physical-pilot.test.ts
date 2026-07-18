import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeStl } from './stl';

interface PilotSpecimen {
  specimenId: string;
  family: 'adhesion-stability'|'inclined-overhang'|'bridge';
  file: string;
  sha256: string;
  intendedFactors: Record<string, number|boolean>;
  measuredGeometry: { triangleCount: number };
}

const pilotRoot = new URL('../../validation/p1/generated/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', pilotRoot), 'utf8')) as {
  specimenCount: number;
  specimens: PilotSpecimen[];
};
const load = (specimen: PilotSpecimen) => {
  const bytes = readFileSync(new URL(specimen.file, pilotRoot));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { bytes, analysis: analyzeStl(buffer, specimen.file).analysis };
};

describe('physical P1 pilot artifacts', () => {
  it('contains 18 immutable, uniquely identified screening specimens', () => {
    expect(manifest.specimenCount).toBe(18);
    expect(new Set(manifest.specimens.map(specimen => specimen.specimenId)).size).toBe(18);
    expect(manifest.specimens.filter(specimen => specimen.family === 'adhesion-stability')).toHaveLength(6);
    expect(manifest.specimens.filter(specimen => specimen.family === 'inclined-overhang')).toHaveLength(7);
    expect(manifest.specimens.filter(specimen => specimen.family === 'bridge')).toHaveLength(5);
    for (const specimen of manifest.specimens) {
      const { bytes } = load(specimen);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(specimen.sha256);
    }
  });

  it('keeps adhesion specimens free of unsupported-overhang regions', () => {
    for (const specimen of manifest.specimens.filter(candidate => candidate.family === 'adhesion-stability')) {
      const { analysis } = load(specimen);
      expect(analysis.geometryRisk.overhangRegionCount, specimen.specimenId).toBe(0);
      expect(analysis.bedContactAreaMm2, specimen.specimenId).toBeCloseTo(specimen.intendedFactors.bedContactAreaMm2 as number, 4);
      expect(analysis.geometryRisk.heightToContactWidthRatio, specimen.specimenId)
        .toBeCloseTo(specimen.intendedFactors.heightToContactWidthRatio as number, 4);
    }
  });

  it('crosses the provisional 45-degree classifier with controlled inclined surfaces', () => {
    for (const specimen of manifest.specimens.filter(candidate => candidate.family === 'inclined-overhang')) {
      const { analysis } = load(specimen); const angle = specimen.intendedFactors.meanDownwardNormalAngleDeg as number;
      if (angle <= 40) {
        expect(analysis.geometryRisk.overhangRegionCount, specimen.specimenId).toBe(1);
        expect(analysis.geometryRisk.overhangRegions[0].meanDownwardNormalAngleDeg, specimen.specimenId).toBeCloseTo(angle, 4);
      } else expect(analysis.geometryRisk.overhangRegionCount, specimen.specimenId).toBe(0);
    }
  });

  it('keeps bridge truth in the manifest instead of claiming it from STL geometry', () => {
    for (const specimen of manifest.specimens.filter(candidate => candidate.family === 'bridge')) {
      const { analysis } = load(specimen);
      expect(specimen.intendedFactors.bridgeGroundTruth).toBe(true);
      expect(analysis.geometryRisk.bridgeClassification).toBe('not-evaluated');
      expect(analysis.geometryRisk.overhangRegionCount).toBe(1);
    }
  });

  it('fits every supported printer including the 180 mm A1 mini volume', () => {
    for (const specimen of manifest.specimens) {
      const { analysis } = load(specimen);
      expect(Math.max(...Object.values(analysis.boundingBox.size)), specimen.specimenId).toBeLessThanOrEqual(180);
      expect(analysis.triangleCount).toBe(specimen.measuredGeometry.triangleCount);
    }
  });
});
