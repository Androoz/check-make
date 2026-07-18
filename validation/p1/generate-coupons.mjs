import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

const root = dirname(fileURLToPath(import.meta.url));
const outputDirectory = join(root, 'generated', 'coupons');
mkdirSync(outputDirectory, { recursive: true });

function extrudePolygonXZ(points, depthMm) {
  const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const vertices = [];
  for (const y of [-depthMm / 2, depthMm / 2]) {
    for (const [x, z] of points) vertices.push(x, y, z);
  }
  const count = points.length;
  const indices = [];
  for (const [a, b, c] of triangles) {
    indices.push(a, b, c, count + c, count + b, count + a);
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, count + next, next, index, count + index, count + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function normalizeToBed(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  object.position.x -= (box.min.x + box.max.x) / 2;
  object.position.y -= (box.min.y + box.max.y) / 2;
  object.position.z -= box.min.z;
  object.updateMatrixWorld(true);
  return object;
}

function adhesionCoupon({ baseWidthMm, heightMm, topOffsetMm }) {
  const depthMm = baseWidthMm;
  const points = [
    [-baseWidthMm / 2, 0], [baseWidthMm / 2, 0],
    [topOffsetMm + baseWidthMm / 2, heightMm], [topOffsetMm - baseWidthMm / 2, heightMm],
  ];
  return normalizeToBed(new THREE.Mesh(extrudePolygonXZ(points, depthMm)));
}

function overhangCoupon({ angleDeg, projectedSpanMm }) {
  const stemWidthMm = 6; const stemHeightMm = 10; const roofThicknessMm = 3; const depthMm = 10;
  const riseMm = Math.tan(THREE.MathUtils.degToRad(angleDeg)) * projectedSpanMm;
  const points = [
    [0, 0], [stemWidthMm, 0], [stemWidthMm, stemHeightMm],
    [stemWidthMm + projectedSpanMm, stemHeightMm + riseMm],
    [stemWidthMm + projectedSpanMm, stemHeightMm + riseMm + roofThicknessMm],
    [0, stemHeightMm + riseMm + roofThicknessMm],
  ];
  return normalizeToBed(new THREE.Mesh(extrudePolygonXZ(points, depthMm)));
}

function bridgeCoupon({ clearSpanMm }) {
  const columnWidthMm = 5; const depthMm = 10; const columnHeightMm = 15; const bridgeThicknessMm = 2.4;
  const group = new THREE.Group();
  const centerOffset = clearSpanMm / 2 + columnWidthMm / 2;
  for (const x of [-centerOffset, centerOffset]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(columnWidthMm, depthMm, columnHeightMm));
    column.position.set(x, 0, columnHeightMm / 2); group.add(column);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(clearSpanMm + 2 * columnWidthMm, depthMm, bridgeThicknessMm));
  beam.position.z = columnHeightMm + bridgeThicknessMm / 2; group.add(beam);
  return normalizeToBed(group);
}

const specimens = [
  ...[
    ['A01', 6, 80, 0], ['A02', 10, 80, 0], ['A03', 14, 80, 0],
    ['A04', 10, 120, 0], ['A05', 10, 80, 6], ['A06', 10, 120, 6],
  ].map(([id, baseWidthMm, heightMm, topOffsetMm]) => ({
    id, family: 'adhesion-stability', fileName: `${id}_tower_b${baseWidthMm}_h${heightMm}_o${topOffsetMm}.stl`,
    object: adhesionCoupon({ baseWidthMm, heightMm, topOffsetMm }),
    intendedFactors: {
      baseWidthMm, baseDepthMm: baseWidthMm, heightMm, topOffsetMm,
      bedContactAreaMm2: baseWidthMm * baseWidthMm,
      heightToContactWidthRatio: heightMm / baseWidthMm,
      bridgeGroundTruth: false,
    },
  })),
  ...[
    ['O01', 20, 20], ['O02', 30, 20], ['O03', 40, 20], ['O04', 50, 20],
    ['O05', 60, 20], ['O06', 40, 10], ['O07', 40, 30],
  ].map(([id, angleDeg, projectedSpanMm]) => ({
    id, family: 'inclined-overhang', fileName: `${id}_overhang_a${angleDeg}_s${projectedSpanMm}.stl`,
    object: overhangCoupon({ angleDeg, projectedSpanMm }),
    intendedFactors: {
      meanDownwardNormalAngleDeg: angleDeg, projectedSpanMm,
      inclinedSurfaceAreaMm2: projectedSpanMm / Math.cos(THREE.MathUtils.degToRad(angleDeg)) * 10,
      bridgeGroundTruth: false,
    },
  })),
  ...[
    ['B01', 5], ['B02', 10], ['B03', 20], ['B04', 30], ['B05', 40],
  ].map(([id, clearSpanMm]) => ({
    id, family: 'bridge', fileName: `${id}_bridge_s${clearSpanMm}.stl`,
    object: bridgeCoupon({ clearSpanMm }),
    intendedFactors: { clearSpanMm, projectedSpanMm: clearSpanMm, bridgeGroundTruth: true },
  })),
];

const exporter = new STLExporter();
const manifestSpecimens = specimens.map(specimen => {
  const exported = exporter.parse(specimen.object, { binary: true });
  const view = exported instanceof DataView ? exported : new DataView(exported);
  const bytes = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  const path = join(outputDirectory, specimen.fileName); writeFileSync(path, bytes);
  const bounds = new THREE.Box3().setFromObject(specimen.object); const size = new THREE.Vector3(); bounds.getSize(size);
  return {
    specimenId: specimen.id,
    family: specimen.family,
    file: `coupons/${specimen.fileName}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    triangleCount: (bytes.length - 84) / 50,
    boundingSizeMm: { x: size.x, y: size.y, z: size.z },
    intendedFactors: specimen.intendedFactors,
  };
});

const manifest = {
  schemaVersion: 1,
  pilotId: 'P1-ADHESION-SUPPORT-PILOT-001',
  generator: 'validation/p1/generate-coupons.mjs',
  units: 'mm',
  specimenCount: manifestSpecimens.length,
  experimentalUnit: 'one specimen per print job',
  specimens: manifestSpecimens,
};
writeFileSync(join(root, 'generated', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${manifest.specimenCount} deterministic P1 coupons in ${outputDirectory}`);
