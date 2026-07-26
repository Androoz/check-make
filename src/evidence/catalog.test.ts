import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import datasetsText from '../../rules/evidence-datasets.yaml?raw';
import sourcesText from '../../rules/evidence-sources.yaml?raw';
import targetsText from '../../rules/evidence-targets.yaml?raw';
import rulesText from '../../rules/mvp-rules.yaml?raw';
import type { ExternalEvidenceDataset } from './types';
import type { Rule } from '../types';

interface Source { id: string }
interface Target { id: string; ruleIds: string[]; scope: { process: string; outcomeDomain: string } }
const unique = (values: string[]) => new Set(values).size === values.length;

describe('external evidence catalog', () => {
  const datasets = YAML.parse(datasetsText) as ExternalEvidenceDataset[];
  const sources = YAML.parse(sourcesText) as Source[];
  const targets = YAML.parse(targetsText) as Target[];
  const rules = YAML.parse(rulesText) as Rule[];
  const sourceIds = new Set(sources.map(source => source.id)); const ruleIds = new Set(rules.map(rule => rule.id));

  it('has unique, traceable dataset records with conservative integrity states', () => {
    expect(unique(datasets.map(dataset => dataset.id))).toBe(true);
    for (const dataset of datasets) {
      expect(dataset.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(() => new URL(dataset.landingPage)).not.toThrow();
      expect(dataset.limitations.trim()).not.toBe('');
      expect(dataset.sourceIds.every(id => sourceIds.has(id))).toBe(true);
      expect(dataset.ruleIds.every(id => ruleIds.has(id))).toBe(true);
      if (dataset.integrity === 'checksum-verified') {
        expect(dataset.localPath).toBeTruthy(); expect(dataset.sha256).toMatch(/^[0-9a-f]{64}$/);
        const path = resolve(dataset.localPath!); expect(existsSync(path)).toBe(true);
        expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(dataset.sha256);
      } else {
        expect(dataset.localPath).toBeUndefined(); expect(dataset.sha256).toBeUndefined();
      }
    }
  });

  it('declares reference targets only for known rules and material extrusion outcomes', () => {
    expect(unique(targets.map(target => target.id))).toBe(true);
    for (const target of targets) {
      expect(target.ruleIds.every(id => ruleIds.has(id))).toBe(true);
      expect(target.scope.process).toBe('material-extrusion');
      expect(target.scope.outcomeDomain.trim()).not.toBe('');
    }
  });
});

