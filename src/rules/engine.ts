import type { ModelAnalysis, Questionnaire, Recommendation, Rule, RuleAction } from '../types';
import { analyzePurpose } from '../intent/analyzePurpose';
import { englishReasons } from './reasons';

const get = (ctx: unknown, path: string) => path.split('.').reduce<unknown>((v, key) => (v as Record<string, unknown>)?.[key], ctx);
const matches = (actual: unknown, op: string, expected: unknown) => {
  if (op === 'eq') return actual === expected;
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  return op === 'gte' ? actual >= expected : op === 'lte' ? actual <= expected : op === 'gt' ? actual > expected : actual < expected;
};
const merge = (current: RuleAction | undefined, next: RuleAction): RuleAction => {
  if (!current || next.mode === 'set') return next;
  if (typeof current.value !== 'number' || typeof next.value !== 'number') return next;
  return next.mode === 'min' ? {...next, value: Math.max(current.value, next.value)} : {...next, value: Math.min(current.value, next.value)};
};
export function evaluateRules(rules: Rule[], analysis: ModelAnalysis, answers: Questionnaire): Recommendation[] {
  const ctx = { analysis, answers, intent: analyzePurpose(`${answers.purpose} ${answers.properties}`) }; const selected = new Map<string, {action: RuleAction; rules: Rule[]}>();
  for (const rule of [...rules].sort((a,b) => a.priority-b.priority)) {
    if (!rule.conditions.every(c => matches(get(ctx, c.path), c.op, c.value))) continue;
    for (const rawAction of rule.actions) {
      const action = typeof rawAction.value === 'string' && rawAction.value.startsWith('$') ? {...rawAction,value:get(ctx,rawAction.value.slice(1)) as string|number|boolean} : rawAction;
      const old = selected.get(action.setting); selected.set(action.setting, { action: merge(old?.action, action), rules: [...(old?.rules ?? []), rule] });
    }
  }
  return [...selected.entries()].map(([setting, hit]) => ({ setting: setting as Recommendation['setting'], value: hit.action.value,
    reason: hit.rules.map(r => englishReasons[r.id] ?? r.reason).join(' '), confidence: Math.min(...hit.rules.map(r => r.confidence)), ruleIds: hit.rules.map(r => r.id) }));
}
