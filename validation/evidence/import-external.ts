import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import YAML from 'yaml';
import {
  normalizeEvidenceRows, parseEvidenceRows, type EvidenceImportMapping,
} from '../../src/evidence/normalize';

const argument = (name: string) => {
  const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : undefined;
};
const inputPath = argument('input'); const mappingPath = argument('mapping');
if (!inputPath || !mappingPath) throw new Error('Usage: npm run evidence:import -- --input <raw.csv|json|jsonl> --mapping <mapping.yaml> [--output <directory>]');
const absoluteInput = resolve(inputPath); const absoluteMapping = resolve(mappingPath);
const inputBytes = readFileSync(absoluteInput); const mappingBytes = readFileSync(absoluteMapping);
const upstreamPath = argument('upstream');
const upstreamBytes = upstreamPath ? readFileSync(resolve(upstreamPath)) : undefined;
const mapping = YAML.parse(mappingBytes.toString('utf8')) as EvidenceImportMapping;
const catalogPath = resolve(argument('catalog') ?? 'rules/evidence-datasets.yaml');
const catalog = YAML.parse(readFileSync(catalogPath, 'utf8')) as Array<{ id: string; dataAccess: string }>;
const dataset = catalog.find(candidate => candidate.id === mapping.datasetId);
if (!dataset) throw new Error(`Mapping references unknown dataset ${mapping.datasetId}.`);
if (!['raw-open', 'raw-restricted'].includes(dataset.dataAccess)) throw new Error(`Dataset ${mapping.datasetId} is cataloged as ${dataset.dataAccess}, not a raw-data asset.`);
const rows = parseEvidenceRows(inputBytes.toString('utf8'), mapping.format);
const observations = normalizeEvidenceRows(rows, mapping);
const outputDirectory = resolve(argument('output') ?? `validation/evidence/imported/${mapping.datasetId}`);
mkdirSync(outputDirectory, { recursive: true });
const normalized = `${observations.map(observation => JSON.stringify(observation)).join('\n')}\n`;
const observationsPath = resolve(outputDirectory, 'observations.jsonl'); writeFileSync(observationsPath, normalized);
const digest = (value: Uint8Array|string) => createHash('sha256').update(value).digest('hex');
const manifest = {
  schemaVersion: 1, datasetId: mapping.datasetId, importedAt: new Date().toISOString(),
  sourceFile: basename(absoluteInput), sourceSha256: digest(inputBytes),
  ...(upstreamPath && upstreamBytes ? {
    upstreamSourceFile: basename(resolve(upstreamPath)), upstreamSourceSha256: digest(upstreamBytes),
  } : {}),
  mappingFile: basename(absoluteMapping), mappingSha256: digest(mappingBytes),
  observationCount: observations.length, observationsFile: 'observations.jsonl',
  observationsSha256: digest(normalized),
};
writeFileSync(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Imported ${observations.length} normalized observations for ${mapping.datasetId} into ${outputDirectory}`);
