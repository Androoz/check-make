import { semanticVocabularyVersion } from './types';

export const validSemanticInterpretation = {
  schemaVersion: 2,
  vocabularyVersion: semanticVocabularyVersion,
  objectIdentity: {
    value: 'parasol base spacer',
    certainty: 'strong_hypothesis',
    basis: 'combined',
    evidence: '“Distance for a parasol base” commonly describes a spacer.',
    needsConfirmation: true,
  },
  parentSystem: {
    value: 'parasol base assembly',
    certainty: 'strong_hypothesis',
    basis: 'world_knowledge',
    evidence: 'The description places the spacer in a parasol base assembly.',
    needsConfirmation: true,
  },
  primaryFunction: {
    value: 'create spacing between two components',
    certainty: 'strong_hypothesis',
    basis: 'world_knowledge',
    evidence: 'The word “distance” may refer to a spacing function.',
    needsConfirmation: true,
  },
  candidateFacts: [{
    key: 'primary_function',
    value: 'space',
    certainty: 'strong_hypothesis',
    basis: 'world_knowledge',
    evidence: 'The description may refer to creating spacing.',
    needsConfirmation: true,
  }],
  uncertainties: ['The supported parts and operating environment are not stated.'],
  conflicts: [],
  confirmationQuestions: [{
    id: 'confirm-spacing',
    question: 'Does this part create spacing between two components?',
    why: 'The wording is ambiguous.',
    factKeys: ['primary_function'],
  }],
};
