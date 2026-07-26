import { describe, expect, it } from 'vitest';
import { normalizeEvidenceRows, parseCsv, parseEvidenceRows, type EvidenceImportMapping } from './normalize';

const mapping: EvidenceImportMapping = {
  schemaVersion: 1, datasetId: 'TEST-OVERHANG', format: 'csv', idColumn: 'id',
  scope: {
    process: { constant: 'material-extrusion' },
    materialFamily: { column: 'material' }, geometryClass: { constant: 'inclined-overhang' },
  },
  factors: [
    { name: 'angleDeg', column: 'angle_deg', type: 'number', unit: 'deg' },
    { name: 'nozzleTemperatureC', column: 'temp_c', type: 'number', unit: 'C' },
  ],
  outcomes: [{ name: 'roughnessUm', column: 'roughness_mm', type: 'number', scale: 1000, unit: 'um' }],
};

describe('external evidence normalization', () => {
  it('parses quoted CSV and normalizes mapped values and units', () => {
    const rows = parseCsv('id,material,angle_deg,temp_c,roughness_mm\n1,"PLA, natural",40,210,0.012\n');
    const [observation] = normalizeEvidenceRows(rows, mapping);
    expect(observation.observationId).toBe('TEST-OVERHANG:1');
    expect(observation.scope).toMatchObject({ process: 'material-extrusion', materialFamily: 'PLA, natural' });
    expect(observation.factors).toEqual({ angleDeg: 40, nozzleTemperatureC: 210 });
    expect(observation.outcomes.roughnessUm).toBe(12);
    expect(observation.units['outcomes.roughnessUm']).toBe('um');
  });

  it('supports JSON and JSONL object records', () => {
    expect(parseEvidenceRows('[{"id":1}]', 'json')).toEqual([{ id: 1 }]);
    expect(parseEvidenceRows('{"id":1}\n{"id":2}\n', 'jsonl')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('rejects malformed rows, duplicate IDs, and missing outcomes', () => {
    expect(() => parseCsv('a,b\n1\n')).toThrow(/expected 2/);
    const duplicate = [{ id: 'same', material: 'PLA', angle_deg: 40, temp_c: 210, roughness_mm: 0.1 }, { id: 'same', material: 'PLA', angle_deg: 45, temp_c: 210, roughness_mm: 0.2 }];
    expect(() => normalizeEvidenceRows(duplicate, mapping)).toThrow(/Duplicate observation ID/);
    expect(() => normalizeEvidenceRows([{ id: 1, material: 'PLA', angle_deg: 40, temp_c: 210 }], mapping)).toThrow(/roughnessUm is missing/);
  });
});

