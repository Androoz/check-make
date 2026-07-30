import { printerProfiles } from '../printers/profiles';
import { isPlanPreference } from '../planning/preferences';
import type { PlanPreference } from '../types';

export interface ApplicationPreferences {
  schemaVersion: 1;
  defaultPrinterId: string;
  defaultAnalysisMode: 'local' | 'extended';
  extendedAIProvider: 'llama' | 'openai';
  defaultPlanPreference: PlanPreference;
  preferMatchingFilamentProfiles: boolean;
}

export const applicationPreferenceStorageKey = 'check-make.application-preferences';

export const initialApplicationPreferences: ApplicationPreferences = {
  schemaVersion: 1,
  defaultPrinterId: '',
  defaultAnalysisMode: 'local',
  extendedAIProvider: 'llama',
  defaultPlanPreference: 'balanced',
  preferMatchingFilamentProfiles: false,
};

export function normalizeApplicationPreferences(value: unknown): ApplicationPreferences {
  const stored = value && typeof value === 'object'
    ? value as Partial<ApplicationPreferences> & { defaultAnalysisProvider?: 'local' | 'llama' | 'openai' }
    : {};
  return {
    schemaVersion: 1,
    defaultPrinterId: printerProfiles.some(profile => profile.id === stored.defaultPrinterId) ? stored.defaultPrinterId! : '',
    defaultAnalysisMode: stored.defaultAnalysisMode === 'extended' || stored.defaultAnalysisProvider === 'openai' || stored.defaultAnalysisProvider === 'llama'
      ? 'extended'
      : 'local',
    extendedAIProvider: stored.extendedAIProvider === 'openai' || stored.defaultAnalysisProvider === 'openai' ? 'openai' : 'llama',
    defaultPlanPreference: isPlanPreference(stored.defaultPlanPreference) ? stored.defaultPlanPreference : 'balanced',
    preferMatchingFilamentProfiles: stored.preferMatchingFilamentProfiles === true,
  };
}

export function loadApplicationPreferences(storage: Pick<Storage, 'getItem'> = localStorage): ApplicationPreferences {
  try {
    return normalizeApplicationPreferences(JSON.parse(storage.getItem(applicationPreferenceStorageKey) ?? '{}'));
  } catch {
    return initialApplicationPreferences;
  }
}

export function saveApplicationPreferences(
  preferences: ApplicationPreferences,
  storage: Pick<Storage, 'setItem'> = localStorage,
) {
  try {
    storage.setItem(applicationPreferenceStorageKey, JSON.stringify(preferences));
  } catch {
    // Preferences remain session-local when the host storage is unavailable.
  }
}
