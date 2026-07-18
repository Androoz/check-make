import YAML from 'yaml';
import rulesText from '../../rules/mvp-rules.yaml?raw';
import evidenceText from '../../rules/rule-evidence.yaml?raw';
import type { Rule, RuleEvidenceRecord } from '../types';
export const rules = YAML.parse(rulesText) as Rule[];
export const ruleEvidence = YAML.parse(evidenceText) as RuleEvidenceRecord[];
export const ruleEvidenceById = Object.fromEntries(ruleEvidence.map(record => [record.ruleId, record])) as Record<string, RuleEvidenceRecord>;
