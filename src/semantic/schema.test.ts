import { describe, expect, it } from 'vitest';
import { SemanticSchemaError, validateSemanticInterpretation } from './schema';
import { validSemanticInterpretation } from './testFixtures';

describe('semantic interpretation schema', () => {
  it('accepts the versioned closed vocabulary', () => {
    expect(validateSemanticInterpretation(validSemanticInterpretation).candidateFacts[0]).toMatchObject({
      key: 'primary_function',
      value: 'space',
    });
  });

  it('rejects unknown keys, values, and extra output fields', () => {
    expect(() => validateSemanticInterpretation({
      ...validSemanticInterpretation,
      candidateFacts: [{ ...validSemanticInterpretation.candidateFacts[0], key: 'material.choice' }],
    })).toThrow(SemanticSchemaError);
    expect(() => validateSemanticInterpretation({
      ...validSemanticInterpretation,
      candidateFacts: [{ ...validSemanticInterpretation.candidateFacts[0], value: 'PETG' }],
    })).toThrow(SemanticSchemaError);
    expect(() => validateSemanticInterpretation({ ...validSemanticInterpretation, recommendation: 'Use PETG' })).toThrow(/unknown field/);
  });

  it('preserves an optional structured evidence path for graph conclusions', () => {
    const value = structuredClone(validSemanticInterpretation);
    value.candidateFacts[0] = {
      ...value.candidateFacts[0],
      evidencePath: [
        { kind: 'text_match', value: 'spacer' },
        { kind: 'relation', value: 'used_for:camping-chair' },
        { kind: 'property', value: 'priority=strength' },
      ],
    };
    expect(validateSemanticInterpretation(value).candidateFacts[0].evidencePath).toEqual(value.candidateFacts[0].evidencePath);
  });
});
