import { describe,expect,it } from 'vitest';
import { applyInference,inferBrief } from './inferBrief';
import type { Questionnaire } from '../types';

describe('inferBrief',()=>{
  it('turns a written use case into checklist values',()=>{const result=inferBrief('Outdoor hinge that is opened repeatedly and gets knocked','accurate fit and weather resistant');expect(result.environment.value).toBe('outdoor');expect(result.load.value).toBe('cyclic');expect(result.impact.value).toBe('medium');expect(result.priority.value).toBe('accuracy')});
  it('preserves manual overrides',()=>{const answers={environment:'indoor'} as Questionnaire;const result=applyInference(answers,inferBrief('outdoor bracket',''),new Set(['environment']));expect(result.environment).toBe('indoor')});
  it('keeps fields unknown when the user supplied no evidence',()=>{const result=inferBrief('','');expect(result.environment.value).toBe('unknown');expect(result.load.value).toBe('unknown');expect(result.impact.value).toBe('unknown');expect(result.priority.value).toBe('unknown');expect(result.supportsAllowed.value).toBe('unknown')});
  it('recognizes explicit Swedish requirements',()=>{const result=inferBrief('Bärande fäste utomhus med upprepad rörelse utan stöd','');expect(result.environment.value).toBe('outdoor');expect(result.load.value).toBe('cyclic');expect(result.priority.value).toBe('strength');expect(result.supportsAllowed.value).toBe(false)});
});
