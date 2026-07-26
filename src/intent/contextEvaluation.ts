import { interpretBriefV3 } from './inferBrief';
import type { ChecklistField, Questionnaire } from '../types';

export interface ContextCorpusCase {
  id: string;
  language: 'en';
  text: string;
  expected?: Partial<{ [K in ChecklistField]: Questionnaire[K] }>;
  expectedUnknown?: ChecklistField[];
  expectedIssues?: ChecklistField[];
  expectedFacets?: string[];
  expectedAbsentFacets?: string[];
  expectedLanguageCues?: string[];
  expectedCorrections?: string[];
}

export interface ContextCorpus {
  schemaVersion: 1;
  corpusVersion: string;
  description: string;
  cases: ContextCorpusCase[];
}

export interface ContextCaseEvaluation {
  id: string;
  correctConfirmations: number;
  expectedConfirmations: number;
  falseConfirmations: string[];
  missedConfirmations: string[];
  missingIssues: ChecklistField[];
  missingFacets: string[];
  unexpectedFacets: string[];
  missingLanguageCues: string[];
  missingCorrections: string[];
}

export interface ContextCorpusEvaluation {
  caseCount: number;
  confirmationCoverage: number;
  falseConfirmationRate: number;
  unknownAbstentionRate: number;
  issueCoverage: number;
  facetCoverage: number;
  languageCueCoverage: number;
  correctionCoverage: number;
  falseConfirmationCount: number;
  results: ContextCaseEvaluation[];
}

const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : 1;

export function evaluateContextCorpus(corpus: ContextCorpus): ContextCorpusEvaluation {
  let expectedConfirmations = 0;
  let correctConfirmations = 0;
  let unknownExpectations = 0;
  let correctUnknowns = 0;
  let issueExpectations = 0;
  let correctIssues = 0;
  let facetExpectations = 0;
  let correctFacets = 0;
  let scoredExpectations = 0;
  let falseConfirmationCount = 0;
  let languageCueExpectations = 0;
  let correctLanguageCues = 0;
  let correctionExpectations = 0;
  let correctCorrections = 0;

  const results = corpus.cases.map(testCase => {
    const interpretation = interpretBriefV3(testCase.text, '');
    const falseConfirmations: string[] = [];
    const missedConfirmations: string[] = [];
    const expected = testCase.expected ?? {};
    (Object.keys(expected) as ChecklistField[]).forEach(field => {
      expectedConfirmations += 1; scoredExpectations += 1;
      const actual = interpretation.inference[field].value;
      if (actual === expected[field]) correctConfirmations += 1;
      else if (actual === 'unknown') missedConfirmations.push(field);
      else { falseConfirmations.push(`${field}:${String(actual)}`); falseConfirmationCount += 1; }
    });
    (testCase.expectedUnknown ?? []).forEach(field => {
      unknownExpectations += 1; scoredExpectations += 1;
      const actual = interpretation.inference[field].value;
      if (actual === 'unknown') correctUnknowns += 1;
      else { falseConfirmations.push(`${field}:${String(actual)}`); falseConfirmationCount += 1; }
    });

    const issueFields = new Set<ChecklistField>([
      ...interpretation.conflicts.map(issue => issue.field),
      ...interpretation.ambiguities.map(issue => issue.field),
    ]);
    const missingIssues = (testCase.expectedIssues ?? []).filter(field => !issueFields.has(field));
    issueExpectations += testCase.expectedIssues?.length ?? 0;
    correctIssues += (testCase.expectedIssues?.length ?? 0) - missingIssues.length;

    const facetIds = new Set(interpretation.facets.map(facet => facet.id));
    const missingFacets = (testCase.expectedFacets ?? []).filter(id => !facetIds.has(id));
    const unexpectedFacets = (testCase.expectedAbsentFacets ?? []).filter(id => facetIds.has(id));
    facetExpectations += (testCase.expectedFacets?.length ?? 0) + (testCase.expectedAbsentFacets?.length ?? 0);
    correctFacets += (testCase.expectedFacets?.length ?? 0) - missingFacets.length;
    correctFacets += (testCase.expectedAbsentFacets?.length ?? 0) - unexpectedFacets.length;

    const languageCueDomains = new Set(interpretation.languageCues.map(cue => cue.domain));
    const missingLanguageCues = (testCase.expectedLanguageCues ?? []).filter(domain => !languageCueDomains.has(domain as 'chemical' | 'food-contact' | 'safety'));
    languageCueExpectations += testCase.expectedLanguageCues?.length ?? 0;
    correctLanguageCues += (testCase.expectedLanguageCues?.length ?? 0) - missingLanguageCues.length;
    const correctionIds = new Set(interpretation.corrections.map(correction => correction.ruleId));
    const missingCorrections = (testCase.expectedCorrections ?? []).filter(ruleId => !correctionIds.has(ruleId));
    correctionExpectations += testCase.expectedCorrections?.length ?? 0;
    correctCorrections += (testCase.expectedCorrections?.length ?? 0) - missingCorrections.length;

    return {
      id: testCase.id,
      correctConfirmations: (Object.keys(expected) as ChecklistField[]).filter(field => interpretation.inference[field].value === expected[field]).length,
      expectedConfirmations: Object.keys(expected).length,
      falseConfirmations, missedConfirmations, missingIssues, missingFacets, unexpectedFacets, missingLanguageCues, missingCorrections,
    };
  });

  return {
    caseCount: corpus.cases.length,
    confirmationCoverage: ratio(correctConfirmations, expectedConfirmations),
    falseConfirmationRate: ratio(falseConfirmationCount, scoredExpectations),
    unknownAbstentionRate: ratio(correctUnknowns, unknownExpectations),
    issueCoverage: ratio(correctIssues, issueExpectations),
    facetCoverage: ratio(correctFacets, facetExpectations),
    languageCueCoverage: ratio(correctLanguageCues, languageCueExpectations),
    correctionCoverage: ratio(correctCorrections, correctionExpectations),
    falseConfirmationCount,
    results,
  };
}
