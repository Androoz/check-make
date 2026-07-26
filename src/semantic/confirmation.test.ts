import { describe, expect, it } from 'vitest';
import { emptyManufacturingIntent, intentFactUsable } from '../intent/manufacturingIntent';
import { evaluateRules } from '../rules/engine';
import type { ModelAnalysis, Questionnaire, Rule } from '../types';
import {
  applySemanticFactsToManufacturingIntent,
  evidenceIsGroundedInDescription,
  promotedSemanticFacts,
  semanticFactAnswerId,
} from './confirmation';
import { validSemanticInterpretation } from './testFixtures';
import type { SemanticInterpretation } from './types';

const questionnaire = {
  purpose: 'replacement part',
  properties: '',
  environment: 'unknown',
  load: 'unknown',
  impact: 'unknown',
  heat: 'unknown',
  priority: 'unknown',
  supportsAllowed: 'unknown',
} as Questionnaire;

describe('semantic confirmation gate', () => {
  it('promotes only exact grounded explicit statements without confirmation', () => {
    const interpretation: SemanticInterpretation = {
      ...validSemanticInterpretation,
      candidateFacts: [{
        key: 'environment.location', value: 'outdoor', certainty: 'explicit',
        basis: 'user_description', evidence: 'used outdoors', needsConfirmation: false,
      }],
    };
    expect(evidenceIsGroundedInDescription('used outdoors', 'A bracket used outdoors.')).toBe(true);
    expect(promotedSemanticFacts(interpretation, 'A bracket used outdoors.')).toHaveLength(1);
    expect(promotedSemanticFacts(interpretation, 'A bracket used indoors.')).toHaveLength(0);
  });

  it('does not auto-promote a positive fact from a negated phrase', () => {
    const interpretation: SemanticInterpretation = {
      ...validSemanticInterpretation,
      candidateFacts: [{
        key: 'environment.location', value: 'outdoor', certainty: 'explicit',
        basis: 'user_description', evidence: 'used outdoors', needsConfirmation: false,
      }],
    };
    expect(promotedSemanticFacts(interpretation, 'This cover will not be used outdoors.')).toEqual([]);
  });

  it('does not promote strong hypotheses until the user confirms them', () => {
    const interpretation = validSemanticInterpretation as SemanticInterpretation;
    expect(promotedSemanticFacts(interpretation, 'Distance for a parasol base')).toEqual([]);
    const fact = interpretation.candidateFacts[0];
    const confirmed = promotedSemanticFacts(interpretation, 'Distance for a parasol base', {
      [semanticFactAnswerId(fact)]: 'confirmed',
    });
    expect(confirmed[0]).toMatchObject({ key: 'primary_function', value: 'space', promotion: 'user-confirmed' });
    expect(applySemanticFactsToManufacturingIntent(emptyManufacturingIntent(questionnaire), confirmed).function)
      .toMatchObject({ value: 'creates spacing between components', status: 'confirmed' });
  });

  it('prevents an unconfirmed AI hypothesis from activating a rule', () => {
    const interpretation: SemanticInterpretation = {
      ...validSemanticInterpretation,
      candidateFacts: [{
        key: 'environment.location', value: 'outdoor', certainty: 'strong_hypothesis',
        basis: 'world_knowledge', evidence: 'A parasol may be used outside.', needsConfirmation: true,
      }],
    };
    const baseIntent = emptyManufacturingIntent(questionnaire);
    const rule: Rule = {
      id: 'semantic-outdoor-test', group: 'test', priority: 1,
      conditions: [{ path: 'intent.environment.location.value', op: 'eq', value: 'outdoor' }],
      actions: [{ setting: 'material', value: 'ASA' }],
      reason: 'Outdoor test.', confidence: 1,
    };
    const analysis = { heightMm: 10, bedContactAreaMm2: 100, overhangRatio: 0 } as ModelAnalysis;
    const unconfirmed = promotedSemanticFacts(interpretation, 'Distance for a parasol base');
    const unconfirmedIntent = applySemanticFactsToManufacturingIntent(baseIntent, unconfirmed);
    expect(intentFactUsable(unconfirmedIntent.environment.location)).toBe(false);
    expect(evaluateRules([rule], analysis, { ...questionnaire, manufacturingIntent: unconfirmedIntent })).toEqual([]);

    const fact = interpretation.candidateFacts[0];
    const confirmed = promotedSemanticFacts(interpretation, 'Distance for a parasol base', {
      [semanticFactAnswerId(fact)]: 'confirmed',
    });
    const confirmedIntent = applySemanticFactsToManufacturingIntent(baseIntent, confirmed);
    expect(intentFactUsable(confirmedIntent.environment.location)).toBe(true);
    expect(evaluateRules([rule], analysis, { ...questionnaire, manufacturingIntent: confirmedIntent })[0]?.value).toBe('ASA');
  });
});
