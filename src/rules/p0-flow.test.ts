import { describe, expect, it } from 'vitest';
import { localModelAnalysis, questionnaireFromIntelligence, refineLocalIntelligence } from '../ai/modelIntelligence';
import { getPrinter } from '../printers/profiles';
import type { ModelAnalysis } from '../types';
import { evaluateRules } from './engine';
import { ruleEvidenceById, rules } from './load';

const model: ModelAnalysis = {
  fileName: 'wall_bracket_v2.stl', triangleCount: 12,
  boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 40, y: 30, z: 20 }, size: { x: 40, y: 30, z: 20 } },
  heightMm: 20, bedContactAreaMm2: 600, overhangAreaMm2: 10, overhangRatio: 0.02,
  confidence: { bedContact: 0.65, overhang: 0.78 }, orientations: [], orientationLabel: 'As imported',
  metadata: { format: 'stl', encoding: 'binary', clues: [{ source: 'file-name', value: 'wall bracket' }] },
};

describe('P0 safe decision flow', () => {
  it('keeps an unknown model on the neutral baseline despite a suggestive filename', () => {
    const intelligence = localModelAnalysis(model);
    const questionnaire = questionnaireFromIntelligence(intelligence, getPrinter('bambu-x1c'));
    const recommendations = evaluateRules(rules, model, questionnaire, ruleEvidenceById);
    const bySetting = Object.fromEntries(recommendations.map(item => [item.setting, item]));
    expect(questionnaire).toMatchObject({ environment: 'unknown', load: 'unknown', impact: 'unknown', heat: 'unknown', priority: 'unknown', supportsAllowed: 'unknown' });
    expect(bySetting.material.value).toBe('PLA');
    expect(bySetting.wall_loops.value).toBe(3);
    expect(bySetting.infill_percent.value).toBe(15);
    expect(bySetting.wall_loops.matchedRuleIds).toEqual(['P04']);
    expect(bySetting.material.matchedRuleIds).toEqual(['M01']);
  });

  it('activates only requirements supported by explicit user clarification', () => {
    const refined = refineLocalIntelligence(localModelAnalysis(model), {
      purpose: 'Bärande väggfäste utomhus med upprepad rörelse utan stöd',
    });
    const questionnaire = questionnaireFromIntelligence(refined, getPrinter('bambu-x1c'));
    const recommendations = evaluateRules(rules, model, questionnaire, ruleEvidenceById);
    const bySetting = Object.fromEntries(recommendations.map(item => [item.setting, item]));
    expect(bySetting.material.value).toBe('PETG');
    expect(bySetting.material.ruleIds).toEqual(['M02', 'M03']);
    expect(bySetting.material.inputEvidenceIds).toContain('requirement:environment:1');
    expect(bySetting.wall_loops.value).toBe(4);
    expect(bySetting.wall_loops.matchedRuleIds).toEqual(['P04', 'U01', 'U06', 'Q01']);
    expect(bySetting.support.value).toBe('Off — orientation required');
    expect(bySetting.support.ruleIds).toEqual(['Q09']);
    expect(bySetting.support.trace.find(entry => entry.ruleId === 'Q09')?.inputEvidenceIds).toContain('requirement:supportsAllowed:1');
    expect(questionnaire.impact).toBe('unknown');
    expect(bySetting.material.matchedRuleIds).not.toContain('M04');
  });

  it('recalculates support from the explicit step-two override', () => {
    const intelligence = localModelAnalysis(model, 'A simple indoor spacer.');
    const withSupports = questionnaireFromIntelligence(refineLocalIntelligence(intelligence, {
      'support-preference': 'required',
    }), getPrinter('bambu-x1c'));
    const withoutSupports = questionnaireFromIntelligence(refineLocalIntelligence(intelligence, {
      'support-preference': 'forbidden',
    }), getPrinter('bambu-x1c'));
    const enabled = Object.fromEntries(evaluateRules(rules, model, withSupports, ruleEvidenceById).map(item => [item.setting, item]));
    const disabled = Object.fromEntries(evaluateRules(rules, model, withoutSupports, ruleEvidenceById).map(item => [item.setting, item]));

    expect(enabled.support.value).toBe('Auto');
    expect(enabled.support.matchedRuleIds).toContain('G12');
    expect(disabled.support.value).toBe('Off — orientation required');
    expect(disabled.support.matchedRuleIds).toContain('G13');
  });
});
