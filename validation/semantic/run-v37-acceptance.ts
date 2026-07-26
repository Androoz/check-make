import { evaluateV37Acceptance } from './v37-acceptance';

const report = evaluateV37Acceptance();
console.log(JSON.stringify(report, null, 2));

if (report.score < 0.97 || report.falsePositiveCount > 0 || report.criticalQuestionMisses > 0) {
  process.exitCode = 1;
}

