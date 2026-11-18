import * as THREE from 'three';

export interface OrnamentQrTileGeometryData {
  outerGeo: THREE.BufferGeometry;
  innerGeo: THREE.BufferGeometry;
  rimGeo: THREE.BufferGeometry;
  anchorPosition: THREE.Vector3;
  anchorQuaternion: THREE.Quaternion;
  maxRadius: number;
  stickerHalf: number;
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

    const pairs = 6; // 6 deep burgundy + 6 muted crimson alternating spiral bands
    const twistAmount = 0.58;

    // Rich Crimson Red (#961b26) & Warm Porcelain White Shade (#e8e3de) alternating spiral straps
    const darkR = 150;
    const darkG = 27;
    const darkB = 38;
    const lightR = 232;
    const lightG = 227;
    const lightB = 222;

    for (let py = 0; py < size; py++) {
      const v = 1 - py / (size - 1);
      const yNorm = Math.max(-1, Math.min(1, 2 * v - 1));
      const theta = Math.acos(yNorm);
      const sinTheta = Math.max(0.04, Math.sin(theta));

      const spiralOffset =
        twistAmount * (theta / Math.PI) + 0.045 * Math.sin(theta * 2);

      // Gentle vertical spherical modeling for depth & silhouette separation on pure white
      const shadeMod = 0.87 + 0.13 * v;

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

function createCompactQrStickerGeometry(
  innerR: number,
): OrnamentQrTileGeometryData {
  // Position sticker neatly centered on the rear-facing inner wall of the lower bowl
  const lonCenter = Math.PI - 0.12;
  const latCenter = THREE.MathUtils.degToRad(-33);

  const outwardN = new THREE.Vector3(
    Math.cos(latCenter) * Math.sin(lonCenter),
    Math.sin(latCenter),
    Math.cos(latCenter) * Math.cos(lonCenter),
  ).normalize();
  const inwardN = outwardN.clone().negate();
  const upRef = new THREE.Vector3(0, 1, 0);
  const tangentV = upRef
    .clone()
    .addScaledVector(inwardN, -upRef.dot(inwardN))
    .normalize();
  const tangentU = new THREE.Vector3()
    .crossVectors(tangentV, inwardN)
    .normalize();

  const anchorBasis = new THREE.Matrix4().makeBasis(tangentU, tangentV, inwardN);
  const anchorQuaternion = new THREE.Quaternion().setFromRotationMatrix(
    anchorBasis,
  );

  // Place back of compact sticker flush inside concave inner bowl wall without clipping corners
  const stickerHalf = 0.13;
  const cornerRadius = 0.022;
  const thickness = 0.01;
  const zFront = thickness * 0.5;
  const zBack = -thickness * 0.5;
  const anchorRadius = innerR - 0.016;
  const anchorPosition = outwardN.clone().multiplyScalar(anchorRadius);

  // Build rounded-square perimeter (CCW in +Z plane)
  const ringPts: Array<{x: number; y: number}> = [];
  const innerCorner = stickerHalf - cornerRadius;
  const arcSteps = 6;
  const corners = [
    {cx: innerCorner, cy: innerCorner, startAngle: 0},
    {cx: -innerCorner, cy: innerCorner, startAngle: Math.PI * 0.5},
    {cx: -innerCorner, cy: -innerCorner, startAngle: Math.PI},
    {cx: innerCorner, cy: -innerCorner, startAngle: Math.PI * 1.5},
  ];
  for (const corner of corners) {
    for (let s = 0; s <= arcSteps; s++) {
      const a = corner.startAngle + (s / arcSteps) * (Math.PI * 0.5);
      ringPts.push({
        x: corner.cx + Math.cos(a) * cornerRadius,
        y: corner.cy + Math.sin(a) * cornerRadius,
      });
    }
  }

  const frontPos: number[] = [];
  const frontNorm: number[] = [];
  const frontUv: number[] = [];

  const backPos: number[] = [];
  const backNorm: number[] = [];
  const backUv: number[] = [];

  const rimPos: number[] = [];
  const rimNorm: number[] = [];
  const rimUv: number[] = [];

  const invSpan = 1 / (2 * stickerHalf);
  const nPts = ringPts.length;

  for (let i = 0; i < nPts; i++) {
    const a = ringPts[i];
    const b = ringPts[(i + 1) % nPts];

    // Front QR sticker face (+Z, CCW)
    frontPos.push(0, 0, zFront, a.x, a.y, zFront, b.x, b.y, zFront);
    frontNorm.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
    frontUv.push(
      0.5,
      0.5,
      0.5 + a.x * invSpan,
      0.5 + a.y * invSpan,
      0.5 + b.x * invSpan,
      0.5 + b.y * invSpan,
    );

    // Back face (-Z, reverse winding with upright UVs when flipped 180 deg around Y)
    backPos.push(0, 0, zBack, b.x, b.y, zBack, a.x, a.y, zBack);
    backNorm.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
    backUv.push(
      0.5,
      0.5,
      0.5 - b.x * invSpan,
      0.5 + b.y * invSpan,
      0.5 - a.x * invSpan,
      0.5 + a.y * invSpan,
    );

    // Wafer-thin solid edge wall connecting front & back
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.max(1e-6, Math.hypot(ex, ey));
    const nx = ey / len;
    const ny = -ex / len;

    rimPos.push(
      a.x, a.y, zFront,
      a.x, a.y, zBack,
      b.x, b.y, zBack,
      a.x, a.y, zFront,
      b.x, b.y, zBack,
      b.x, b.y, zFront,
    );
    rimNorm.push(
      nx, ny, 0,
      nx, ny, 0,
      nx, ny, 0,
      nx, ny, 0,
      nx, ny, 0,
      nx, ny, 0,
    );
    rimUv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
  }

  const buildGeo = (
    positions: number[],
    normals: number[],
    uvs: number[],
  ): THREE.BufferGeometry => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  };

  const maxRadius = Math.hypot(innerCorner, innerCorner) + cornerRadius;

  return {
    innerGeo: buildGeo(frontPos, frontNorm, frontUv),
    outerGeo: buildGeo(backPos, backNorm, backUv),
    rimGeo: buildGeo(rimPos, rimNorm, rimUv),
    anchorPosition,
    anchorQuaternion,
    maxRadius,
    stickerHalf,
  };
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

  // Upper hemisphere inner cavity profile (descending from top inner dome to equator)
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

  // Lower hemisphere outer profile (bottom pole y=-outerR up to equator y=0)
  const lowerOuterPts: THREE.Vector2[] = [];
  for (let i = 0; i <= arcSteps; i++) {
    const phi = -Math.PI * 0.5 + (i / arcSteps) * (Math.PI * 0.5);
    lowerOuterPts.push(
      new THREE.Vector2(
        Math.max(0, Math.cos(phi) * outerR),
        Math.sin(phi) * outerR,
      ),
    );
  }
  const lowerOuterGeo = new THREE.LatheGeometry(lowerOuterPts, radialSegments);

  // Lower hemisphere inner cavity profile (equator downward to bottom inner pole)
  const lowerInnerPts: THREE.Vector2[] = [];
  for (let i = arcSteps; i >= 0; i--) {
    const phi = -Math.PI * 0.5 + (i / arcSteps) * (Math.PI * 0.5);
    lowerInnerPts.push(
      new THREE.Vector2(
        Math.max(0, Math.cos(phi) * innerR),
        Math.sin(phi) * innerR,
      ),
    );
  }
  const lowerInnerGeo = new THREE.LatheGeometry(lowerInnerPts, radialSegments);

  // Lower half upward-facing rim connecting outerR to innerR at y = 0
  const lowerRimPts: THREE.Vector2[] = [
    new THREE.Vector2(outerR, 0),
    new THREE.Vector2(innerR, 0),
  ];
  const lowerRimGeo = new THREE.LatheGeometry(lowerRimPts, radialSegments);

  // Fix UVs on outer shells so spiral texture wraps seamlessly across full sphere (-outerR .. +outerR)
  const mapSphereUvs = (geo: THREE.BufferGeometry) => {
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
  mapSphereUvs(upperOuterGeo);
  mapSphereUvs(lowerOuterGeo);

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
  const qrTile = createCompactQrStickerGeometry(innerR);

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
    qrTile,
  };
}
