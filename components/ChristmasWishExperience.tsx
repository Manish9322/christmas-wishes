'use client';

import React, {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {motion, AnimatePresence} from 'motion/react';
import {Github, RotateCcw, X} from 'lucide-react';
import QRCode from 'qrcode';
import {createFacetedWishGeometries} from '@/lib/wish-geometry';

type WishPhase = 'intact' | 'opened' | 'closing';

const GITHUB_PROFILE_URL = 'https://github.com/Manish9322';

const CAMERA_FOV_DEG = 40;
const TAN_HALF_V = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEG * 0.5));
const SIN_HALF_V = Math.sin(THREE.MathUtils.degToRad(CAMERA_FOV_DEG * 0.5));
const SCULPTURE_SCALE = 0.88;

interface ViewportFraming {
  defaultDistance: number;
  minDistanceIntact: number;
  minDistanceOpened: number;
  maxDistance: number;
}

function computeViewportFraming(width: number, height: number): ViewportFraming {
  const aspect = Math.max(0.35, width / Math.max(1, height));
  const tanHalfH = aspect * TAN_HALF_V;
  const sinHalfH = tanHalfH / Math.sqrt(1 + tanHalfH * tanHalfH);

  // Full animated bounding radii (scaled by SCULPTURE_SCALE, accounting for split separation, tilt, float, and drag)
  const openRadiusV = 1.9;
  const openRadiusH = 1.68;
  const intactRadiusV = 1.2;
  const intactRadiusH = 1.01;
  const inspectRadiusV = 0.86;
  const inspectRadiusH = 0.76;

  const defaultDistance = Math.max(
    openRadiusV / (0.85 * SIN_HALF_V),
    openRadiusH / (0.86 * sinHalfH),
  );

  const minDistanceIntact = Math.max(
    intactRadiusV / (0.86 * SIN_HALF_V),
    intactRadiusH / (0.86 * sinHalfH),
  );

  const minDistanceOpened = Math.max(
    inspectRadiusV / (0.88 * SIN_HALF_V),
    inspectRadiusH / (0.88 * sinHalfH),
  );

  const maxDistance = defaultDistance * 1.48;

  return {
    defaultDistance,
    minDistanceIntact,
    minDistanceOpened,
    maxDistance,
  };
}

function createQrTileTextures(url: string): {
  subtleTex: THREE.CanvasTexture;
  scanTex: THREE.CanvasTexture;
} {
  const qr = QRCode.create(url, {errorCorrectionLevel: 'M'});
  const count = qr.modules.size;

  // 1. High-definition, well-contrasted monochrome QR integrated on the inside-facing cavity tile
  const subtleSize = 1024;
  const subtleEdgePad = 4;
  const subtleQuietPx = Math.round(subtleSize * 0.09);
  const subtleSpan = subtleSize - subtleQuietPx * 2;
  const subtleModulePx = subtleSpan / count;

  const subtleCanvas = document.createElement('canvas');
  subtleCanvas.width = subtleSize;
  subtleCanvas.height = subtleSize;
  const sCtx = subtleCanvas.getContext('2d');
  if (sCtx) {
    sCtx.clearRect(0, 0, subtleSize, subtleSize);
    sCtx.fillStyle = '#f4f4f5';
    sCtx.fillRect(
      subtleEdgePad,
      subtleEdgePad,
      subtleSize - subtleEdgePad * 2,
      subtleSize - subtleEdgePad * 2,
    );
    sCtx.fillStyle = '#09090b';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.modules.get(r, c)) {
          const x0 = Math.floor(subtleQuietPx + c * subtleModulePx);
          const y0 = Math.floor(subtleQuietPx + r * subtleModulePx);
          const x1 = Math.ceil(subtleQuietPx + (c + 1) * subtleModulePx);
          const y1 = Math.ceil(subtleQuietPx + (r + 1) * subtleModulePx);
          sCtx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
      }
    }
  }
  const subtleTex = new THREE.CanvasTexture(subtleCanvas);
  subtleTex.colorSpace = THREE.SRGBColorSpace;
  subtleTex.wrapS = THREE.ClampToEdgeWrapping;
  subtleTex.wrapT = THREE.ClampToEdgeWrapping;
  subtleTex.generateMipmaps = false;
  subtleTex.minFilter = THREE.LinearFilter;
  subtleTex.magFilter = THREE.NearestFilter;

  // 2. Full-contrast glare-free scannable texture centered with surrounding tile margin
  const scanSize = 1024;
  const scanEdgePad = 4;
  const scanQuietPx = Math.round(scanSize * 0.09);
  const scanSpan = scanSize - scanQuietPx * 2;
  const scanModulePx = scanSpan / count;

  const scanCanvas = document.createElement('canvas');
  scanCanvas.width = scanSize;
  scanCanvas.height = scanSize;
  const fCtx = scanCanvas.getContext('2d');
  if (fCtx) {
    fCtx.clearRect(0, 0, scanSize, scanSize);
    fCtx.fillStyle = '#ffffff';
    fCtx.fillRect(
      scanEdgePad,
      scanEdgePad,
      scanSize - scanEdgePad * 2,
      scanSize - scanEdgePad * 2,
    );
    fCtx.fillStyle = '#09090b';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.modules.get(r, c)) {
          const x0 = Math.floor(scanQuietPx + c * scanModulePx);
          const y0 = Math.floor(scanQuietPx + r * scanModulePx);
          const x1 = Math.ceil(scanQuietPx + (c + 1) * scanModulePx);
          const y1 = Math.ceil(scanQuietPx + (r + 1) * scanModulePx);
          fCtx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
      }
    }
  }
  const scanTex = new THREE.CanvasTexture(scanCanvas);
  scanTex.colorSpace = THREE.SRGBColorSpace;
  scanTex.wrapS = THREE.ClampToEdgeWrapping;
  scanTex.wrapT = THREE.ClampToEdgeWrapping;
  scanTex.generateMipmaps = false;
  scanTex.minFilter = THREE.LinearFilter;
  scanTex.magFilter = THREE.NearestFilter;

  return {subtleTex, scanTex};
}

function createTileDepthHaloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    grad.addColorStop(0.45, 'rgba(212, 212, 216, 0.06)');
    grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    grad.addColorStop(0.42, 'rgba(0, 0, 0, 0.34)');
    grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.08)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let cachedGlCapability: {supported: boolean; isSoftwareGl: boolean} | null = null;

function getWebGLCapability(): {supported: boolean; isSoftwareGl: boolean} {
  if (cachedGlCapability) return cachedGlCapability;
  if (typeof document === 'undefined') {
    return {supported: true, isSoftwareGl: false};
  }
  try {
    const probeCanvas = document.createElement('canvas');
    const gl =
      (probeCanvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (probeCanvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) {
      cachedGlCapability = {supported: false, isSoftwareGl: false};
      return cachedGlCapability;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedGlCapability = {supported: true, isSoftwareGl};
    return cachedGlCapability;
  } catch {
    cachedGlCapability = {supported: false, isSoftwareGl: false};
    return cachedGlCapability;
  }
}

const subscribeNoop = () => () => {};
const getWebglUnavailableSnapshot = () => !getWebGLCapability().supported;
const getWebglUnavailableServerSnapshot = () => false;

export default function ChristmasWishExperience() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [wishPhase, setWishPhase] = useState<WishPhase>('intact');
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [isHoveringInteractive, setIsHoveringInteractive] = useState(false);
  const [isDraggingUI, setIsDraggingUI] = useState(false);
  const [qrSelected, setQrSelected] = useState(false);
  const [showGithubDialog, setShowGithubDialog] = useState(false);

  const webglUnavailable = React.useSyncExternalStore(
    subscribeNoop,
    getWebglUnavailableSnapshot,
    getWebglUnavailableServerSnapshot,
  );

  const phaseRef = useRef<WishPhase>('intact');
  const zoomedInRef = useRef(false);
  const qrSelectedRef = useRef(false);
  const showDialogRef = useRef(false);
  const closeHandlerRef = useRef<(() => void) | null>(null);
  const deselectQrHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    showDialogRef.current = showGithubDialog;
  }, [showGithubDialog]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showDialogRef.current) {
        setShowGithubDialog(false);
      } else if (qrSelectedRef.current) {
        deselectQrHandlerRef.current?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const {supported: webglSupported, isSoftwareGl} = getWebGLCapability();
    if (!webglSupported) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV_DEG,
      width / Math.max(1, height),
      0.1,
      100,
    );
    let framing = computeViewportFraming(width, height);
    let targetDistance = framing.defaultDistance;
    let currentDistance = framing.defaultDistance;
    camera.position.set(0, 0.08, currentDistance);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    const onContextRestored = () => {
      renderer.setSize(
        container.clientWidth || window.innerWidth,
        container.clientHeight || window.innerHeight,
      );
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // Studio reflection environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Monochromatic 3-point studio lighting rig
    const hemiLight = new THREE.HemisphereLight(0xf4f4f5, 0x18181b, 0.82);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.05);
    keyLight.position.set(4.4, 6.2, 5.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -3.2;
    keyLight.shadow.camera.right = 3.2;
    keyLight.shadow.camera.top = 3.2;
    keyLight.shadow.camera.bottom = -3.2;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xfafafa, 1.55);
    rimLight.position.set(-4.8, 3.2, -4.6);
    scene.add(rimLight);

    const bounceLight = new THREE.DirectionalLight(0xd4d4d8, 0.5);
    bounceLight.position.set(3.2, -3.8, 2.4);
    scene.add(bounceLight);

    // Interior glow point light revealed when the Christmas surprise opens
    const interiorLight = new THREE.PointLight(0xffffff, 0, 7, 1.8);
    interiorLight.position.set(0, 0, 0);
    scene.add(interiorLight);

    // Subtle accent light for the enlarged floating QR polygon bevels
    const qrAccentLight = new THREE.PointLight(0xf4f4f5, 0, 6, 1.6);
    scene.add(qrAccentLight);

    // Soft grounded studio contact shadow
    const shadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
    });
    const shadowGeo = new THREE.PlaneGeometry(2.9, 2.9);
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.44;
    scene.add(shadowPlane);

    // Sculptural Christmas surprise hierarchy (scaled for balanced viewport breathing room)
    const sculptureRoot = new THREE.Group();
    sculptureRoot.scale.setScalar(SCULPTURE_SCALE);
    sculptureRoot.position.y = -0.03;
    scene.add(sculptureRoot);

    const upperPivot = new THREE.Group();
    const lowerPivot = new THREE.Group();
    sculptureRoot.add(upperPivot);
    sculptureRoot.add(lowerPivot);

    const {
      upperGeometry,
      lowerGeometry,
      upperEdgeGeometry,
      lowerEdgeGeometry,
      qrTile,
    } = createFacetedWishGeometries();

    const shellMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.38,
      metalness: 0.16,
      envMapIntensity: 0.9,
    });

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xb8b8c2,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });

    const upperMesh = new THREE.Mesh(upperGeometry, shellMaterial);
    upperMesh.castShadow = !isSoftwareGl;
    upperMesh.receiveShadow = !isSoftwareGl;
    upperPivot.add(upperMesh);

    const upperEdges = new THREE.LineSegments(upperEdgeGeometry, edgeMaterial);
    upperPivot.add(upperEdges);

    const lowerMesh = new THREE.Mesh(lowerGeometry, shellMaterial);
    lowerMesh.castShadow = !isSoftwareGl;
    lowerMesh.receiveShadow = !isSoftwareGl;
    lowerPivot.add(lowerMesh);

    const lowerEdges = new THREE.LineSegments(lowerEdgeGeometry, edgeMaterial);
    lowerPivot.add(lowerEdges);

    // Subtle background dim veil rendered between the background shell and the enlarged QR polygon
    const backdropDimGeo = new THREE.PlaneGeometry(40, 40);
    const backdropDimMat = new THREE.MeshBasicMaterial({
      color: 0x070709,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    const backdropDimPlane = new THREE.Mesh(backdropDimGeo, backdropDimMat);
    backdropDimPlane.renderOrder = 1;
    backdropDimPlane.visible = false;
    scene.add(backdropDimPlane);

    // Home slot inside lowerPivot tracks exact position & orientation of the QR polygon
    const qrHomeSlot = new THREE.Object3D();
    qrHomeSlot.position.copy(qrTile.anchorPosition);
    qrHomeSlot.quaternion.copy(qrTile.anchorQuaternion);
    lowerPivot.add(qrHomeSlot);

    // Independent QR polygon tile group rendered smoothly above background when selected
    const qrTilePivot = new THREE.Group();
    scene.add(qrTilePivot);

    const {subtleTex, scanTex} = createQrTileTextures(GITHUB_PROFILE_URL);
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    subtleTex.anisotropy = maxAnisotropy;
    scanTex.anisotropy = maxAnisotropy;

    const qrSubtleMat = new THREE.MeshBasicMaterial({
      map: subtleTex,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const qrScanMat = new THREE.MeshBasicMaterial({
      map: scanTex,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const qrTileShellMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.34,
      metalness: 0.22,
      envMapIntensity: 1.05,
      transparent: true,
      opacity: 1,
      depthWrite: true,
    });

    const haloTex = createTileDepthHaloTexture();
    const qrHaloMat = new THREE.MeshBasicMaterial({
      map: haloTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const qrHaloGeo = new THREE.PlaneGeometry(1, 1);
    const qrHaloMesh = new THREE.Mesh(qrHaloGeo, qrHaloMat);
    const haloSpan = qrTile.maxRadius * 3.1;
    qrHaloMesh.scale.set(haloSpan, haloSpan, 1);
    qrHaloMesh.position.z = -0.14;
    qrHaloMesh.renderOrder = 1;
    qrHaloMesh.visible = false;
    qrTilePivot.add(qrHaloMesh);

    const qrOuterMesh = new THREE.Mesh(qrTile.outerGeo, qrTileShellMat);
    qrOuterMesh.castShadow = !isSoftwareGl;
    qrOuterMesh.receiveShadow = !isSoftwareGl;
    qrOuterMesh.renderOrder = 2;
    qrTilePivot.add(qrOuterMesh);

    const qrInnerMesh = new THREE.Mesh(qrTile.innerGeo, qrTileShellMat);
    qrInnerMesh.renderOrder = 2;
    qrTilePivot.add(qrInnerMesh);

    const qrRimMesh = new THREE.Mesh(qrTile.rimGeo, qrTileShellMat);
    qrRimMesh.renderOrder = 2;
    qrTilePivot.add(qrRimMesh);

    const qrOuterEdges = new THREE.LineSegments(qrTile.outerEdgeGeo, edgeMaterial);
    qrOuterEdges.renderOrder = 3;
    qrTilePivot.add(qrOuterEdges);

    // Both subtle hidden QR (inside bowl) and full-contrast scan QR map onto the inside-facing polygon surface
    const qrSubtleMesh = new THREE.Mesh(qrTile.innerGeo, qrSubtleMat);
    qrSubtleMesh.renderOrder = 3;
    qrTilePivot.add(qrSubtleMesh);

    const qrScanMesh = new THREE.Mesh(qrTile.innerGeo, qrScanMat);
    qrScanMesh.renderOrder = 4;
    qrTilePivot.add(qrScanMesh);

    const intactInteractiveMeshes = [upperMesh, lowerMesh, qrOuterMesh];
    const openedHitTestMeshes = [
      upperMesh,
      lowerMesh,
      qrOuterMesh,
      qrInnerMesh,
      qrRimMesh,
      qrSubtleMesh,
    ];
    const isQrInnerTarget = (obj: THREE.Object3D): boolean =>
      obj === qrInnerMesh || obj === qrSubtleMesh || obj === qrScanMesh;

    // Monochromatic 3D Confetti InstancedMeshes (ribbons + diamond shards)
    const ribbonCount = 100;
    const shardCount = 80;
    const totalConfetti = ribbonCount + shardCount;

    const ribbonGeo = new THREE.PlaneGeometry(0.042, 0.115);
    const shardGeo = new THREE.PlaneGeometry(0.068, 0.068);
    shardGeo.rotateZ(Math.PI / 4);

    const confettiMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.34,
      metalness: 0.26,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
    });

    const ribbonMesh = new THREE.InstancedMesh(ribbonGeo, confettiMat, ribbonCount);
    const shardMesh = new THREE.InstancedMesh(shardGeo, confettiMat, shardCount);
    ribbonMesh.frustumCulled = false;
    shardMesh.frustumCulled = false;
    ribbonMesh.visible = false;
    shardMesh.visible = false;
    scene.add(ribbonMesh);
    scene.add(shardMesh);

    const confettiColors = [
      0xffffff,
      0xf4f4f5,
      0xe4e4e7,
      0xd4d4d8,
      0xa1a1aa,
      0x71717a,
      0x3f3f46,
      0x18181b,
    ];

    const cPos = new Float32Array(totalConfetti * 3);
    const cVel = new Float32Array(totalConfetti * 3);
    const cRot = new Float32Array(totalConfetti * 3);
    const cRotVel = new Float32Array(totalConfetti * 3);
    const cScale = new Float32Array(totalConfetti);
    const cDrag = new Float32Array(totalConfetti);
    const cPhase = new Float32Array(totalConfetti);

    const tempColor = new THREE.Color();
    for (let i = 0; i < totalConfetti; i++) {
      tempColor.setHex(confettiColors[i % confettiColors.length]);
      if (i < ribbonCount) {
        ribbonMesh.setColorAt(i, tempColor);
      } else {
        shardMesh.setColorAt(i - ribbonCount, tempColor);
      }
    }
    if (ribbonMesh.instanceColor) ribbonMesh.instanceColor.needsUpdate = true;
    if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;

    // Pre-allocate math objects (Zero GC in render loop)
    const _dummy = new THREE.Object3D();
    const _raycaster = new THREE.Raycaster();
    const _pointerNdc = new THREE.Vector2();
    const _homePos = new THREE.Vector3();
    const _homeQuat = new THREE.Quaternion();
    const _homeScale = new THREE.Vector3();
    const _targetPos = new THREE.Vector3();
    const _targetQuat = new THREE.Quaternion();
    const _targetScale = new THREE.Vector3();
    const _floatEuler = new THREE.Euler();
    const _floatQuat = new THREE.Quaternion();

    // Rotation & drag state
    let rotY = 0.25;
    let rotX = 0.06;
    let rotZ = 0;
    let velY = 0;
    let velX = 0;

    let openElapsed = 0;
    let confettiActive = false;

    // Independent QR polygon animation, gentle float & movement stabilization state
    let qrAnimT = 0;
    let qrFloatWeight = 0;
    let qrFloatTime = 0;
    let motionFactor = 1;
    let motionTime = 0;
    let confettiOpacityTarget = 1;

    const activePointers = new Map<number, {x: number; y: number}>();
    let isDragging = false;
    let dragPointerId: number | null = null;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let pointerDownX = 0;
    let pointerDownY = 0;
    let totalDragDist = 0;
    let prevPinchDist: number | null = null;
    let lastHoverCheck = 0;

    const getActiveMinDistance = () =>
      phaseRef.current === 'intact'
        ? framing.minDistanceIntact
        : framing.minDistanceOpened;

    const syncZoomStateFlag = () => {
      const zoomed = targetDistance < framing.defaultDistance - 0.16;
      if (zoomed !== zoomedInRef.current) {
        zoomedInRef.current = zoomed;
        setIsZoomedIn(zoomed);
      }
    };

    const spawnCelebrationBurst = () => {
      confettiActive = true;
      ribbonMesh.visible = true;
      shardMesh.visible = true;
      confettiMat.opacity = 1;
      confettiOpacityTarget = 1;

      for (let i = 0; i < totalConfetti; i++) {
        const idx = i * 3;
        cPos[idx] = (Math.random() - 0.5) * 0.2;
        cPos[idx + 1] = (Math.random() - 0.5) * 0.24;
        cPos[idx + 2] = (Math.random() - 0.5) * 0.2;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 2.4 + Math.random() * 3.8;

        cVel[idx] = Math.sin(phi) * Math.cos(theta) * speed;
        cVel[idx + 1] = Math.cos(phi) * speed * 0.9 + 1.1;
        cVel[idx + 2] = Math.sin(phi) * Math.sin(theta) * speed;

        cRot[idx] = Math.random() * Math.PI * 2;
        cRot[idx + 1] = Math.random() * Math.PI * 2;
        cRot[idx + 2] = Math.random() * Math.PI * 2;

        cRotVel[idx] = (Math.random() - 0.5) * 9;
        cRotVel[idx + 1] = (Math.random() - 0.5) * 9;
        cRotVel[idx + 2] = (Math.random() - 0.5) * 9;

        cScale[i] = 0.6 + Math.random() * 0.9;
        cDrag[i] = 1.65 + Math.random() * 1.1;
        cPhase[i] = Math.random() * Math.PI * 2;
      }
    };

    const triggerOpen = () => {
      if (phaseRef.current !== 'intact') return;
      phaseRef.current = 'opened';
      openElapsed = 0;
      targetDistance = THREE.MathUtils.clamp(
        targetDistance,
        framing.minDistanceOpened,
        framing.maxDistance,
      );
      syncZoomStateFlag();
      setWishPhase('opened');
      setIsHoveringInteractive(false);
      spawnCelebrationBurst();
    };

    const triggerSelectQr = () => {
      if (phaseRef.current !== 'opened' || qrSelectedRef.current) return;
      qrSelectedRef.current = true;
      setQrSelected(true);
      setIsHoveringInteractive(false);
    };

    const triggerDeselectQr = () => {
      if (!qrSelectedRef.current) return;
      qrSelectedRef.current = false;
      setQrSelected(false);
      setShowGithubDialog(false);
      setIsHoveringInteractive(false);
    };
    deselectQrHandlerRef.current = triggerDeselectQr;

    const triggerClose = () => {
      if (phaseRef.current !== 'opened') return;
      triggerDeselectQr();
      if (targetDistance < framing.minDistanceIntact) {
        targetDistance = framing.minDistanceIntact;
        syncZoomStateFlag();
      }
      phaseRef.current = 'closing';
      setWishPhase('closing');
      setIsHoveringInteractive(false);
    };
    closeHandlerRef.current = triggerClose;

    const handleSceneTap = (clientX: number, clientY: number) => {
      if (showDialogRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);

      // When enlarged QR polygon is active, tapping it or background returns it smoothly
      if (qrSelectedRef.current) {
        triggerDeselectQr();
        return;
      }

      if (phaseRef.current === 'opened') {
        const hits = _raycaster.intersectObjects(openedHitTestMeshes, false);
        if (hits.length > 0 && isQrInnerTarget(hits[0].object)) {
          triggerSelectQr();
          return;
        }
        // Only the designated inside-facing QR polygon is clickable in the opened state unless resetting global zoom
        if (targetDistance < framing.defaultDistance - 0.16 && hits.length > 0) {
          targetDistance = framing.defaultDistance;
          syncZoomStateFlag();
        }
        return;
      }

      if (phaseRef.current === 'intact') {
        const hits = _raycaster.intersectObjects(intactInteractiveMeshes, false);
        if (hits.length === 0) return;

        if (targetDistance < framing.defaultDistance - 0.16) {
          targetDistance = framing.defaultDistance;
          syncZoomStateFlag();
          return;
        }
        triggerOpen();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (qrSelectedRef.current || showDialogRef.current) return;
      const delta = e.deltaY * 0.0038;
      targetDistance = THREE.MathUtils.clamp(
        targetDistance + delta,
        getActiveMinDistance(),
        framing.maxDistance,
      );
      syncZoomStateFlag();
    };

    const getPinchDistance = (): number | null => {
      if (activePointers.size < 2) return null;
      const pts = Array.from(activePointers.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      return Math.hypot(dx, dy);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (showDialogRef.current) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      renderer.domElement.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

      if (activePointers.size === 1) {
        isDragging = !qrSelectedRef.current;
        if (isDragging) setIsDraggingUI(true);
        dragPointerId = e.pointerId;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        pointerDownX = e.clientX;
        pointerDownY = e.clientY;
        totalDragDist = 0;
        velX = 0;
        velY = 0;
        prevPinchDist = null;
      } else if (activePointers.size === 2) {
        isDragging = false;
        setIsDraggingUI(false);
        dragPointerId = null;
        prevPinchDist = getPinchDistance();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      }

      if (activePointers.size >= 2) {
        if (qrSelectedRef.current || showDialogRef.current) return;
        const pinchDist = getPinchDistance();
        if (pinchDist !== null && prevPinchDist !== null) {
          const diff = prevPinchDist - pinchDist;
          targetDistance = THREE.MathUtils.clamp(
            targetDistance + diff * 0.015,
            getActiveMinDistance(),
            framing.maxDistance,
          );
          syncZoomStateFlag();
        }
        prevPinchDist = pinchDist;
        return;
      }

      if (isDragging && e.pointerId === dragPointerId && !qrSelectedRef.current) {
        const dx = e.clientX - lastPointerX;
        const dy = e.clientY - lastPointerY;
        totalDragDist += Math.hypot(dx, dy);

        const sens = 0.0075;
        rotY += dx * sens;
        rotX = THREE.MathUtils.clamp(rotX + dy * sens * 0.72, -0.78, 0.78);
        rotZ = THREE.MathUtils.clamp(rotZ - dx * 0.0018, -0.22, 0.22);

        velY = dx * sens * 22;
        velX = dy * sens * 14;

        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        return;
      }

      if (e.pointerType === 'mouse' && !showDialogRef.current) {
        const now = performance.now();
        if (now - lastHoverCheck > 45) {
          lastHoverCheck = now;
          const rect = renderer.domElement.getBoundingClientRect();
          _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          _raycaster.setFromCamera(_pointerNdc, camera);

          if (phaseRef.current === 'intact') {
            const hits = _raycaster.intersectObjects(intactInteractiveMeshes, false);
            setIsHoveringInteractive(hits.length > 0);
          } else if (phaseRef.current === 'opened' && !qrSelectedRef.current) {
            const hits = _raycaster.intersectObjects(openedHitTestMeshes, false);
            setIsHoveringInteractive(hits.length > 0 && isQrInnerTarget(hits[0].object));
          } else {
            setIsHoveringInteractive(false);
          }
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }
      activePointers.delete(e.pointerId);

      if (e.pointerId === dragPointerId) {
        const wasTap =
          totalDragDist < 7 &&
          Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) < 7;
        isDragging = false;
        setIsDraggingUI(false);
        dragPointerId = null;

        if (wasTap) {
          handleSceneTap(e.clientX, e.clientY);
        }
      }

      if (activePointers.size < 2) {
        prevPinchDist = null;
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (e.pointerId === dragPointerId) {
        isDragging = false;
        setIsDraggingUI(false);
        dragPointerId = null;
      }
      prevPinchDist = null;
    };

    const canvasEl = renderer.domElement;
    canvasEl.addEventListener('wheel', onWheel, {passive: false});
    canvasEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const prevDefault = framing.defaultDistance;
      framing = computeViewportFraming(w, h);

      if (Math.abs(targetDistance - prevDefault) < 0.25) {
        targetDistance = framing.defaultDistance;
      } else {
        targetDistance = THREE.MathUtils.clamp(
          targetDistance,
          getActiveMinDistance(),
          framing.maxDistance,
        );
      }
      syncZoomStateFlag();

      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResize)
        : null;
    resizeObserver?.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    const tick = () => {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Smoothly pause/stabilize circular movement while the QR polygon is selected, and resume naturally on close
      const targetMotionFactor = qrSelectedRef.current ? 0 : 1;
      motionFactor = THREE.MathUtils.damp(
        motionFactor,
        targetMotionFactor,
        qrSelectedRef.current ? 5.8 : 3.8,
        dt,
      );
      motionTime += dt * motionFactor;

      // Smooth zoom damping (unchanged global camera distance)
      currentDistance = THREE.MathUtils.damp(currentDistance, targetDistance, 8.5, dt);
      camera.position.z = currentDistance;
      camera.position.y = 0.08;
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      // Rotational physics & idle circular motion
      if (!isDragging) {
        rotY += velY * dt * motionFactor;
        rotX = THREE.MathUtils.clamp(rotX + velX * dt * motionFactor, -0.78, 0.78);
        velY = THREE.MathUtils.damp(velY, 0, 4.5, dt);
        velX = THREE.MathUtils.damp(velX, 0, 4.5, dt);

        if (!prefersReducedMotion) {
          const idleSpeed = phaseRef.current === 'intact' ? 0.26 : 0.14;
          rotY += idleSpeed * dt * motionFactor;
          const targetIdleX = 0.06 + Math.sin(motionTime * 0.68) * 0.075;
          const targetIdleZ = Math.cos(motionTime * 0.68) * 0.045;
          rotX = THREE.MathUtils.damp(rotX, targetIdleX, 1.8 * motionFactor + 0.001, dt);
          rotZ = THREE.MathUtils.damp(rotZ, targetIdleZ, 2.2 * motionFactor + 0.001, dt);
        } else {
          rotZ = THREE.MathUtils.damp(rotZ, 0, 4.0, dt);
        }
      }

      sculptureRoot.rotation.y = rotY;
      sculptureRoot.rotation.x = rotX;
      sculptureRoot.rotation.z = rotZ;

      const idleFloat = prefersReducedMotion ? 0 : Math.sin(motionTime * 1.25) * 0.032;
      sculptureRoot.position.y = -0.03 + idleFloat;

      // Opening / closing animation choreography
      if (phaseRef.current === 'opened') {
        openElapsed += dt * motionFactor;

        const splitActive = openElapsed > 0.08;
        const floatA = prefersReducedMotion ? 0 : Math.sin(motionTime * 1.45) * 0.035;
        const floatB = prefersReducedMotion ? 0 : Math.cos(motionTime * 1.35) * 0.03;

        const targetUpperPosX = splitActive ? -0.28 : 0;
        const targetUpperPosY = splitActive ? 0.8 + floatA : 0;
        const targetUpperPosZ = splitActive ? -0.14 : 0;

        const targetUpperRotX = splitActive ? -0.28 : 0;
        const targetUpperRotY = splitActive ? 0.18 : 0;
        const targetUpperRotZ = splitActive ? 0.32 : 0;

        const targetLowerPosX = splitActive ? 0.24 : 0;
        const targetLowerPosY = splitActive ? -0.74 + floatB : 0;
        const targetLowerPosZ = splitActive ? 0.12 : 0;

        const targetLowerRotX = splitActive ? 0.24 : 0;
        const targetLowerRotY = splitActive ? -0.16 : 0;
        const targetLowerRotZ = splitActive ? -0.28 : 0;

        const lambda = 4.6;
        upperPivot.position.x = THREE.MathUtils.damp(upperPivot.position.x, targetUpperPosX, lambda, dt);
        upperPivot.position.y = THREE.MathUtils.damp(upperPivot.position.y, targetUpperPosY, lambda, dt);
        upperPivot.position.z = THREE.MathUtils.damp(upperPivot.position.z, targetUpperPosZ, lambda, dt);
        upperPivot.rotation.x = THREE.MathUtils.damp(upperPivot.rotation.x, targetUpperRotX, lambda, dt);
        upperPivot.rotation.y = THREE.MathUtils.damp(upperPivot.rotation.y, targetUpperRotY, lambda, dt);
        upperPivot.rotation.z = THREE.MathUtils.damp(upperPivot.rotation.z, targetUpperRotZ, lambda, dt);

        lowerPivot.position.x = THREE.MathUtils.damp(lowerPivot.position.x, targetLowerPosX, lambda, dt);
        lowerPivot.position.y = THREE.MathUtils.damp(lowerPivot.position.y, targetLowerPosY, lambda, dt);
        lowerPivot.position.z = THREE.MathUtils.damp(lowerPivot.position.z, targetLowerPosZ, lambda, dt);
        lowerPivot.rotation.x = THREE.MathUtils.damp(lowerPivot.rotation.x, targetLowerRotX, lambda, dt);
        lowerPivot.rotation.y = THREE.MathUtils.damp(lowerPivot.rotation.y, targetLowerRotY, lambda, dt);
        lowerPivot.rotation.z = THREE.MathUtils.damp(lowerPivot.rotation.z, targetLowerRotZ, lambda, dt);

        const targetGlow = openElapsed < 0.55 ? 4.8 : 1.4;
        interiorLight.intensity = THREE.MathUtils.damp(interiorLight.intensity, targetGlow, 5.5, dt);
        shadowMat.opacity = THREE.MathUtils.damp(shadowMat.opacity, 0.24, 3.0, dt);

        if (confettiActive) {
          const fadeStart = 3.8;
          const fadeDuration = 2.4;
          let globalFade = 1;
          if (openElapsed > fadeStart) {
            globalFade = Math.max(0, 1 - (openElapsed - fadeStart) / fadeDuration);
          }
          confettiOpacityTarget = globalFade;
          confettiMat.opacity = confettiOpacityTarget;

          if (globalFade <= 0.005) {
            confettiActive = false;
            ribbonMesh.visible = false;
            shardMesh.visible = false;
          } else {
            for (let i = 0; i < totalConfetti; i++) {
              const idx = i * 3;
              const dampFactor = Math.exp(-cDrag[i] * dt * motionFactor);
              cVel[idx] *= dampFactor;
              cVel[idx + 1] = cVel[idx + 1] * dampFactor - 0.52 * dt * motionFactor;
              cVel[idx + 2] *= dampFactor;

              const flutter = Math.sin(motionTime * 3.8 + cPhase[i]) * 0.28 * dt * motionFactor;
              cPos[idx] += cVel[idx] * dt * motionFactor + flutter;
              cPos[idx + 1] += cVel[idx + 1] * dt * motionFactor;
              cPos[idx + 2] += cVel[idx + 2] * dt * motionFactor;

              cRot[idx] += cRotVel[idx] * dt * motionFactor;
              cRot[idx + 1] += cRotVel[idx + 1] * dt * motionFactor;
              cRot[idx + 2] += cRotVel[idx + 2] * dt * motionFactor;

              _dummy.position.set(cPos[idx], cPos[idx + 1], cPos[idx + 2]);
              _dummy.rotation.set(cRot[idx], cRot[idx + 1], cRot[idx + 2]);
              const s = cScale[i] * Math.min(1, openElapsed * 5);
              _dummy.scale.setScalar(s);
              _dummy.updateMatrix();

              if (i < ribbonCount) {
                ribbonMesh.setMatrixAt(i, _dummy.matrix);
              } else {
                shardMesh.setMatrixAt(i - ribbonCount, _dummy.matrix);
              }
            }
            ribbonMesh.instanceMatrix.needsUpdate = true;
            shardMesh.instanceMatrix.needsUpdate = true;
          }
        }
      } else if (phaseRef.current === 'closing') {
        const closeLambda = 6.2;
        upperPivot.position.x = THREE.MathUtils.damp(upperPivot.position.x, 0, closeLambda, dt);
        upperPivot.position.y = THREE.MathUtils.damp(upperPivot.position.y, 0, closeLambda, dt);
        upperPivot.position.z = THREE.MathUtils.damp(upperPivot.position.z, 0, closeLambda, dt);
        upperPivot.rotation.x = THREE.MathUtils.damp(upperPivot.rotation.x, 0, closeLambda, dt);
        upperPivot.rotation.y = THREE.MathUtils.damp(upperPivot.rotation.y, 0, closeLambda, dt);
        upperPivot.rotation.z = THREE.MathUtils.damp(upperPivot.rotation.z, 0, closeLambda, dt);

        lowerPivot.position.x = THREE.MathUtils.damp(lowerPivot.position.x, 0, closeLambda, dt);
        lowerPivot.position.y = THREE.MathUtils.damp(lowerPivot.position.y, 0, closeLambda, dt);
        lowerPivot.position.z = THREE.MathUtils.damp(lowerPivot.position.z, 0, closeLambda, dt);
        lowerPivot.rotation.x = THREE.MathUtils.damp(lowerPivot.rotation.x, 0, closeLambda, dt);
        lowerPivot.rotation.y = THREE.MathUtils.damp(lowerPivot.rotation.y, 0, closeLambda, dt);
        lowerPivot.rotation.z = THREE.MathUtils.damp(lowerPivot.rotation.z, 0, closeLambda, dt);

        interiorLight.intensity = THREE.MathUtils.damp(interiorLight.intensity, 0, 8.0, dt);
        shadowMat.opacity = THREE.MathUtils.damp(shadowMat.opacity, 0.52, 5.0, dt);

        if (confettiActive) {
          confettiMat.opacity = THREE.MathUtils.damp(confettiMat.opacity, 0, 9.0, dt);
          for (let i = 0; i < totalConfetti; i++) {
            const idx = i * 3;
            const dampFactor = Math.exp(-cDrag[i] * dt);
            cVel[idx] *= dampFactor;
            cVel[idx + 1] = cVel[idx + 1] * dampFactor - 0.52 * dt;
            cVel[idx + 2] *= dampFactor;
            cPos[idx] += cVel[idx] * dt;
            cPos[idx + 1] += cVel[idx + 1] * dt;
            cPos[idx + 2] += cVel[idx + 2] * dt;
            _dummy.position.set(cPos[idx], cPos[idx + 1], cPos[idx + 2]);
            _dummy.rotation.set(cRot[idx], cRot[idx + 1], cRot[idx + 2]);
            _dummy.scale.setScalar(cScale[i]);
            _dummy.updateMatrix();
            if (i < ribbonCount) ribbonMesh.setMatrixAt(i, _dummy.matrix);
            else shardMesh.setMatrixAt(i - ribbonCount, _dummy.matrix);
          }
          ribbonMesh.instanceMatrix.needsUpdate = true;
          shardMesh.instanceMatrix.needsUpdate = true;
          if (confettiMat.opacity < 0.01) {
            confettiActive = false;
            ribbonMesh.visible = false;
            shardMesh.visible = false;
          }
        }

        const settled =
          upperPivot.position.lengthSq() < 0.00004 &&
          lowerPivot.position.lengthSq() < 0.00004 &&
          Math.abs(upperPivot.rotation.x) < 0.004 &&
          Math.abs(upperPivot.rotation.z) < 0.004 &&
          Math.abs(lowerPivot.rotation.x) < 0.004 &&
          Math.abs(lowerPivot.rotation.z) < 0.004;

        if (settled) {
          upperPivot.position.set(0, 0, 0);
          upperPivot.rotation.set(0, 0, 0);
          lowerPivot.position.set(0, 0, 0);
          lowerPivot.rotation.set(0, 0, 0);
          interiorLight.intensity = 0;
          shadowMat.opacity = 0.52;
          confettiActive = false;
          ribbonMesh.visible = false;
          shardMesh.visible = false;
          confettiMat.opacity = 1;
          openElapsed = 0;
          phaseRef.current = 'intact';
          setWishPhase('intact');
        }
      }

      // Sync world matrices so qrHomeSlot reflects exact live shell pose
      sculptureRoot.updateMatrixWorld(true);
      qrHomeSlot.matrixWorld.decompose(_homePos, _homeQuat, _homeScale);

      // Independent QR polygon enlargement, gentle floating & restoration animation
      const targetQrT = qrSelectedRef.current ? 1 : 0;
      qrAnimT = THREE.MathUtils.damp(
        qrAnimT,
        targetQrT,
        qrSelectedRef.current ? 5.6 : 6.4,
        dt,
      );
      if (!qrSelectedRef.current && qrAnimT < 0.0008) {
        qrAnimT = 0;
      }

      // Gentle restrained floating animation once enlarged, smoothing down cleanly to 0 on close
      const targetFloatWeight =
        qrSelectedRef.current && qrAnimT > 0.85 && !prefersReducedMotion ? 1 : 0;
      qrFloatWeight = THREE.MathUtils.damp(
        qrFloatWeight,
        targetFloatWeight,
        qrSelectedRef.current ? 2.4 : 6.8,
        dt,
      );
      if (qrFloatWeight > 0.001) {
        qrFloatTime += dt;
      } else if (!qrSelectedRef.current) {
        qrFloatTime = 0;
      }

      if (qrAnimT === 0) {
        qrTilePivot.position.copy(_homePos);
        qrTilePivot.quaternion.copy(_homeQuat);
        qrTilePivot.scale.copy(_homeScale);
      } else {
        const viewDepth = 3.2;
        const visHalfH = viewDepth * TAN_HALF_V;
        const visHalfW = visHalfH * camera.aspect;
        const desiredOuterRadius = Math.min(visHalfH * 0.45, visHalfW * 0.67);
        const targetScaleScalar =
          desiredOuterRadius / Math.max(0.12, qrTile.maxRadius);

        const floatX = Math.sin(qrFloatTime * 0.72) * 0.022 * qrFloatWeight;
        const floatY = Math.sin(qrFloatTime * 1.05 + 0.6) * 0.026 * qrFloatWeight;
        const floatZ = Math.cos(qrFloatTime * 0.64) * 0.016 * qrFloatWeight;

        const tiltX = Math.sin(qrFloatTime * 0.82 + 1.1) * 0.024 * qrFloatWeight;
        const tiltY = Math.cos(qrFloatTime * 0.66) * 0.03 * qrFloatWeight;
        const tiltZ = Math.sin(qrFloatTime * 0.54) * 0.014 * qrFloatWeight;

        _targetPos.set(
          floatX,
          0.08 + visHalfH * 0.1 + floatY,
          currentDistance - viewDepth + floatZ,
        );
        _floatQuat.setFromEuler(_floatEuler.set(tiltX, tiltY, tiltZ));
        _targetQuat.copy(camera.quaternion).multiply(_floatQuat);
        _targetScale.setScalar(targetScaleScalar);

        qrTilePivot.position.lerpVectors(_homePos, _targetPos, qrAnimT);
        qrTilePivot.quaternion.slerpQuaternions(_homeQuat, _targetQuat, qrAnimT);
        qrTilePivot.scale.lerpVectors(_homeScale, _targetScale, qrAnimT);
      }

      // Clearer monochrome QR inside the bowl & full-contrast scannable reveal when enlarged
      const subtleTargetOpacity =
        phaseRef.current === 'opened' && !qrSelectedRef.current ? 0.68 : 0;
      qrSubtleMat.opacity = THREE.MathUtils.damp(
        qrSubtleMat.opacity,
        subtleTargetOpacity,
        6.0,
        dt,
      );
      qrSubtleMesh.visible = qrSubtleMat.opacity > 0.005;

      const scanTargetOpacity = qrSelectedRef.current ? 1 : 0;
      qrScanMat.opacity = THREE.MathUtils.damp(
        qrScanMat.opacity,
        scanTargetOpacity,
        6.8,
        dt,
      );
      qrScanMesh.visible = qrScanMat.opacity > 0.005;

      // Depth halo & bevel accent lighting for the enlarged floating tile

      const haloTargetOpacity = qrSelectedRef.current ? 0.72 : 0;
      qrHaloMat.opacity = THREE.MathUtils.damp(
        qrHaloMat.opacity,
        haloTargetOpacity,
        5.8,
        dt,
      );
      qrHaloMesh.visible = qrHaloMat.opacity > 0.005;

      const accentTargetIntensity = qrSelectedRef.current ? 2.1 : 0;
      qrAccentLight.intensity = THREE.MathUtils.damp(
        qrAccentLight.intensity,
        accentTargetIntensity,
        5.5,
        dt,
      );
      qrAccentLight.position.set(-1.35, 1.45, currentDistance - 1.5);

      const dimTargetOpacity = qrSelectedRef.current ? 0.64 : 0;
      backdropDimMat.opacity = THREE.MathUtils.damp(
        backdropDimMat.opacity,
        dimTargetOpacity,
        6.2,
        dt,
      );
      backdropDimPlane.visible = backdropDimMat.opacity > 0.005;
      if (backdropDimPlane.visible) {
        backdropDimPlane.position.set(0, 0.08, currentDistance - 4.0);
        backdropDimPlane.quaternion.copy(camera.quaternion);
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      renderer.render(scene, camera);
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);

      resizeObserver?.disconnect();
      canvasEl.removeEventListener('wheel', onWheel);
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('resize', handleResize);
      canvasEl.removeEventListener('webglcontextlost', onContextLost);
      canvasEl.removeEventListener('webglcontextrestored', onContextRestored);

      closeHandlerRef.current = null;
      deselectQrHandlerRef.current = null;
      upperGeometry.dispose();
      lowerGeometry.dispose();
      upperEdgeGeometry.dispose();
      lowerEdgeGeometry.dispose();
      qrTile.outerGeo.dispose();
      qrTile.innerGeo.dispose();
      qrTile.rimGeo.dispose();
      qrTile.outerEdgeGeo.dispose();
      shellMaterial.dispose();
      qrTileShellMat.dispose();
      edgeMaterial.dispose();
      qrSubtleMat.dispose();
      qrScanMat.dispose();
      subtleTex.dispose();
      scanTex.dispose();
      qrHaloGeo.dispose();
      qrHaloMat.dispose();
      haloTex.dispose();
      backdropDimGeo.dispose();
      backdropDimMat.dispose();
      ribbonGeo.dispose();
      shardGeo.dispose();
      confettiMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      envTarget.dispose();
      renderer.dispose();

      if (canvasEl.parentNode === container) {
        container.removeChild(canvasEl);
      }
    };
  }, []);

  const cursorClass = isDraggingUI
    ? 'cursor-grabbing'
    : isHoveringInteractive
      ? 'cursor-pointer'
      : qrSelected
        ? 'cursor-default'
        : 'cursor-grab';

  return (
    <main
      className={`relative w-full h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_50%_46%,#1b1b1f_0%,#0e0e11_48%,#070709_100%)] ${cursorClass}`}
    >
      {/* Isolated WebGL mount container */}
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Interactive monochromatic 3D faceted Christmas surprise"
        role="img"
      />

      {/* WebGL fallback in case GPU/WebGL is disabled */}
      {webglUnavailable && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <div className="max-w-sm space-y-2">
            <h1 className="font-display text-3xl text-zinc-100">Merry Christmas!</h1>
            <p className="text-sm text-zinc-400">
              WebGL is unavailable in this browser environment.
            </p>
          </div>
        </div>
      )}

      {/* Monochromatic Christmas greeting card & icon-only close control */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6 transition-opacity duration-300 ${
          qrSelected ? 'opacity-10' : 'opacity-100'
        }`}
      >
        <AnimatePresence>
          {wishPhase === 'opened' && (
            <motion.div
              initial={{opacity: 0, scale: 0.9, y: 14}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{
                opacity: 0,
                scale: 0.95,
                y: -8,
                transition: {duration: 0.32, ease: [0.16, 1, 0.3, 1]},
              }}
              transition={{
                delay: 0.22,
                duration: 0.85,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex flex-col items-center text-center max-w-md"
            >
              <h1
                className="font-display font-normal tracking-[0.015em] text-zinc-50 drop-shadow-[0_6px_30px_rgba(0,0,0,0.92)] select-none"
                style={{
                  fontSize: 'clamp(2.85rem, 6.8vw, 5.25rem)',
                  lineHeight: 1.24,
                  padding: '0.06em 0.14em',
                  textWrap: 'balance',
                }}
              >
                Merry Christmas!
              </h1>

              <motion.p
                initial={{opacity: 0, y: 8}}
                animate={{opacity: 1, y: 0}}
                transition={{delay: 0.42, duration: 0.65, ease: [0.16, 1, 0.3, 1]}}
                className="mt-2 sm:mt-2.5 font-sans font-normal text-[15px] sm:text-base leading-[1.7] tracking-[0.02em] text-zinc-200/90 drop-shadow-[0_3px_20px_rgba(0,0,0,0.95)] select-none"
                style={{textWrap: 'pretty'}}
              >
                Wishing you a peaceful season filled with quiet wonder, warmth at
                home, and joyful moments shared with the people who matter most.
              </motion.p>

              <motion.div
                initial={{opacity: 0, y: 8}}
                animate={{opacity: 1, y: 0}}
                transition={{delay: 0.6, duration: 0.45, ease: [0.16, 1, 0.3, 1]}}
                className={`mt-6 sm:mt-7 ${
                  qrSelected ? 'pointer-events-none' : 'pointer-events-auto'
                }`}
              >
                <div className="relative inline-flex items-center justify-center">
                  <button
                    type="button"
                    aria-label="Close Christmas surprise"
                    aria-describedby="close-surprise-tooltip"
                    tabIndex={qrSelected ? -1 : 0}
                    onClick={() => closeHandlerRef.current?.()}
                    className="peer inline-flex items-center justify-center w-11 h-11 rounded-full bg-zinc-950/80 hover:bg-zinc-800/90 border border-zinc-600/50 hover:border-zinc-300/80 text-zinc-300 hover:text-white shadow-[0_4px_18px_rgba(0,0,0,0.65)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <RotateCcw size={16} strokeWidth={1.65} aria-hidden="true" />
                  </button>
                  <span
                    id="close-surprise-tooltip"
                    role="tooltip"
                    className="pointer-events-none absolute top-full mt-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-zinc-950/95 border border-zinc-700/70 font-sans text-[11px] font-normal tracking-[0.04em] text-zinc-200 whitespace-nowrap opacity-0 translate-y-1 peer-hover:opacity-100 peer-hover:translate-y-0 peer-focus-visible:opacity-100 peer-focus-visible:translate-y-0 transition-all duration-150"
                  >
                    Close surprise
                  </span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Refined monochrome hierarchy & GitHub action below the enlarged floating QR polygon */}
      <AnimatePresence>
        {qrSelected && wishPhase === 'opened' && (
          <motion.div
            initial={{opacity: 0, y: 12}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: 8}}
            transition={{duration: 0.34, ease: [0.16, 1, 0.3, 1]}}
            className="pointer-events-none fixed bottom-9 sm:bottom-12 inset-x-0 z-30 flex flex-col items-center justify-center gap-3 px-4"
          >
            <p className="font-sans text-[11px] font-normal uppercase tracking-[0.18em] text-zinc-400/90 select-none">
              Scan to connect &middot; Manish9322
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowGithubDialog(true)}
                className="pointer-events-auto inline-flex items-center gap-2 h-10 px-4 rounded-full bg-zinc-950/92 hover:bg-zinc-800/95 border border-zinc-500/60 hover:border-zinc-200/80 text-zinc-100 hover:text-white font-sans text-xs font-normal tracking-[0.04em] shadow-[0_6px_22px_rgba(0,0,0,0.72)] transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <Github size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>GitHub Profile</span>
              </button>

              <div className="relative inline-flex items-center justify-center pointer-events-auto">
                <button
                  type="button"
                  aria-label="Close QR code"
                  aria-describedby="close-qr-tooltip"
                  onClick={() => deselectQrHandlerRef.current?.()}
                  className="peer inline-flex items-center justify-center w-10 h-10 rounded-full bg-zinc-950/92 hover:bg-zinc-800/95 border border-zinc-600/60 hover:border-zinc-300/80 text-zinc-300 hover:text-white shadow-[0_6px_22px_rgba(0,0,0,0.72)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <X size={15} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <span
                  id="close-qr-tooltip"
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-zinc-950/95 border border-zinc-700/70 font-sans text-[11px] font-normal tracking-[0.04em] text-zinc-200 whitespace-nowrap opacity-0 translate-y-1 peer-hover:opacity-100 peer-hover:translate-y-0 peer-focus-visible:opacity-100 peer-focus-visible:translate-y-0 transition-all duration-150"
                >
                  Close QR
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Monochromatic GitHub Confirmation Dialog */}
      <AnimatePresence>
        {showGithubDialog && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.2}}
            onClick={() => setShowGithubDialog(false)}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 px-6"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="github-dialog-title"
              aria-describedby="github-dialog-description"
              initial={{opacity: 0, scale: 0.94, y: 8}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.96, y: 4}}
              transition={{duration: 0.22, ease: [0.16, 1, 0.3, 1]}}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-zinc-950 border border-zinc-700/80 p-6 shadow-[0_24px_64px_rgba(0,0,0,0.85)] text-left font-sans"
            >
              <h2
                id="github-dialog-title"
                className="text-base font-medium tracking-[0.015em] text-zinc-50"
              >
                Visit GitHub Profile?
              </h2>
              <p
                id="github-dialog-description"
                className="mt-2.5 text-sm leading-relaxed text-zinc-300"
              >
                You&apos;re about to visit the GitHub profile of Manish9322.
                Would you like to continue?
              </p>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowGithubDialog(false)}
                  className="inline-flex items-center justify-center h-9 px-4 rounded-lg border border-zinc-700/80 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-medium tracking-[0.03em] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  Cancel
                </button>
                <a
                  href={GITHUB_PROFILE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowGithubDialog(false)}
                  className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium tracking-[0.03em] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  Continue
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle single-line interaction cue that fades out once opened */}
      <AnimatePresence>
        {wishPhase === 'intact' && !webglUnavailable && (
          <motion.p
            initial={{opacity: 0}}
            animate={{opacity: 0.68}}
            exit={{opacity: 0}}
            transition={{duration: 0.45}}
            className="pointer-events-none fixed bottom-6 inset-x-0 z-20 flex items-center justify-center text-center font-sans font-normal text-xs tracking-[0.05em] text-zinc-400 px-4"
          >
            {isZoomedIn ? (
              'Click to reset zoom'
            ) : (
              <>
                <span>Drag to rotate</span>
                <span aria-hidden="true" className="mx-2.5 text-zinc-600">
                  |
                </span>
                <span>Scroll to zoom</span>
                <span aria-hidden="true" className="mx-2.5 text-zinc-600">
                  |
                </span>
                <span>Click to open</span>
              </>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </main>
  );
}
