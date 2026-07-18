import { describe, expect, it } from 'vitest';
import { evaluateRules } from './engine';
import type { ModelAnalysis, Questionnaire, Rule } from '../types';
const analysis = {heightMm:180,bedContactAreaMm2:200,overhangRatio:.2} as ModelAnalysis;
const answers = {purpose:'bärande fäste',impact:'high'} as Questionnaire;
it('combines minimum actions deterministically', () => {
  const rules: Rule[] = [4,5].map((n,i)=>({id:`r${i}`,group:'usage',priority:i,conditions:[{path:'answers.impact',op:'eq',value:'high'}],actions:[{setting:'wall_loops',value:n,mode:'min'}],reason:'impact',confidence:.8}));
  const result = evaluateRules(rules,analysis,answers)[0];
  expect(result.value).toBe(5);
  expect(result.ruleIds).toEqual(['r1']);
  expect(result.trace).toEqual([
    { ruleId: 'r0', state: 'superseded', conflictsWithFinal: false, proposedValue: 4, resultingValue: 4 },
    { ruleId: 'r1', state: 'active', conflictsWithFinal: false, proposedValue: 5, resultingValue: 5 },
  ]);
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
