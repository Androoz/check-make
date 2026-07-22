import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateContextCorpus } from '../../src/intent/contextEvaluation';
import type { ContextCorpus } from '../../src/intent/contextEvaluation';

const corpusPath = resolve('validation/interpretation/context-corpus.v1.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as ContextCorpus;
const report = evaluateContextCorpus(corpus);
const failures = report.results.filter(result => result.falseConfirmations.length || result.missedConfirmations.length || result.missingIssues.length || result.missingFacets.length || result.unexpectedFacets.length || result.missingLanguageCues.length || result.missingCorrections.length);

console.log(JSON.stringify({
  corpusVersion: corpus.corpusVersion,
  caseCount: report.caseCount,
  confirmationCoverage: report.confirmationCoverage,
  falseConfirmationRate: report.falseConfirmationRate,
  unknownAbstentionRate: report.unknownAbstentionRate,
  issueCoverage: report.issueCoverage,
  facetCoverage: report.facetCoverage,
  languageCueCoverage: report.languageCueCoverage,
  correctionCoverage: report.correctionCoverage,
  failures,
}, null, 2));

if (report.falseConfirmationRate > 0 || failures.length) process.exitCode = 1;
