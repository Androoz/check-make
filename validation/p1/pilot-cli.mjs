import { createHash } from 'node:crypto';
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const generatedDirectory = join(root, 'generated');
const manifestPath = join(generatedDirectory, 'manifest.json');
const recordsPath = join(root, 'records', 'results.jsonl');

const argument = name => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const fail = message => { throw new Error(message); };
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const requiredText = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || /REQUIRED/i.test(value)) fail(`${label} must be explicitly recorded.`);
  return value.trim();
};
const requiredNumber = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number.`);
  return value;
};
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');

function loadManifest() {
  if (!existsSync(manifestPath)) fail('No generated manifest. Run npm run p1:generate first.');
  return json(manifestPath);
}

function readRecords(path = recordsPath) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { fail(`Invalid JSON on results.jsonl line ${index + 1}.`); }
  });
}

function validateScope(scope) {
  requiredText(scope.scopeId, 'scopeId');
  if (scope.pilotId !== 'P1-ADHESION-SUPPORT-PILOT-001') fail('scope.pilotId does not match this pilot.');
  requiredText(scope.randomizationSeed, 'randomizationSeed');
  requiredText(scope.lockedAt, 'lockedAt');
  if (Number.isNaN(Date.parse(scope.lockedAt))) fail('lockedAt must be an ISO-8601 timestamp.');
  for (const [section, fields] of Object.entries({
    printer: ['id', 'manufacturer', 'model', 'serial', 'firmware', 'kinematicClass'],
    material: ['manufacturer', 'product', 'color', 'lot', 'conditioning', 'moistureHandling'],
    process: ['slicer', 'slicerVersion', 'machineProfile', 'processProfile', 'materialProfile', 'enclosure', 'plate', 'platePreparation'],
    measurement: ['caliperId', 'caliperCalibration', 'massScaleId', 'photoDevice', 'undersideMetricMethod'],
  })) {
    if (!scope[section] || typeof scope[section] !== 'object') fail(`${section} is required.`);
    fields.forEach(field => requiredText(scope[section][field], `${section}.${field}`));
  }
  for (const [path, value] of [
    ['material.diameterMm', scope.material.diameterMm], ['process.nozzleMm', scope.process.nozzleMm],
    ['process.extrusionWidthMm', scope.process.extrusionWidthMm], ['process.layerHeightMm', scope.process.layerHeightMm],
    ['process.nozzleTemperatureC', scope.process.nozzleTemperatureC], ['process.bedTemperatureC', scope.process.bedTemperatureC],
    ['process.coolingPercent', scope.process.coolingPercent], ['process.accelerationMmS2', scope.process.accelerationMmS2],
    ['process.brimWidthMm', scope.process.brimWidthMm], ['environment.ambientTemperatureC', scope.environment?.ambientTemperatureC],
    ['environment.relativeHumidityPercent', scope.environment?.relativeHumidityPercent],
    ['measurement.caliperResolutionMm', scope.measurement?.caliperResolutionMm],
    ['measurement.massScaleResolutionGrams', scope.measurement?.massScaleResolutionGrams],
  ]) requiredNumber(value, path);
  if (scope.process.supportMode !== 'off' || scope.process.brimWidthMm !== 0) {
    fail('The screening scope requires supportMode="off" and brimWidthMm=0. Interventions are a separate stage.');
  }
  return scope;
}

function seededOrder(items, seedText) {
  let state = [...seedText].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1)); [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function responseTemplate() {
  return {
    detached: null, cornerLiftMaxMm: null, dimensionalWarpMaxMm: null, visibleOscillationRating: null,
    sagMaxMm: null, undersideDeviationMaxMm: null, undersideRoughnessMetric: null,
    supportRemovalSeconds: null, removalDamageRating: null, printTimeSeconds: null,
    materialUsedGrams: null, measurementNotes: '',
  };
}

function prepare() {
  const scopePath = resolve(argument('scope') ?? join(root, 'scope.json'));
  const outputDirectory = resolve(argument('output') ?? generatedDirectory);
  if (!existsSync(scopePath)) fail(`Scope file not found: ${scopePath}. Copy scope.template.json and fill every REQUIRED value.`);
  const scope = validateScope(json(scopePath)); const manifest = loadManifest();
  verifyArtifacts(manifest);
  const specimens = seededOrder(manifest.specimens, scope.randomizationSeed);
  const runs = specimens.map((specimen, index) => ({
    runOrder: index + 1,
    runId: `P1-SCR-${String(index + 1).padStart(3, '0')}`,
    stage: 'screening', scopeId: scope.scopeId, specimenId: specimen.specimenId,
    family: specimen.family, file: specimen.file, geometrySha256: specimen.sha256,
    supportMode: 'off', brimWidthMm: 0,
  }));
  const runPlan = { schemaVersion: 1, pilotId: manifest.pilotId, scope, generatedFromManifest: 'manifest.json', runs };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, 'run-plan.json'), `${JSON.stringify(runPlan, null, 2)}\n`);
  const templateDirectory = join(outputDirectory, 'record-templates'); mkdirSync(templateDirectory, { recursive: true });
  for (const run of runs) {
    const specimen = manifest.specimens.find(candidate => candidate.specimenId === run.specimenId);
    const template = {
      recordId: `${run.runId}-REQUIRED-RECORD-ID`, runId: run.runId, scopeId: scope.scopeId,
      stage: 'screening', experimentId: manifest.pilotId, specimenId: run.specimenId,
      recordedAt: 'REQUIRED-ISO-8601-TIMESTAMP',
      supersedesRecordId: null, correctionReason: null,
      geometry: {
        modelRevision: '1', geometrySha256: specimen.sha256, orientationId: 'as-imported', units: 'mm',
        p1Metrics: specimen.measuredGeometry,
      },
      printer: scope.printer, material: scope.material, process: scope.process,
      environment: scope.environment, responses: responseTemplate(),
      outcome: { completed: null, failed: null, failureMode: null, operatorNotes: '' },
      provenance: { effectiveSettingsPath: 'REQUIRED', photoPaths: [], analysisCodeVersion: 'REQUIRED-GIT-COMMIT', reviewer: 'REQUIRED', measurementSystem: scope.measurement },
    };
    writeFileSync(join(templateDirectory, `${run.runId}_${run.specimenId}.json`), `${JSON.stringify(template, null, 2)}\n`);
  }
  console.log(`Prepared ${runs.length} randomized screening runs for scope ${scope.scopeId}`);
}

function validateRecord(record, manifest, existingRecords, runPlan) {
  for (const field of ['recordId', 'runId', 'scopeId', 'stage', 'experimentId', 'specimenId', 'recordedAt']) requiredText(record[field], field);
  if (record.stage !== 'screening') fail('This pilot implementation currently accepts screening records only.');
  if (record.experimentId !== manifest.pilotId) fail('experimentId does not match the manifest.');
  if (Number.isNaN(Date.parse(record.recordedAt))) fail('recordedAt must be an ISO-8601 timestamp.');
  if (existingRecords.some(existing => existing.recordId === record.recordId)) fail(`Duplicate recordId ${record.recordId}.`);
  const specimen = manifest.specimens.find(candidate => candidate.specimenId === record.specimenId);
  if (!specimen) fail(`Unknown specimenId ${record.specimenId}.`);
  if (!runPlan) fail('No locked run plan. Run npm run p1:prepare before recording observations.');
  const run = runPlan.runs?.find(candidate => candidate.runId === record.runId);
  if (!run || run.specimenId !== record.specimenId || run.scopeId !== record.scopeId) fail('runId, scopeId, and specimenId do not match the locked run plan.');
  if (record.geometry?.geometrySha256 !== specimen.sha256) fail('geometrySha256 does not match the generated specimen.');
  if (record.geometry?.units !== 'mm' || record.geometry?.orientationId !== 'as-imported') fail('Screening geometry must use millimetres and the as-imported orientation.');
  if (!record.geometry?.p1Metrics || typeof record.geometry.p1Metrics !== 'object') fail('geometry.p1Metrics is required.');
  validateScope({
    scopeId: record.scopeId, pilotId: record.experimentId, lockedAt: record.recordedAt,
    randomizationSeed: 'record-validation', printer: record.printer, material: record.material,
    process: record.process, environment: record.environment, measurement: record.provenance?.measurementSystem,
  });
  if (!record.responses || typeof record.responses !== 'object') fail('responses are required.');
  if (typeof record.outcome?.completed !== 'boolean' || typeof record.outcome?.failed !== 'boolean') fail('outcome.completed and outcome.failed must be boolean.');
  if (record.outcome.completed === record.outcome.failed) fail('Exactly one of outcome.completed and outcome.failed must be true.');
  if (record.outcome.failed) requiredText(record.outcome.failureMode, 'outcome.failureMode');
  const responseNumber = field => {
    const value = record.responses[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(`responses.${field} must be a non-negative measurement.`);
  };
  responseNumber('printTimeSeconds'); responseNumber('materialUsedGrams');
  if (record.outcome.completed && specimen.family === 'adhesion-stability') {
    if (typeof record.responses.detached !== 'boolean') fail('Completed adhesion runs require responses.detached.');
    responseNumber('cornerLiftMaxMm'); responseNumber('dimensionalWarpMaxMm');
    if (!Number.isInteger(record.responses.visibleOscillationRating) || record.responses.visibleOscillationRating < 0 || record.responses.visibleOscillationRating > 5) fail('visibleOscillationRating must be an integer from 0 to 5.');
  }
  if (record.outcome.completed && specimen.family !== 'adhesion-stability') {
    responseNumber('sagMaxMm'); responseNumber('undersideDeviationMaxMm'); responseNumber('undersideRoughnessMetric');
  }
  if (record.responses.supportRemovalSeconds !== null || record.responses.removalDamageRating !== null) fail('Support-removal responses must be null in the support-off screening stage.');
  for (const field of ['effectiveSettingsPath', 'analysisCodeVersion', 'reviewer']) requiredText(record.provenance?.[field], `provenance.${field}`);
  if (!Array.isArray(record.provenance?.photoPaths)) fail('provenance.photoPaths must be an array.');
  if (!record.provenance?.measurementSystem || typeof record.provenance.measurementSystem !== 'object') fail('provenance.measurementSystem is required.');
  if (record.supersedesRecordId) {
    if (!existingRecords.some(existing => existing.recordId === record.supersedesRecordId)) fail('supersedesRecordId does not exist.');
    requiredText(record.correctionReason, 'correctionReason');
  }
  return specimen;
}

function record() {
  const inputPath = argument('file'); if (!inputPath) fail('Usage: npm run p1:record -- --file <completed-record.json>');
  const outputRecordsPath = resolve(argument('records') ?? recordsPath);
  const runPlanPath = resolve(argument('plan') ?? join(generatedDirectory, 'run-plan.json'));
  if (!existsSync(runPlanPath)) fail(`No locked run plan at ${runPlanPath}. Run npm run p1:prepare first.`);
  const manifest = loadManifest(); const existing = readRecords(outputRecordsPath); const observation = json(resolve(inputPath));
  validateRecord(observation, manifest, existing, json(runPlanPath));
  mkdirSync(dirname(outputRecordsPath), { recursive: true });
  appendFileSync(outputRecordsPath, `${JSON.stringify(observation)}\n`, { encoding: 'utf8', flag: 'a' });
  console.log(`Appended immutable observation ${observation.recordId} to ${outputRecordsPath}`);
}

function verifyArtifacts(manifest = loadManifest()) {
  if (manifest.specimenCount !== 18 || manifest.specimens?.length !== 18) fail('The physical pilot must contain exactly 18 screening specimens.');
  const ids = new Set();
  for (const specimen of manifest.specimens) {
    if (ids.has(specimen.specimenId)) fail(`Duplicate specimenId ${specimen.specimenId}.`); ids.add(specimen.specimenId);
    const path = join(generatedDirectory, specimen.file);
    if (!existsSync(path)) fail(`Missing coupon ${specimen.file}.`);
    if (sha256(path) !== specimen.sha256) fail(`SHA-256 mismatch for ${specimen.file}.`);
    if (!specimen.measuredGeometry?.geometryRisk && !specimen.measuredGeometry?.overhangRegions) {
      // geometryRisk is flattened into measuredGeometry by analyze-coupons.ts.
      if (typeof specimen.measuredGeometry?.bedCoverageRatio !== 'number') fail(`Missing P1 measurements for ${specimen.specimenId}.`);
    }
  }
  return manifest;
}

function verify() {
  const inputRecordsPath = resolve(argument('records') ?? recordsPath);
  const runPlanPath = resolve(argument('plan') ?? join(generatedDirectory, 'run-plan.json'));
  const manifest = verifyArtifacts(); const records = readRecords(inputRecordsPath);
  const runPlan = records.length ? existsSync(runPlanPath) ? json(runPlanPath) : fail(`Missing run plan ${runPlanPath}.`) : undefined;
  records.forEach((observation, index) => validateRecord(observation, manifest, records.slice(0, index), runPlan));
  console.log(`Verified ${manifest.specimens.length} coupon hashes and ${records.length} append-only observations`);
}

function summary() {
  const inputRecordsPath = resolve(argument('records') ?? recordsPath);
  const runPlanPath = resolve(argument('plan') ?? join(generatedDirectory, 'run-plan.json'));
  const manifest = verifyArtifacts(); const records = readRecords(inputRecordsPath);
  const runPlan = records.length ? existsSync(runPlanPath) ? json(runPlanPath) : fail(`Missing run plan ${runPlanPath}.`) : undefined;
  const result = {};
  for (const specimen of manifest.specimens) result[specimen.family] ??= { planned: 0, recorded: 0, completed: 0, failed: 0 };
  for (const specimen of manifest.specimens) result[specimen.family].planned += 1;
  for (const observation of records) {
    const specimen = validateRecord(observation, manifest, records.filter(item => item !== observation), runPlan);
    result[specimen.family].recorded += 1;
    result[specimen.family][observation.outcome.failed ? 'failed' : 'completed'] += 1;
  }
  console.log(JSON.stringify({ pilotId: manifest.pilotId, families: result }, null, 2));
}

function selfTest() {
  const runPlanPath = resolve(argument('plan') ?? fail('self-test requires --plan.'));
  const templateDirectory = resolve(argument('templates') ?? fail('self-test requires --templates.'));
  const runPlan = json(runPlanPath); const run = runPlan.runs[0]; const manifest = loadManifest();
  const template = json(join(templateDirectory, `${run.runId}_${run.specimenId}.json`));
  template.recordId = `${run.runId}-SELF-TEST`; template.recordedAt = '2026-07-14T00:01:00Z';
  template.responses.printTimeSeconds = 60; template.responses.materialUsedGrams = 1;
  template.responses.detached = false; template.responses.cornerLiftMaxMm = 0; template.responses.dimensionalWarpMaxMm = 0;
  template.responses.visibleOscillationRating = 0; template.responses.sagMaxMm = 0; template.responses.undersideDeviationMaxMm = 0;
  template.responses.undersideRoughnessMetric = 0; template.outcome = { completed: true, failed: false, failureMode: null, operatorNotes: 'CLI self-test only' };
  template.provenance.effectiveSettingsPath = 'self-test-settings.json'; template.provenance.analysisCodeVersion = 'self-test'; template.provenance.reviewer = 'self-test';
  validateRecord(template, manifest, [], runPlan);
  console.log(`Validated synthetic ${run.family} record against ${run.runId}`);
}

const command = process.argv[2];
try {
  if (command === 'prepare') prepare();
  else if (command === 'record') record();
  else if (command === 'verify') verify();
  else if (command === 'summary') summary();
  else if (command === 'self-test') selfTest();
  else fail('Commands: prepare, record, verify, summary, self-test');
} catch (error) {
  console.error(`P1 pilot error: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1;
}
