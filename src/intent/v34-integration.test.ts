import { describe, expect, it } from 'vitest';
import { localModelAnalysis, questionnaireFromIntelligence, refineLocalIntelligence } from '../ai/modelIntelligence';
import { assessDecisionReadiness } from '../decision/readiness';
import { compareOrientations } from '../geometry/stl';
import { getPrinter } from '../printers/profiles';
import { evaluateRules } from '../rules/engine';
import { ruleEvidenceById, rules } from '../rules/load';
import type { ModelAnalysis } from '../types';

const model: ModelAnalysis = {
  fileName: 'reference.stl', triangleCount: 120,
  boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 80, y: 50, z: 25 }, size: { x: 80, y: 50, z: 25 } },
  heightMm: 25, bedContactAreaMm2: 1200, overhangAreaMm2: 120, overhangRatio: .05,
  confidence: { bedContact: .8, overhang: .8 }, orientationLabel: 'As imported',
  metadata: { format: 'stl', encoding: 'ascii', clues: [] },
  geometryRisk: { boundingFootprintAreaMm2: 4000, bedCoverageRatio: .3, heightToContactWidthRatio: .5, surfaceCentroidOffsetMm: 0, surfaceCentroidOffsetRatio: 0, overhangRegionCount: 1, largestOverhangRegionAreaMm2: 120, largestOverhangRegionSpanMm: 15, overhangRegions: [], bridgeClassification: 'not-evaluated' },
  orientations: [
    { id: 'as-imported', label: 'As imported', heightMm: 25, bedContactAreaMm2: 1200, overhangRatio: .05, geometryRisk: { boundingFootprintAreaMm2: 4000, bedCoverageRatio: .3, heightToContactWidthRatio: .5, surfaceCentroidOffsetMm: 0, surfaceCentroidOffsetRatio: 0, overhangRegionCount: 1, largestOverhangRegionAreaMm2: 120, largestOverhangRegionSpanMm: 15, overhangRegions: [], bridgeClassification: 'not-evaluated' } },
    { id: 'side', label: 'On side', heightMm: 50, bedContactAreaMm2: 500, overhangRatio: .01, geometryRisk: { boundingFootprintAreaMm2: 2000, bedCoverageRatio: .25, heightToContactWidthRatio: 1.2, surfaceCentroidOffsetMm: 2, surfaceCentroidOffsetRatio: .1, overhangRegionCount: 0, largestOverhangRegionAreaMm2: 0, largestOverhangRegionSpanMm: 0, overhangRegions: [], bridgeClassification: 'not-evaluated' } },
  ],
};

const complete = (context: string, answers: Record<string, string>) => {
  const local = localModelAnalysis(model, context);
  const prepared = {
    ...local,
    userEvidence: [context],
    purposeConfirmed: local.objectHypothesis?.purpose.status === 'user-stated',
    questions: local.questions.filter(question => question.id !== 'purpose'),
  };
  return refineLocalIntelligence(prepared, {
    priority: 'strength', load: 'static', impact: 'none', environment: 'indoor', heat: 'normal', supportsAllowed: 'true',
    ...answers,
  });
};

describe('Interpretation v3.4 decision bridge', () => {
  it('turns confirmed outdoor and UV context into a traceable PETG plan', () => {
    const intelligence = complete('Long-term protective cover outdoors in direct sun and rain.', { environment: 'outdoor', heat: 'warm' });
    const questionnaire = questionnaireFromIntelligence(intelligence, getPrinter('bambu-x1c'));
    const recommendations = evaluateRules(rules, model, questionnaire, ruleEvidenceById);
    const material = recommendations.find(item => item.setting === 'material')!;
    expect(assessDecisionReadiness(intelligence).conservativePlan).toBe('ready');
    expect(material.value).toBe('PETG');
    expect(material.ruleIds).toEqual(expect.arrayContaining(['M02', 'M03', 'M06']));
    expect(material.inputEvidenceIds).toEqual(expect.arrayContaining(['requirement:environment:1', 'facet:environment-uv:1']));
  });

  it('uses a confirmed snap fit for process rules while keeping surface localization explicit', () => {
    const intelligence = complete('Protective cover with a snap fit and a visible face.', { priority: 'accuracy' });
    const questionnaire = questionnaireFromIntelligence(intelligence, getPrinter('bambu-x1c'));
    const recommendations = evaluateRules(rules, model, questionnaire, ruleEvidenceById);
    expect(recommendations.find(item => item.setting === 'wall_order')).toMatchObject({ value: 'Outer/Inner', ruleIds: ['U07'] });
    expect(recommendations.find(item => item.setting === 'seam')?.inputEvidenceIds).toContain('facet:fit-snap:1');
    const orientation = compareOrientations(model, 'accuracy', intelligence.manufacturingIntent)[0];
    expect(orientation.constraintsUnresolved?.join(' ')).toMatch(/mating geometry.*visible surfaces/s);
  });

  it('carries repeated bending into structure rules without inventing a load axis', () => {
    const intelligence = complete('Mounting bracket under repeated bending load.', { load: 'cyclic', priority: 'strength' });
    const questionnaire = questionnaireFromIntelligence(intelligence, getPrinter('bambu-x1c'));
    const walls = evaluateRules(rules, model, questionnaire, ruleEvidenceById).find(item => item.setting === 'wall_loops')!;
    expect(walls.value).toBe(4);
    expect(walls.matchedRuleIds).toEqual(expect.arrayContaining(['U01', 'U06', 'Q01']));
    expect(compareOrientations(model, 'strength', intelligence.manufacturingIntent)[0].constraintsUnresolved?.join(' ')).toContain('bending');
  });

  it('keeps vague heat and sun Context incomplete instead of producing a false-ready plan', () => {
    const intelligence = localModelAnalysis(model, 'heat sun');
    const readiness = assessDecisionReadiness(intelligence);
    expect(intelligence.questions.map(question => question.id)).toContain('heat');
    expect(intelligence.questions.map(question => question.id)).not.toContain('object-purpose-description');
    expect(readiness.conservativePlan).toBe('needs-input');
    expect(readiness.gaps.map(gap => gap.id)).toEqual(expect.arrayContaining(['purpose', 'heat']));
  });

  it('abstains after a safety-critical use is confirmed', () => {
    const intelligence = complete('Safety-critical mounting bracket that supports an overhead load.', { 'intent-safety-critical': 'confirmed' });
    const readiness = assessDecisionReadiness(intelligence);
    expect(readiness.requirements).toBe('ready');
    expect(readiness.conservativePlan).toBe('unsupported');
    expect(readiness.unsupportedReasons.join(' ')).toContain('outside Check Make’s validation scope');
  });
});
