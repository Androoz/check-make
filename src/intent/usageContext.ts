import type { CandidateFact, SemanticConfirmationQuestion } from '../semantic/types';
import { contextGraphConcepts, interpretContextGraph } from './contextGraph';

export interface UsageContextInterpretation {
  id: string;
  label: string;
  evidence: string;
  facts: CandidateFact[];
  questions: SemanticConfirmationQuestion[];
  objectIdentity?: string;
  primaryFunction?: {
    value: 'display' | 'guide';
    label: string;
    evidence: string;
  };
}

// v4.0 compatibility boundary: the v3.8 entry point remains stable, while the
// former product-by-product profiles now live as inherited graph concepts.
export function interpretUsageContext(text: string, target?: string): UsageContextInterpretation | undefined {
  const composed = interpretContextGraph(text, target);
  if (!composed) return undefined;
  return {
    id: composed.id,
    label: composed.label,
    evidence: composed.evidence,
    facts: composed.facts,
    questions: composed.questions,
    objectIdentity: composed.objectIdentity,
    primaryFunction: composed.primaryFunction,
  };
}

export const usageContextProfiles = contextGraphConcepts
  .filter(concept => concept.kind === 'parent-system')
  .map(({ id, label }) => ({ id, label }));
