import {
  semanticFactVocabulary,
  semanticVocabularyVersion,
  type CandidateFact,
  type SemanticBasis,
  type SemanticCertainty,
  type SemanticConfirmationQuestion,
  type SemanticConflict,
  type SemanticFactKey,
  type SemanticEvidenceStep,
  type SemanticInterpretation,
  type SemanticProposal,
} from './types';

export class SemanticSchemaError extends Error {
  constructor(message: string) {
    super(`Invalid semantic interpretation: ${message}`);
    this.name = 'SemanticSchemaError';
  }
}

const certainties = ['explicit', 'strong_hypothesis', 'weak_hypothesis', 'unknown'] as const;
const bases = ['user_description', 'geometry', 'filename', 'world_knowledge', 'combined'] as const;

function record(value: unknown, path: string, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SemanticSchemaError(`${path} must be an object.`);
  const candidate = value as Record<string, unknown>;
  const unknownKeys = Object.keys(candidate).filter(key => !keys.includes(key));
  if (unknownKeys.length) throw new SemanticSchemaError(`${path} contains unknown field(s): ${unknownKeys.join(', ')}.`);
  return candidate;
}

function text(value: unknown, path: string, maximum = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new SemanticSchemaError(`${path} must be a non-empty string up to ${maximum} characters.`);
  return value.trim();
}

function stringList(value: unknown, path: string, maximum = 12) {
  if (!Array.isArray(value) || value.length > maximum) throw new SemanticSchemaError(`${path} must be an array with at most ${maximum} items.`);
  return value.map((item, index) => text(item, `${path}[${index}]`));
}

function oneOf<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new SemanticSchemaError(`${path} has an unsupported value.`);
  return value as T;
}

function factKey(value: unknown, path: string): SemanticFactKey {
  return oneOf(value, Object.keys(semanticFactVocabulary) as SemanticFactKey[], path);
}

function proposal(value: unknown, path: string): SemanticProposal {
  const item = record(value, path, ['value', 'certainty', 'basis', 'evidence', 'needsConfirmation']);
  return {
    value: text(item.value, `${path}.value`, 160),
    certainty: oneOf(item.certainty, certainties, `${path}.certainty`) as SemanticCertainty,
    basis: oneOf(item.basis, bases, `${path}.basis`) as SemanticBasis,
    evidence: text(item.evidence, `${path}.evidence`),
    needsConfirmation: typeof item.needsConfirmation === 'boolean'
      ? item.needsConfirmation
      : (() => { throw new SemanticSchemaError(`${path}.needsConfirmation must be boolean.`); })(),
  };
}

function candidateFact(value: unknown, path: string): CandidateFact {
  const item = record(value, path, ['key', 'value', 'certainty', 'basis', 'evidence', 'evidencePath', 'needsConfirmation']);
  const key = factKey(item.key, `${path}.key`);
  const allowedValues = semanticFactVocabulary[key] as readonly string[];
  let evidencePath: SemanticEvidenceStep[] | undefined;
  if (item.evidencePath !== undefined) {
    if (!Array.isArray(item.evidencePath) || !item.evidencePath.length || item.evidencePath.length > 12) {
      throw new SemanticSchemaError(`${path}.evidencePath must contain 1–12 steps.`);
    }
    evidencePath = item.evidencePath.map((step, index) => {
      const parsed = record(step, `${path}.evidencePath[${index}]`, ['kind', 'value']);
      return {
        kind: oneOf(parsed.kind, ['text_match', 'concept', 'relation', 'inheritance', 'composition', 'property'] as const, `${path}.evidencePath[${index}].kind`),
        value: text(parsed.value, `${path}.evidencePath[${index}].value`, 180),
      };
    });
  }
  return {
    key,
    value: oneOf(item.value, allowedValues, `${path}.value`) as CandidateFact['value'],
    certainty: oneOf(item.certainty, certainties, `${path}.certainty`) as SemanticCertainty,
    basis: oneOf(item.basis, bases, `${path}.basis`) as SemanticBasis,
    evidence: text(item.evidence, `${path}.evidence`),
    ...(evidencePath ? { evidencePath } : {}),
    needsConfirmation: typeof item.needsConfirmation === 'boolean'
      ? item.needsConfirmation
      : (() => { throw new SemanticSchemaError(`${path}.needsConfirmation must be boolean.`); })(),
  };
}

function conflict(value: unknown, path: string): SemanticConflict {
  const item = record(value, path, ['factKeys', 'observation']);
  if (!Array.isArray(item.factKeys) || !item.factKeys.length || item.factKeys.length > 6) throw new SemanticSchemaError(`${path}.factKeys must contain 1–6 keys.`);
  return {
    factKeys: item.factKeys.map((key, index) => factKey(key, `${path}.factKeys[${index}]`)),
    observation: text(item.observation, `${path}.observation`),
  };
}

function question(value: unknown, path: string): SemanticConfirmationQuestion {
  const item = record(value, path, ['id', 'question', 'why', 'factKeys']);
  if (!Array.isArray(item.factKeys) || !item.factKeys.length || item.factKeys.length > 6) throw new SemanticSchemaError(`${path}.factKeys must contain 1–6 keys.`);
  return {
    id: text(item.id, `${path}.id`, 100),
    question: text(item.question, `${path}.question`),
    why: text(item.why, `${path}.why`),
    factKeys: item.factKeys.map((key, index) => factKey(key, `${path}.factKeys[${index}]`)),
  };
}

export function validateSemanticInterpretation(value: unknown): SemanticInterpretation {
  const root = record(value, 'root', [
    'schemaVersion', 'vocabularyVersion', 'objectIdentity', 'parentSystem', 'primaryFunction',
    'candidateFacts', 'uncertainties', 'conflicts', 'confirmationQuestions',
  ]);
  if (root.schemaVersion !== 2) throw new SemanticSchemaError('schemaVersion must be 2.');
  if (root.vocabularyVersion !== semanticVocabularyVersion) throw new SemanticSchemaError(`vocabularyVersion must be ${semanticVocabularyVersion}.`);
  if (!Array.isArray(root.candidateFacts) || root.candidateFacts.length > 24) throw new SemanticSchemaError('candidateFacts must contain at most 24 items.');
  if (!Array.isArray(root.conflicts) || root.conflicts.length > 8) throw new SemanticSchemaError('conflicts must contain at most 8 items.');
  if (!Array.isArray(root.confirmationQuestions) || root.confirmationQuestions.length > 8) throw new SemanticSchemaError('confirmationQuestions must contain at most 8 items.');
  return {
    schemaVersion: 2,
    vocabularyVersion: semanticVocabularyVersion,
    objectIdentity: proposal(root.objectIdentity, 'objectIdentity'),
    parentSystem: proposal(root.parentSystem, 'parentSystem'),
    primaryFunction: proposal(root.primaryFunction, 'primaryFunction'),
    candidateFacts: root.candidateFacts.map((item, index) => candidateFact(item, `candidateFacts[${index}]`)),
    uncertainties: stringList(root.uncertainties, 'uncertainties'),
    conflicts: root.conflicts.map((item, index) => conflict(item, `conflicts[${index}]`)),
    confirmationQuestions: root.confirmationQuestions.map((item, index) => question(item, `confirmationQuestions[${index}]`)),
  };
}

export const semanticOutputSchemaDescription = {
  schemaVersion: 2,
  vocabularyVersion: semanticVocabularyVersion,
  objectIdentity: { value: 'string', certainty: certainties, basis: bases, evidence: 'string', needsConfirmation: 'boolean' },
  parentSystem: { value: 'string', certainty: certainties, basis: bases, evidence: 'string', needsConfirmation: 'boolean' },
  primaryFunction: { value: 'string', certainty: certainties, basis: bases, evidence: 'string', needsConfirmation: 'boolean' },
  candidateFacts: Object.fromEntries(Object.entries(semanticFactVocabulary)),
  candidateFactShape: { key: 'vocabulary key', value: 'allowed value for key', certainty: certainties, basis: bases, evidence: 'string', evidencePath: [{ kind: 'string', value: 'string' }], needsConfirmation: 'boolean' },
  uncertainties: ['string'],
  conflicts: [{ factKeys: ['vocabulary key'], observation: 'string' }],
  confirmationQuestions: [{ id: 'string', question: 'string', why: 'string', factKeys: ['vocabulary key'] }],
};

const factKeys = Object.keys(semanticFactVocabulary);
const factValues = [...new Set(Object.values(semanticFactVocabulary).flat())];
const proposalSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'certainty', 'basis', 'evidence', 'needsConfirmation'],
  properties: {
    value: { type: 'string', minLength: 1, maxLength: 160 },
    certainty: { type: 'string', enum: certainties },
    basis: { type: 'string', enum: bases },
    evidence: { type: 'string', minLength: 1, maxLength: 500 },
    needsConfirmation: { type: 'boolean' },
  },
} as const;

export const semanticJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'vocabularyVersion', 'objectIdentity', 'parentSystem', 'primaryFunction', 'candidateFacts', 'uncertainties', 'conflicts', 'confirmationQuestions'],
  properties: {
    schemaVersion: { type: 'integer', const: 2 },
    vocabularyVersion: { type: 'integer', const: semanticVocabularyVersion },
    objectIdentity: proposalSchema,
    parentSystem: proposalSchema,
    primaryFunction: proposalSchema,
    candidateFacts: {
      type: 'array',
      maxItems: 24,
      items: {
        ...proposalSchema,
        required: ['key', 'value', 'certainty', 'basis', 'evidence', 'needsConfirmation'],
        properties: {
          key: { type: 'string', enum: factKeys },
          value: { type: 'string', enum: factValues },
          certainty: { type: 'string', enum: certainties },
          basis: { type: 'string', enum: bases },
          evidence: { type: 'string', minLength: 1, maxLength: 500 },
          evidencePath: {
            type: 'array', minItems: 1, maxItems: 12,
            items: {
              type: 'object', additionalProperties: false, required: ['kind', 'value'],
              properties: {
                kind: { type: 'string', enum: ['text_match', 'concept', 'relation', 'inheritance', 'composition', 'property'] },
                value: { type: 'string', minLength: 1, maxLength: 180 },
              },
            },
          },
          needsConfirmation: { type: 'boolean' },
        },
      },
    },
    uncertainties: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 500 } },
    conflicts: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['factKeys', 'observation'],
        properties: {
          factKeys: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', enum: factKeys } },
          observation: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
    },
    confirmationQuestions: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'question', 'why', 'factKeys'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 100 },
          question: { type: 'string', minLength: 1, maxLength: 500 },
          why: { type: 'string', minLength: 1, maxLength: 500 },
          factKeys: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', enum: factKeys } },
        },
      },
    },
  },
} as const;
