import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Material, ModelAnalysis, Priority, Questionnaire } from '../types';

export type IntelligenceProvider = 'local' | 'openai';

export interface FollowUpQuestion {
  id: string;
  question: string;
  why: string;
}

export interface ModelIntelligence {
  provider: IntelligenceProvider;
  objectName: string;
  likelyPurpose: string;
  confidence: number;
  evidence: string[];
  assumptions: string[];
  questions: FollowUpQuestion[];
  environment: Questionnaire['environment'];
  load: Questionnaire['load'];
  impact: Questionnaire['impact'];
  heat: Questionnaire['heat'];
  priority: Priority;
  supportsAllowed: boolean;
  materialHint: Material;
}

export interface AIConnection {
  provider: IntelligenceProvider;
  apiKey: string;
  model: string;
}

function clampConfidence(value: unknown, fallback: number) {
  return typeof value === 'number' ? Math.max(0, Math.min(1, value)) : fallback;
}

export function localModelAnalysis(model: ModelAnalysis): ModelIntelligence {
  const { x, y, z } = model.boundingBox.size;
  const sorted = [x, y, z].sort((a, b) => a - b);
  const flat = sorted[0] < sorted[2] * 0.18;
  const slender = sorted[2] > Math.max(1, sorted[1]) * 3;
  const tall = z > Math.max(x, y) * 2;
  const smallContact = model.bedContactAreaMm2 < Math.max(100, x * y * 0.08);
  const overhang = model.overhangRatio > 0.12;

  let objectName = 'mechanical component';
  let likelyPurpose = 'A functional part whose exact role cannot be established from geometry alone.';
  if (flat) {
    objectName = 'plate, cover, sign, or mounting panel';
    likelyPurpose = 'Likely a flat structural, protective, decorative, or mounting part.';
  } else if (slender || tall) {
    objectName = 'post, pin, spacer, handle, or tower-like part';
    likelyPurpose = 'Likely transfers force, creates spacing, or supports another component.';
  } else if (sorted[2] / Math.max(1, sorted[0]) < 1.7) {
    objectName = 'compact bracket, block, adapter, or enclosure component';
    likelyPurpose = 'Likely a compact functional component, but mating features and load direction need confirmation.';
  }

  return {
    provider: 'local', objectName, likelyPurpose, confidence: 0.42,
    evidence: [
      `Overall dimensions are ${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)} mm.`,
      `${(model.overhangRatio * 100).toFixed(1)}% of the surface is estimated as critical overhang.`,
      `${model.bedContactAreaMm2.toFixed(0)} mm² estimated contact in the imported orientation.`,
      ...(smallContact ? ['The imported orientation has a relatively small bed contact area.'] : []),
      ...(overhang ? ['The imported orientation contains a meaningful amount of downward-facing geometry.'] : []),
    ],
    assumptions: ['STL contains no semantic information, named features, material, load direction, or operating environment.'],
    questions: [
      { id: 'purpose', question: 'What does this object connect, hold, protect, display, or move?', why: 'Geometry alone cannot establish function reliably.' },
      { id: 'load', question: 'Where is force applied, and is strength, fit, or visible surface quality most important?', why: 'This determines orientation and shell strategy.' },
      { id: 'environment', question: 'Will it face heat, sunlight, moisture, chemicals, or repeated impact?', why: 'This determines the material family.' },
    ],
    environment: 'indoor', load: 'static', impact: 'medium', heat: 'normal',
    priority: flat ? 'finish' : 'strength', supportsAllowed: true, materialHint: 'PETG',
  };
}

function normalizeAI(value: Record<string, unknown>, fallback: ModelIntelligence): ModelIntelligence {
  const allowed = <T extends string>(candidate: unknown, values: readonly T[], defaultValue: T) =>
    typeof candidate === 'string' && values.includes(candidate as T) ? candidate as T : defaultValue;
  const list = (candidate: unknown) => Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === 'string').slice(0, 8) : [];
  const questions = Array.isArray(value.questions) ? value.questions.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const q = item as Record<string, unknown>;
    if (typeof q.question !== 'string') return [];
    return [{ id: typeof q.id === 'string' ? q.id : `question-${index + 1}`, question: q.question, why: typeof q.why === 'string' ? q.why : 'Needed to reduce uncertainty.' }];
  }).slice(0, 3) : [];
  return {
    provider: 'openai',
    objectName: typeof value.objectName === 'string' ? value.objectName : fallback.objectName,
    likelyPurpose: typeof value.likelyPurpose === 'string' ? value.likelyPurpose : fallback.likelyPurpose,
    confidence: clampConfidence(value.confidence, fallback.confidence),
    evidence: list(value.evidence).length ? list(value.evidence) : fallback.evidence,
    assumptions: list(value.assumptions), questions,
    environment: allowed(value.environment, ['indoor', 'outdoor'] as const, fallback.environment),
    load: allowed(value.load, ['none', 'static', 'cyclic'] as const, fallback.load),
    impact: allowed(value.impact, ['none', 'medium', 'high'] as const, fallback.impact),
    heat: allowed(value.heat, ['normal', 'warm', 'hot'] as const, fallback.heat),
    priority: allowed(value.priority, ['strength', 'accuracy', 'finish', 'speed', 'flexibility'] as const, fallback.priority),
    supportsAllowed: typeof value.supportsAllowed === 'boolean' ? value.supportsAllowed : fallback.supportsAllowed,
    materialHint: allowed(value.materialHint, ['PLA', 'PETG', 'ASA', 'TPU', 'PA-CF'] as const, fallback.materialHint),
  };
}

export async function analyzeWithOpenAI(
  connection: AIConnection,
  model: ModelAnalysis,
  previewImage: string | undefined,
  followUpAnswers: Record<string, string>,
): Promise<ModelIntelligence> {
  if (!isTauri()) throw new Error('AI analysis is available in the desktop app.');
  if (!connection.apiKey.trim()) throw new Error('Enter an OpenAI API key or use local preliminary analysis.');
  const fallback = localModelAnalysis(model);
  const context = JSON.stringify({
    geometry: model,
    preliminaryAnalysis: fallback,
    userAnswers: followUpAnswers,
  });
  const raw = await invoke<string>('analyze_model_with_openai', {
    apiKey: connection.apiKey,
    model: connection.model || 'gpt-5.4-mini',
    context,
    previewImage: previewImage ?? null,
  });
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  return normalizeAI(JSON.parse(cleaned) as Record<string, unknown>, fallback);
}

export function questionnaireFromIntelligence(ai: ModelIntelligence, printer: Questionnaire['printer']): Questionnaire {
  return {
    purpose: `${ai.objectName}. ${ai.likelyPurpose}`,
    properties: `AI material hint: ${ai.materialHint}. ${ai.assumptions.join(' ')}`,
    environment: ai.environment, load: ai.load, impact: ai.impact, heat: ai.heat,
    priority: ai.priority, supportsAllowed: ai.supportsAllowed,
    printerId: printer.id, printer,
  };
}
