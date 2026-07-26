import type { CompatibilityNotice, Material, ModelAnalysis, PrinterCapabilities } from '../types';

const requirements: Record<Material, { nozzle: number; bed: number; enclosure?: boolean; hardened?: boolean }> = {
  PLA: { nozzle: 230, bed: 60 }, PETG: { nozzle: 260, bed: 80 },
  ASA: { nozzle: 270, bed: 100, enclosure: true }, TPU: { nozzle: 240, bed: 50 },
  'PA-CF': { nozzle: 290, bed: 100, enclosure: true, hardened: true }
};

export function checkMaterialCompatibility(material: Material, printer: PrinterCapabilities): CompatibilityNotice[] {
  const req = requirements[material]; const notices: CompatibilityNotice[] = [];
  if (printer.maxNozzleTempC < req.nozzle) notices.push({severity:'warning',message:`This material needs approximately ${req.nozzle} °C at the nozzle; your printer is limited to ${printer.maxNozzleTempC} °C.`});
  if (printer.maxBedTempC < req.bed) notices.push({severity:'warning',message:`This material needs approximately ${req.bed} °C at the build plate; your printer is limited to ${printer.maxBedTempC} °C.`});
  if (req.enclosure && !printer.enclosed) notices.push({severity:'warning',message:'This material should be printed in an enclosure to reduce warping and drafts.'});
  if (req.hardened && !printer.hardenedNozzle) notices.push({severity:'warning',message:'This fiber-reinforced material requires a wear-resistant nozzle and compatible filament path.'});
  if (!notices.length) notices.push({severity:'info',message:'The selected printer profile meets the material’s baseline requirements.'});
  return notices;
}

export function checkBuildVolume(analysis: ModelAnalysis, printer: PrinterCapabilities): CompatibilityNotice[] {
  const model=analysis.boundingBox.size, bed=printer.buildVolume;
  if(model.x>bed.x||model.y>bed.y||model.z>bed.z)return [{severity:'warning',message:`The imported orientation is ${model.x.toFixed(0)} × ${model.y.toFixed(0)} × ${model.z.toFixed(0)} mm, exceeding the ${bed.x} × ${bed.y} × ${bed.z} mm build volume.`}];
  return [];
}
