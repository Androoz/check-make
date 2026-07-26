import type { Material, PrinterProfile, Questionnaire, Recommendation } from '../types';

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

export type MaterialBenefit = 'easy-to-print' | 'outdoor' | 'impact' | 'heat' | 'stiffness' | 'dimensional-stability' | 'flexibility';

export const materialCatalog: MaterialCatalogEntry[] = [
  {
    id: 'PLA', label: 'PLA', nominalDensityGcm3: 1.24, nozzleTemperature: '220 °C', bedTemperature: '55 °C',
    notes: 'General indoor baseline; not selected for elevated heat or long-term weather exposure.',
    strengths: ['easy-to-print', 'dimensional-stability'],
    disadvantages: ['Limited service-temperature margin', 'Not a long-term outdoor baseline', 'Lower impact tolerance than PETG'],
    printerRequirements: ['Standard non-abrasive filament path'],
  },
  {
    id: 'PETG', label: 'PETG', nominalDensityGcm3: 1.27, nozzleTemperature: '250 °C', bedTemperature: '75 °C',
    notes: 'General weather- and impact-tolerant baseline.',
    strengths: ['outdoor', 'impact'],
    disadvantages: ['More stringing and surface sensitivity than PLA', 'Lower stiffness than PLA or PA-CF', 'Not the high-temperature baseline'],
    printerRequirements: ['Nozzle capable of at least 260 °C', 'Build plate capable of at least 80 °C'],
  },
  {
    id: 'ASA', label: 'ASA', nominalDensityGcm3: 1.07, nozzleTemperature: '260 °C', bedTemperature: '100 °C',
    notes: 'Weather and elevated-temperature candidate that normally needs an enclosure.',
    strengths: ['outdoor', 'heat', 'dimensional-stability'],
    disadvantages: ['More warping risk than PLA or PETG', 'Ventilation and controlled printing conditions are important', 'Less forgiving on open-frame printers'],
    printerRequirements: ['Enclosed printer', 'Nozzle capable of at least 270 °C', 'Build plate capable of at least 100 °C'],
  },
  {
    id: 'TPU', label: 'TPU', nominalDensityGcm3: 1.21, nozzleTemperature: '230 °C', bedTemperature: '50 °C',
    notes: 'Flexible-function candidate, not a drop-in rigid-material substitute.',
    strengths: ['flexibility', 'impact'],
    disadvantages: ['Not a rigid structural substitute', 'Slower and more feed-path-sensitive printing', 'Fit and hardness depend on the exact product grade'],
    printerRequirements: ['Filament path suitable for flexible filament', 'Product-specific speed and hardness validation'],
  },
  {
    id: 'PA-CF', label: 'PA-CF', nominalDensityGcm3: 1.10, nozzleTemperature: '285 °C', bedTemperature: '100 °C',
    notes: 'Stiff engineering candidate requiring an enclosed, abrasive-ready printer path.',
    strengths: ['heat', 'stiffness', 'dimensional-stability'],
    disadvantages: ['Abrasive and moisture-sensitive', 'Not a universal impact upgrade', 'Properties and temperatures vary substantially by product grade'],
    printerRequirements: ['Enclosed printer', 'Wear-resistant nozzle and compatible filament path', 'Nozzle capable of at least 290 °C', 'Dry filament handling'],
  },
];

export const materialEntry = (material: Material) => materialCatalog.find(entry => entry.id === material) ?? materialCatalog[0];

function printerCanUse(material: Material, printer: PrinterProfile) {
  const requirements: Record<Material, { nozzle: number; bed: number; enclosure?: boolean; hardened?: boolean }> = {
    PLA: { nozzle: 230, bed: 60 },
    PETG: { nozzle: 260, bed: 80 },
    ASA: { nozzle: 270, bed: 100, enclosure: true },
    TPU: { nozzle: 240, bed: 50 },
    'PA-CF': { nozzle: 290, bed: 100, enclosure: true, hardened: true },
  };
  const requirement = requirements[material];
  if (printer.maxNozzleTempC < requirement.nozzle || printer.maxBedTempC < requirement.bed) return false;
  if (requirement.enclosure && !printer.enclosed) return false;
  if (requirement.hardened && !printer.hardenedNozzle) return false;
  return true;
}

export function viableMaterials(answers: Questionnaire): Material[] {
  if (answers.priority === 'flexibility') return printerCanUse('TPU', answers.printer) ? ['TPU'] : [];
  return materialCatalog.map(entry => entry.id).filter(material => {
    if (material === 'TPU') return false;
    if (!printerCanUse(material, answers.printer)) return false;
    if (answers.environment === 'outdoor' && material === 'PLA') return false;
    if ((answers.heat === 'warm' || answers.heat === 'hot') && material === 'PLA') return false;
    if (answers.heat === 'hot' && material === 'PETG') return false;
    if (answers.impact === 'high' && (material === 'PLA' || material === 'PA-CF')) return false;
    return true;
  });
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
}

const benefitLabels: Record<MaterialBenefit, string> = {
  'easy-to-print': 'Easier printing',
  outdoor: 'Outdoor-capable',
  impact: 'Impact tolerant',
  heat: 'Higher heat margin',
  stiffness: 'Higher stiffness',
  'dimensional-stability': 'Dimensional stability',
  flexibility: 'Flexible function',
};

function desiredBenefits(answers: Questionnaire): MaterialBenefit[] {
  const desired: MaterialBenefit[] = [];
  if (answers.environment === 'outdoor') desired.push('outdoor');
  if (answers.impact === 'medium' || answers.impact === 'high') desired.push('impact');
  if (answers.heat === 'warm' || answers.heat === 'hot') desired.push('heat');
  if (answers.priority === 'strength') desired.push('stiffness');
  if (answers.priority === 'accuracy') desired.push('dimensional-stability');
  if (answers.priority === 'flexibility') desired.push('flexibility');
  if (!desired.length) desired.push('easy-to-print');
  return desired;
}

export function materialAlternatives(answers: Questionnaire, recommendedMaterial: Material): MaterialAlternativeCandidate[] {
  const desired = desiredBenefits(answers);
  const viable = new Set(viableMaterials(answers));
  return materialCatalog
    .filter(entry => viable.has(entry.id))
    .map(entry => {
      const matching = entry.strengths.filter(strength => desired.includes(strength));
      const fitLabels = matching.length ? matching.map(strength => benefitLabels[strength]) : entry.strengths.slice(0, 2).map(strength => benefitLabels[strength]);
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
      } satisfies MaterialAlternativeCandidate;
    })
    .sort((left, right) => {
      if (left.recommended) return -1;
      if (right.recommended) return 1;
      return right.relevanceScore - left.relevanceScore || left.material.localeCompare(right.material);
    })
    .slice(0, 4);
}
