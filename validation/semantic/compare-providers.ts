import { readFile } from 'node:fs/promises';
import { deterministicSemanticInterpretation } from '../../src/semantic/deterministic';
import { LlamaCppSemanticInterpreter } from '../../src/semantic/llamaCpp';
import { semanticJsonSchema, validateSemanticInterpretation } from '../../src/semantic/schema';
import type {
  SemanticFactKey,
  SemanticInterpretation,
  SemanticInterpretationInput,
} from '../../src/semantic/types';

interface ExpectedCandidate {
  key: SemanticFactKey;
  value: string;
  certainty?: string;
}

interface EvalCase {
  id: string;
  language: string;
  text: string;
  expectedCandidates?: ExpectedCandidate[];
  forbiddenCandidates?: Array<Pick<ExpectedCandidate, 'key' | 'value'>>;
  expectedConflictKeys?: SemanticFactKey[];
  expectedUnknown?: SemanticFactKey[];
}

interface ProviderResult {
  provider: string;
  status: 'passed' | 'failed' | 'unavailable';
  cases: number;
  checks: number;
  passedChecks: number;
  score: number | null;
  falsePositiveCount: number;
  failures?: string[];
  reason?: string;
}

const corpus = JSON.parse(
  await readFile(new URL('./local-semantic-v1-corpus.json', import.meta.url), 'utf8'),
) as { cases: EvalCase[] };

const inputFor = (testCase: EvalCase): SemanticInterpretationInput => ({
  description: testCase.text,
  language: 'en',
  filename: { value: 'candidate-part.stl', certainty: 'uncertain' },
  dimensionsMm: { x: 40, y: 40, z: 8 },
  geometryObservations: [
    'Triangle mesh dimensions are 40.0 × 40.0 × 8.0 mm.',
    'The mesh is a single component. Geometry does not establish identity or use.',
  ],
  confirmedManufacturingContext: { facts: [] },
});

async function scoreProvider(
  provider: string,
  interpret: (input: SemanticInterpretationInput) => Promise<SemanticInterpretation>,
): Promise<ProviderResult> {
  let checks = 0;
  let passedChecks = 0;
  let falsePositiveCount = 0;
  const failures: string[] = [];
  for (const testCase of corpus.cases) {
    const interpretation = await interpret(inputFor(testCase));
    const withCertainty = new Set(interpretation.candidateFacts.map(fact => `${fact.key}:${fact.value}:${fact.certainty}`));
    const facts = new Set(interpretation.candidateFacts.map(fact => `${fact.key}:${fact.value}`));
    const check = (condition: boolean, label: string, forbidden = false) => {
      checks += 1;
      if (condition) passedChecks += 1;
      else {
        failures.push(`${testCase.id}: ${label}`);
        if (forbidden) falsePositiveCount += 1;
      }
    };
    (testCase.expectedCandidates ?? []).forEach(candidate => check(
      candidate.certainty
        ? withCertainty.has(`${candidate.key}:${candidate.value}:${candidate.certainty}`)
        : facts.has(`${candidate.key}:${candidate.value}`),
      `missing ${candidate.key}:${candidate.value}${candidate.certainty ? `:${candidate.certainty}` : ''}`,
    ));
    (testCase.forbiddenCandidates ?? []).forEach(candidate =>
      check(!facts.has(`${candidate.key}:${candidate.value}`), `forbidden ${candidate.key}:${candidate.value}`, true));
    (testCase.expectedConflictKeys ?? []).forEach(key =>
      check(interpretation.conflicts.some(conflict => conflict.factKeys.includes(key)), `missing conflict ${key}`));
    (testCase.expectedUnknown ?? []).forEach(key =>
      check(!interpretation.candidateFacts.some(fact => fact.key === key && fact.certainty !== 'unknown'), `expected unknown ${key}`));
  }
  const score = checks ? passedChecks / checks : 0;
  return {
    provider,
    status: score >= 0.9 && falsePositiveCount === 0 ? 'passed' : 'failed',
    cases: corpus.cases.length,
    checks,
    passedChecks,
    score,
    falsePositiveCount,
    failures,
  };
}

function responseText(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('OpenAI returned a non-object response.');
  const object = value as Record<string, unknown>;
  if (typeof object.output_text === 'string') return object.output_text;
  const output = Array.isArray(object.output) ? object.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
        return (part as Record<string, unknown>).text as string;
      }
    }
  }
  throw new Error('OpenAI returned no semantic output text.');
}

async function openAIInterpretation(input: SemanticInterpretationInput) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.CHECK_MAKE_OPENAI_MODEL ?? 'gpt-5.4-mini',
      input: [{
        role: 'user',
        content: [{
          type: 'input_text',
          text: [
            'You are Check Make semantic interpreter v3.',
            'Return only the supplied semantic schema. Explicit facts require exact user evidence.',
            'Keep the printed object separate from its surrounding parentSystem and use parent-product knowledge only as reviewable hypotheses.',
            'World-knowledge hypotheses need confirmation. Geometry does not prove purpose.',
            'Do not recommend materials, orientation, supports, or process settings.',
            JSON.stringify(input),
          ].join('\n'),
        }],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'check_make_semantic_interpretation',
          strict: true,
          schema: semanticJsonSchema,
        },
      },
      store: false,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === 'object'
      ? (payload as { error?: { message?: string } }).error?.message
      : undefined;
    throw new Error(message ?? `OpenAI returned HTTP ${response.status}.`);
  }
  return validateSemanticInterpretation(JSON.parse(responseText(payload)));
}

async function localEndpointAvailable(endpoint: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const health = new URL(endpoint);
    health.pathname = '/health';
    const response = await fetch(health, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const results: ProviderResult[] = [];
results.push(await scoreProvider('deterministic-local', async input =>
  deterministicSemanticInterpretation(input)));

const localEndpoint = process.env.CHECK_MAKE_LLAMA_ENDPOINT ?? 'http://127.0.0.1:8080';
if (await localEndpointAvailable(localEndpoint)) {
  const local = new LlamaCppSemanticInterpreter({
    endpoint: localEndpoint,
    model: process.env.CHECK_MAKE_LLAMA_MODEL ?? 'local-model',
    timeoutMs: 120_000,
  });
  try {
    results.push(await scoreProvider('llama.cpp-live', input => local.interpret(input)));
  } catch (reason) {
    results.push({
      provider: 'llama.cpp-live', status: 'failed', cases: corpus.cases.length,
      checks: 0, passedChecks: 0, score: null, falsePositiveCount: 0, reason: String(reason),
    });
  }
} else {
  results.push({
    provider: 'llama.cpp-live', status: 'unavailable', cases: 0, checks: 0,
    passedChecks: 0, score: null, falsePositiveCount: 0,
    reason: `No healthy llama.cpp server at ${localEndpoint}.`,
  });
}

if (process.env.OPENAI_API_KEY?.trim()) {
  try {
    results.push(await scoreProvider('openai-live', openAIInterpretation));
  } catch (reason) {
    results.push({
      provider: 'openai-live', status: 'failed', cases: corpus.cases.length,
      checks: 0, passedChecks: 0, score: null, falsePositiveCount: 0, reason: String(reason),
    });
  }
} else {
  results.push({
    provider: 'openai-live', status: 'unavailable', cases: 0, checks: 0,
    passedChecks: 0, score: null, falsePositiveCount: 0,
    reason: 'OPENAI_API_KEY is not set in this process.',
  });
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  contract: 'Check Make Semantic Interpreter v3',
  results,
  interpretation: 'Unavailable providers are not counted as passed. Integration remains covered by mocked and request-shape tests.',
}, null, 2));

if (results.some(result => result.status === 'failed')) process.exitCode = 1;
