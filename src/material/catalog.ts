import type { Material, PrinterCapabilities, Questionnaire, Recommendation } from '../types';
import { intentFactUsable } from '../intent/manufacturingIntent';

export interface MaterialCatalogEntry {
  id: Material;
  label: string;
  nominalDensityGcm3: number;
  nozzleTemperature: string;
  bedTemperature: string;
  notes: string;
  strengths: MaterialBenefit[];
  disadvantages: string[];
  printerRequirements: string[];
}

export type MaterialBenefit =
  | 'easy-to-print'
  | 'outdoor'
  | 'moisture'
  | 'toughness'
  | 'fatigue'
  | 'creep-resistance'
  | 'heat'
  | 'high-heat'
  | 'stiffness'
  | 'dimensional-stability'
  | 'flexibility';
export type MaterialRequirementId =
  | 'weather-resistance'
  | 'moisture-resistance'
  | 'toughness'
  | 'fatigue-resistance'
  | 'creep-resistance'
  | 'wear-resistance'
  | 'chemical-compatibility'
  | 'heat-margin'
  | 'stiffness'
  | 'flexibility';
export type MaterialRequirementKind = 'required' | 'preferred' | 'specialist-review';

export interface MaterialRequirement {
  id: MaterialRequirementId;
  label: string;
  benefit?: MaterialBenefit;
  kind: MaterialRequirementKind;
  reason: string;
  evidenceIds: string[];
}

export interface MaterialCandidateAssessment {
  material: Material;
  meetsRequirements: boolean;
  printerCompatible: boolean;
  selectable: boolean;
  matchedRequirements: MaterialRequirementId[];
  missingRequirements: MaterialRequirement[];
  unmetPreferences: MaterialRequirement[];
  printerLimitations: string[];
}

export interface MaterialPlanEvaluation {
  requirements: MaterialRequirement[];
  recommended: MaterialCandidateAssessment;
  candidates: MaterialAlternativeCandidate[];
  decisionReason: string;
  blocked: boolean;
  blockerReasons: string[];
}

export const materialCatalog: MaterialCatalogEntry[] = [
  {
    id: 'PLA', label: 'PLA', nominalDensityGcm3: 1.24, nozzleTemperature: '220 °C', bedTemperature: '55 °C',
    notes: 'General indoor baseline; not selected for elevated heat or long-term weather exposure.',
    strengths: ['easy-to-print', 'stiffness', 'dimensional-stability'],
    disadvantages: ['Limited service-temperature margin', 'Not a long-term outdoor baseline', 'Lower impact tolerance than PETG'],
    printerRequirements: ['Standard non-abrasive filament path'],
  },
  {
    id: 'PETG', label: 'PETG', nominalDensityGcm3: 1.27, nozzleTemperature: '250 °C', bedTemperature: '75 °C',
    notes: 'General weather- and impact-tolerant baseline.',
    strengths: ['outdoor', 'moisture', 'toughness', 'fatigue'],
    disadvantages: ['More stringing and surface sensitivity than PLA', 'Lower stiffness than PLA or PA-CF', 'Not the high-temperature baseline'],
    printerRequirements: ['Nozzle capable of at least 260 °C', 'Build plate capable of at least 80 °C'],
  },
  {
    id: 'ASA', label: 'ASA', nominalDensityGcm3: 1.07, nozzleTemperature: '260 °C', bedTemperature: '100 °C',
    notes: 'Weather and elevated-temperature candidate that normally needs an enclosure.',
    strengths: ['outdoor', 'moisture', 'heat', 'high-heat', 'stiffness', 'dimensional-stability'],
    disadvantages: ['More warping risk than PLA or PETG', 'Ventilation and controlled printing conditions are important', 'Less forgiving on open-frame printers'],
    printerRequirements: ['Enclosed printer', 'Nozzle capable of at least 270 °C', 'Build plate capable of at least 100 °C'],
  },
  {
    id: 'TPU', label: 'TPU', nominalDensityGcm3: 1.21, nozzleTemperature: '230 °C', bedTemperature: '50 °C',
    notes: 'Flexible-function candidate, not a drop-in rigid-material substitute.',
    strengths: ['flexibility', 'toughness', 'fatigue'],
    disadvantages: ['Not a rigid structural substitute', 'Slower and more feed-path-sensitive printing', 'Fit and hardness depend on the exact product grade'],
    printerRequirements: ['Filament path suitable for flexible filament', 'Product-specific speed and hardness validation'],
  },
  {
    id: 'PA-CF', label: 'PA-CF', nominalDensityGcm3: 1.10, nozzleTemperature: '285 °C', bedTemperature: '100 °C',
    notes: 'Stiff engineering candidate requiring an enclosed, abrasive-ready printer path.',
    strengths: ['heat', 'high-heat', 'stiffness', 'creep-resistance', 'dimensional-stability'],
    disadvantages: ['Abrasive and moisture-sensitive', 'Not a universal impact upgrade', 'Properties and temperatures vary substantially by product grade'],
    printerRequirements: ['Enclosed printer', 'Wear-resistant nozzle and compatible filament path', 'Nozzle capable of at least 290 °C', 'Dry filament handling'],
  },
];

export const materialEntry = (material: Material) => materialCatalog.find(entry => entry.id === material) ?? materialCatalog[0];

export function materialPrinterLimitations(material: Material, printer: PrinterCapabilities & { model?: string }): string[] {
  const requirements: Record<Material, { nozzle: number; bed: number; enclosure?: boolean; hardened?: boolean }> = {
    PLA: { nozzle: 230, bed: 60 },
    PETG: { nozzle: 260, bed: 80 },
    ASA: { nozzle: 270, bed: 100, enclosure: true },
    TPU: { nozzle: 240, bed: 50 },
    'PA-CF': { nozzle: 290, bed: 100, enclosure: true, hardened: true },
  };
  const requirement = requirements[material];
  const printerLabel = printer.model ?? 'The selected printer';
  const limitations: string[] = [];
  if (printer.maxNozzleTempC < requirement.nozzle) limitations.push(`Requires at least ${requirement.nozzle} °C nozzle capability; ${printerLabel} is limited to ${printer.maxNozzleTempC} °C.`);
  if (printer.maxBedTempC < requirement.bed) limitations.push(`Requires at least ${requirement.bed} °C build-plate capability; ${printerLabel} is limited to ${printer.maxBedTempC} °C.`);
  if (requirement.enclosure && !printer.enclosed) limitations.push(`Requires an enclosed printer; ${printerLabel} is an open-frame profile.`);
  if (requirement.hardened && !printer.hardenedNozzle) limitations.push(`Requires a wear-resistant nozzle and compatible filament path; ${printerLabel} is not configured with one.`);
  return limitations;
}

const uniqueRequirements = (requirements: MaterialRequirement[]) => requirements.filter(
  (requirement, index) => requirements.findIndex(candidate => candidate.id === requirement.id) === index,
);

export function materialRequirements(answers: Questionnaire): MaterialRequirement[] {
  const intent = answers.manufacturingIntent;
  const requirements: MaterialRequirement[] = [];
  const add = (requirement: MaterialRequirement) => requirements.push(requirement);

  const outdoor = intent?.environment.location;
  const uv = intent?.environment.uvExposure;
  const moisture = intent?.environment.moistureExposure;
  const weatherExposed = Boolean(
    outdoor && intentFactUsable(outdoor) && outdoor.value === 'outdoor'
    || uv && intentFactUsable(uv) && uv.value === true
  ) || (!outdoor || !intentFactUsable(outdoor)) && answers.environment === 'outdoor';
  if (weatherExposed) add({
    id: 'weather-resistance', label: 'Weather resistance', benefit: 'outdoor', kind: 'required',
    reason: 'The reviewed plan includes outdoor or UV exposure.',
    evidenceIds: [...new Set([
      ...(outdoor && intentFactUsable(outdoor) ? outdoor.evidenceIds : []),
      ...(uv && intentFactUsable(uv) ? uv.evidenceIds : []),
      ...((!outdoor || !intentFactUsable(outdoor)) && answers.environment === 'outdoor' ? ['answer:environment'] : []),
    ])],
  });

  const impact = intent?.mechanical.impact;
  const impactValue = impact && intentFactUsable(impact) ? impact.value : answers.impact;
  if (impactValue === 'medium' || impactValue === 'high') add({
    id: 'toughness', label: impactValue === 'high' ? 'High-impact toughness' : 'Impact toughness', benefit: 'toughness', kind: 'required',
    reason: `The reviewed plan identifies ${impactValue} impact exposure.`,
    evidenceIds: impact && intentFactUsable(impact) ? impact.evidenceIds : ['answer:impact'],
  });

  const heat = intent?.thermal.band;
  const heatValue = heat && intentFactUsable(heat) ? heat.value : answers.heat;
  if (heatValue === 'warm' || heatValue === 'hot') add({
    id: 'heat-margin', label: heatValue === 'hot' ? 'High-temperature margin' : 'Elevated-temperature margin', benefit: heatValue === 'hot' ? 'high-heat' : 'heat', kind: 'required',
    reason: `The reviewed plan identifies ${heatValue === 'hot' ? 'high' : 'elevated'} service temperature.`,
    evidenceIds: heat && intentFactUsable(heat) ? heat.evidenceIds : ['answer:heat'],
  });

  const priority = intent?.preferences.priority;
  const priorityValue = priority && intentFactUsable(priority) ? priority.value : answers.priority;
  if (priorityValue === 'flexibility') add({
    id: 'flexibility', label: 'Flexible function', benefit: 'flexibility', kind: 'required',
    reason: 'The reviewed plan requires a flexible material response.',
    evidenceIds: priority && intentFactUsable(priority) ? priority.evidenceIds : ['answer:priority'],
  });
  if (priorityValue === 'strength') add({
    id: 'stiffness', label: 'Stiffness', benefit: 'stiffness', kind: 'preferred',
    reason: 'The reviewed plan prioritizes structural performance, so stiffness is used to rank otherwise compatible families.',
    evidenceIds: priority && intentFactUsable(priority) ? priority.evidenceIds : ['answer:priority'],
  });

  const service = intent?.environment.service;
  const serviceValue = service && intentFactUsable(service) ? service.value : 'unknown';
  const moistureExposed = Boolean(moisture && intentFactUsable(moisture) && moisture.value === true)
    || serviceValue === 'washed' || serviceValue === 'dishwasher';
  if (moistureExposed) add({
    id: 'moisture-resistance',
    label: serviceValue === 'dishwasher' ? 'Dishwasher moisture and wash-cycle compatibility' : 'Moisture resistance',
    benefit: serviceValue === 'dishwasher' ? undefined : 'moisture',
    kind: serviceValue === 'dishwasher' ? 'specialist-review' : 'required',
    reason: serviceValue === 'dishwasher'
      ? 'Dishwasher service combines hot water, detergents, repeated cycles, and product-specific material behavior.'
      : 'The reviewed plan includes direct moisture or repeated washing exposure.',
    evidenceIds: [...new Set([
      ...(moisture && intentFactUsable(moisture) ? moisture.evidenceIds : []),
      ...(service && intentFactUsable(service) ? service.evidenceIds : []),
    ])],
  });

  const loadMode = intent?.mechanical.loadMode;
  const loadValue = loadMode && intentFactUsable(loadMode) ? loadMode.value : answers.load;
  const magnitude = intent?.mechanical.loadMagnitude;
  const magnitudeValue = magnitude && intentFactUsable(magnitude) ? magnitude.value : 'unknown';
  const failure = intent?.failureConsequence;
  const safetyCritical = Boolean(failure && intentFactUsable(failure) && failure.value === 'safety-critical');
  if (loadValue === 'cyclic') add({
    id: 'fatigue-resistance', label: safetyCritical || magnitudeValue === 'heavy' || magnitudeValue === 'quantified'
      ? 'Qualified fatigue performance'
      : 'Fatigue resistance',
    benefit: safetyCritical || magnitudeValue === 'heavy' || magnitudeValue === 'quantified' ? undefined : 'fatigue',
    kind: safetyCritical || magnitudeValue === 'heavy' || magnitudeValue === 'quantified' ? 'specialist-review' : 'preferred',
    reason: safetyCritical || magnitudeValue === 'heavy' || magnitudeValue === 'quantified'
      ? 'Repeated consequential loading needs grade-, process-, geometry-, and load-specific fatigue evidence.'
      : 'The reviewed plan includes repeated loading, so fatigue resistance is used to rank otherwise compatible families.',
    evidenceIds: [...new Set([
      ...(loadMode && intentFactUsable(loadMode) ? loadMode.evidenceIds : ['answer:load']),
      ...(magnitude && intentFactUsable(magnitude) ? magnitude.evidenceIds : []),
      ...(failure && intentFactUsable(failure) ? failure.evidenceIds : []),
    ])],
  });

  const lifetime = intent?.intendedLifetime;
  const longTerm = Boolean(lifetime && intentFactUsable(lifetime) && lifetime.value === 'long-term');
  if (longTerm) {
    const creepNeedsQualification = loadValue === 'static' && (
      heatValue === 'warm' || heatValue === 'hot'
      || magnitudeValue === 'heavy' || magnitudeValue === 'quantified'
      || safetyCritical
    );
    add({
      id: 'creep-resistance',
      label: creepNeedsQualification ? 'Qualified long-term creep performance' : 'Creep resistance',
      benefit: creepNeedsQualification ? undefined : 'creep-resistance',
      kind: creepNeedsQualification ? 'specialist-review' : 'preferred',
      reason: creepNeedsQualification
        ? 'Long-term sustained, warm, heavy, or consequential loading requires grade- and load-specific creep data.'
        : 'The reviewed plan requests long service life, so creep resistance is used to rank otherwise compatible families.',
      evidenceIds: [...new Set([
        ...(lifetime && intentFactUsable(lifetime) ? lifetime.evidenceIds : []),
        ...(loadMode && intentFactUsable(loadMode) ? loadMode.evidenceIds : []),
        ...(heat && intentFactUsable(heat) ? heat.evidenceIds : []),
        ...(magnitude && intentFactUsable(magnitude) ? magnitude.evidenceIds : []),
      ])],
    });
  }

  const wear = intent?.mechanical.wear;
  if (wear && intentFactUsable(wear) && wear.value !== 'unknown') add({
    id: 'wear-resistance',
    label: wear.value === 'abrasive' ? 'Qualified abrasive-wear resistance' : 'Qualified sliding-wear resistance',
    kind: 'specialist-review',
    reason: `${wear.value === 'abrasive' ? 'Abrasive' : 'Sliding'} wear depends on the exact material grade, mating surface, lubrication, pressure, speed, and geometry.`,
    evidenceIds: wear.evidenceIds,
  });

  const chemical = intent?.environment.chemicalExposure;
  if (chemical && intentFactUsable(chemical) && chemical.value === true) {
    const details = intent.environment.chemicalDetails;
    add({
      id: 'chemical-compatibility',
      label: 'Qualified chemical compatibility',
      kind: 'specialist-review',
      reason: details && intentFactUsable(details) && details.value
        ? `Chemical compatibility with “${details.value}” requires a reviewed product-specific compatibility source.`
        : 'Chemical exposure requires the substance, concentration, temperature, duration, and material product to be established.',
      evidenceIds: [...new Set([
        ...chemical.evidenceIds,
        ...(details && intentFactUsable(details) ? details.evidenceIds : []),
      ])],
    });
  }

  return uniqueRequirements(requirements);
}

export function assessMaterialCandidate(
  answers: Questionnaire,
  material: Material,
  requirements = materialRequirements(answers),
): MaterialCandidateAssessment {
  const entry = materialEntry(material);
  const rigidPlan = !requirements.some(requirement => requirement.id === 'flexibility');
  const matches = (requirement: MaterialRequirement) => Boolean(requirement.benefit && entry.strengths.includes(requirement.benefit));
  const missingRequirements = requirements.filter(requirement => requirement.kind !== 'preferred' && !matches(requirement));
  const unmetPreferences = requirements.filter(requirement => requirement.kind === 'preferred' && !matches(requirement));
  if (rigidPlan && material === 'TPU') {
    missingRequirements.push({
      id: 'flexibility', label: 'Rigid functional material', benefit: 'stiffness',
      kind: 'required', reason: 'The reviewed plan does not call for a flexible material.', evidenceIds: [],
    });
  }
  const printerSelected = answers.printerId !== 'unselected';
  const printerLimitations = printerSelected ? materialPrinterLimitations(material, answers.printer) : [];
  const meetsRequirements = missingRequirements.length === 0;
  const printerCompatible = !printerSelected || printerLimitations.length === 0;
  return {
    material,
    meetsRequirements,
    printerCompatible,
    selectable: meetsRequirements && printerSelected && printerCompatible,
    matchedRequirements: requirements.filter(matches).map(requirement => requirement.id),
    missingRequirements,
    unmetPreferences,
    printerLimitations,
  };
}

export function viableMaterials(answers: Questionnaire): Material[] {
  const requirements = materialRequirements(answers);
  return materialCatalog
    .map(entry => assessMaterialCandidate(answers, entry.id, requirements))
    .filter(candidate => candidate.meetsRequirements && candidate.printerCompatible)
    .map(candidate => candidate.material);
}

export function planForMaterial(base: Recommendation[], material: Material): Recommendation[] {
  const entry = materialEntry(material);
  const values = new Map<string, string | number | boolean>([
    ['material', material], ['nozzle_temperature', entry.nozzleTemperature], ['bed_temperature', entry.bedTemperature],
  ]);
  return base.map(item => values.has(item.setting) ? {
    ...item,
    value: values.get(item.setting)!,
    reason: `${entry.label} is being evaluated as a requirement-compatible material candidate. ${entry.notes}`,
    ruleIds: ['OPT-MATERIAL'], matchedRuleIds: [...item.matchedRuleIds, 'OPT-MATERIAL'], evidenceLevel: 'D',
    validationStatus: 'Candidate; final mass and time require slicing.',
  } : item);
}

export interface MaterialAlternativeCandidate {
  material: Material;
  recommended: boolean;
  fitLabels: string[];
  improvement: string;
  disadvantages: string[];
  printerRequirements: string[];
  nozzleTemperature: string;
  bedTemperature: string;
  confidence: 'requirement-compatible' | 'family-level fallback';
  evidenceScope: string;
  relevanceScore: number;
  selectable: boolean;
  status: 'compatible' | 'requirements-gap' | 'specialist-review' | 'printer-incompatible';
  whyNotRecommended: string;
  missingRequirements: string[];
  unmetPreferences: string[];
  printerLimitations: string[];
}

const benefitLabels: Record<MaterialBenefit, string> = {
  'easy-to-print': 'Easier printing',
  outdoor: 'Outdoor-capable',
  moisture: 'Moisture tolerant',
  toughness: 'Impact toughness',
  fatigue: 'Fatigue-oriented family baseline',
  'creep-resistance': 'Improved creep margin',
  heat: 'Higher heat margin',
  'high-heat': 'High-temperature margin',
  stiffness: 'Higher stiffness',
  'dimensional-stability': 'Dimensional stability',
  flexibility: 'Flexible function',
};

function desiredBenefits(answers: Questionnaire, requirements = materialRequirements(answers)): MaterialBenefit[] {
  const desired: MaterialBenefit[] = [];
  desired.push(...requirements.flatMap(requirement => requirement.benefit ? [requirement.benefit] : []));
  if (answers.priority === 'strength') desired.push('stiffness');
  if (answers.priority === 'accuracy') desired.push('dimensional-stability');
  if (answers.priority === 'flexibility') desired.push('flexibility');
  if (!desired.length) desired.push('easy-to-print');
  return desired;
}

export function materialAlternatives(answers: Questionnaire, recommendedMaterial: Material): MaterialAlternativeCandidate[] {
  const requirements = materialRequirements(answers);
  const desired = desiredBenefits(answers, requirements);
  return materialCatalog
    .map(entry => {
      const assessment = assessMaterialCandidate(answers, entry.id, requirements);
      const matching = entry.strengths.filter(strength => desired.includes(strength));
      const fitLabels = matching.length ? matching.map(strength => benefitLabels[strength]) : entry.strengths.slice(0, 2).map(strength => benefitLabels[strength]);
      const status: MaterialAlternativeCandidate['status'] = !assessment.meetsRequirements
        ? assessment.missingRequirements.some(requirement => requirement.kind === 'specialist-review')
          ? 'specialist-review'
          : 'requirements-gap'
        : !assessment.printerCompatible ? 'printer-incompatible' : 'compatible';
      const whyNotRecommended = entry.id === recommendedMaterial
        ? 'This is the material selected by the deterministic Recommended plan.'
        : assessment.missingRequirements.length
          ? `It does not cover ${assessment.missingRequirements.map(requirement => requirement.label.toLocaleLowerCase('en-US')).join(' and ')} in Check Make’s current family-level model.`
          : assessment.printerLimitations.length
            ? assessment.printerLimitations[0]
            : entry.disadvantages[0] ?? 'It adds printing complexity without a requirement-backed benefit over the Recommended material.';
      return {
        material: entry.id,
        recommended: entry.id === recommendedMaterial,
        fitLabels,
        improvement: entry.id === recommendedMaterial
          ? 'This is the material used by the Recommended plan.'
          : matching.length
            ? `Adds ${matching.map(strength => benefitLabels[strength].toLocaleLowerCase('en-US')).join(' and ')} while preserving the confirmed requirements.`
            : entry.notes,
        disadvantages: entry.disadvantages,
        printerRequirements: entry.printerRequirements,
        nozzleTemperature: entry.nozzleTemperature,
        bedTemperature: entry.bedTemperature,
        confidence: entry.id === recommendedMaterial ? 'requirement-compatible' : 'family-level fallback',
        evidenceScope: 'Material-family comparison only. Exact properties and temperatures require a reviewed manufacturer and product profile.',
        relevanceScore: matching.length,
        selectable: assessment.selectable,
        status,
        whyNotRecommended,
        missingRequirements: assessment.missingRequirements.map(requirement => requirement.label),
        unmetPreferences: assessment.unmetPreferences.map(requirement => requirement.label),
        printerLimitations: assessment.printerLimitations,
      } satisfies MaterialAlternativeCandidate;
    })
    .sort((left, right) => {
      if (left.recommended) return -1;
      if (right.recommended) return 1;
      if (left.status !== right.status) {
        const rank: Record<MaterialAlternativeCandidate['status'], number> = { compatible: 0, 'requirements-gap': 1, 'specialist-review': 2, 'printer-incompatible': 3 };
        return rank[left.status] - rank[right.status];
      }
      return right.relevanceScore - left.relevanceScore || left.material.localeCompare(right.material);
    })
    .slice(0, 5);
}

export function evaluateMaterialPlan(answers: Questionnaire, recommendedMaterial: Material): MaterialPlanEvaluation {
  const requirements = materialRequirements(answers);
  const recommended = assessMaterialCandidate(answers, recommendedMaterial, requirements);
  const requirementReason = requirements.length
    ? requirements.map(requirement => requirement.reason).join(' ')
    : 'No demanding material requirement is confirmed, so the deterministic rules retain the general PLA baseline.';
  const blockerReasons = [
    ...recommended.missingRequirements.map(requirement => `${recommendedMaterial} does not cover the confirmed ${requirement.label.toLocaleLowerCase('en-US')} requirement in Check Make’s current family-level model. ${requirement.reason}`),
    ...recommended.printerLimitations,
  ];
  return {
    requirements,
    recommended,
    candidates: materialAlternatives(answers, recommendedMaterial),
    decisionReason: `${recommendedMaterial} is selected by the Recommended plan. ${requirementReason}`,
    blocked: recommended.missingRequirements.length > 0
      || answers.printerId !== 'unselected' && recommended.printerLimitations.length > 0,
    blockerReasons,
  };
}
