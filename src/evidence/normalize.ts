export type ObservationValue = string|number|boolean;
export interface ValueBinding {
  column?: string;
  constant?: ObservationValue;
  type?: 'string'|'number'|'boolean';
  required?: boolean;
  unit?: string;
  scale?: number;
  offset?: number;
}
export interface EvidenceImportMapping {
  schemaVersion: 1;
  datasetId: string;
  format: 'csv'|'json'|'jsonl';
  idColumn?: string;
  scope: Record<string, ValueBinding>;
  factors: Array<ValueBinding & { name: string }>;
  outcomes: Array<ValueBinding & { name: string }>;
}
export interface NormalizedExternalObservation {
  observationId: string;
  datasetId: string;
  sourceRow: number;
  scope: Record<string, ObservationValue>;
  factors: Record<string, ObservationValue>;
  outcomes: Record<string, ObservationValue>;
  units: Record<string, string>;
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += character;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const nonEmpty = rows.filter(candidate => candidate.some(value => value.trim()));
  const headers = nonEmpty.shift()?.map(header => header.trim()) ?? [];
  if (!headers.length || new Set(headers).size !== headers.length) throw new Error('CSV headers must be present and unique.');
  return nonEmpty.map((values, rowIndex) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

export function parseEvidenceRows(text: string, format: EvidenceImportMapping['format']): Record<string, unknown>[] {
  if (format === 'csv') return parseCsv(text);
  if (format === 'jsonl') return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    const value = JSON.parse(line) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`JSONL row ${index + 1} is not an object.`);
    return value as Record<string, unknown>;
  });
  const value = JSON.parse(text) as unknown;
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('JSON evidence input must be an array of objects.');
  return value as Record<string, unknown>[];
}

function boundValue(row: Record<string, unknown>, binding: ValueBinding, label: string): ObservationValue | undefined {
  const raw = binding.constant ?? (binding.column ? row[binding.column] : undefined);
  const required = binding.required !== false;
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw new Error(`${label} is missing.`);
    return undefined;
  }
  const type = binding.type ?? (typeof binding.constant === 'number' ? 'number' : typeof binding.constant === 'boolean' ? 'boolean' : 'string');
  if (type === 'number') {
    const number = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(number)) throw new Error(`${label} is not a finite number.`);
    return number * (binding.scale ?? 1) + (binding.offset ?? 0);
  }
  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const normalized = String(raw).trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    throw new Error(`${label} is not a recognized boolean.`);
  }
  return String(raw).trim();
}

export function normalizeEvidenceRows(
  rows: Record<string, unknown>[], mapping: EvidenceImportMapping,
): NormalizedExternalObservation[] {
  if (mapping.schemaVersion !== 1 || !mapping.datasetId.trim()) throw new Error('Unsupported or incomplete evidence mapping.');
  if (!mapping.outcomes.length) throw new Error('At least one measured outcome is required.');
  const observationIds = new Set<string>();
  return rows.map((row, index) => {
    const sourceRow = index + 1;
    const rawId = mapping.idColumn ? row[mapping.idColumn] : sourceRow;
    const observationId = `${mapping.datasetId}:${String(rawId).trim()}`;
    if (observationIds.has(observationId)) throw new Error(`Duplicate observation ID ${observationId}.`);
    observationIds.add(observationId);
    const scope: Record<string, ObservationValue> = {};
    const factors: Record<string, ObservationValue> = {};
    const outcomes: Record<string, ObservationValue> = {};
    const units: Record<string, string> = {};
    for (const [name, binding] of Object.entries(mapping.scope)) {
      const value = boundValue(row, binding, `row ${sourceRow} scope.${name}`); if (value !== undefined) scope[name] = value;
    }
    for (const binding of mapping.factors) {
      const value = boundValue(row, binding, `row ${sourceRow} factor.${binding.name}`); if (value !== undefined) factors[binding.name] = value;
      if (binding.unit) units[`factors.${binding.name}`] = binding.unit;
    }
    for (const binding of mapping.outcomes) {
      const value = boundValue(row, binding, `row ${sourceRow} outcome.${binding.name}`); if (value !== undefined) outcomes[binding.name] = value;
      if (binding.unit) units[`outcomes.${binding.name}`] = binding.unit;
    }
    if (!Object.keys(outcomes).length) throw new Error(`row ${sourceRow} contains no measured outcome.`);
    return { observationId, datasetId: mapping.datasetId, sourceRow, scope, factors, outcomes, units };
  });
}
