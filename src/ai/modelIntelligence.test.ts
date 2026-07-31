import { describe, expect, it } from 'vitest';
import { localModelAnalysis, prepareIntelligenceForReview, questionnaireFromIntelligence, refineLocalIntelligence } from './modelIntelligence';
import { getPrinter } from '../printers/profiles';
import { evaluateRules } from '../rules/engine';
import { intentFactUsable } from '../intent/manufacturingIntent';
import type { ModelAnalysis, Rule } from '../types';

const model: ModelAnalysis = {
  fileName: 'panel.stl', triangleCount: 12,
  boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 60, z: 4 }, size: { x: 100, y: 60, z: 4 } },
  heightMm: 4, bedContactAreaMm2: 6000, overhangAreaMm2: 20, overhangRatio: 0.01,
  confidence: { bedContact: 0.65, overhang: 0.78 }, orientations: [], orientationLabel: 'As imported',
  metadata: { format: 'stl', encoding: 'ascii', clues: [] },
};

describe('local model intelligence', () => {
  it('identifies flat model families without pretending to know exact semantics', () => {
    const result = localModelAnalysis(model);
    expect(result.objectName).toContain('plate');
    expect(result.questions).toHaveLength(6);
    expect(result.environment).toBe('unknown');
    expect(result.load).toBe('unknown');
    expect(result.impact).toBe('unknown');
    expect(result.priority).toBe('unknown');
    expect(result.requirements.priority.status).toBe('assumed');
    expect(result.requirements.supportsAllowed.status).toBe('not_applicable');
    expect(result.questions.map(question => question.id)).toEqual(['purpose', 'priority', 'load', 'impact', 'environment', 'heat']);
    expect(result.questions.every(question => question.kind === 'text' || question.kind === 'single')).toBe(true);
  });

  it('recommends supports from geometry without asking permission unless support-free is explicit', () => {
    const overhangModel = {
      ...model,
      overhangRatio: 0.2,
      geometryRisk: { bedCoverageRatio: 0.2, overhangRegionCount: 2, largestOverhangRegionSpanMm: 10 },
    } as ModelAnalysis;
    const automatic = localModelAnalysis(overhangModel, 'Protective cover for a connector.');
    expect(automatic.questions.map(question => question.id)).not.toContain('supportsAllowed');
    expect(automatic.requirements.supportsAllowed).toMatchObject({ value: true, status: 'inferred' });

    const constrained = localModelAnalysis(overhangModel, 'Protective cover for a connector. Must print without supports.');
    expect(constrained.questions.map(question => question.id)).not.toContain('supportsAllowed');
    expect(constrained.requirements.supportsAllowed).toMatchObject({ value: false, status: 'confirmed', source: 'user' });
  });

  it('keeps an explicit support-free statement as a step-two override instead of another required question', () => {
    const geometryRisk = { bedCoverageRatio: 0.2, overhangRegionCount: 2, largestOverhangRegionSpanMm: 10 } as ModelAnalysis['geometryRisk'];
    const constrained = localModelAnalysis({
      ...model,
      overhangRatio: 0.2,
      geometryRisk,
      orientations: [
        { id: 'a', label: 'A', heightMm: 20, bedContactAreaMm2: 100, overhangRatio: 0.18, geometryRisk },
        { id: 'b', label: 'B', heightMm: 40, bedContactAreaMm2: 80, overhangRatio: 0.12, geometryRisk },
      ],
    }, 'Protective cover for a connector. Must print without supports.');
    expect(constrained.questions.map(question => question.id)).not.toContain('support-tradeoff');
    expect(constrained.supportPreference).toBe('forbidden');
    expect(constrained.requirements.supportsAllowed).toMatchObject({ value: false, status: 'confirmed' });
    const refined = refineLocalIntelligence(constrained, { 'support-preference': 'required' });
    expect(refined.requirements.supportsAllowed).toMatchObject({ value: true, status: 'confirmed', source: 'user' });
    expect(refined.supportPreference).toBe('required');
  });

  it('prefills reviewable world-model assumptions from Context, object clues, and normal use expectations', () => {
    const result = localModelAnalysis(model, 'Spacer for a parasol base.');
    expect(result.requirements.environment).toMatchObject({ value: 'outdoor', status: 'assumed' });
    expect(result.requirements.heat).toMatchObject({ value: 'warm', status: 'assumed' });
    expect(result.requirements.load).toMatchObject({ value: 'static', status: 'assumed' });
    expect(result.requirements.priority).toMatchObject({ value: 'accuracy', status: 'assumed' });
    expect(result.questions.map(question => question.id)).toEqual(expect.arrayContaining(['environment', 'heat', 'load', 'priority']));
  });

  it('uses model naming as an explicitly unverified identity clue', () => {
    const result = localModelAnalysis({
      ...model,
      fileName: 'phone_stand_v2.stl',
      metadata: { format: 'stl', encoding: 'binary', clues: [{ source: 'file-name', value: 'phone stand' }] },
    });
    expect(result.objectName).toBe('possible phone stand');
    expect(result.likelyPurpose).toContain('file name');
    expect(result.evidence).toContain('File name provides the unverified clue “phone stand”.');
  });

  it('keeps missing function unresolved without adding a second description field', () => {
    const result = localModelAnalysis(model, 'Used outside in direct sun and rain.');
    expect(result.objectHypothesis?.purpose.status).toBe('unknown');
    expect(result.purposeConfirmed).toBe(false);
    expect(result.questions.map(question => question.id)).not.toContain('object-purpose-description');
  });

  it('updates an unclear model understanding from a user-supplied RC wheel purpose', () => {
    const initial = localModelAnalysis({
      ...model,
      fileName: 'Comp_M05_3mm_offset.stl',
      metadata: { format: 'stl', encoding: 'binary', clues: [] },
    }, 'Part for a vehicle assembly.');
    const refined = refineLocalIntelligence(initial, {
      'object-purpose-description': 'Wheel rim for a toy radio-controlled car.',
    });
    expect(refined.purposeConfirmed).toBe(true);
    expect(refined.objectHypothesis?.purpose).toMatchObject({
      value: 'Wheel rim for a toy radio-controlled car.',
      status: 'confirmed',
    });
  });

  it('keeps explicit identity and purpose separate without repeating the purpose question', () => {
    const result = localModelAnalysis(model, 'Protective cover that snaps onto a housing.');
    expect(result.objectHypothesis?.identity).toMatchObject({ value: 'protective cover or enclosure', status: 'user-stated' });
    expect(result.objectHypothesis?.purpose).toMatchObject({ value: 'protects or encloses', status: 'user-stated' });
    expect(result.questions.map(question => question.id)).not.toContain('object-purpose-description');
  });

  it('asks for the critical dimension when fit is consequential and closes it from a structured answer', () => {
    const initial = localModelAnalysis(model, 'Protective cover with a snap-fit mating surface.');
    expect(initial.questions.find(question => question.id === 'intent-critical-dimension')).toMatchObject({
      kind: 'single',
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'xy' }),
        expect.objectContaining({ value: 'z' }),
        expect.objectContaining({ value: 'surface' }),
        expect.objectContaining({ value: 'unknown' }),
      ]),
    });
    const refined = refineLocalIntelligence(initial, {
      priority: 'accuracy',
      load: 'none',
      impact: 'none',
      environment: 'indoor',
      heat: 'normal',
      'intent-critical-dimension': 'z',
    });
    expect(refined.questions.map(question => question.id)).not.toContain('intent-critical-dimension');
  });

  it('keeps naming hypotheses out of rule context until the user confirms them', () => {
    const initial = localModelAnalysis({
      ...model,
      fileName: 'wall_bracket.stl',
      metadata: { format: 'stl', encoding: 'binary', clues: [{ source: 'file-name', value: 'wall bracket' }] },
    });
    expect(initial.objectName).toBe('possible wall bracket');
    expect(questionnaireFromIntelligence(initial, getPrinter('bambu-x1c')).purpose).toBe('');
    const refined = refineLocalIntelligence(initial, { purpose: 'Bärande väggfäste utomhus med upprepad rörelse utan stöd' });
    const questionnaire = questionnaireFromIntelligence(refined, getPrinter('bambu-x1c'));
    expect(questionnaire.purpose).toContain('Bärande väggfäste');
    expect(questionnaire.environment).toBe('outdoor');
    expect(questionnaire.load).toBe('cyclic');
    expect(questionnaire.priority).toBe('strength');
    expect(questionnaire.supportsAllowed).toBe(false);
    expect(questionnaire.impact).toBe('unknown');
    expect(refined.requirements.environment.status).toBe('confirmed');
    expect(refined.requirements.load.source).toBe('user');
  });

  it('turns ambiguous mesh topology into evidence and consequential questions', () => {
    const result = localModelAnalysis({
      ...model,
      topology: { componentCount: 2, boundaryEdgeCount: 3, nonManifoldEdgeCount: 0, degenerateTriangleCount: 0, watertight: false },
    });

    expect(result.evidence).toContain('2 disconnected mesh component(s) were detected.');
    expect(result.questions.map(question => question.id)).toEqual(expect.arrayContaining(['components', 'mesh-repair']));
    expect(result.questions.find(question => question.id === 'mesh-repair')).toMatchObject({
      kind: 'single',
      question: 'How should Check Make treat the highlighted geometry?',
      options: expect.arrayContaining([expect.objectContaining({ value: 'intentional' }), expect.objectContaining({ value: 'not-sure' })]),
    });
    expect(result.questions.length).toBeLessThanOrEqual(7);
  });

  it('closes deterministic requirements from structured answers instead of relying on prose keywords', () => {
    const context = 'Protective machine cover';
    const refined = refineLocalIntelligence({ ...localModelAnalysis(model, context), userEvidence: [context] }, {
      priority: 'finish', load: 'none', impact: 'medium',
      environment: 'outdoor', heat: 'warm',
    });

    expect(refined.purposeConfirmed).toBe(true);
    expect(refined.priority).toBe('finish');
    expect(refined.load).toBe('none');
    expect(refined.impact).toBe('medium');
    expect(refined.environment).toBe('outdoor');
    expect(refined.heat).toBe('warm');
    expect(refined.questions).toHaveLength(0);
    expect(refined.requirements.heat).toMatchObject({ status: 'confirmed', source: 'user', confidence: 1 });
  });

  it('understands a spacer for a parasol base from the original Context field', () => {
    const result = localModelAnalysis(model, 'Distance for parasoll base');
    expect(result.objectHypothesis?.identity).toMatchObject({ value: 'parasol base spacer', status: 'user-stated' });
    expect(result.objectHypothesis?.purpose).toMatchObject({ value: 'creates or maintains spacing', status: 'user-stated' });
    expect(result.questions.map(question => question.id)).not.toContain('object-purpose-description');
  });

  it('accepts a short natural description and carries its interpretation into review', () => {
    const result = localModelAnalysis(model, 'Parasol base distance for outside use.');
    expect(result.objectHypothesis?.identity).toMatchObject({ value: 'parasol base spacer', status: 'user-stated' });
    expect(result.objectHypothesis?.purpose).toMatchObject({ value: 'creates or maintains spacing', status: 'user-stated' });
    expect(result.requirements.environment).toMatchObject({ value: 'outdoor' });
    expect(result.questions.map(question => question.id)).not.toContain('purpose');
  });

  it('removes the legacy duplicate purpose field from saved projects', () => {
    const initial = localModelAnalysis(model, 'Used outside in direct sun.');
    const restored = prepareIntelligenceForReview({
      ...initial,
      questions: [...initial.questions, { id: 'object-purpose-description', question: 'Legacy duplicate', why: 'Legacy field' }],
    });
    expect(restored.questions.map(question => question.id)).not.toContain('object-purpose-description');
  });

  it('keeps a grouped outdoor hypothesis visible through review and applies it only after confirmation', () => {
    const description = 'Protective housing for an outdoor security camera';
    const initial = localModelAnalysis(model, description);
    const questionId = 'semantic-question:confirm-outdoor-service';
    expect(initial.questions.find(question => question.id === questionId)).toMatchObject({
      kind: 'single',
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'confirmed' }),
        expect.objectContaining({ value: 'rejected' }),
      ]),
    });
    expect(prepareIntelligenceForReview(initial).questions.map(question => question.id)).toContain(questionId);
    expect(intentFactUsable(initial.manufacturingIntent!.environment.uvExposure)).toBe(false);
    expect(intentFactUsable(initial.manufacturingIntent!.environment.moistureExposure)).toBe(false);

    const rule: Rule = {
      id: 'confirmed-uv-test', group: 'test', priority: 1,
      conditions: [{ path: 'intent.environment.uvExposure.value', op: 'eq', value: true }],
      actions: [{ setting: 'material', value: 'ASA' }],
      reason: 'Confirmed UV exposure.', confidence: 1,
    };
    expect(evaluateRules([rule], model, questionnaireFromIntelligence(initial, getPrinter('bambu-x1c')))).toEqual([]);

    const confirmed = refineLocalIntelligence(initial, {
      purpose: description,
      [questionId]: 'confirmed',
    });
    expect(confirmed.questions.map(question => question.id)).not.toContain(questionId);
    expect(confirmed.manufacturingIntent!.environment.uvExposure).toMatchObject({ value: true, status: 'confirmed' });
    expect(confirmed.manufacturingIntent!.environment.moistureExposure).toMatchObject({ value: true, status: 'confirmed' });
    expect(evaluateRules([rule], model, questionnaireFromIntelligence(confirmed, getPrinter('bambu-x1c')))[0]?.value).toBe('ASA');
  });

  it('lets one grouped rejection discard related exposure hypotheses without inventing indoor use', () => {
    const description = 'Protective housing for an outdoor security camera';
    const questionId = 'semantic-question:confirm-outdoor-service';
    const rejected = refineLocalIntelligence(localModelAnalysis(model, description), {
      purpose: description,
      [questionId]: 'rejected',
    });
    expect(rejected.questions.map(question => question.id)).not.toContain(questionId);
    expect(intentFactUsable(rejected.manufacturingIntent!.environment.uvExposure)).toBe(false);
    expect(intentFactUsable(rejected.manufacturingIntent!.environment.moistureExposure)).toBe(false);
    expect(rejected.manufacturingIntent!.environment.location).toMatchObject({ value: 'outdoor', status: 'confirmed' });
  });

  it.each([
    ['Spacer for a camping chair', 'semantic-question:confirm-person-load'],
    ['Next tee sign for disc golf', 'semantic-question:confirm-outdoor-service'],
    ['Adapter for a garden hose', 'semantic:pressure.exposure:internal'],
  ])('keeps the consequential semantic question visible for %s', (description, questionId) => {
    const initial = localModelAnalysis(model, description);
    expect(initial.questions.map(question => question.id)).toContain(questionId);
    expect(prepareIntelligenceForReview(initial).questions.map(question => question.id)).toContain(questionId);
  });
});
