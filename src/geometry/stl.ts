import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { ModelAnalysis } from '../types';

export function analyzeStl(buffer: ArrayBuffer, fileName: string): { analysis: ModelAnalysis; geometry: THREE.BufferGeometry } {
  const geometry = new STLLoader().parse(buffer);
  geometry.computeBoundingBox(); geometry.computeVertexNormals();
  const box = geometry.boundingBox!; const size = new THREE.Vector3(); box.getSize(size);
  const positions = geometry.getAttribute('position');
  let totalArea = 0, overhangArea = 0, bedContactArea = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  const bedEpsilon = Math.max(0.05, size.z * 0.002);
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
    ab.subVectors(b, a); ac.subVectors(c, a); normal.crossVectors(ab, ac);
    const area = normal.length() / 2; if (!area) continue; normal.normalize(); totalArea += area;
    // Down-facing surfaces steeper than 45° relative to the build plate are support candidates.
    if (normal.z < -Math.SQRT1_2) overhangArea += area;
    if (Math.max(a.z, b.z, c.z) <= box.min.z + bedEpsilon && Math.abs(normal.z) > 0.9) bedContactArea += area;
  }
  const orientations = analyzeOrientations(geometry);
  const analysis: ModelAnalysis = {
    fileName, triangleCount: positions.count / 3,
    boundingBox: { min: {x:box.min.x,y:box.min.y,z:box.min.z}, max:{x:box.max.x,y:box.max.y,z:box.max.z}, size:{x:size.x,y:size.y,z:size.z} },
    heightMm: size.z, bedContactAreaMm2: bedContactArea, overhangAreaMm2: overhangArea,
    overhangRatio: totalArea ? overhangArea / totalArea : 0,
    confidence: { bedContact: 0.55, overhang: 0.72 }, orientations, orientationLabel:'As imported'
  };
  return { analysis, geometry };
}

const transforms: Array<{id:string;label:string;map:(v:THREE.Vector3)=>THREE.Vector3}> = [
  {id:'as-imported',label:'As imported',map:v=>new THREE.Vector3(v.x,v.y,v.z)},
  {id:'flip-z',label:'Flip upside down',map:v=>new THREE.Vector3(v.x,-v.y,-v.z)},
  {id:'right-side',label:'Place right side down',map:v=>new THREE.Vector3(v.z,v.y,-v.x)},
  {id:'left-side',label:'Place left side down',map:v=>new THREE.Vector3(-v.z,v.y,v.x)},
  {id:'front-side',label:'Place front side down',map:v=>new THREE.Vector3(v.x,v.z,-v.y)},
  {id:'back-side',label:'Place back side down',map:v=>new THREE.Vector3(v.x,-v.z,v.y)}
];

function analyzeOrientations(geometry: THREE.BufferGeometry) {
  const pos=geometry.getAttribute('position'); const source=new THREE.Vector3();
  return transforms.map(t=>{
    let minZ=Infinity,maxZ=-Infinity;
    for(let i=0;i<pos.count;i++){source.fromBufferAttribute(pos,i);const v=t.map(source);minZ=Math.min(minZ,v.z);maxZ=Math.max(maxZ,v.z)}
    const epsilon=Math.max(.05,(maxZ-minZ)*.002);let total=0,overhang=0,contact=0;
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),n=new THREE.Vector3();
    for(let i=0;i<pos.count;i+=3){source.fromBufferAttribute(pos,i);a.copy(t.map(source));source.fromBufferAttribute(pos,i+1);b.copy(t.map(source));source.fromBufferAttribute(pos,i+2);c.copy(t.map(source));n.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a));const area=n.length()/2;if(!area)continue;n.normalize();total+=area;if(n.z < -Math.SQRT1_2)overhang+=area;if(Math.max(a.z,b.z,c.z)<=minZ+epsilon&&Math.abs(n.z)>.9)contact+=area}
    return {id:t.id,label:t.label,heightMm:maxZ-minZ,bedContactAreaMm2:contact,overhangRatio:total?overhang/total:0};
  });
}

export function chooseOrientation(analysis: ModelAnalysis, priority: 'strength'|'accuracy'|'finish'|'speed'|'flexibility') {
  const maxContact=Math.max(...analysis.orientations.map(o=>o.bedContactAreaMm2),1);const maxHeight=Math.max(...analysis.orientations.map(o=>o.heightMm),1);
  const score=(o:ModelAnalysis['orientations'][number])=>{const contact=o.bedContactAreaMm2/maxContact,height=o.heightMm/maxHeight,clean=1-o.overhangRatio;
    if(priority==='finish')return clean*.65+contact*.2+(1-height)*.15;
    if(priority==='speed')return (1-height)*.5+clean*.35+contact*.15;
    if(priority==='accuracy')return contact*.5+clean*.35+(1-height)*.15;
    return contact*.45+clean*.3+(1-height)*.25;
  };
  return [...analysis.orientations].sort((a,b)=>score(b)-score(a))[0];
}
