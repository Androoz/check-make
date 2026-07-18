import { describe, expect, it } from 'vitest';
import { localModelAnalysis, questionnaireFromIntelligence, refineLocalIntelligence } from './modelIntelligence';
import { getPrinter } from '../printers/profiles';
import type { ModelAnalysis } from '../types';

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
    expect(result.questions).toHaveLength(3);
    expect(result.environment).toBe('unknown');
    expect(result.load).toBe('unknown');
    expect(result.impact).toBe('unknown');
    expect(result.priority).toBe('unknown');
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
  });
});
