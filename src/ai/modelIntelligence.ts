import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Material, ModelAnalysis, Questionnaire } from '../types';
import { inferBrief } from '../intent/inferBrief';

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
  evidence: string[];
  assumptions: string[];
  questions: FollowUpQuestion[];
  environment: Questionnaire['environment'];
  load: Questionnaire['load'];
  impact: Questionnaire['impact'];
  heat: Questionnaire['heat'];
  priority: Questionnaire['priority'];
  supportsAllowed: Questionnaire['supportsAllowed'];
  materialHint: Material | 'unknown';
  userEvidence: string[];
}

export interface AIConnection {
  provider: IntelligenceProvider;
  apiKey: string;
  model: string;
}

export function localModelAnalysis(model: ModelAnalysis): ModelIntelligence {
  const { x, y, z } = model.boundingBox.size;
  const sorted = [x, y, z].sort((a, b) => a - b);
  const flat = sorted[0] < sorted[2] * 0.18;
  const slender = sorted[2] > Math.max(1, sorted[1]) * 3;
  const tall = z > Math.max(x, y) * 2;

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
  const nameClue = model.metadata?.clues[0];
  if (nameClue) {
    objectName = `possible ${nameClue.value}`;
    likelyPurpose = `The model's ${nameClue.source === 'file-name' ? 'file name' : 'embedded STL name'} suggests this identity, but its intended use remains unconfirmed.`;
  }
  const clueEvidence = model.metadata?.clues.map(clue => {
    const source = clue.source === 'file-name' ? 'File name' : clue.source === 'stl-solid-name' ? 'Embedded STL solid name' : 'Embedded STL binary header';
    return `${source} provides the unverified clue “${clue.value}”.`;
  }) ?? [];
  const geometryRiskEvidence = model.geometryRisk ? [
    `Bed contact covers ${(model.geometryRisk.bedCoverageRatio * 100).toFixed(1)}% of the XY bounding footprint.`,
    `${model.geometryRisk.overhangRegionCount} connected overhang region(s) were measured; the largest projected span is ${model.geometryRisk.largestOverhangRegionSpanMm.toFixed(1)} mm.`,
  ] : [];

  return {
    provider: 'local', objectName, likelyPurpose,
    evidence: [
      `Overall dimensions are ${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)} mm.`,
      `${(model.overhangRatio * 100).toFixed(1)}% of the surface is estimated as critical overhang.`,
      `${model.bedContactAreaMm2.toFixed(0)} mm² estimated contact in the imported orientation.`,
      ...geometryRiskEvidence,
      ...clueEvidence,
    ],
    assumptions: ['File names and STL header or solid names are unverified labels, not proof of function.', 'STL geometry does not establish material, load direction, operating environment, or whether a downward region can bridge successfully.'],
    questions: [
      { id: 'purpose', question: 'What does this object connect, hold, protect, display, or move?', why: 'Geometry alone cannot establish function reliably.' },
      { id: 'load', question: 'Where is force applied, and is strength, fit, or visible surface quality most important?', why: 'This determines orientation and shell strategy.' },
      { id: 'environment', question: 'Will it face heat, sunlight, moisture, chemicals, or repeated impact?', why: 'This determines the material family.' },
    ],
    environment: 'unknown', load: 'unknown', impact: 'unknown', heat: 'unknown',
    priority: 'unknown', supportsAllowed: 'unknown', materialHint: 'unknown', userEvidence: [],
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
    evidence: list(value.evidence).length ? list(value.evidence) : fallback.evidence,
    assumptions: list(value.assumptions), questions,
    environment: allowed(value.environment, ['unknown', 'indoor', 'outdoor'] as const, fallback.environment),
    load: allowed(value.load, ['unknown', 'none', 'static', 'cyclic'] as const, fallback.load),
    impact: allowed(value.impact, ['unknown', 'none', 'medium', 'high'] as const, fallback.impact),
    heat: allowed(value.heat, ['unknown', 'normal', 'warm', 'hot'] as const, fallback.heat),
    priority: allowed(value.priority, ['unknown', 'strength', 'accuracy', 'finish', 'speed', 'flexibility'] as const, fallback.priority),
    supportsAllowed: typeof value.supportsAllowed === 'boolean' || value.supportsAllowed === 'unknown' ? value.supportsAllowed : fallback.supportsAllowed,
    materialHint: allowed(value.materialHint, ['unknown', 'PLA', 'PETG', 'ASA', 'TPU', 'PA-CF'] as const, fallback.materialHint),
    userEvidence: fallback.userEvidence,
  };
}

export function refineLocalIntelligence(ai: ModelIntelligence, answers: Record<string, string>): ModelIntelligence {
  const userEvidence = Object.values(answers).map(value => value.trim()).filter(Boolean);
  if (!userEvidence.length) return ai;
  const detail = userEvidence.join(' ');
  const inference = inferBrief(detail, '');
  const inferred = <K extends 'environment'|'load'|'impact'|'heat'|'priority'|'supportsAllowed'>(field: K): ModelIntelligence[K] =>
    inference[field].evidence.length ? inference[field].value as ModelIntelligence[K] : ai[field];
  return {
    ...ai,
    likelyPurpose: detail,
    evidence: [...ai.evidence, `User-provided clarification: “${detail}”.`],
    assumptions: [...ai.assumptions, 'Only explicit terms in the user clarification were converted into manufacturing requirements.'],
    questions: ai.questions.filter(question => !answers[question.id]?.trim()),
    environment: inferred('environment'), load: inferred('load'), impact: inferred('impact'), heat: inferred('heat'),
    priority: inferred('priority'), supportsAllowed: inferred('supportsAllowed'), userEvidence,
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
  return { ...normalizeAI(JSON.parse(cleaned) as Record<string, unknown>, fallback), userEvidence: Object.values(followUpAnswers).map(value => value.trim()).filter(Boolean) };
}

export function questionnaireFromIntelligence(ai: ModelIntelligence, printer: Questionnaire['printer']): Questionnaire {
  return {
    purpose: ai.userEvidence.join(' '),
    properties: '',
    environment: ai.environment, load: ai.load, impact: ai.impact, heat: ai.heat,
    priority: ai.priority, supportsAllowed: ai.supportsAllowed,
    printerId: printer.id, printer,
  };
}
