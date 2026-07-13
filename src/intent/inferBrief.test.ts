import { describe,expect,it } from 'vitest';
import { applyInference,inferBrief } from './inferBrief';
import type { Questionnaire } from '../types';

describe('inferBrief',()=>{
  it('turns a written use case into checklist values',()=>{const result=inferBrief('Outdoor hinge that is opened repeatedly and gets knocked','accurate fit and weather resistant');expect(result.environment.value).toBe('outdoor');expect(result.load.value).toBe('cyclic');expect(result.impact.value).toBe('medium');expect(result.priority.value).toBe('accuracy')});
  it('preserves manual overrides',()=>{const answers={environment:'indoor'} as Questionnaire;const result=applyInference(answers,inferBrief('outdoor bracket',''),new Set(['environment']));expect(result.environment).toBe('indoor')});
});
