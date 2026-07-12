import { describe, expect, it } from 'vitest';
import { evaluateRules } from './engine';
import type { ModelAnalysis, Questionnaire, Rule } from '../types';
const analysis = {heightMm:180,bedContactAreaMm2:200,overhangRatio:.2} as ModelAnalysis;
const answers = {impact:'high'} as Questionnaire;
it('combines minimum actions deterministically', () => {
  const rules: Rule[] = [4,5].map((n,i)=>({id:`r${i}`,group:'usage',priority:i,conditions:[{path:'answers.impact',op:'eq',value:'high'}],actions:[{setting:'wall_loops',value:n,mode:'min'}],reason:'impact',confidence:.8}));
  expect(evaluateRules(rules,analysis,answers)[0].value).toBe(5);
});
