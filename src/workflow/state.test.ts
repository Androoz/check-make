import { describe, expect, it } from 'vitest';
import { deriveWorkflowStage, isPreparationComplete, prepareStatus } from './state';

describe('state-driven GUI workflow', () => {
  it('keeps Inspect active until intelligence exists', () => {
    expect(deriveWorkflowStage({ hasIntelligence: false, exportRequested: false, ready: false })).toBe('import');
  });

  it('keeps Prepare active until the ready plan is explicitly accepted', () => {
    expect(deriveWorkflowStage({ hasIntelligence: true, exportRequested: false, ready: true })).toBe('analysis');
    expect(deriveWorkflowStage({ hasIntelligence: true, exportRequested: true, ready: false })).toBe('analysis');
  });

  it('unlocks Export only for an accepted ready plan', () => {
    expect(deriveWorkflowStage({ hasIntelligence: true, exportRequested: true, ready: true })).toBe('export');
  });

  it('uses a confirmation state instead of claiming zero decisions remain', () => {
    expect(prepareStatus(2)).toBe('2 decisions left');
    expect(prepareStatus(1)).toBe('1 decision left');
    expect(prepareStatus(0)).toBe('Ready to confirm');
  });

  it('keeps recommendations provisional until visible decisions are applied', () => {
    expect(isPreparationComplete(true, 3)).toBe(false);
    expect(isPreparationComplete(true, 0)).toBe(true);
    expect(isPreparationComplete(false, 0)).toBe(false);
  });
});
