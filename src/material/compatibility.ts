import type { CompatibilityNotice, Material, ModelAnalysis, PrinterCapabilities } from '../types';
import { materialPrinterLimitations } from './catalog';

export function checkMaterialCompatibility(material: Material, printer: PrinterCapabilities): CompatibilityNotice[] {
  const notices: CompatibilityNotice[] = materialPrinterLimitations(material, printer)
    .map(message => ({ severity: 'warning', message }));
  if (!notices.length) notices.push({severity:'success',message:'The selected printer profile meets the material’s baseline requirements.'});
  return notices;
}

export function checkBuildVolume(analysis: ModelAnalysis, printer: PrinterCapabilities): CompatibilityNotice[] {
  const model=analysis.boundingBox.size, bed=printer.buildVolume;
  if(model.x>bed.x||model.y>bed.y||model.z>bed.z)return [{severity:'warning',message:`The imported orientation is ${model.x.toFixed(0)} × ${model.y.toFixed(0)} × ${model.z.toFixed(0)} mm, exceeding the ${bed.x} × ${bed.y} × ${bed.z} mm build volume.`}];
  return [];
}
