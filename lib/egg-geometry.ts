import * as THREE from 'three';

export interface EggShellGeometries {
  upperGeometry: THREE.BufferGeometry;
  lowerGeometry: THREE.BufferGeometry;
  upperEdgeGeometry: THREE.BufferGeometry;
  lowerEdgeGeometry: THREE.BufferGeometry;
}

interface HullFace {
  a: number;
  b: number;
  c: number;
  normal: THREE.Vector3;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function sphereToEgg(u: THREE.Vector3, target = new THREE.Vector3()): THREE.Vector3 {
  const rx = 0.96;
  const ry = 1.32;
  const taper = 1.0 - 0.21 * u.y - 0.04 * u.y * u.y;
  target.set(u.x * rx * taper, u.y * ry + 0.04, u.z * rx * taper);
  return target;
}

function makeFace(points: THREE.Vector3[], a: number, b: number, c: number): HullFace {
  const pa = points[a];
  const pb = points[b];
  const pc = points[c];
  const ab = new THREE.Vector3().subVectors(pb, pa);
  const ac = new THREE.Vector3().subVectors(pc, pa);
  const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();

  // Origin is strictly inside unit sphere, so outward normal has positive dot with pa
  if (normal.dot(pa) < 0) {
    normal.negate();
    return {a, b: c, c: b, normal};
  }
  return {a, b, c, normal};
}

function computeSphericalConvexHull(points: THREE.Vector3[]): HullFace[] {
  const n = points.length;

  // Pick initial 4 non-coplanar vertices with large volume
  const i0 = 0;
  let i1 = 1;
  let maxDistSq = -1;
  for (let i = 1; i < n; i++) {
    const d = points[i].distanceToSquared(points[i0]);
    if (d > maxDistSq) {
      maxDistSq = d;
      i1 = i;
    }
  }

  const lineDir = new THREE.Vector3().subVectors(points[i1], points[i0]).normalize();
  let i2 = -1;
  let maxLineDist = -1;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1) continue;
    tmp.subVectors(points[i], points[i0]);
    const proj = tmp.dot(lineDir);
    const perpSq = tmp.lengthSq() - proj * proj;
    if (perpSq > maxLineDist) {
      maxLineDist = perpSq;
      i2 = i;
    }
  }

  const triA = new THREE.Vector3().subVectors(points[i1], points[i0]);
  const triB = new THREE.Vector3().subVectors(points[i2], points[i0]);
  const planeNormal = new THREE.Vector3().crossVectors(triA, triB).normalize();
  let i3 = -1;
  let maxPlaneDist = -1;
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1 || i === i2) continue;
    tmp.subVectors(points[i], points[i0]);
    const dist = Math.abs(tmp.dot(planeNormal));
    if (dist > maxPlaneDist) {
      maxPlaneDist = dist;
      i3 = i;
    }
  }

  let faces: HullFace[] = [
    makeFace(points, i0, i1, i2),
    makeFace(points, i0, i2, i3),
    makeFace(points, i0, i3, i1),
    makeFace(points, i1, i3, i2),
  ];

  const used = new Set<number>([i0, i1, i2, i3]);

  for (let idx = 0; idx < n; idx++) {
    if (used.has(idx)) continue;
    const p = points[idx];

    const visible: HullFace[] = [];
    const hidden: HullFace[] = [];

    for (let f = 0; f < faces.length; f++) {
      const face = faces[f];
      tmp.subVectors(p, points[face.a]);
      if (face.normal.dot(tmp) > 1e-7) {
        visible.push(face);
      } else {
        hidden.push(face);
      }
    }

    if (visible.length === 0) continue;

    // Collect directed edges of visible faces; boundary edges lack their twin in visible set
    const visibleEdges = new Set<string>();
    const edgeList: Array<[number, number]> = [];
    for (let f = 0; f < visible.length; f++) {
      const vf = visible[f];
      const pairs: Array<[number, number]> = [
        [vf.a, vf.b],
        [vf.b, vf.c],
        [vf.c, vf.a],
      ];
      for (const [u, v] of pairs) {
        visibleEdges.add(`${u}_${v}`);
        edgeList.push([u, v]);
      }
    }

    faces = hidden;
    for (const [u, v] of edgeList) {
      if (!visibleEdges.has(`${v}_${u}`)) {
        faces.push(makeFace(points, u, v, idx));
      }
    }
  }

  return faces;
}

const MONOCHROME_PALETTE = [
  0x18181b, // deep obsidian
  0x222226, // charcoal
  0x2e2e33, // graphite
  0x3f3f46, // dark slate
  0x52525b, // medium charcoal
  0x71717a, // neutral slate
  0x94949c, // cool pewter
  0xb4b4bc, // silver grey
  0xd4d4d8, // soft platinum
  0xe8e8ec, // alabaster
  0xf4f4f5, // crisp off-white
];

export function createFacetedEggGeometries(): EggShellGeometries {
  const rand = mulberry32(20261224);
  const seedCount = 108;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  const seeds: THREE.Vector3[] = [];
  const upRef = new THREE.Vector3(0, 1, 0);
  const altRef = new THREE.Vector3(1, 0, 0);

  for (let i = 0; i < seedCount; i++) {
    const y = 1 - ((i + 0.5) / seedCount) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const p = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);

    // Tangential asymmetric jitter for irregular polygonal facets
    const ref = Math.abs(p.y) > 0.9 ? altRef : upRef;
    const t1 = new THREE.Vector3().crossVectors(ref, p).normalize();
    const t2 = new THREE.Vector3().crossVectors(p, t1).normalize();
    const jitterScale = 0.21;
    p.addScaledVector(t1, (rand() - 0.5) * jitterScale);
    p.addScaledVector(t2, (rand() - 0.5) * jitterScale);
    p.normalize();
    seeds.push(p);
  }

  const hullFaces = computeSphericalConvexHull(seeds);

  // Dual vertices on unit sphere & mapped onto egg surface
  const dualUnit: THREE.Vector3[] = [];
  const dualOuter: THREE.Vector3[] = [];
  const dualInner: THREE.Vector3[] = [];
  const shellThickness = 0.075;

  const edgeToFaces = new Map<string, number[]>();

  for (let f = 0; f < hullFaces.length; f++) {
    const face = hullFaces[f];
    const pa = seeds[face.a];
    const pb = seeds[face.b];
    const pc = seeds[face.c];

    const centroid = new THREE.Vector3().add(pa).add(pb).add(pc).normalize();
    const ab = new THREE.Vector3().subVectors(pb, pa);
    const ac = new THREE.Vector3().subVectors(pc, pa);
    const circum = new THREE.Vector3().crossVectors(ab, ac).normalize();
    if (circum.dot(centroid) < 0) circum.negate();

    const dualPt = new THREE.Vector3().lerpVectors(centroid, circum, 0.52).normalize();
    dualUnit.push(dualPt);

    const outerPos = sphereToEgg(dualPt);
    dualOuter.push(outerPos);

    // Estimate surface normal via finite difference on egg mapping or radial direction
    const innerPos = outerPos.clone().addScaledVector(dualPt, -shellThickness);
    dualInner.push(innerPos);

    const pairs: Array<[number, number]> = [
      [face.a, face.b],
      [face.b, face.c],
      [face.c, face.a],
    ];
    for (const [u, v] of pairs) {
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      const list = edgeToFaces.get(key);
      if (list) list.push(f);
      else edgeToFaces.set(key, [f]);
    }
  }

  // Group hull faces around each seed vertex to form Voronoi polygons
  const seedFaces: number[][] = Array.from({length: seedCount}, () => []);
  for (let f = 0; f < hullFaces.length; f++) {
    const face = hullFaces[f];
    seedFaces[face.a].push(f);
    seedFaces[face.b].push(f);
    seedFaces[face.c].push(f);
  }

  interface PolygonFacet {
    seedIdx: number;
    dualIndices: number[];
    centroidOuter: THREE.Vector3;
    centroidInner: THREE.Vector3;
    normal: THREE.Vector3;
    color: THREE.Color;
    isUpper: boolean;
  }

  const facets: PolygonFacet[] = [];

  for (let i = 0; i < seedCount; i++) {
    const incident = seedFaces[i];
    if (incident.length < 3) continue;

    const p = seeds[i];
    const ref = Math.abs(p.y) > 0.9 ? altRef : upRef;
    const t1 = new THREE.Vector3().crossVectors(ref, p).normalize();
    const t2 = new THREE.Vector3().crossVectors(p, t1).normalize();

    const ordered = incident
      .map((fIdx) => {
        const d = dualUnit[fIdx];
        const dx = d.x - p.x;
        const dy = d.y - p.y;
        const dz = d.z - p.z;
        const angle = Math.atan2(dx * t2.x + dy * t2.y + dz * t2.z, dx * t1.x + dy * t1.y + dz * t1.z);
        return {fIdx, angle};
      })
      .sort((a, b) => a.angle - b.angle)
      .map((entry) => entry.fIdx);

    const centroidOuter = new THREE.Vector3();
    const centroidInner = new THREE.Vector3();
    for (const fIdx of ordered) {
      centroidOuter.add(dualOuter[fIdx]);
      centroidInner.add(dualInner[fIdx]);
    }
    centroidOuter.divideScalar(ordered.length);
    centroidInner.divideScalar(ordered.length);

    // Compute average outward polygon normal
    const normal = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    for (let k = 0; k < ordered.length; k++) {
      const curr = dualOuter[ordered[k]];
      const next = dualOuter[ordered[(k + 1) % ordered.length]];
      v1.subVectors(curr, centroidOuter);
      v2.subVectors(next, centroidOuter);
      normal.add(new THREE.Vector3().crossVectors(v1, v2));
    }
    if (normal.lengthSq() < 1e-8) {
      normal.copy(p);
    } else {
      normal.normalize();
    }
    if (normal.dot(p) < 0) normal.negate();

    // Curated tonal distribution: gentle architectural contrast across monochrome shades
    const heightBias = (p.y + 1) * 0.5; // 0 bottom .. 1 top
    const rawTone = rand() * 0.78 + heightBias * 0.22;
    const paletteIdx = Math.min(
      MONOCHROME_PALETTE.length - 1,
      Math.max(0, Math.floor(rawTone * MONOCHROME_PALETTE.length)),
    );
    const color = new THREE.Color(MONOCHROME_PALETTE[paletteIdx]);

    const phi = Math.atan2(centroidOuter.z, centroidOuter.x);
    const crackY =
      0.04 +
      0.11 * Math.sin(2 * phi + 0.65) +
      0.055 * Math.cos(3 * phi - 0.45);
    const isUpper = centroidOuter.y >= crackY;

    facets.push({
      seedIdx: i,
      dualIndices: ordered,
      centroidOuter,
      centroidInner,
      normal,
      color,
      isUpper,
    });
  }

  // Build non-indexed BufferGeometries for crisp flat-shaded polygon facets
  interface MeshBuilder {
    positions: number[];
    normals: number[];
    colors: number[];
    edgePositions: number[];
    seenEdges: Set<string>;
  }

  const createBuilder = (): MeshBuilder => ({
    positions: [],
    normals: [],
    colors: [],
    edgePositions: [],
    seenEdges: new Set<string>(),
  });

  const upper = createBuilder();
  const lower = createBuilder();
  const innerColor = new THREE.Color(0x111113);
  const rimColor = new THREE.Color(0x8a8a93);

  const pushTri = (
    b: MeshBuilder,
    a: THREE.Vector3,
    bPt: THREE.Vector3,
    c: THREE.Vector3,
    n: THREE.Vector3,
    col: THREE.Color,
  ) => {
    b.positions.push(a.x, a.y, a.z, bPt.x, bPt.y, bPt.z, c.x, c.y, c.z);
    b.normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
    b.colors.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b);
  };

  // Map dual edge (fA, fB) -> facets sharing it so we can detect fracture seam edges
  const dualEdgeToFacets = new Map<string, number[]>();
  for (let fi = 0; fi < facets.length; fi++) {
    const d = facets[fi].dualIndices;
    for (let k = 0; k < d.length; k++) {
      const a = d[k];
      const b = d[(k + 1) % d.length];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const list = dualEdgeToFacets.get(key);
      if (list) list.push(fi);
      else dualEdgeToFacets.set(key, [fi]);
    }
  }

  for (let fi = 0; fi < facets.length; fi++) {
    const facet = facets[fi];
    const target = facet.isUpper ? upper : lower;
    const d = facet.dualIndices;
    const inwardNormal = facet.normal.clone().negate();

    for (let k = 0; k < d.length; k++) {
      const fA = d[k];
      const fB = d[(k + 1) % d.length];
      const pA = dualOuter[fA];
      const pB = dualOuter[fB];
      const iA = dualInner[fA];
      const iB = dualInner[fB];

      // Outer polygon facet triangle (shared flat normal & uniform shade across polygon)
      pushTri(target, facet.centroidOuter, pA, pB, facet.normal, facet.color);

      // Inner dark cavity triangle (reversed winding)
      pushTri(target, facet.centroidInner, iB, iA, inwardNormal, innerColor);

      // Polygon perimeter hairline edge (nudged radially outward by 0.002 to avoid z-fighting)
      const edgeKey = fA < fB ? `${fA}_${fB}` : `${fB}_${fA}`;
      if (!target.seenEdges.has(edgeKey)) {
        target.seenEdges.add(edgeKey);
        const eA = pA.clone().addScaledVector(dualUnit[fA], 0.0025);
        const eB = pB.clone().addScaledVector(dualUnit[fB], 0.0025);
        target.edgePositions.push(eA.x, eA.y, eA.z, eB.x, eB.y, eB.z);
      }

      // Check if this edge lies on the fracture seam between Upper and Lower halves
      const sharing = dualEdgeToFacets.get(edgeKey);
      if (sharing && sharing.length === 2) {
        const other = facets[sharing[0] === fi ? sharing[1] : sharing[0]];
        if (other.isUpper !== facet.isUpper) {
          // Emit wall bevel quad along the fracture edge so the shell has solid thickness
          const edgeVec = new THREE.Vector3().subVectors(pB, pA);
          const wallVec = new THREE.Vector3().subVectors(iA, pA);
          const rimNormal = new THREE.Vector3().crossVectors(edgeVec, wallVec).normalize();
          // Ensure rim normal faces out of the solid piece (away from facet centroid)
          const midEdge = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
          const awayFromFacet = new THREE.Vector3().subVectors(midEdge, facet.centroidOuter);
          if (rimNormal.dot(awayFromFacet) < 0) {
            rimNormal.negate();
            pushTri(target, pA, iA, iB, rimNormal, rimColor);
            pushTri(target, pA, iB, pB, rimNormal, rimColor);
          } else {
            pushTri(target, pA, pB, iB, rimNormal, rimColor);
            pushTri(target, pA, iB, iA, rimNormal, rimColor);
          }
        }
      }
    }
  }

  const finalizeMesh = (b: MeshBuilder): THREE.BufferGeometry => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3));
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    return geom;
  };

  const finalizeEdges = (b: MeshBuilder): THREE.BufferGeometry => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(b.edgePositions, 3));
    geom.computeBoundingSphere();
    return geom;
  };

  return {
    upperGeometry: finalizeMesh(upper),
    lowerGeometry: finalizeMesh(lower),
    upperEdgeGeometry: finalizeEdges(upper),
    lowerEdgeGeometry: finalizeEdges(lower),
  };
}
