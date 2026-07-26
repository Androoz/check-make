import { describe, expect, it } from 'vitest';
import { packageFileName, serializeRecommendations } from './manufacturing';

describe('manufacturing package helpers', () => {
  it('uses an explicit slicer suffix for project packages', () => {
    expect(packageFileName('bracket.stl', 'generic')).toBe('bracket.check-make.3mf');
    expect(packageFileName('bracket.obj', 'generic')).toBe('bracket.check-make.3mf');
    expect(packageFileName('bracket.3mf', 'bambu')).toBe('bracket.check-make.bambu.3mf');
    expect(packageFileName('bracket.STL', 'bambu')).toBe('bracket.check-make.bambu.3mf');
    expect(packageFileName('bracket.stl', 'orca')).toBe('bracket.check-make.orca.3mf');
    expect(packageFileName('bracket.stl', 'prusa')).toBe('bracket.check-make.prusa.3mf');
    expect(packageFileName('bracket.stl', 'cura')).toBe('bracket.check-make.cura.3mf');
    expect(packageFileName('bracket.stl', 'creality')).toBe('bracket.check-make.creality.3mf');
  });

  it('passes only canonical setting keys and values to native adapters', () => {
    expect(JSON.parse(serializeRecommendations([{
      setting: 'wall_loops', value: 5, reason: 'test', ruleIds: ['U03'], matchedRuleIds: ['P04', 'U03'],
      evidenceLevel: 'D', validationStatus: 'unreviewed', trace: [],
    }]))).toEqual([{ setting: 'wall_loops', value: 5 }]);
  });
});
