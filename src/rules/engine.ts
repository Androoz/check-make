import type { DecisionTraceEntry, EvidenceLevel, ModelAnalysis, OptimizationObjective, Questionnaire, Recommendation, Rule, RuleAction, RuleEvidenceRecord } from '../types';
import { analyzePurpose } from '../intent/analyzePurpose';
import { englishReasons } from './reasons';

const get = (ctx: unknown, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], ctx);

const matches = (actual: unknown, op: string, expected: unknown) => {
  if (op === 'eq') return actual === expected;
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  return op === 'gte' ? actual >= expected : op === 'lte' ? actual <= expected : op === 'gt' ? actual > expected : actual < expected;
};

const merge = (current: RuleAction | undefined, next: RuleAction): RuleAction => {
  if (!current || !next.mode || next.mode === 'set') return next;
  if (typeof current.value !== 'number' || typeof next.value !== 'number') return next;
  return next.mode === 'min'
    ? { ...next, value: Math.max(current.value, next.value) }
    : { ...next, value: Math.min(current.value, next.value) };
};

const sameValue = (left: RuleAction['value'], right: RuleAction['value']) => Object.is(left, right);

interface AppliedRule {
  rule: Rule;
  action: RuleAction;
  resultingValue: RuleAction['value'];
  changed: boolean;
}

const evidenceLevel = (rules: Rule[], evidence: Record<string, RuleEvidenceRecord>): EvidenceLevel => {
  const rank: Record<EvidenceLevel, number> = { A: 0, B: 1, C: 2, D: 3 };
  return rules.reduce<EvidenceLevel>((weakest, rule) => {
    const level = evidence[rule.id]?.evidenceLevel ?? 'D';
    return rank[level] > rank[weakest] ? level : weakest;
  }, 'A');
};

const validationStatus = (rules: Rule[], evidence: Record<string, RuleEvidenceRecord>) => {
  if (rules.some(rule => !evidence[rule.id])) return 'unreviewed';
  if (rules.some(rule => evidence[rule.id].status.includes('contested'))) return 'provisional-contested';
  const statuses = [...new Set(rules.map(rule => evidence[rule.id].status))];
  return statuses.length === 1 ? statuses[0] : statuses.join(' + ');
};

export function evaluateRules(
  rules: Rule[],
  analysis: ModelAnalysis,
  answers: Questionnaire,
  evidence: Record<string, RuleEvidenceRecord> = {},
  objective: OptimizationObjective = 'recommended',
): Recommendation[] {
  const ctx = { analysis, answers, objective, intent: analyzePurpose(`${answers.purpose} ${answers.properties}`) };
  const selected = new Map<Recommendation['setting'], { action: RuleAction; applied: AppliedRule[] }>();

  for (const rule of [...rules].sort((left, right) => left.priority - right.priority)) {
    if (!rule.conditions.every(condition => matches(get(ctx, condition.path), condition.op, condition.value))) continue;
    for (const rawAction of rule.actions) {
      const action = typeof rawAction.value === 'string' && rawAction.value.startsWith('$')
        ? { ...rawAction, value: get(ctx, rawAction.value.slice(1)) as RuleAction['value'] }
        : rawAction;
      const setting = action.setting as Recommendation['setting'];
      const previous = selected.get(setting);
      const merged = merge(previous?.action, action);
      selected.set(setting, {
        action: merged,
        applied: [
          ...(previous?.applied ?? []),
          { rule, action, resultingValue: merged.value, changed: !previous || !sameValue(previous.action.value, merged.value) },
        ],
      });
    }
  }

  return [...selected.entries()].map(([setting, hit]) => {
    let activeIndex = 0;
    hit.applied.forEach((entry, index) => { if (entry.changed) activeIndex = index; });
    const trace: DecisionTraceEntry[] = hit.applied.map((entry, index) => {
      const state: DecisionTraceEntry['state'] = index === activeIndex
        ? 'active'
        : sameValue(entry.action.value, hit.action.value) ? 'supporting' : 'superseded';
      const mode = entry.action.mode ?? 'set';
      const numericConflict = typeof entry.action.value === 'number' && typeof hit.action.value === 'number'
        && ((mode === 'min' && hit.action.value < entry.action.value) || (mode === 'max' && hit.action.value > entry.action.value));
      return {
        ruleId: entry.rule.id,
        state,
        conflictsWithFinal: state === 'superseded' && (mode === 'set' || numericConflict),
        proposedValue: entry.action.value,
        resultingValue: entry.resultingValue,
      };
    });
    const activeRules = hit.applied.filter((_, index) => trace[index].state !== 'superseded').map(entry => entry.rule);
    return {
      setting,
      value: hit.action.value,
      reason: activeRules.map(rule => englishReasons[rule.id] ?? rule.reason).join(' '),
      ruleIds: activeRules.map(rule => rule.id),
      matchedRuleIds: hit.applied.map(entry => entry.rule.id),
      evidenceLevel: evidenceLevel(activeRules, evidence),
      validationStatus: validationStatus(activeRules, evidence),
      trace,
    };
  });
}
