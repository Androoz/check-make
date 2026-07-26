import type { ModelAnalysis } from '../types';

export const semanticVocabularyVersion = 3 as const;

export const semanticFactVocabulary = {
  'environment.location': ['indoor', 'outdoor'],
  'environment.exposure': ['uv', 'moisture', 'chemical', 'food_contact'],
  'environment.service': ['continuous_outdoor', 'intermittent_outdoor', 'washed', 'dishwasher'],
  'thermal.exposure': ['freezing', 'normal', 'warm', 'hot'],
  'primary_function': ['connect', 'hold', 'protect', 'display', 'move', 'space', 'seal', 'guide', 'mount', 'support', 'contain', 'fasten', 'grip', 'transmit', 'other'],
  'load.type': ['none', 'static', 'cyclic', 'impact'],
  'load.role': ['load_bearing', 'non_load_bearing', 'unknown'],
  'load.magnitude': ['light', 'moderate', 'heavy', 'quantified'],
  'impact.severity': ['none', 'medium', 'high'],
  'mechanical.wear': ['sliding', 'abrasive'],
  'interface.fit': ['press', 'sliding', 'snap', 'threaded', 'sealing', 'clearance'],
  'interface.mating': ['true', 'false'],
  'pressure.exposure': ['internal', 'external'],
  'electrical.requirement': ['insulating'],
  flexibility: ['rigid', 'flexible'],
  'appearance.requirement': ['none', 'visible_surface', 'finish_critical'],
  'failure.consequence': ['non_critical', 'safety_critical', 'unknown'],
  lifetime: ['temporary', 'long_term'],
  priority: ['strength', 'accuracy', 'finish', 'speed', 'flexibility', 'cost', 'weight'],
} as const;

export type SemanticFactKey = keyof typeof semanticFactVocabulary;
export type SemanticFactValue = (typeof semanticFactVocabulary)[SemanticFactKey][number];
export type SemanticCertainty = 'explicit' | 'strong_hypothesis' | 'weak_hypothesis' | 'unknown';
export type SemanticBasis = 'user_description' | 'geometry' | 'filename' | 'world_knowledge' | 'combined';

export interface CandidateFact {
  key: SemanticFactKey;
  value: SemanticFactValue;
  certainty: SemanticCertainty;
  basis: SemanticBasis;
  evidence: string;
  needsConfirmation: boolean;
}

export interface SemanticProposal {
  value: string;
  certainty: SemanticCertainty;
  basis: SemanticBasis;
  evidence: string;
  needsConfirmation: boolean;
}

export interface SemanticConflict {
  factKeys: SemanticFactKey[];
  observation: string;
}

export interface SemanticConfirmationQuestion {
  id: string;
  question: string;
  why: string;
  factKeys: SemanticFactKey[];
}

export interface SemanticInterpretation {
  schemaVersion: 2;
  vocabularyVersion: typeof semanticVocabularyVersion;
  objectIdentity: SemanticProposal;
  parentSystem: SemanticProposal;
  primaryFunction: SemanticProposal;
  candidateFacts: CandidateFact[];
  uncertainties: string[];
  conflicts: SemanticConflict[];
  confirmationQuestions: SemanticConfirmationQuestion[];
}

export interface ConfirmedSemanticContext {
  facts: Array<{ key: SemanticFactKey; value: SemanticFactValue; evidence: string }>;
}

export interface SemanticInterpretationInput {
  description: string;
  language: string;
  filename?: { value: string; certainty: 'uncertain' };
  dimensionsMm: ModelAnalysis['boundingBox']['size'];
  geometryObservations: string[];
  confirmedManufacturingContext: ConfirmedSemanticContext;
}

export interface SemanticInterpreter {
  interpret(input: SemanticInterpretationInput, signal?: AbortSignal): Promise<SemanticInterpretation>;
}

export interface SemanticProviderInfo {
  kind: 'llama.cpp' | 'openai';
  endpoint: string;
  model: string;
  localOnly: boolean;
}
