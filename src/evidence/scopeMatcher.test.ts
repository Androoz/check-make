import { describe, expect, it } from 'vitest';
import type { EvidenceTargetScope, ExternalEvidenceDataset } from './types';
import { assessExternalDataset } from './scopeMatcher';

const target: EvidenceTargetScope = {
  process: 'material-extrusion', materialFamily: 'PLA', materialProduct: 'Example PLA',
  printerManufacturer: 'Example', printerModel: 'Printer 1', kinematicClass: 'corexy',
  nozzleDiameterMm: 0.4, layerHeightMm: 0.2, enclosure: true,
  geometryClass: 'inclined-overhang', outcomeDomain: 'support-need',
};
const dataset = (overrides: Partial<ExternalEvidenceDataset> = {}): ExternalEvidenceDataset => ({
  id: 'TEST', sourceIds: ['TEST-SOURCE'], title: 'Test observations',
  sourceStrength: 'peer-reviewed-experiment', dataAccess: 'raw-open', integrity: 'checksum-verified',
  license: 'CC BY 4.0', licenseUse: 'analysis-allowed', landingPage: 'https://example.com/data',
  localPath: 'test.csv', sha256: 'a'.repeat(64),
  scope: {
    process: 'material-extrusion', materialFamilies: ['PLA'], materialProducts: ['Example PLA'],
    printerManufacturers: ['Example'], printerModels: ['Printer 1'], kinematicClasses: ['corexy'],
    nozzleDiameterMm: [0.4], layerHeightMm: [0.2], enclosure: true,
    geometryClasses: ['inclined-overhang'],
  },
  outcomeDomains: ['support-need'], proxyOutcomeDomains: [], variables: ['angle', 'failure'],
  ruleIds: ['G05'], limitations: 'Synthetic test record.', reviewedAt: '2026-07-18', ...overrides,
});

describe('external evidence scope matcher', () => {
  it('allows fitting only for verified raw direct observations in a matching scope', () => {
    const result = assessExternalDataset(dataset(), target);
    expect(result.scopeMatch).toBe('exact');
    expect(result.outcomeMatch).toBe('direct');
    expect(result.eligibility).toBe('eligible-for-fit');
  });

  it('requires import and checksum verification before remote raw data can be used', () => {
    const result = assessExternalDataset(dataset({ integrity: 'metadata-verified', localPath: undefined, sha256: undefined }), target);
    expect(result.eligibility).toBe('import-required');
  });

  it('uses verified but only partially matching observations as a prior', () => {
    const partial = dataset({
      scope: { ...dataset().scope, printerModels: [], nozzleDiameterMm: [], layerHeightMm: [] },
    });
    const result = assessExternalDataset(partial, target);
    expect(result.scopeMatch).toBe('partial');
    expect(result.eligibility).toBe('eligible-as-prior');
  });

  it('keeps summarized studies directional even when material and geometry match', () => {
    const result = assessExternalDataset(dataset({ dataAccess: 'summary-only', integrity: 'metadata-verified' }), target);
    expect(result.eligibility).toBe('direction-only');
  });

  it('records build surface and slicer as explicit transfer dimensions when the target locks them', () => {
    const result = assessExternalDataset(dataset(), { ...target, buildSurface: 'textured PEI', slicer: 'Bambu Studio' });
    expect(result.dimensions.buildSurface).toBe('unknown');
    expect(result.dimensions.slicer).toBe('unknown');
    expect(result.scopeMatch).toBe('partial');
  });

  it('excludes another manufacturing process or an unrelated outcome', () => {
    expect(assessExternalDataset(dataset({ scope: { ...dataset().scope, process: 'laser-powder-bed-fusion' } }), target).eligibility).toBe('excluded');
    expect(assessExternalDataset(dataset({ outcomeDomains: ['tensile-properties'] }), target).eligibility).toBe('excluded');
  });
});
