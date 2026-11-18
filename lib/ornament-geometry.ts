import * as THREE from 'three';

export interface OrnamentQrTileGeometryData {
  outerGeo: THREE.BufferGeometry;
  innerGeo: THREE.BufferGeometry;
  rimGeo: THREE.BufferGeometry;
  outerEdgeGeo: THREE.BufferGeometry;
  anchorPosition: THREE.Vector3;
  anchorQuaternion: THREE.Quaternion;
  maxRadius: number;
  qrSquareHalf: number;
}

export interface OrnamentParts {
  upperOuterGeo: THREE.BufferGeometry;
  upperInnerGeo: THREE.BufferGeometry;
  upperRimGeo: THREE.BufferGeometry;
  lowerOuterGeo: THREE.BufferGeometry;
  lowerInnerGeo: THREE.BufferGeometry;
  lowerRimGeo: THREE.BufferGeometry;
  capBodyGeo: THREE.BufferGeometry;
  capCollarGeo: THREE.BufferGeometry;
  pinGeo: THREE.BufferGeometry;
  loopGeo: THREE.BufferGeometry;
  finishTexture: THREE.CanvasTexture;
  qrTile: OrnamentQrTileGeometryData;
}

function createSpiralOrnamentTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    const pairs = 6; // 6 deep pine-slate + 6 warm satin stone spiral bands
    const twistAmount = 0.58;

    // Deep Pine-Slate (#182a26) & Warm Satin Stone (#c6c1b8) tuned for pure white background prominence
    const darkR = 24;
    const darkG = 42;
    const darkB = 38;
    const lightR = 198;
    const lightG = 193;
    const lightB = 184;

    for (let py = 0; py < size; py++) {
      const v = 1 - py / (size - 1);
      const yNorm = Math.max(-1, Math.min(1, 2 * v - 1));
      const theta = Math.acos(yNorm);
      const sinTheta = Math.max(0.04, Math.sin(theta));

      const spiralOffset =
        twistAmount * (theta / Math.PI) + 0.045 * Math.sin(theta * 2);

      // Gentle vertical spherical modeling so lighter bands keep edge definition against white
      const shadeMod = 0.86 + 0.14 * v;

      const aa = Math.min(0.42, Math.max(0.035, 0.045 / sinTheta));

      for (let px = 0; px < size; px++) {
        const u = px / size;
        const phase = (u - spiralOffset) * pairs;
        const wave = Math.sin(2 * Math.PI * phase);

        const t = Math.max(0, Math.min(1, (wave + aa) / (2 * aa)));
        const blend = t * t * (3 - 2 * t);

        const idx = (py * size + px) * 4;
        data[idx] = Math.round((darkR + (lightR - darkR) * blend) * shadeMod);
        data[idx + 1] = Math.round((darkG + (lightG - darkG) * blend) * shadeMod);
        data[idx + 2] = Math.round((darkB + (lightB - darkB) * blend) * shadeMod);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createFlutedCapGeometry(
  radiusBottom: number,
  radiusTop: number,
  height: number,
  flutes = 20,
): THREE.BufferGeometry {
  const radialSegments = flutes * 3;
  const heightSegments = 4;
  const geo = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    radialSegments,
    heightSegments,
    false,
  );

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.01) {
      const angle = Math.atan2(z, x);
      const yNorm = 1 - Math.abs(y / (height * 0.5));
      const rib =
        Math.cos(angle * flutes) * 0.008 * Math.pow(Math.max(0, yNorm), 0.5);
      const scale = (r + rib) / r;
      pos.setX(i, x * scale);
      pos.setZ(i, z * scale);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function computePolygonMaxCenteredSquare(
  pts2D: Array<{u: number; v: number}>,
): number {
  let minHalf = Infinity;
  const n = pts2D.length;
  for (let k = 0; k < n; k++) {
    const a = pts2D[k];
    const b = pts2D[(k + 1) % n];
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let ox = dy / len;
    let oy = -dx / len;
    let dist = a.u * ox + a.v * oy;
    if (dist < 0) {
      ox = -ox;
      oy = -oy;
      dist = -dist;
    }
    const denom = Math.abs(ox) + Math.abs(oy);
    if (denom > 1e-6) {
      minHalf = Math.min(minHalf, dist / denom);
    }
  }
  return Number.isFinite(minHalf) ? minHalf : 0.08;
}

interface TriBuilder {
  positions: number[];
  normals: number[];
  uvs: number[];
}

const createTriBuilder = (): TriBuilder => ({
  positions: [],
  normals: [],
  uvs: [],
});

function pushVertex(
  b: TriBuilder,
  p: THREE.Vector3,
  n: THREE.Vector3,
  u: number,
  v: number,
) {
  b.positions.push(p.x, p.y, p.z);
  b.normals.push(n.x, n.y, n.z);
  b.uvs.push(u, v);
}

function finalizeTriGeometry(b: TriBuilder): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(b.positions, 3),
  );
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export function createOrnamentParts(): OrnamentParts {
  const outerR = 1.06;
  const innerR = 0.99;
  const radialSegments = 72;
  const arcSteps = 32;

  // Upper hemisphere outer profile (equator y=0 up to neck under cap)
  const neckStopAngle = Math.PI * 0.415;
  const upperOuterPts: THREE.Vector2[] = [];
  for (let i = 0; i <= arcSteps; i++) {
    const phi = (i / arcSteps) * neckStopAngle;
    upperOuterPts.push(
      new THREE.Vector2(Math.cos(phi) * outerR, Math.sin(phi) * outerR),
    );
  }
  const neckTopR = Math.cos(neckStopAngle) * outerR;
  const neckTopY = Math.sin(neckStopAngle) * outerR;
  upperOuterPts.push(new THREE.Vector2(neckTopR * 0.96, neckTopY + 0.06));
  const upperOuterGeo = new THREE.LatheGeometry(upperOuterPts, radialSegments);

  // Upper hemisphere inner cavity profile
  const upperInnerPts: THREE.Vector2[] = [];
  upperInnerPts.push(new THREE.Vector2(0, innerR));
  for (let i = arcSteps; i >= 0; i--) {
    const phi = (i / arcSteps) * (Math.PI * 0.5);
    upperInnerPts.push(
      new THREE.Vector2(Math.cos(phi) * innerR, Math.sin(phi) * innerR),
    );
  }
  const upperInnerGeo = new THREE.LatheGeometry(upperInnerPts, radialSegments);

  // Upper half downward-facing rim connecting innerR to outerR at y = 0
  const upperRimPts: THREE.Vector2[] = [
    new THREE.Vector2(innerR, 0),
    new THREE.Vector2(outerR, 0),
  ];
  const upperRimGeo = new THREE.LatheGeometry(upperRimPts, radialSegments);

  // Fix UVs on upper outer shell so vertical spiral spans seamlessly across (-outerR .. +outerR)
  const mapUpperUvs = (geo: THREE.BufferGeometry) => {
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    if (!uv) return;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const v = THREE.MathUtils.clamp((y + outerR) / (outerR * 2), 0, 1);
      uv.setY(i, v);
    }
    uv.needsUpdate = true;
  };
  mapUpperUvs(upperOuterGeo);

  // Lower hemisphere upward-facing rim connecting outerR to innerR at y = 0
  const lowerRimPts: THREE.Vector2[] = [
    new THREE.Vector2(outerR, 0),
    new THREE.Vector2(innerR, 0),
  ];
  const lowerRimGeo = new THREE.LatheGeometry(lowerRimPts, radialSegments);

  // Build lower outer shell, lower inner cavity + dark socket, and detachable QR tile
  // Patch sits centered at the rear-facing interior slope of the lower bowl (facing forward toward camera when opened)
  const segStart = 32;
  const segEnd = 39; // 7 segments (35 deg wide)
  const stepStart = 15;
  const stepEnd = 24; // 9 steps (~25.3 deg tall, centered around -35.2 deg)

  const spherePoint = (
    radius: number,
    segIdx: number,
    stepIdx: number,
  ): THREE.Vector3 => {
    const lon = (segIdx / radialSegments) * Math.PI * 2;
    const lat = -Math.PI * 0.5 + (stepIdx / arcSteps) * (Math.PI * 0.5);
    const cosLat = stepIdx === 0 ? 0 : Math.cos(lat);
    const sinLat = stepIdx === 0 ? -1 : stepIdx === arcSteps ? 0 : Math.sin(lat);
    return new THREE.Vector3(
      cosLat * radius * Math.sin(lon),
      sinLat * radius,
      cosLat * radius * Math.cos(lon),
    );
  };

  const sphereNormalOut = (segIdx: number, stepIdx: number): THREE.Vector3 => {
    const lon = (segIdx / radialSegments) * Math.PI * 2;
    const lat = -Math.PI * 0.5 + (stepIdx / arcSteps) * (Math.PI * 0.5);
    const cosLat = stepIdx === 0 ? 0 : Math.cos(lat);
    const sinLat = stepIdx === 0 ? -1 : stepIdx === arcSteps ? 0 : Math.sin(lat);
    return new THREE.Vector3(
      cosLat * Math.sin(lon),
      sinLat,
      cosLat * Math.cos(lon),
    ).normalize();
  };

  const sphereUv = (segIdx: number, stepIdx: number): [number, number] => {
    const lat = -Math.PI * 0.5 + (stepIdx / arcSteps) * (Math.PI * 0.5);
    const y = (stepIdx === 0 ? -1 : stepIdx === arcSteps ? 0 : Math.sin(lat)) * outerR;
    const u = segIdx / radialSegments;
    const v = THREE.MathUtils.clamp((y + outerR) / (outerR * 2), 0, 1);
    return [u, v];
  };

  // Compute tile anchor frame in lowerPivot local space
  const lonCenter = (((segStart + segEnd) * 0.5) / radialSegments) * Math.PI * 2;
  const latCenter =
    -Math.PI * 0.5 + (((stepStart + stepEnd) * 0.5) / arcSteps) * (Math.PI * 0.5);
  const centerOutwardN = new THREE.Vector3(
    Math.cos(latCenter) * Math.sin(lonCenter),
    Math.sin(latCenter),
    Math.cos(latCenter) * Math.cos(lonCenter),
  ).normalize();
  const centerInwardN = centerOutwardN.clone().negate();
  const upRef = new THREE.Vector3(0, 1, 0);
  const tileTangentV = upRef
    .clone()
    .addScaledVector(centerInwardN, -upRef.dot(centerInwardN))
    .normalize();
  const tileTangentU = new THREE.Vector3()
    .crossVectors(tileTangentV, centerInwardN)
    .normalize();

  const anchorBasis = new THREE.Matrix4().makeBasis(
    tileTangentU,
    tileTangentV,
    centerInwardN,
  );
  const anchorQuaternion = new THREE.Quaternion().setFromRotationMatrix(
    anchorBasis,
  );
  const invAnchorQuat = anchorQuaternion.clone().invert();
  const anchorPosition = centerOutwardN.clone().multiplyScalar(innerR);

  const toTileLocal = (worldPt: THREE.Vector3): THREE.Vector3 =>
    worldPt.clone().sub(anchorPosition).applyQuaternion(invAnchorQuat);
  const toTileLocalDir = (worldDir: THREE.Vector3): THREE.Vector3 =>
    worldDir.clone().applyQuaternion(invAnchorQuat).normalize();

  const lowerOuterBuilder = createTriBuilder();
  const lowerInnerBuilder = createTriBuilder();
  const qrOuterBuilder = createTriBuilder();
  const qrInnerBuilder = createTriBuilder();
  const qrRimBuilder = createTriBuilder();

  const isQrSlotCell = (i: number, j: number) =>
    i >= segStart && i < segEnd && j >= stepStart && j < stepEnd;

  // 1. Lower outer shell & QR tile outer shell
  for (let i = 0; i < radialSegments; i++) {
    for (let j = 0; j < arcSteps; j++) {
      const pBL = spherePoint(outerR, i, j);
      const pBR = spherePoint(outerR, i + 1, j);
      const pTR = spherePoint(outerR, i + 1, j + 1);
      const pTL = spherePoint(outerR, i, j + 1);

      const nBL = sphereNormalOut(i, j);
      const nBR = sphereNormalOut(i + 1, j);
      const nTR = sphereNormalOut(i + 1, j + 1);
      const nTL = sphereNormalOut(i, j + 1);

      const [uBL, vBL] = sphereUv(i, j);
      const [uBR, vBR] = sphereUv(i + 1, j);
      const [uTR, vTR] = sphereUv(i + 1, j + 1);
      const [uTL, vTL] = sphereUv(i, j + 1);

      if (isQrSlotCell(i, j)) {
        const lBL = toTileLocal(pBL);
        const lBR = toTileLocal(pBR);
        const lTR = toTileLocal(pTR);
        const lTL = toTileLocal(pTL);
        const lnBL = toTileLocalDir(nBL);
        const lnBR = toTileLocalDir(nBR);
        const lnTR = toTileLocalDir(nTR);
        const lnTL = toTileLocalDir(nTL);

        pushVertex(qrOuterBuilder, lBL, lnBL, uBL, vBL);
        pushVertex(qrOuterBuilder, lBR, lnBR, uBR, vBR);
        pushVertex(qrOuterBuilder, lTR, lnTR, uTR, vTR);

        pushVertex(qrOuterBuilder, lBL, lnBL, uBL, vBL);
        pushVertex(qrOuterBuilder, lTR, lnTR, uTR, vTR);
        pushVertex(qrOuterBuilder, lTL, lnTL, uTL, vTL);
      } else if (j === 0) {
        // Pole cap triangle
        pushVertex(lowerOuterBuilder, pBL, nBL, uBL, vBL);
        pushVertex(lowerOuterBuilder, pTR, nTR, uTR, vTR);
        pushVertex(lowerOuterBuilder, pTL, nTL, uTL, vTL);
      } else {
        pushVertex(lowerOuterBuilder, pBL, nBL, uBL, vBL);
        pushVertex(lowerOuterBuilder, pBR, nBR, uBR, vBR);
        pushVertex(lowerOuterBuilder, pTR, nTR, uTR, vTR);

        pushVertex(lowerOuterBuilder, pBL, nBL, uBL, vBL);
        pushVertex(lowerOuterBuilder, pTR, nTR, uTR, vTR);
        pushVertex(lowerOuterBuilder, pTL, nTL, uTL, vTL);
      }
    }
  }

  // 2. Lower inner cavity + sealed recessed socket under QR slot
  const socketR = outerR - 0.015; // 1.045: sits cleanly between innerR (0.99) and outerR (1.06)
  for (let i = 0; i < radialSegments; i++) {
    for (let j = 0; j < arcSteps; j++) {
      const inSlot = isQrSlotCell(i, j);
      const r = inSlot ? socketR : innerR;
      const pBL = spherePoint(r, i, j);
      const pBR = spherePoint(r, i + 1, j);
      const pTR = spherePoint(r, i + 1, j + 1);
      const pTL = spherePoint(r, i, j + 1);

      const nBL = sphereNormalOut(i, j).negate();
      const nBR = sphereNormalOut(i + 1, j).negate();
      const nTR = sphereNormalOut(i + 1, j + 1).negate();
      const nTL = sphereNormalOut(i, j + 1).negate();

      const [uBL, vBL] = sphereUv(i, j);
      const [uBR, vBR] = sphereUv(i + 1, j);
      const [uTR, vTR] = sphereUv(i + 1, j + 1);
      const [uTL, vTL] = sphereUv(i, j + 1);

      if (j === 0) {
        pushVertex(lowerInnerBuilder, pBL, nBL, uBL, vBL);
        pushVertex(lowerInnerBuilder, pTL, nTL, uTL, vTL);
        pushVertex(lowerInnerBuilder, pTR, nTR, uTR, vTR);
      } else {
        pushVertex(lowerInnerBuilder, pBL, nBL, uBL, vBL);
        pushVertex(lowerInnerBuilder, pTR, nTR, uTR, vTR);
        pushVertex(lowerInnerBuilder, pBR, nBR, uBR, vBR);

        pushVertex(lowerInnerBuilder, pBL, nBL, uBL, vBL);
        pushVertex(lowerInnerBuilder, pTL, nTL, uTL, vTL);
        pushVertex(lowerInnerBuilder, pTR, nTR, uTR, vTR);
      }
    }
  }

  // Helper to push an oriented flat quad facing toward targetDirCenter
  const pushOrientedQuad = (
    b: TriBuilder,
    a: THREE.Vector3,
    bPt: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    towardPt: THREE.Vector3,
    flipAway = false,
  ) => {
    const ab = new THREE.Vector3().subVectors(bPt, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const n = new THREE.Vector3().crossVectors(ab, ac).normalize();
    const mid = new THREE.Vector3()
      .add(a)
      .add(bPt)
      .add(c)
      .add(d)
      .multiplyScalar(0.25);
    const dir = new THREE.Vector3().subVectors(towardPt, mid);
    const dot = n.dot(dir);
    const invert = flipAway ? dot > 0 : dot < 0;
    if (invert) n.negate();

    if (invert) {
      pushVertex(b, a, n, 0, 0);
      pushVertex(b, c, n, 1, 1);
      pushVertex(b, bPt, n, 1, 0);
      pushVertex(b, a, n, 0, 0);
      pushVertex(b, d, n, 0, 1);
      pushVertex(b, c, n, 1, 1);
    } else {
      pushVertex(b, a, n, 0, 0);
      pushVertex(b, bPt, n, 1, 0);
      pushVertex(b, c, n, 1, 1);
      pushVertex(b, a, n, 0, 0);
      pushVertex(b, c, n, 1, 1);
      pushVertex(b, d, n, 0, 1);
    }
  };

  // Perimeter indices (counter-clockwise looking inward from bowl center)
  // Bottom edge: j = stepStart, i = segStart..segEnd-1
  // Right edge:  i = segEnd,    j = stepStart..stepEnd-1
  // Top edge:    j = stepEnd,   i = segEnd..segStart+1
  // Left edge:   i = segStart,  j = stepEnd..stepStart+1
  const boundaryGridCoords: Array<[number, number]> = [];
  for (let i = segStart; i < segEnd; i++) boundaryGridCoords.push([i, stepStart]);
  for (let j = stepStart; j < stepEnd; j++) boundaryGridCoords.push([segEnd, j]);
  for (let i = segEnd; i > segStart; i--) boundaryGridCoords.push([i, stepEnd]);
  for (let j = stepEnd; j > stepStart; j--) boundaryGridCoords.push([segStart, j]);

  const socketCenter = centerOutwardN.clone().multiplyScalar((innerR + socketR) * 0.5);
  for (let k = 0; k < boundaryGridCoords.length; k++) {
    const [i0, j0] = boundaryGridCoords[k];
    const [i1, j1] = boundaryGridCoords[(k + 1) % boundaryGridCoords.length];
    const iA = spherePoint(innerR, i0, j0);
    const iB = spherePoint(innerR, i1, j1);
    const sA = spherePoint(socketR, i0, j0);
    const sB = spherePoint(socketR, i1, j1);
    pushOrientedQuad(lowerInnerBuilder, iA, iB, sB, sA, socketCenter, false);
  }

  // 3. Build flat inside-facing QR plaque (qrInnerGeo), beveled side rim (qrRimGeo), and hairline perimeter (outerEdgeGeo)
  const localOuterBoundaryPts: THREE.Vector3[] = [];
  const localInnerBoundaryPts: THREE.Vector3[] = [];
  const innerPlaneZ = 0.012;
  const bevelInset = 0.968; // slight inward chamfer so plaque sits neatly inside socket with zero z-fighting

  for (const [i, j] of boundaryGridCoords) {
    const wOut = spherePoint(outerR, i, j);
    const wIn = spherePoint(innerR, i, j);
    const lOut = toTileLocal(wOut);
    const lIn = toTileLocal(wIn);
    localOuterBoundaryPts.push(lOut);
    localInnerBoundaryPts.push(
      new THREE.Vector3(lIn.x * bevelInset, lIn.y * bevelInset, innerPlaneZ),
    );
  }

  const rawMaxHalfSquare = computePolygonMaxCenteredSquare(
    localInnerBoundaryPts.map((pt) => ({u: pt.x, v: pt.y})),
  );
  const qrSquareHalf = rawMaxHalfSquare * 0.78;
  let maxRadius = 0;
  for (const pt of localOuterBoundaryPts) {
    maxRadius = Math.max(maxRadius, Math.hypot(pt.x, pt.y));
  }

  const localInwardNormal = new THREE.Vector3(0, 0, 1);
  const localCenterInner = new THREE.Vector3(0, 0, innerPlaneZ);
  const invSpan = 1 / (2 * qrSquareHalf);

  const outerEdgePositions: number[] = [];
  const rimCenter = new THREE.Vector3(0, 0, -0.025);

  for (let k = 0; k < localInnerBoundaryPts.length; k++) {
    const nextK = (k + 1) % localInnerBoundaryPts.length;
    const iA = localInnerBoundaryPts[k];
    const iB = localInnerBoundaryPts[nextK];
    const oA = localOuterBoundaryPts[k];
    const oB = localOuterBoundaryPts[nextK];

    // Inner flat face triangle (CCW in +Z plane)
    const abX = iA.x - localCenterInner.x;
    const abY = iA.y - localCenterInner.y;
    const acX = iB.x - localCenterInner.x;
    const acY = iB.y - localCenterInner.y;
    const crossZ = abX * acY - abY * acX;
    const p1 = localCenterInner;
    const p2 = crossZ >= 0 ? iA : iB;
    const p3 = crossZ >= 0 ? iB : iA;

    pushVertex(
      qrInnerBuilder,
      p1,
      localInwardNormal,
      0.5 + p1.x * invSpan,
      0.5 + p1.y * invSpan,
    );
    pushVertex(
      qrInnerBuilder,
      p2,
      localInwardNormal,
      0.5 + p2.x * invSpan,
      0.5 + p2.y * invSpan,
    );
    pushVertex(
      qrInnerBuilder,
      p3,
      localInwardNormal,
      0.5 + p3.x * invSpan,
      0.5 + p3.y * invSpan,
    );

    // Solid beveled rim side wall facing outward away from tile center
    pushOrientedQuad(qrRimBuilder, iA, iB, oB, oA, rimCenter, true);

    // Subtle hairline edge along outer boundary
    const localOrigin = toTileLocal(new THREE.Vector3(0, 0, 0));
    const nOutA = oA.clone().sub(localOrigin).normalize();
    const nOutB = oB.clone().sub(localOrigin).normalize();
    const eA = oA.clone().addScaledVector(nOutA, 0.002);
    const eB = oB.clone().addScaledVector(nOutB, 0.002);
    outerEdgePositions.push(eA.x, eA.y, eA.z, eB.x, eB.y, eB.z);
  }

  const lowerOuterGeo = finalizeTriGeometry(lowerOuterBuilder);
  const lowerInnerGeo = finalizeTriGeometry(lowerInnerBuilder);
  const qrOuterGeo = finalizeTriGeometry(qrOuterBuilder);
  const qrInnerGeo = finalizeTriGeometry(qrInnerBuilder);
  const qrRimGeo = finalizeTriGeometry(qrRimBuilder);

  const outerEdgeGeo = new THREE.BufferGeometry();
  outerEdgeGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(outerEdgePositions, 3),
  );
  outerEdgeGeo.computeBoundingSphere();

  // Decorative metallic crown cap + sculpted collar + pin + hanging loop
  const capRadiusBottom = neckTopR * 1.08;
  const capRadiusTop = neckTopR * 0.86;
  const capHeight = 0.19;
  const capBodyGeo = createFlutedCapGeometry(
    capRadiusBottom,
    capRadiusTop,
    capHeight,
    20,
  );
  capBodyGeo.translate(0, neckTopY + capHeight * 0.42, 0);

  const capCollarGeo = new THREE.TorusGeometry(
    capRadiusBottom * 0.99,
    0.022,
    16,
    48,
  );
  capCollarGeo.rotateX(Math.PI / 2);
  capCollarGeo.translate(0, neckTopY + 0.008, 0);

  const capTopY = neckTopY + capHeight * 0.92;
  const pinGeo = new THREE.CylinderGeometry(0.026, 0.036, 0.065, 20);
  pinGeo.translate(0, capTopY + 0.028, 0);

  const loopGeo = new THREE.TorusGeometry(0.115, 0.019, 18, 56);
  loopGeo.translate(0, capTopY + 0.155, 0);

  const finishTexture = createSpiralOrnamentTexture();

  return {
    upperOuterGeo,
    upperInnerGeo,
    upperRimGeo,
    lowerOuterGeo,
    lowerInnerGeo,
    lowerRimGeo,
    capBodyGeo,
    capCollarGeo,
    pinGeo,
    loopGeo,
    finishTexture,
    qrTile: {
      outerGeo: qrOuterGeo,
      innerGeo: qrInnerGeo,
      rimGeo: qrRimGeo,
      outerEdgeGeo,
      anchorPosition,
      anchorQuaternion,
      maxRadius,
      qrSquareHalf,
    },
  };
}
