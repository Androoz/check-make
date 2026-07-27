import { describe, expect, it } from 'vitest';
import type { MaterialAlternativeCandidate } from '../material/catalog';
import { compatibleMaterialAlternatives } from './RecommendationResults';

const candidate = (
  material: MaterialAlternativeCandidate['material'],
  selectable: boolean,
  recommended = false,
) => ({
  material,
  selectable,
  recommended,
}) as MaterialAlternativeCandidate;

describe('material alternative presentation', () => {
  it('shows only compatible selectable alternatives', () => {
    expect(compatibleMaterialAlternatives([
      candidate('PETG', false, true),
      candidate('ASA', false),
      candidate('PA-CF', false),
    ])).toEqual([]);

    expect(compatibleMaterialAlternatives([
      candidate('PLA', true, true),
      candidate('PETG', true),
      candidate('ASA', false),
    ]).map(option => option.material)).toEqual(['PETG']);
  });
});
