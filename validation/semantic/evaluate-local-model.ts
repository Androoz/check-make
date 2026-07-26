import { readFile } from 'node:fs/promises';
import { LlamaCppSemanticInterpreter } from '../../src/semantic/llamaCpp';
import type { SemanticFactKey, SemanticInterpretationInput } from '../../src/semantic/types';

interface ExpectedCandidate {
  key: SemanticFactKey;
  value: string;
  certainty?: string;
}

interface EvalCase {
  id: string;
  language: string;
  text: string;
  equivalentTo?: string;
  expectedCandidates?: ExpectedCandidate[];
  forbiddenCandidates?: Array<Pick<ExpectedCandidate, 'key' | 'value'>>;
  expectedConflictKeys?: SemanticFactKey[];
  expectedUnknown?: SemanticFactKey[];
}

const corpusPath = new URL('./local-semantic-v1-corpus.json', import.meta.url);
const corpus = JSON.parse(await readFile(corpusPath, 'utf8')) as { cases: EvalCase[] };
const endpoint = process.env.CHECK_MAKE_LLAMA_ENDPOINT ?? 'http://localhost:8080';
const model = process.env.CHECK_MAKE_LLAMA_MODEL ?? 'local-model';
const interpreter = new LlamaCppSemanticInterpreter({ endpoint, model, timeoutMs: 120_000 });
const results = new Map<string, Awaited<ReturnType<typeof interpreter.interpret>>>();
let passedChecks = 0;
let totalChecks = 0;

for (const testCase of corpus.cases) {
  const input: SemanticInterpretationInput = {
    description: testCase.text,
    language: testCase.language,
    filename: { value: 'candidate-part.stl', certainty: 'uncertain' },
    dimensionsMm: { x: 40, y: 40, z: 8 },
    geometryObservations: [
      'Triangle mesh dimensions are 40.0 × 40.0 × 8.0 mm.',
      'The mesh is a single component. Geometry does not establish identity or use.',
    ],
    confirmedManufacturingContext: { facts: [] },
  };
  const interpretation = await interpreter.interpret(input);
  results.set(testCase.id, interpretation);
  const actual = new Set(interpretation.candidateFacts.map(fact => `${fact.key}:${fact.value}:${fact.certainty}`));
  const actualWithoutCertainty = new Set(interpretation.candidateFacts.map(fact => `${fact.key}:${fact.value}`));
  const check = (condition: boolean) => { totalChecks += 1; if (condition) passedChecks += 1; };
  (testCase.expectedCandidates ?? []).forEach(candidate =>
    check(candidate.certainty
      ? actual.has(`${candidate.key}:${candidate.value}:${candidate.certainty}`)
      : actualWithoutCertainty.has(`${candidate.key}:${candidate.value}`)));
  (testCase.forbiddenCandidates ?? []).forEach(candidate => check(!actualWithoutCertainty.has(`${candidate.key}:${candidate.value}`)));
  (testCase.expectedConflictKeys ?? []).forEach(key => check(interpretation.conflicts.some(conflict => conflict.factKeys.includes(key))));
  (testCase.expectedUnknown ?? []).forEach(key => check(!interpretation.candidateFacts.some(fact => fact.key === key && fact.certainty !== 'unknown')));
}

for (const testCase of corpus.cases.filter(item => item.equivalentTo)) {
  const left = results.get(testCase.id);
  const right = results.get(testCase.equivalentTo!);
  const relevant = (value: typeof left) => new Set(value?.candidateFacts.filter(fact => fact.certainty !== 'unknown').map(fact => `${fact.key}:${fact.value}`));
  const leftFacts = relevant(left);
  const rightFacts = relevant(right);
  totalChecks += 1;
  if ([...leftFacts].every(fact => rightFacts.has(fact)) && [...rightFacts].every(fact => leftFacts.has(fact))) passedChecks += 1;
}

const score = totalChecks ? passedChecks / totalChecks : 0;
console.log(JSON.stringify({
  provider: interpreter.provider,
  cases: corpus.cases.length,
  passedChecks,
  totalChecks,
  score,
  note: 'A live-model benchmark result; it is not part of the deterministic unit-test guarantee.',
}, null, 2));
if (score < 1) process.exitCode = 1;
