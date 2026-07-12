import YAML from 'yaml';
import rulesText from '../../rules/mvp-rules.yaml?raw';
import type { Rule } from '../types';
export const rules = YAML.parse(rulesText) as Rule[];
