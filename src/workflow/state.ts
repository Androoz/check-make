export type WorkflowStage = 'import' | 'analysis' | 'export';

export function deriveWorkflowStage(input: { hasIntelligence: boolean; exportRequested: boolean; ready: boolean }): WorkflowStage {
  if (!input.hasIntelligence) return 'import';
  if (input.exportRequested && input.ready) return 'export';
  return 'analysis';
}

export function prepareStatus(decisions: number) {
  return decisions > 0 ? `${decisions} decision${decisions === 1 ? '' : 's'} left` : 'Ready to confirm';
}

export function isPreparationComplete(planReady: boolean, visibleDecisionCount: number) {
  return planReady && visibleDecisionCount === 0;
}
