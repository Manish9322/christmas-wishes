import * as THREE from 'three';

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

    const pairs = 6; // 6 black + 6 white alternating spiral bands
    const twistAmount = 0.58; // smooth diagonal spiral wrap from top cap to bottom pole

    // Deep obsidian-charcoal black & luminous alabaster white (strictly monochromatic)
    const blackR = 20;
    const blackG = 20;
    const blackB = 24;
    const whiteR = 246;
    const whiteG = 246;
    const whiteB = 248;

    for (let py = 0; py < size; py++) {
      // With flipY = true, py = 0 corresponds to v = 1 (top pole) and py = size - 1 to v = 0 (bottom pole)
      const v = 1 - py / (size - 1);
      const yNorm = Math.max(-1, Math.min(1, 2 * v - 1));
      const theta = Math.acos(yNorm); // 0 at top pole, PI at bottom pole
      const sinTheta = Math.max(0.04, Math.sin(theta));

      // Gentle S-curve spiral progression so bands curve naturally around the sphere
      const spiralOffset =
        twistAmount * (theta / Math.PI) + 0.045 * Math.sin(theta * 2);

      // Subtle vertical grey-value falloff to enhance spherical curvature
      const shadeMod = 0.9 + 0.1 * v;

      // Anti-aliasing band scales gently near poles so seams stay smooth without jagged steps
      const aa = Math.min(0.42, Math.max(0.035, 0.045 / sinTheta));

      for (let px = 0; px < size; px++) {
        const u = px / size;
        const phase = (u - spiralOffset) * pairs;
        const wave = Math.sin(2 * Math.PI * phase);

        // Smoothstep transition between black (wave < 0) and white (wave > 0)
        const t = Math.max(0, Math.min(1, (wave + aa) / (2 * aa)));
        const blend = t * t * (3 - 2 * t);

        const idx = (py * size + px) * 4;
        data[idx] = Math.round((blackR + (whiteR - blackR) * blend) * shadeMod);
        data[idx + 1] = Math.round((blackG + (whiteG - blackG) * blend) * shadeMod);
        data[idx + 2] = Math.round((blackB + (whiteB - blackB) * blend) * shadeMod);
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
      // Taper flute depth near top and bottom edges of the cap
      const yNorm = 1 - Math.abs(y / (height * 0.5));
      const rib = Math.cos(angle * flutes) * 0.008 * Math.pow(Math.max(0, yNorm), 0.5);
      const scale = (r + rib) / r;
      pos.setX(i, x * scale);
      pos.setZ(i, z * scale);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function createOrnamentParts(): OrnamentParts {
  const outerR = 1.06;
  const innerR = 0.99;
  const radialSegments = 72;
  const arcSteps = 32;

  // Upper hemisphere outer profile (equator y=0 up to neck under cap)
  const neckStopAngle = Math.PI * 0.415; // stops cleanly inside crown cap
  const upperOuterPts: THREE.Vector2[] = [];
  for (let i = 0; i <= arcSteps; i++) {
    const phi = (i / arcSteps) * neckStopAngle;
    upperOuterPts.push(
      new THREE.Vector2(Math.cos(phi) * outerR, Math.sin(phi) * outerR),
    );
  }
  // Small vertical neck lip tucked inside the crown cap
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
      new THREE.Vector2(Math.max(0, Math.cos(phi) * outerR), Math.sin(phi) * outerR),
    );
  }
  const lowerOuterGeo = new THREE.LatheGeometry(lowerOuterPts, radialSegments);

  // Lower hemisphere inner cavity profile (equator downward to bottom inner pole)
  const lowerInnerPts: THREE.Vector2[] = [];
  for (let i = arcSteps; i >= 0; i--) {
    const phi = -Math.PI * 0.5 + (i / arcSteps) * (Math.PI * 0.5);
    lowerInnerPts.push(
      new THREE.Vector2(Math.max(0, Math.cos(phi) * innerR), Math.sin(phi) * innerR),
    );
  }
  const lowerInnerGeo = new THREE.LatheGeometry(lowerInnerPts, radialSegments);

  // Lower half upward-facing rim connecting outerR to innerR at y = 0
  const lowerRimPts: THREE.Vector2[] = [
    new THREE.Vector2(outerR, 0),
    new THREE.Vector2(innerR, 0),
  ];
  const lowerRimGeo = new THREE.LatheGeometry(lowerRimPts, radialSegments);

  // Fix UVs on outer shells so vertical gradient spans seamlessly across the whole sphere (-outerR .. +outerR)
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
  const capBodyGeo = createFlutedCapGeometry(capRadiusBottom, capRadiusTop, capHeight, 20);
  capBodyGeo.translate(0, neckTopY + capHeight * 0.42, 0);

  const capCollarGeo = new THREE.TorusGeometry(capRadiusBottom * 0.99, 0.022, 16, 48);
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
  };
}
