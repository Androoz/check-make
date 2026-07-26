import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { assessExternalDataset } from '../../src/evidence/scopeMatcher';
import type { EvidenceEligibility, EvidenceTargetScope, ExternalEvidenceDataset } from '../../src/evidence/types';
import type { Rule } from '../../src/types';

interface Target { id: string; label: string; ruleIds: string[]; scope: EvidenceTargetScope }
const root = resolve(import.meta.dirname, '../..');
const load = <T>(path: string) => YAML.parse(readFileSync(resolve(root, path), 'utf8')) as T;
const catalogDatasets = load<ExternalEvidenceDataset[]>('rules/evidence-datasets.yaml');
const importedRoot = resolve(root, 'validation/evidence/imported');
const datasets = catalogDatasets.map(dataset => {
  const directory = resolve(importedRoot, dataset.id); const manifestPath = resolve(directory, 'manifest.json');
  if (!existsSync(manifestPath)) return dataset;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { datasetId: string; observationsFile: string; observationsSha256: string };
  const observationsPath = resolve(directory, manifest.observationsFile);
  if (manifest.datasetId !== dataset.id || !existsSync(observationsPath)) throw new Error(`Invalid local import manifest for ${dataset.id}.`);
  const actual = createHash('sha256').update(readFileSync(observationsPath)).digest('hex');
  if (actual !== manifest.observationsSha256) throw new Error(`Local observations checksum mismatch for ${dataset.id}.`);
  return { ...dataset, integrity: 'checksum-verified' as const, localPath: observationsPath, sha256: actual };
});
const targets = load<Target[]>('rules/evidence-targets.yaml');
const rules = load<Rule[]>('rules/mvp-rules.yaml');
const rank: Record<EvidenceEligibility, number> = {
  'eligible-for-fit': 5, 'eligible-as-prior': 4, 'import-required': 3, 'direction-only': 2, excluded: 1,
};
const counts = <T extends string>(values: T[]) => Object.entries(values.reduce<Record<string, number>>((result, value) => {
  result[value] = (result[value] ?? 0) + 1; return result;
}, {})).map(([key, value]) => `${key}: ${value}`).join(', ');
const today = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const targetSections = targets.map(target => {
  const assessments = datasets.map(dataset => ({ dataset, result: assessExternalDataset(dataset, target.scope) }))
    .filter(item => item.result.eligibility !== 'excluded')
    .sort((left, right) => rank[right.result.eligibility] - rank[left.result.eligibility]);
  const best = assessments[0]?.result.eligibility ?? 'excluded';
  const action = best === 'eligible-for-fit'
    ? 'A scoped fit is permitted, followed by held-out confirmation.'
    : best === 'eligible-as-prior'
      ? 'Use external observations as a prior and run targeted local confirmation.'
      : best === 'import-required'
        ? 'Import and checksum-verify the raw asset before deciding the local test reduction.'
        : 'External evidence is directional only; local screening remains required.';
  return `## ${target.id}\n\n${target.label}\n\n- Rules: ${target.ruleIds.join(', ')}\n- Best current eligibility: **${best}**\n- Action: ${action}\n\n| Dataset | Scope | Outcome | Eligibility |\n|---|---|---|---|\n${assessments.map(({ dataset, result }) => `| ${dataset.id} | ${result.scopeMatch} | ${result.outcomeMatch} | ${result.eligibility} |`).join('\n') || '| None | none | none | excluded |'}`;
}).join('\n\n');

const byRule = rules.map(rule => {
  const linked = datasets.filter(dataset => dataset.ruleIds.includes(rule.id));
  const readiness = linked.some(dataset => dataset.integrity === 'checksum-verified' && dataset.dataAccess === 'raw-open')
    ? 'verified raw candidate' : linked.length ? 'directional or import pending' : 'no external dataset';
  return `| ${rule.id} | ${rule.group} | ${linked.map(dataset => dataset.id).join(', ') || '—'} | ${readiness} |`;
}).join('\n');

const waveDataset = datasets.find(dataset => dataset.id === 'MENDELEY-WAVE-OVERHANG-2026');
let verifiedObservationNotes = 'No dataset-specific verified observation summary is available.';
if (waveDataset?.localPath) {
  const observations = readFileSync(waveDataset.localPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) as Array<{
    factors: { pathStrategy: string; geometryDifficulty: string }; outcomes: { rmseDeviationMm: number };
  }>;
  const cells = ['easy', 'medium', 'hard'].flatMap(difficulty => ['arc', 'wave'].map(strategy => {
    const values = observations.filter(item => item.factors.geometryDifficulty === difficulty && item.factors.pathStrategy === strategy).map(item => item.outcomes.rmseDeviationMm);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return `${difficulty} ${strategy}: ${mean.toFixed(3)} mm`;
  }));
  verifiedObservationNotes = `Replicate-mean scan-deviation RMSE (three prints per cell): ${cells.join('; ')}. These descriptive means preserve print-level replication and do not establish significance or an X1 Carbon threshold.`;
}

const report = `# External evidence reuse and gap report

Generated: ${today}

## Result

The catalog contains ${datasets.length} external dataset records. Data access: ${counts(datasets.map(dataset => dataset.dataAccess))}. Integrity after local-import verification: ${counts(datasets.map(dataset => dataset.integrity))}.

No external record is currently both locally checksum-verified and sufficiently scoped to replace Check Make's P1 confirmation. External work can already determine factor direction and test design; quantitative transfer remains gated by raw import, license review, and scope match.

The matcher deliberately separates source strength, data access, integrity, license, outcome match, and scope match. Publication alone never promotes a rule.

## Verified observation notes

${verifiedObservationNotes}

${targetSections}

## Rule coverage

| Rule | Group | External datasets | Current readiness |
|---|---|---|---|
${byRule}

## Next implementation actions

1. Use the imported wave-overhang observations for path-strategy and geometry-difficulty interaction only, not a standard X1 Carbon support threshold.
2. Seek raw specimen rows for the exact-scope X1 Carbon PLA flexural study or another CoreXY study with nozzle and build-surface metadata.
3. Treat the Spoerk and Laumann adhesion studies as test-design evidence only: their quantitative results are aggregates and their build surfaces do not match textured PEI.
4. Seek author-supplied strand-level rows or another open quantitative adhesion dataset with textured-PEI surface metadata before fitting the first-layer track.
5. Keep image-only defect datasets in the monitoring track, not the manufacturing-threshold track.
6. Generate a reduced confirmation matrix only after raw external rows are normalized and sufficiently matched to the locked target scope.
`;
writeFileSync(resolve(root, 'docs/EXTERNAL_EVIDENCE_GAP_REPORT.md'), report);
console.log(`Wrote external evidence report for ${datasets.length} datasets, ${targets.length} targets, and ${rules.length} rules`);
