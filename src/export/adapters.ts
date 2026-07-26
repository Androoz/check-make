import type { SlicerAdapterStatus, SlicerTarget } from '../types';

const supportedPrinters: Partial<Record<SlicerTarget, string[]>> = {
  bambu: ['bambu-x1c', 'bambu-p1s', 'bambu-a1', 'bambu-a1-mini'],
  orca: ['bambu-x1c', 'bambu-p1s', 'bambu-a1', 'bambu-a1-mini', 'prusa-mk4s', 'prusa-core-one', 'creality-k1c', 'creality-ender3-v3', 'creality-ender3-v3-se', 'creality-ender3-v3-ke', 'elegoo-neptune4pro', 'anycubic-kobra3'],
  prusa: ['prusa-mk4s', 'prusa-core-one'],
  cura: ['creality-ender3-v3-se', 'creality-ender3-v3-ke', 'elegoo-neptune4pro'],
  creality: ['bambu-x1c', 'bambu-p1s', 'bambu-a1', 'bambu-a1-mini', 'creality-k1c', 'creality-ender3-v3', 'creality-ender3-v3-se', 'creality-ender3-v3-ke'],
};

export const adapterPlaceholders: SlicerAdapterStatus[] = [
  { target: 'generic', label: 'Generic Core 3MF', available: true, capability: 'core-3mf', detail: 'Portable corrected mesh and Check Make metadata.', supportedPrinterIds: [] },
  { target: 'bambu', label: 'Bambu Studio', available: false, capability: 'planned', detail: 'Checking for Bambu Studio…', supportedPrinterIds: supportedPrinters.bambu },
  { target: 'orca', label: 'OrcaSlicer', available: false, capability: 'planned', detail: 'Checking for OrcaSlicer…', supportedPrinterIds: supportedPrinters.orca },
  { target: 'prusa', label: 'PrusaSlicer', available: false, capability: 'planned', detail: 'Checking for PrusaSlicer…', supportedPrinterIds: supportedPrinters.prusa },
  { target: 'cura', label: 'UltiMaker Cura', available: false, capability: 'planned', detail: 'Checking for UltiMaker Cura…', supportedPrinterIds: supportedPrinters.cura },
  { target: 'creality', label: 'Creality Print', available: false, capability: 'planned', detail: 'Checking for Creality Print…', supportedPrinterIds: supportedPrinters.creality },
];

export function supportsPrinter(adapter: SlicerAdapterStatus | undefined, printerId: string) {
  return !adapter?.supportedPrinterIds?.length || adapter.supportedPrinterIds.includes(printerId);
}

export function mergeDetectedAdapters(detected: SlicerAdapterStatus[]) {
  const byTarget = new Map(detected.map(adapter => [adapter.target, adapter]));
  return adapterPlaceholders.map(adapter => byTarget.get(adapter.target) ?? adapter);
}

const targetPreference: Array<{ matches: (printerId: string) => boolean; targets: SlicerTarget[] }> = [
  { matches: printerId => printerId.startsWith('bambu-'), targets: ['bambu', 'orca', 'creality'] },
  { matches: printerId => printerId.startsWith('prusa-'), targets: ['prusa', 'orca'] },
  { matches: printerId => printerId.startsWith('creality-'), targets: ['creality', 'cura', 'orca'] },
  { matches: printerId => printerId.startsWith('elegoo-'), targets: ['cura', 'orca'] },
  { matches: printerId => printerId.startsWith('anycubic-'), targets: ['orca'] },
];

export function suggestSlicerTarget(adapters: SlicerAdapterStatus[], printerId: string): SlicerTarget {
  const preferred = targetPreference.find(entry => entry.matches(printerId))?.targets ?? [];
  const compatible = (target: SlicerTarget) => {
    const adapter = adapters.find(candidate => candidate.target === target);
    return Boolean(adapter?.available && supportsPrinter(adapter, printerId));
  };
  return preferred.find(compatible) ?? adapters.find(adapter => adapter.target !== 'generic' && compatible(adapter.target))?.target ?? 'generic';
}
