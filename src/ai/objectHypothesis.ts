import { interpretBriefV3 } from '../intent/inferBrief';
import type { ModelAnalysis } from '../types';

export type ObjectEvidenceSource =
  | 'geometry-observation'
  | 'topology-observation'
  | 'component-observation'
  | 'filename-clue'
  | 'user-statement'
  | 'language-match'
  | 'ai-hypothesis';

export type HypothesisStatus = 'unknown' | 'hypothesized' | 'user-stated' | 'confirmed' | 'rejected';

export interface ObjectHypothesisEvidence {
  id: string;
  source: ObjectEvidenceSource;
  statement: string;
  confidence: number;
}

export interface ObjectHypothesisAssertion {
  id: string;
  label: string;
  value: string;
  confidence: number;
  status: HypothesisStatus;
  evidenceIds: string[];
  consequential: boolean;
  affectsRecommendations: string[];
}

export interface ObjectHypothesis {
  identity: ObjectHypothesisAssertion;
  purpose: ObjectHypothesisAssertion;
  features: ObjectHypothesisAssertion[];
  evidence: ObjectHypothesisEvidence[];
  limits: string[];
}

export interface AIObjectEvidence {
  objectName?: string;
  likelyPurpose?: string;
  evidence?: string[];
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const assertion = (
  id: string,
  label: string,
  value: string,
  confidence: number,
  status: HypothesisStatus,
  evidenceIds: string[],
  affectsRecommendations: string[] = [],
): ObjectHypothesisAssertion => ({
  id, label, value, confidence: clamp(confidence), status, evidenceIds,
  consequential: affectsRecommendations.length > 0,
  affectsRecommendations,
});

const identityPatterns: Array<{ expression: RegExp; value: string }> = [
  { expression: /\b(?:mounting\s+)?bracket\b/i, value: 'mounting bracket' },
  { expression: /\b(?:protective\s+)?(?:cover|guard|enclosure|housing)\b/i, value: 'protective cover or enclosure' },
  { expression: /\b(?:adapter|connector|coupler)\b/i, value: 'adapter or connector' },
  { expression: /\bhinge\b/i, value: 'hinge component' },
  { expression: /\b(?:hook|hanger)\b/i, value: 'hook or hanger' },
  { expression: /\b(?:holder|stand|cradle)\b/i, value: 'holder or stand' },
  { expression: /\b(?:spacer|standoff|distance piece)\b/i, value: 'spacer or standoff' },
  { expression: /\b(?:handle|grip)\b/i, value: 'handle or grip' },
  { expression: /\b(?:sign|nameplate|plaque)\b/i, value: 'sign or nameplate' },
  { expression: /\b(?:gasket|seal)\b/i, value: 'gasket or seal' },
  { expression: /\b(?:gear|cog)\b/i, value: 'gear' },
  { expression: /\b(?:clip|clamp)\b/i, value: 'clip or clamp' },
  { expression: /\b(?:panel|plate)\b/i, value: 'panel or plate' },
];

function broadGeometryIdentity(model: ModelAnalysis) {
  const { x, y, z } = model.boundingBox.size;
  const sorted = [x, y, z].sort((left, right) => left - right);
  const largest = Math.max(0.001, sorted[2]);
  const flatness = sorted[0] / largest;
  const elongation = largest / Math.max(0.001, sorted[1]);
  const aspect = largest / Math.max(0.001, sorted[0]);
  if (elongation >= 3) return { value: 'elongated component', confidence: 0.74 };
  if (flatness <= 0.18) return { value: 'plate-like component', confidence: 0.76 };
  if (aspect < 1.7) return { value: 'compact mechanical component', confidence: 0.68 };
  return { value: 'general mechanical component', confidence: 0.55 };
}

function normalizedLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/^(?:possible|likely)\s+/i, '');
}

export function buildObjectHypothesis(model: ModelAnalysis, contextText = '', ai?: AIObjectEvidence): ObjectHypothesis {
  const interpretation = interpretBriefV3(contextText, '');
  const evidence: ObjectHypothesisEvidence[] = [];
  const addEvidence = (source: ObjectEvidenceSource, statement: string, confidence: number) => {
    const id = `evidence-${evidence.length + 1}`;
    evidence.push({ id, source, statement, confidence: clamp(confidence) });
    return id;
  };

  const { x, y, z } = model.boundingBox.size;
  const geometryIdentity = broadGeometryIdentity(model);
  const geometryEvidenceId = addEvidence(
    'geometry-observation',
    `The mesh measures ${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)} mm and has broad ${geometryIdentity.value} proportions.`,
    geometryIdentity.confidence,
  );
  if (model.topology) addEvidence(
    'topology-observation',
    model.topology.watertight
      ? 'The measured mesh is closed and manifold.'
      : `The mesh has ${model.topology.boundaryEdgeCount} boundary edges and ${model.topology.nonManifoldEdgeCount} non-manifold edges.`,
    model.topology.watertight ? 0.95 : 0.9,
  );
  if (model.components?.length || (model.topology?.componentCount ?? 1) > 1) addEvidence(
    'component-observation',
    `${model.components?.length ?? model.topology?.componentCount ?? 1} disconnected mesh components were measured.`,
    0.98,
  );

  const explicitIdentity = identityPatterns.flatMap(item => {
    const match = interpretation.normalizedText.match(item.expression);
    return match ? [{ value: item.value, matched: match[0] }] : [];
  })[0];
  const filenameClue = model.metadata?.clues[0];
  const aiIdentity = normalizedLabel(ai?.objectName ?? '');
  let identity = assertion('identity', 'Object identity', geometryIdentity.value, geometryIdentity.confidence, 'hypothesized', [geometryEvidenceId]);
  if (filenameClue) {
    const id = addEvidence('filename-clue', `Model metadata contains the unverified label “${filenameClue.value}”.`, 0.58);
    identity = assertion('identity', 'Object identity', normalizedLabel(filenameClue.value), 0.58, 'hypothesized', [id]);
  }
  if (aiIdentity) {
    const id = addEvidence('ai-hypothesis', `Optional AI analysis proposes “${aiIdentity}”.`, 0.65);
    identity = assertion('identity', 'Object identity', aiIdentity, 0.65, 'hypothesized', [id]);
  }
  if (explicitIdentity) {
    const id = addEvidence('user-statement', `The Context explicitly names “${explicitIdentity.matched}”.`, 1);
    identity = assertion('identity', 'Object identity', explicitIdentity.value, 1, 'user-stated', [id]);
  }

  const purposeFacet = interpretation.facets.find(facet => facet.category === 'object-function');
  const aiPurpose = normalizedLabel(ai?.likelyPurpose ?? '');
  let purpose = assertion('purpose', 'Intended purpose', 'Not established', 0, 'unknown', []);
  if (aiPurpose) {
    const id = addEvidence('ai-hypothesis', `Optional AI analysis proposes this purpose: “${aiPurpose}”.`, 0.62);
    purpose = assertion('purpose', 'Intended purpose', aiPurpose, 0.62, 'hypothesized', [id], ['material', 'orientation', 'structure']);
  }
  if (purposeFacet) {
    const statementId = addEvidence('user-statement', `The Context states that the object ${purposeFacet.value}.`, 1);
    const matchId = addEvidence('language-match', `The reviewed phrase match was “${purposeFacet.evidence.join('”, “')}”.`, purposeFacet.confidence);
    purpose = assertion('purpose', 'Intended purpose', purposeFacet.value, purposeFacet.confidence, 'user-stated', [statementId, matchId], ['material', 'orientation', 'structure']);
  }

  const features: ObjectHypothesisAssertion[] = [];
  interpretation.facets.filter(facet => facet.category === 'interface').forEach(facet => {
    const statementId = addEvidence('user-statement', `The Context explicitly describes a ${facet.value}.`, 1);
    const matchId = addEvidence('language-match', `The reviewed interface phrase was “${facet.evidence.join('”, “')}”.`, facet.confidence);
    features.push(assertion(`feature-${facet.id}`, 'Likely mating feature', facet.value, facet.confidence, 'user-stated', [statementId, matchId], ['dimensional accuracy', 'orientation', 'seam']));
  });
  interpretation.facets.filter(facet => facet.category === 'critical-surface').forEach(facet => {
    const statementId = addEvidence('user-statement', `The Context explicitly identifies the ${facet.value}.`, 1);
    const matchId = addEvidence('language-match', `The reviewed critical-surface phrase was “${facet.evidence.join('”, “')}”.`, facet.confidence);
    features.push(assertion(`feature-${facet.id}`, facet.id === 'surface-visible' ? 'Visible surface' : 'Mating surface', facet.value, facet.confidence, 'user-stated', [statementId, matchId], ['orientation', 'supports', 'seam', 'surface quality']));
  });
  interpretation.facets.filter(facet => facet.category === 'mechanical-demand').forEach(facet => {
    const statementId = addEvidence('user-statement', `The Context explicitly describes ${facet.value}.`, 1);
    const matchId = addEvidence('language-match', `The reviewed mechanical-demand phrase was “${facet.evidence.join('”, “')}”.`, facet.confidence);
    features.push(assertion(`feature-${facet.id}`, 'Load-bearing relevance', facet.value, facet.confidence, 'user-stated', [statementId, matchId], ['orientation', 'wall loops', 'infill']));
  });
  if ((model.topology?.componentCount ?? 1) > 1) {
    const componentEvidence = evidence.find(item => item.source === 'component-observation');
    if (componentEvidence) features.push(assertion(
      'feature-multiple-components', 'Multiple-object relationship', 'Disconnected components may form one assembly or separate printable objects',
      0.7, 'hypothesized', [componentEvidence.id], ['orientation', 'per-object settings'],
    ));
  }

  (ai?.evidence ?? []).slice(0, 4).forEach(statement => addEvidence('ai-hypothesis', statement, 0.6));

  return {
    identity,
    purpose,
    features,
    evidence,
    limits: [
      'Mesh proportions describe shape, not semantic identity or intended use.',
      'Holes, threads, and mating geometry are not classified in this analysis version.',
      'Local wall thickness and critical thin features are not measured.',
      'Load paths and load-bearing regions require user input; no structural simulation is performed.',
      'A visible surface cannot be identified from geometry alone.',
    ],
  };
}

export function applyObjectHypothesisAnswers(hypothesis: ObjectHypothesis, answers: Record<string, string>): ObjectHypothesis {
  const evidence = [...hypothesis.evidence];
  const recordUserEvidence = (id: string, statement: string) => {
    const existing = evidence.find(item => item.id === id);
    if (!existing) evidence.push({ id, source: 'user-statement', statement, confidence: 1 });
    return id;
  };
  const update = (item: ObjectHypothesisAssertion) => {
    const answer = answers[`object-${item.id}`];
    if (answer === 'confirmed') {
      const id = recordUserEvidence(`evidence-user-confirmed-${item.id}`, `The user confirmed the proposed ${item.label.toLocaleLowerCase('en-US')}.`);
      return { ...item, status: 'confirmed' as const, confidence: 1, evidenceIds: [...new Set([...item.evidenceIds, id])] };
    }
    if (answer === 'rejected') {
      const id = recordUserEvidence(`evidence-user-rejected-${item.id}`, `The user rejected the proposed ${item.label.toLocaleLowerCase('en-US')}.`);
      return { ...item, status: 'rejected' as const, evidenceIds: [...new Set([...item.evidenceIds, id])] };
    }
    return item;
  };
  const describedPurpose = answers['object-purpose-description']?.trim();
  const purposeEvidenceId = describedPurpose
    ? recordUserEvidence('evidence-user-described-purpose', `The user supplied the object purpose: “${describedPurpose}”.`)
    : undefined;
  const purpose = describedPurpose && purposeEvidenceId
    ? { ...hypothesis.purpose, value: describedPurpose, status: 'confirmed' as const, confidence: 1, evidenceIds: [...new Set([...hypothesis.purpose.evidenceIds, purposeEvidenceId])] }
    : update(hypothesis.purpose);
  return { ...hypothesis, identity: update(hypothesis.identity), purpose, features: hypothesis.features.map(update), evidence };
}
