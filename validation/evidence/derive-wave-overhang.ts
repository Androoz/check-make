import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseCsv } from '../../src/evidence/normalize';

const argument = (name: string) => {
  const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : undefined;
};
const inputDirectory = argument('input'); const outputPath = argument('output');
if (!inputDirectory || !outputPath) throw new Error('Usage: vite-node validation/evidence/derive-wave-overhang.ts --input <3d-scan-csv-directory> --output <summary.csv>');

const quantile = (sorted: number[], fraction: number) => {
  const position = (sorted.length - 1) * fraction; const lower = Math.floor(position); const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
const fixed = (value: number) => Number(value.toFixed(9));
const header = [
  'observation_id', 'strategy', 'difficulty', 'replication', 'source_file', 'source_sha256', 'point_count',
  'mean_deviation_mm', 'sd_deviation_mm', 'min_deviation_mm', 'max_deviation_mm', 'mean_absolute_deviation_mm',
  'rmse_deviation_mm', 'p95_absolute_deviation_mm', 'negative_point_fraction',
];
const rows = readdirSync(resolve(inputDirectory)).filter(file => file.endsWith('.csv')).sort().map(file => {
  const match = /^(arc|wave) (easy|medium|hard) r([1-3])\.csv$/i.exec(file);
  if (!match) throw new Error(`Unrecognized scan filename: ${file}`);
  const bytes = readFileSync(resolve(inputDirectory, file)); const parsed = parseCsv(bytes.toString('utf8'));
  const deviations = parsed.filter(row => row.Property.trim() === 'dXYZ').map(row => Number(row.Dev));
  if (!deviations.length || deviations.some(value => !Number.isFinite(value))) throw new Error(`No finite dXYZ point deviations in ${file}.`);
  const mean = deviations.reduce((sum, value) => sum + value, 0) / deviations.length;
  const sd = Math.sqrt(deviations.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (deviations.length - 1));
  const absolute = deviations.map(Math.abs).sort((left, right) => left - right);
  const [strategy, difficulty, replication] = [match[1].toLowerCase(), match[2].toLowerCase(), Number(match[3])];
  return [
    `${strategy}-${difficulty}-r${replication}`, strategy, difficulty, replication, basename(file),
    createHash('sha256').update(bytes).digest('hex'), deviations.length, fixed(mean), fixed(sd),
    fixed(Math.min(...deviations)), fixed(Math.max(...deviations)), fixed(absolute.reduce((sum, value) => sum + value, 0) / absolute.length),
    fixed(Math.sqrt(deviations.reduce((sum, value) => sum + (value ** 2), 0) / deviations.length)),
    fixed(quantile(absolute, 0.95)), fixed(deviations.filter(value => value < 0).length / deviations.length),
  ];
});
writeFileSync(resolve(outputPath), `${[header, ...rows].map(row => row.join(',')).join('\n')}\n`);
console.log(`Derived ${rows.length} replicate-level observations from ${resolve(inputDirectory)} into ${resolve(outputPath)}`);
