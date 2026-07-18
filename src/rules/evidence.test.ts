import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import rulesText from '../../rules/mvp-rules.yaml?raw';
import evidenceText from '../../rules/rule-evidence.yaml?raw';
import sourcesText from '../../rules/evidence-sources.yaml?raw';
import type { Rule } from '../types';

interface EvidenceSource {
  id: string;
  type: string;
  title: string;
  url: string;
  accessed: string;
  supports: string;
  limitations: string;
}

interface RuleEvidence {
  ruleId: string;
  status: string;
  evidenceLevel: 'A' | 'B' | 'C' | 'D';
  sourceIds: string[];
  supportedClaim: string;
  unsupportedSpecifics: string;
  experimentPriority: 'low' | 'medium' | 'high' | 'critical';
}

const unique = (values: string[]) => new Set(values).size === values.length;

describe('rule evidence catalog', () => {
  const rules = YAML.parse(rulesText) as Rule[];
  const evidence = YAML.parse(evidenceText) as RuleEvidence[];
  const sources = YAML.parse(sourcesText) as EvidenceSource[];

  it('covers every MVP rule exactly once', () => {
    const ruleIds = rules.map(rule => rule.id).sort();
    const evidenceIds = evidence.map(entry => entry.ruleId).sort();
    expect(unique(ruleIds)).toBe(true);
    expect(unique(evidenceIds)).toBe(true);
    expect(evidenceIds).toEqual(ruleIds);
  });

  it('references complete and unique source records', () => {
    const sourceIds = sources.map(source => source.id);
    const knownSources = new Set(sourceIds);
    expect(unique(sourceIds)).toBe(true);
    for (const source of sources) {
      expect(source.title.trim()).not.toBe('');
      expect(source.supports.trim()).not.toBe('');
      expect(source.limitations.trim()).not.toBe('');
      expect(source.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(() => new URL(source.url)).not.toThrow();
      expect(source.url.startsWith('https://')).toBe(true);
    }
    for (const entry of evidence) {
      for (const sourceId of entry.sourceIds) expect(knownSources.has(sourceId)).toBe(true);
    }
  });

  it('keeps unvalidated MVP rules explicitly provisional', () => {
    for (const entry of evidence) {
      expect(entry.status.startsWith('provisional')).toBe(true);
      expect(['A', 'B', 'C', 'D']).toContain(entry.evidenceLevel);
      expect(['low', 'medium', 'high', 'critical']).toContain(entry.experimentPriority);
      expect(entry.supportedClaim.trim()).not.toBe('');
      expect(entry.unsupportedSpecifics.trim()).not.toBe('');
    }
    expect(evidence.some(entry => entry.evidenceLevel === 'A')).toBe(false);
  });
});
