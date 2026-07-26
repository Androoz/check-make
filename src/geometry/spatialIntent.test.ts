import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { localModelAnalysis, questionnaireFromIntelligence, refineLocalIntelligence } from '../ai/modelIntelligence';
import { assessDecisionReadiness } from '../decision/readiness';
import { printerAgnosticProfile } from '../printers/profiles';
import { evaluateRules } from '../rules/engine';
import type { Rule, SpatialManufacturingIntent } from '../types';
import { compareOrientations, analyzeGeometry } from './stl';
import {
  analyzeSpatialCandidates, applySpatialRegionColors, confirmCandidate, emptySpatialManufacturingIntent,
  facePatchRegion, normalizeSpatialManufacturingIntent, rejectSpatialCandidate, replaceSpatialRegion, setConfirmedLoadAxis,
} from './spatialIntent';

const metadata = { format: 'stl', encoding: 'ascii', clues: [] } as const;

describe('Interpretation v3.5 spatial manufacturing intent', () => {
  it('creates explainable planar and sampled thickness candidates without confirming them', () => {
    const geometry = new THREE.BoxGeometry(30, 20, 6);
    const result = analyzeSpatialCandidates(geometry);

    expect(result.schemaVersion).toBe(1);
    expect(result.planarCandidates.length).toBeGreaterThan(0);
    expect(result.planarCandidates.every(candidate => candidate.status === 'hypothesized')).toBe(true);
    expect(result.thicknessCoverage.sampledTriangles).toBeGreaterThan(0);
    expect(result.thicknessCoverage.totalTriangles).toBe(12);
  });

  it('maps a selected face to a stable connected patch and colors only a derived preview', () => {
    const source = new THREE.BoxGeometry(30, 20, 6);
    const selected = facePatchRegion(source, 0, 'mating-surface', 'Mating face', ['intent:fit']);
    expect(selected?.status).toBe('confirmed');
    expect(selected?.mesh.triangleIndices).toContain(0);

    const preview = source.toNonIndexed();
    applySpatialRegionColors(preview, [selected!]);
    expect(preview.getAttribute('color').count).toBe(preview.getAttribute('position').count);
    expect(source.getAttribute('color')).toBeUndefined();
  });

  it('normalizes absent legacy project data to an empty versioned contract', () => {
    expect(normalizeSpatialManufacturingIntent()).toEqual(emptySpatialManufacturingIntent());
    const candidate = analyzeSpatialCandidates(new THREE.BoxGeometry(10, 10, 10)).planarCandidates[0];
    const confirmed = replaceSpatialRegion(setConfirmedLoadAxis(emptySpatialManufacturingIntent(), 'y', ['user:axis']), confirmCandidate(candidate, 'mating-surface', ['user:surface']));
    const roundTrip = JSON.parse(JSON.stringify({ spatialIntent: confirmed })) as { spatialIntent: SpatialManufacturingIntent };
    expect(normalizeSpatialManufacturingIntent(roundTrip.spatialIntent)).toEqual(confirmed);
  });

  it('keeps explicit load localization gated until both the axis and region are confirmed', () => {
    const geometry = new THREE.BoxGeometry(20, 10, 40).translate(0, 0, 20);
    const { analysis } = analyzeGeometry(geometry, 'bending-bracket.stl', metadata);
    const initial = localModelAnalysis(analysis, 'Snap-fit bracket under repeated bending with a visible face and no supports.');
    const intelligence = refineLocalIntelligence({ ...initial, userEvidence: ['Snap-fit bracket under repeated bending with a visible face and no supports.'] }, { priority: 'strength', load: 'cyclic', impact: 'none', environment: 'indoor', heat: 'normal', supportsAllowed: 'true' });
    const empty = emptySpatialManufacturingIntent();

    expect(assessDecisionReadiness(intelligence, empty).gaps.map(gap => gap.id)).toEqual(expect.arrayContaining(['spatial-load-axis', 'spatial-load-region']));

    const candidate = analyzeSpatialCandidates(geometry).planarCandidates[0];
    const localized = replaceSpatialRegion(setConfirmedLoadAxis(empty, 'x', ['facet:load-bending']), confirmCandidate(candidate, 'load-bearing', ['facet:load-bending']));
    expect(assessDecisionReadiness(intelligence, localized).gaps.map(gap => gap.id)).not.toEqual(expect.arrayContaining(['spatial-load-axis', 'spatial-load-region']));
  });

  it('lets confirmed spatial evidence affect orientation scores and remain traceable', () => {
    const geometry = new THREE.BoxGeometry(20, 10, 40).translate(0, 0, 20);
    const { analysis } = analyzeGeometry(geometry, 'axis-part.stl', metadata);
    const base = localModelAnalysis(analysis, 'Snap-fit bracket under repeated bending with a visible face and no supports.');
    const intelligence = refineLocalIntelligence({ ...base, userEvidence: ['Snap-fit bracket under repeated bending with a visible face and no supports.'] }, { priority: 'strength', load: 'cyclic', impact: 'none', environment: 'indoor', heat: 'normal', supportsAllowed: 'true' });
    const spatial = setConfirmedLoadAxis(emptySpatialManufacturingIntent(), 'x', ['facet:load-bending']);
    const baseline = compareOrientations(analysis, 'strength', intelligence.manufacturingIntent);
    const localized = compareOrientations(analysis, 'strength', intelligence.manufacturingIntent, spatial);

    expect(localized[0].constraintsApplied?.join(' ')).toContain('load axis');
    expect(localized[0].spatialEvidenceIds).toContain('facet:load-bending');
    expect(localized.map(item => item.overallScore)).not.toEqual(baseline.map(item => item.overallScore));

    const orientationRule: Rule = { id: 'SPATIAL_TEST', group: 'geometry', priority: 1, conditions: [{ path: 'analysis.heightMm', op: 'gte', value: 0 }], actions: [{ setting: 'orientation', value: 'As imported' }], reason: 'test', confidence: 1 };
    const questionnaire = { ...questionnaireFromIntelligence(intelligence, printerAgnosticProfile), spatialIntent: spatial };
    const recommendation = evaluateRules([orientationRule], analysis, questionnaire)[0];
    expect(recommendation.inputEvidenceIds).toContain('facet:load-bending');
    expect(recommendation.trace[0].inputEvidenceIds).toContain('facet:load-bending');
  });

  it('gates thin-region process rules on explicit confirmation', () => {
    const geometry = new THREE.BoxGeometry(20, 10, 2).translate(0, 0, 1);
    const { analysis } = analyzeGeometry(geometry, 'thin-panel.stl', metadata);
    const intelligence = refineLocalIntelligence(localModelAnalysis(analysis, 'Indoor protective panel.'), { priority: 'finish', load: 'none', impact: 'none', environment: 'indoor', heat: 'normal', supportsAllowed: 'true' });
    const candidate = analyzeSpatialCandidates(geometry).thinCandidates[0] ?? analyzeSpatialCandidates(geometry).planarCandidates[0];
    const confirmed = replaceSpatialRegion(emptySpatialManufacturingIntent(), confirmCandidate(candidate, 'critical-thin', ['geometry:thin-confirmed']));
    const rule: Rule = { id: 'THIN_TEST', group: 'geometry', priority: 1, conditions: [{ path: 'spatial.confirmedCriticalThin', op: 'eq', value: true }], actions: [{ setting: 'wall_generator', value: 'Arachne' }], reason: 'test', confidence: 1 };
    const baseline = questionnaireFromIntelligence(intelligence, printerAgnosticProfile);

    expect(evaluateRules([rule], analysis, baseline)).toHaveLength(0);
    const recommendation = evaluateRules([rule], analysis, { ...baseline, spatialIntent: confirmed })[0];
    expect(recommendation.inputEvidenceIds).toContain('geometry:thin-confirmed');
  });

  it('persists rejected candidates without letting them affect decisions', () => {
    const geometry = new THREE.BoxGeometry(12, 8, 4);
    const candidate = analyzeSpatialCandidates(geometry).planarCandidates[0];
    const rejected = rejectSpatialCandidate(emptySpatialManufacturingIntent(), 'visible-surface', candidate.id);
    const restored = normalizeSpatialManufacturingIntent(JSON.parse(JSON.stringify(rejected)) as SpatialManufacturingIntent);

    expect(restored.rejectedCandidateIds).toContain(`visible-surface:${candidate.id}`);
    expect(restored.regions).toHaveLength(0);
  });
});
