import type { Material, PrinterProfile, Questionnaire, Recommendation } from '../types';

export interface MaterialCatalogEntry {
  id: Material;
  label: string;
  nominalDensityGcm3: number;
  nozzleTemperature: string;
  bedTemperature: string;
  notes: string;
}

export const materialCatalog: MaterialCatalogEntry[] = [
  { id: 'PLA', label: 'PLA', nominalDensityGcm3: 1.24, nozzleTemperature: '220 °C', bedTemperature: '55 °C', notes: 'General indoor baseline; not selected for elevated heat or long-term weather exposure.' },
  { id: 'PETG', label: 'PETG', nominalDensityGcm3: 1.27, nozzleTemperature: '250 °C', bedTemperature: '75 °C', notes: 'General weather- and impact-tolerant baseline.' },
  { id: 'ASA', label: 'ASA', nominalDensityGcm3: 1.07, nozzleTemperature: '260 °C', bedTemperature: '100 °C', notes: 'Weather and elevated-temperature candidate that normally needs an enclosure.' },
  { id: 'TPU', label: 'TPU', nominalDensityGcm3: 1.21, nozzleTemperature: '230 °C', bedTemperature: '50 °C', notes: 'Flexible-function candidate, not a drop-in rigid-material substitute.' },
  { id: 'PA-CF', label: 'PA-CF', nominalDensityGcm3: 1.10, nozzleTemperature: '285 °C', bedTemperature: '100 °C', notes: 'Stiff engineering candidate requiring an enclosed, abrasive-ready printer path.' },
];

export const materialEntry = (material: Material) => materialCatalog.find(entry => entry.id === material) ?? materialCatalog[0];

function printerCanUse(material: Material, printer: PrinterProfile) {
  if (material === 'ASA' && (!printer.enclosed || printer.maxNozzleTempC < 270 || printer.maxBedTempC < 100)) return false;
  if (material === 'PA-CF' && (!printer.enclosed || !printer.hardenedNozzle || printer.maxNozzleTempC < 290 || printer.maxBedTempC < 100)) return false;
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
