import { describe, expect, it } from 'vitest';
import { analyzeStl, chooseOrientation } from './stl';

// Binary STL for a small triangle is cumbersome; the ranking contract is verified on a modeled analysis.
describe('chooseOrientation',()=>{
  it('prefers low overhang for surface finish',()=>{
    const analysis={orientations:[
      {id:'a',label:'Tall clean side',heightMm:100,bedContactAreaMm2:20,overhangRatio:.01},
      {id:'b',label:'Low rough side',heightMm:20,bedContactAreaMm2:100,overhangRatio:.5}
    ]} as ReturnType<typeof analyzeStl>['analysis'];
    expect(chooseOrientation(analysis,'finish').id).toBe('a');
  });
});
