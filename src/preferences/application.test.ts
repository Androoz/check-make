import { describe, expect, it } from 'vitest';
import {
  applicationPreferenceStorageKey,
  loadApplicationPreferences,
  normalizeApplicationPreferences,
  saveApplicationPreferences,
} from './application';

describe('versioned application preferences', () => {
  it('migrates legacy analysis settings and defaults missing plan preference to Balanced', () => {
    expect(normalizeApplicationPreferences({
      defaultPrinterId: 'bambu-x1c',
      defaultAnalysisProvider: 'openai',
    })).toMatchObject({
      schemaVersion: 1,
      defaultPrinterId: 'bambu-x1c',
      defaultAnalysisMode: 'extended',
      extendedAIProvider: 'openai',
      defaultPlanPreference: 'balanced',
    });
  });

  it('rejects unknown plan preferences and unavailable printer ids', () => {
    expect(normalizeApplicationPreferences({
      defaultPrinterId: 'future-printer',
      defaultPlanPreference: 'lower-cost',
    })).toMatchObject({
      defaultPrinterId: '',
      defaultPlanPreference: 'balanced',
    });
  });

  it('round-trips the versioned preference contract', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    saveApplicationPreferences({
      schemaVersion: 1,
      defaultPrinterId: 'bambu-x1c',
      defaultAnalysisMode: 'local',
      extendedAIProvider: 'llama',
      defaultPlanPreference: 'visual-quality',
    }, storage);
    expect(values.has(applicationPreferenceStorageKey)).toBe(true);
    expect(loadApplicationPreferences(storage)).toMatchObject({
      schemaVersion: 1,
      defaultPlanPreference: 'visual-quality',
    });
  });
});
