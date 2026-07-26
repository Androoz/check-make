import { describe, expect, it } from 'vitest';
import { evaluateRules } from './engine';
import type { ModelAnalysis, Questionnaire, Rule } from '../types';
import { emptyManufacturingIntent } from '../intent/manufacturingIntent';
const analysis = {heightMm:180,bedContactAreaMm2:200,overhangRatio:.2} as ModelAnalysis;
const answers = {purpose:'bärande fäste',impact:'high'} as Questionnaire;
it('combines minimum actions deterministically', () => {
  const rules: Rule[] = [4,5].map((n,i)=>({id:`r${i}`,group:'usage',priority:i,conditions:[{path:'answers.impact',op:'eq',value:'high'}],actions:[{setting:'wall_loops',value:n,mode:'min'}],reason:'impact',confidence:.8}));
  const result = evaluateRules(rules,analysis,answers)[0];
  expect(result.value).toBe(5);
  expect(result.ruleIds).toEqual(['r1']);
  expect(result.trace).toEqual([
    { ruleId: 'r0', state: 'superseded', conflictsWithFinal: false, proposedValue: 4, resultingValue: 4, inputEvidenceIds: ['requirement:impact:1'] },
    { ruleId: 'r1', state: 'active', conflictsWithFinal: false, proposedValue: 5, resultingValue: 5, inputEvidenceIds: ['requirement:impact:1'] },
  ]);
  expect(result.inputEvidenceIds).toEqual(['requirement:impact:1']);
});

it('reports an overwritten set action as a conflict and explains only the final value', () => {
  const rules: Rule[] = [
    {id:'base',group:'material',priority:1,conditions:[],actions:[{setting:'material',value:'PLA',mode:'set'}],reason:'PLA baseline.',confidence:.7},
    {id:'outdoor',group:'material',priority:2,conditions:[{path:'answers.environment',op:'eq',value:'outdoor'}],actions:[{setting:'material',value:'PETG',mode:'set'}],reason:'Outdoor choice.',confidence:.8},
  ];
  const result = evaluateRules(rules, analysis, { ...answers, environment: 'outdoor' })[0];
  expect(result.value).toBe('PETG');
  expect(result.reason).toBe('Outdoor choice.');
  expect(result.ruleIds).toEqual(['outdoor']);
  expect(result.matchedRuleIds).toEqual(['base', 'outdoor']);
  expect(result.trace[0]).toMatchObject({ ruleId: 'base', state: 'superseded', conflictsWithFinal: true });
  expect(result.trace[1]).toMatchObject({ ruleId: 'outdoor', state: 'active', conflictsWithFinal: false });
});

it('applies an optimization objective without replacing the original user priority', () => {
  const objectiveRules: Rule[] = [
    {id:'strength-base',group:'quality',priority:1,conditions:[{path:'answers.priority',op:'eq',value:'strength'}],actions:[{setting:'wall_loops',value:4,mode:'min'}],reason:'strength',confidence:.8},
    {id:'time-objective',group:'optimization',priority:2,conditions:[{path:'objective',op:'eq',value:'time'}],actions:[{setting:'layer_height',value:'0.24 mm',mode:'set'}],reason:'time',confidence:.7},
  ];
  const result = evaluateRules(objectiveRules, analysis, { ...answers, priority: 'strength' }, {}, 'time');
  expect(result.find(item => item.setting === 'wall_loops')?.value).toBe(4);
  expect(result.find(item => item.setting === 'layer_height')?.value).toBe('0.24 mm');
});

it('does not reinterpret raw purpose text with the retired keyword parser', () => {
  const intentRule: Rule = { id: 'structural', group: 'usage', priority: 1, conditions: [{ path: 'intent.compatibility.structural', op: 'eq', value: true }], actions: [{ setting: 'wall_loops', value: 4, mode: 'min' }], reason: 'structural', confidence: .8 };
  const neutral = {
    ...answers, purpose: 'Bracket shaped decorative display only', environment: 'indoor', load: 'none', impact: 'none', heat: 'normal',
    priority: 'finish', supportsAllowed: true,
  } as Questionnaire;
  expect(evaluateRules([intentRule], analysis, neutral)).toHaveLength(0);
});

it('uses the structured manufacturing intent even when raw prose is non-descriptive', () => {
  const intentRule: Rule = { id: 'structural', group: 'usage', priority: 1, conditions: [{ path: 'intent.compatibility.structural', op: 'eq', value: true }], actions: [{ setting: 'wall_loops', value: 4, mode: 'min' }], reason: 'structural', confidence: .8 };
  const structural = {
    ...answers, purpose: 'Replacement part', environment: 'indoor', load: 'static', impact: 'none', heat: 'normal',
    priority: 'strength', supportsAllowed: true,
  } as Questionnaire;
  structural.manufacturingIntent = emptyManufacturingIntent(structural);
  expect(evaluateRules([intentRule], analysis, structural)[0]?.value).toBe(4);
});
