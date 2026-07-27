import { describe, expect, it } from 'vitest';
import { checkMaterialCompatibility } from './compatibility';

describe('checkMaterialCompatibility', () => {
  it('warns when PA-CF exceeds printer capabilities', () => {
    const notices = checkMaterialCompatibility('PA-CF', {maxNozzleTempC:260,maxBedTempC:80,enclosed:false,hardenedNozzle:false});
    expect(notices.filter(n=>n.severity==='warning')).toHaveLength(4);
  });

  it('marks a compatible printer profile as a successful check', () => {
    expect(checkMaterialCompatibility('PETG', {maxNozzleTempC:300,maxBedTempC:110,enclosed:true,hardenedNozzle:true}))
      .toEqual([{severity:'success',message:'The selected printer profile meets the material’s baseline requirements.'}]);
  });
});
