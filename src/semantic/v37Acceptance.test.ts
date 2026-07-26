import { describe, expect, it } from 'vitest';
import { evaluateV37Acceptance, v37AcceptanceScenarios } from '../../validation/semantic/v37-acceptance';

describe('Interpretation v3.7 release acceptance', () => {
  it('covers diverse functional, environmental, mechanical, interface, and abstention scenarios', () => {
    expect(v37AcceptanceScenarios.length).toBeGreaterThanOrEqual(30);
    expect(new Set(v37AcceptanceScenarios.map(item => item.id)).size).toBe(v37AcceptanceScenarios.length);
  });

  it('meets the deterministic quality gate without forbidden facts or missed critical questions', () => {
    const report = evaluateV37Acceptance();
    expect(report.falsePositiveCount, JSON.stringify(report.failures, null, 2)).toBe(0);
    expect(report.criticalQuestionMisses, JSON.stringify(report.failures, null, 2)).toBe(0);
    expect(report.score, JSON.stringify(report.failures, null, 2)).toBeGreaterThanOrEqual(0.97);
  });
});

