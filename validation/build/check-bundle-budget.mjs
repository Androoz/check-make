import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const assets = join(process.cwd(), 'dist', 'assets');
const files = readdirSync(assets);
const entry = files.find(file => /^index-[\w-]+\.js$/.test(file));
if (!entry) throw new Error('Bundle budget: Vite entry chunk was not found.');

const entryBytes = readFileSync(join(assets, entry));
const entryGzipBytes = gzipSync(entryBytes).byteLength;
const preview = files.find(file => /^ModelPreview-[\w-]+\.js$/.test(file));
const deferredLoaders = ['OBJLoader-', '3MFLoader-', 'STLExporter-']
  .every(prefix => files.some(file => file.startsWith(prefix)));

const limits = {
  entryMinifiedBytes: 1_400_000,
  entryGzipBytes: 400_000,
};

if (!preview) throw new Error('Bundle budget: the 3D preview is no longer a deferred chunk.');
if (!deferredLoaders) throw new Error('Bundle budget: one or more model-format loaders are no longer deferred.');
if (entryBytes.byteLength > limits.entryMinifiedBytes || entryGzipBytes > limits.entryGzipBytes) {
  throw new Error(
    `Bundle budget exceeded: entry ${entryBytes.byteLength} bytes minified / ${entryGzipBytes} bytes gzip. `
    + `Limits are ${limits.entryMinifiedBytes} / ${limits.entryGzipBytes}.`,
  );
}

console.log(
  `Bundle budget passed: entry ${(entryBytes.byteLength / 1000).toFixed(1)} kB minified / `
  + `${(entryGzipBytes / 1000).toFixed(1)} kB gzip; 3D preview and model loaders are deferred.`,
);
