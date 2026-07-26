import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeStl } from '../../src/geometry/stl';

const root = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(root, 'generated', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  specimens: Array<Record<string, unknown> & { file: string }>;
};

for (const specimen of manifest.specimens) {
  const bytes = readFileSync(join(root, 'generated', specimen.file));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const analysis = analyzeStl(buffer, specimen.file.split('/').at(-1) ?? 'coupon.stl').analysis;
  specimen.measuredGeometry = {
    triangleCount: analysis.triangleCount,
    boundingSizeMm: analysis.boundingBox.size,
    bedContactAreaMm2: analysis.bedContactAreaMm2,
    overhangAreaMm2: analysis.overhangAreaMm2,
    overhangRatio: analysis.overhangRatio,
    ...analysis.geometryRisk,
  };
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Measured ${manifest.specimens.length} coupons with Check Make's P1 analyzer`);
