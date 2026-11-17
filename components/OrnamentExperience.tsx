'use client';

import React, {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {motion, AnimatePresence} from 'motion/react';
import {RotateCcw} from 'lucide-react';
import {createOrnamentParts} from '@/lib/ornament-geometry';

type OrnamentPhase = 'intact' | 'opened' | 'closing';

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

function computeDefaultDistance(width: number, height: number): number {
  const aspect = width / Math.max(1, height);
  if (aspect >= 1.1) return 5.0;
  return THREE.MathUtils.clamp(5.0 / Math.max(0.68, aspect * 1.12), 5.0, 7.1);
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

export default function OrnamentExperience() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [ornamentPhase, setOrnamentPhase] = useState<OrnamentPhase>('intact');
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [isHoveringOrnament, setIsHoveringOrnament] = useState(false);
  const [isDraggingUI, setIsDraggingUI] = useState(false);
  const webglUnavailable = React.useSyncExternalStore(
    subscribeNoop,
    getWebglUnavailableSnapshot,
    getWebglUnavailableServerSnapshot,
  );

  const phaseRef = useRef<OrnamentPhase>('intact');
  const zoomedInRef = useRef(false);
  const closeHandlerRef = useRef<(() => void) | null>(null);

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

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    let defaultDistance = computeDefaultDistance(width, height);
    let minDistance = defaultDistance * 0.54;
    let maxDistance = defaultDistance * 1.68;
    let targetDistance = defaultDistance;
    let currentDistance = defaultDistance;
    camera.position.set(0, 0.14, currentDistance);
    camera.lookAt(0, 0.08, 0);

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
    const hemiLight = new THREE.HemisphereLight(0xf4f4f5, 0x18181b, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.15);
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

    const rimLight = new THREE.DirectionalLight(0xfafafa, 1.65);
    rimLight.position.set(-4.8, 3.2, -4.6);
    scene.add(rimLight);

    const bounceLight = new THREE.DirectionalLight(0xd4d4d8, 0.55);
    bounceLight.position.set(3.2, -3.8, 2.4);
    scene.add(bounceLight);

    // Interior glow point light revealed when ornament opens
    const interiorLight = new THREE.PointLight(0xffffff, 0, 7, 1.8);
    interiorLight.position.set(0, 0, 0);
    scene.add(interiorLight);

    // Soft grounded studio contact shadow
    const shadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    });
    const shadowGeo = new THREE.PlaneGeometry(3.4, 3.4);
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.52;
    scene.add(shadowPlane);

    // Ornament hierarchy (shifted slightly down so ball + crown loop sit visually centered)
    const ornamentRoot = new THREE.Group();
    ornamentRoot.position.y = -0.08;
    scene.add(ornamentRoot);

    const upperPivot = new THREE.Group();
    const lowerPivot = new THREE.Group();
    ornamentRoot.add(upperPivot);
    ornamentRoot.add(lowerPivot);

    const parts = createOrnamentParts();
    parts.finishTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const outerShellMat = new THREE.MeshPhysicalMaterial({
      map: parts.finishTexture,
      roughness: 0.18,
      metalness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.35,
    });

    const innerCavityMat = new THREE.MeshStandardMaterial({
      color: 0x111113,
      roughness: 0.85,
      metalness: 0.08,
    });

    const rimBevelMat = new THREE.MeshStandardMaterial({
      color: 0xc4c4cc,
      roughness: 0.24,
      metalness: 0.85,
      envMapIntensity: 1.15,
    });

    const capMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.24,
      metalness: 0.92,
      envMapIntensity: 1.25,
    });

    const hardwareChromeMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f5,
      roughness: 0.12,
      metalness: 0.96,
      envMapIntensity: 1.4,
    });

    // Upper shell + cap + hanging loop
    const upperOuterMesh = new THREE.Mesh(parts.upperOuterGeo, outerShellMat);
    upperOuterMesh.castShadow = !isSoftwareGl;
    upperOuterMesh.receiveShadow = !isSoftwareGl;
    upperPivot.add(upperOuterMesh);

    const upperInnerMesh = new THREE.Mesh(parts.upperInnerGeo, innerCavityMat);
    upperPivot.add(upperInnerMesh);

    const upperRimMesh = new THREE.Mesh(parts.upperRimGeo, rimBevelMat);
    upperPivot.add(upperRimMesh);

    const capBodyMesh = new THREE.Mesh(parts.capBodyGeo, capMat);
    capBodyMesh.castShadow = !isSoftwareGl;
    upperPivot.add(capBodyMesh);

    const capCollarMesh = new THREE.Mesh(parts.capCollarGeo, hardwareChromeMat);
    upperPivot.add(capCollarMesh);

    const pinMesh = new THREE.Mesh(parts.pinGeo, hardwareChromeMat);
    upperPivot.add(pinMesh);

    const loopMesh = new THREE.Mesh(parts.loopGeo, hardwareChromeMat);
    loopMesh.castShadow = !isSoftwareGl;
    upperPivot.add(loopMesh);

    // Lower shell
    const lowerOuterMesh = new THREE.Mesh(parts.lowerOuterGeo, outerShellMat);
    lowerOuterMesh.castShadow = !isSoftwareGl;
    lowerOuterMesh.receiveShadow = !isSoftwareGl;
    lowerPivot.add(lowerOuterMesh);

    const lowerInnerMesh = new THREE.Mesh(parts.lowerInnerGeo, innerCavityMat);
    lowerPivot.add(lowerInnerMesh);

    const lowerRimMesh = new THREE.Mesh(parts.lowerRimGeo, rimBevelMat);
    lowerPivot.add(lowerRimMesh);

    const interactiveMeshes = [
      upperOuterMesh,
      lowerOuterMesh,
      capBodyMesh,
      loopMesh,
    ];

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

    // Rotation & drag state
    let rotY = 0.25;
    let rotX = 0.08;
    let rotZ = 0;
    let velY = 0;
    let velX = 0;

    let openElapsed = 0;
    let confettiActive = false;

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

    const syncZoomStateFlag = () => {
      const zoomed = targetDistance < defaultDistance - 0.16;
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

      for (let i = 0; i < totalConfetti; i++) {
        const idx = i * 3;
        cPos[idx] = (Math.random() - 0.5) * 0.24;
        cPos[idx + 1] = (Math.random() - 0.5) * 0.24 - 0.06;
        cPos[idx + 2] = (Math.random() - 0.5) * 0.24;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 2.6 + Math.random() * 4.2;

        cVel[idx] = Math.sin(phi) * Math.cos(theta) * speed;
        cVel[idx + 1] = Math.cos(phi) * speed * 0.9 + 1.15;
        cVel[idx + 2] = Math.sin(phi) * Math.sin(theta) * speed;

        cRot[idx] = Math.random() * Math.PI * 2;
        cRot[idx + 1] = Math.random() * Math.PI * 2;
        cRot[idx + 2] = Math.random() * Math.PI * 2;

        cRotVel[idx] = (Math.random() - 0.5) * 9;
        cRotVel[idx + 1] = (Math.random() - 0.5) * 9;
        cRotVel[idx + 2] = (Math.random() - 0.5) * 9;

        cScale[i] = 0.65 + Math.random() * 0.95;
        cDrag[i] = 1.65 + Math.random() * 1.1;
        cPhase[i] = Math.random() * Math.PI * 2;
      }
    };

    const triggerOpen = () => {
      if (phaseRef.current !== 'intact') return;
      phaseRef.current = 'opened';
      openElapsed = 0;
      setOrnamentPhase('opened');
      setIsHoveringOrnament(false);
      spawnCelebrationBurst();
    };

    const triggerClose = () => {
      if (phaseRef.current !== 'opened') return;
      phaseRef.current = 'closing';
      setOrnamentPhase('closing');
      setIsHoveringOrnament(false);
    };
    closeHandlerRef.current = triggerClose;

    const handleOrnamentTap = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);
      const hits = _raycaster.intersectObjects(interactiveMeshes, false);

      if (hits.length === 0) return;

      if (targetDistance < defaultDistance - 0.16) {
        targetDistance = defaultDistance;
        syncZoomStateFlag();
        return;
      }

      if (phaseRef.current === 'intact') {
        triggerOpen();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * 0.0038;
      targetDistance = THREE.MathUtils.clamp(
        targetDistance + delta,
        minDistance,
        maxDistance,
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
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      renderer.domElement.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

      if (activePointers.size === 1) {
        isDragging = true;
        setIsDraggingUI(true);
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
        const pinchDist = getPinchDistance();
        if (pinchDist !== null && prevPinchDist !== null) {
          const diff = prevPinchDist - pinchDist;
          targetDistance = THREE.MathUtils.clamp(
            targetDistance + diff * 0.015,
            minDistance,
            maxDistance,
          );
          syncZoomStateFlag();
        }
        prevPinchDist = pinchDist;
        return;
      }

      if (isDragging && e.pointerId === dragPointerId) {
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

      if (e.pointerType === 'mouse' && phaseRef.current === 'intact') {
        const now = performance.now();
        if (now - lastHoverCheck > 45) {
          lastHoverCheck = now;
          const rect = renderer.domElement.getBoundingClientRect();
          _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          _raycaster.setFromCamera(_pointerNdc, camera);
          const hits = _raycaster.intersectObjects(interactiveMeshes, false);
          setIsHoveringOrnament(hits.length > 0);
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
          handleOrnamentTap(e.clientX, e.clientY);
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

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const prevDefault = defaultDistance;
      defaultDistance = computeDefaultDistance(w, h);
      minDistance = defaultDistance * 0.54;
      maxDistance = defaultDistance * 1.68;

      if (Math.abs(targetDistance - prevDefault) < 0.25) {
        targetDistance = defaultDistance;
      } else {
        targetDistance = THREE.MathUtils.clamp(targetDistance, minDistance, maxDistance);
      }
      syncZoomStateFlag();

      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsedTotal = 0;

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
      elapsedTotal += dt;

      currentDistance = THREE.MathUtils.damp(currentDistance, targetDistance, 8.5, dt);
      camera.position.z = currentDistance;
      camera.position.y = 0.14;
      camera.lookAt(0, 0.08, 0);

      if (!isDragging) {
        rotY += velY * dt;
        rotX = THREE.MathUtils.clamp(rotX + velX * dt, -0.78, 0.78);
        velY = THREE.MathUtils.damp(velY, 0, 4.5, dt);
        velX = THREE.MathUtils.damp(velX, 0, 4.5, dt);

        if (!prefersReducedMotion) {
          const idleSpeed = phaseRef.current === 'intact' ? 0.26 : 0.14;
          rotY += idleSpeed * dt;
          const targetIdleX = 0.08 + Math.sin(elapsedTotal * 0.68) * 0.075;
          const targetIdleZ = Math.cos(elapsedTotal * 0.68) * 0.045;
          rotX = THREE.MathUtils.damp(rotX, targetIdleX, 1.8, dt);
          rotZ = THREE.MathUtils.damp(rotZ, targetIdleZ, 2.2, dt);
        } else {
          rotZ = THREE.MathUtils.damp(rotZ, 0, 4.0, dt);
        }
      }

      ornamentRoot.rotation.y = rotY;
      ornamentRoot.rotation.x = rotX;
      ornamentRoot.rotation.z = rotZ;

      const idleFloat = prefersReducedMotion ? 0 : Math.sin(elapsedTotal * 1.25) * 0.04;
      ornamentRoot.position.y = -0.08 + idleFloat;

      if (phaseRef.current === 'opened') {
        openElapsed += dt;

        const splitActive = openElapsed > 0.08;
        const floatA = prefersReducedMotion ? 0 : Math.sin(openElapsed * 1.45) * 0.04;
        const floatB = prefersReducedMotion ? 0 : Math.cos(openElapsed * 1.35) * 0.035;

        const targetUpperPosX = splitActive ? -0.32 : 0;
        const targetUpperPosY = splitActive ? 0.94 + floatA : 0;
        const targetUpperPosZ = splitActive ? -0.16 : 0;

        const targetUpperRotX = splitActive ? -0.32 : 0;
        const targetUpperRotY = splitActive ? 0.18 : 0;
        const targetUpperRotZ = splitActive ? 0.34 : 0;

        const targetLowerPosX = splitActive ? 0.26 : 0;
        const targetLowerPosY = splitActive ? -0.86 + floatB : 0;
        const targetLowerPosZ = splitActive ? 0.14 : 0;

        const targetLowerRotX = splitActive ? 0.26 : 0;
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
        shadowMat.opacity = THREE.MathUtils.damp(shadowMat.opacity, 0.22, 3.0, dt);

        if (confettiActive) {
          const fadeStart = 3.8;
          const fadeDuration = 2.4;
          let globalFade = 1;
          if (openElapsed > fadeStart) {
            globalFade = Math.max(0, 1 - (openElapsed - fadeStart) / fadeDuration);
          }
          confettiMat.opacity = globalFade;

          if (globalFade <= 0.005) {
            confettiActive = false;
            ribbonMesh.visible = false;
            shardMesh.visible = false;
          } else {
            for (let i = 0; i < totalConfetti; i++) {
              const idx = i * 3;
              const dampFactor = Math.exp(-cDrag[i] * dt);
              cVel[idx] *= dampFactor;
              cVel[idx + 1] = cVel[idx + 1] * dampFactor - 0.52 * dt;
              cVel[idx + 2] *= dampFactor;

              const flutter = Math.sin(elapsedTotal * 3.8 + cPhase[i]) * 0.28 * dt;
              cPos[idx] += cVel[idx] * dt + flutter;
              cPos[idx + 1] += cVel[idx + 1] * dt;
              cPos[idx + 2] += cVel[idx + 2] * dt;

              cRot[idx] += cRotVel[idx] * dt;
              cRot[idx + 1] += cRotVel[idx + 1] * dt;
              cRot[idx + 2] += cRotVel[idx + 2] * dt;

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
        shadowMat.opacity = THREE.MathUtils.damp(shadowMat.opacity, 0.5, 5.0, dt);

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
          shadowMat.opacity = 0.5;
          confettiActive = false;
          ribbonMesh.visible = false;
          shardMesh.visible = false;
          confettiMat.opacity = 1;
          openElapsed = 0;
          phaseRef.current = 'intact';
          setOrnamentPhase('intact');
        }
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

      canvasEl.removeEventListener('wheel', onWheel);
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('resize', onResize);
      canvasEl.removeEventListener('webglcontextlost', onContextLost);
      canvasEl.removeEventListener('webglcontextrestored', onContextRestored);

      closeHandlerRef.current = null;
      parts.upperOuterGeo.dispose();
      parts.upperInnerGeo.dispose();
      parts.upperRimGeo.dispose();
      parts.lowerOuterGeo.dispose();
      parts.lowerInnerGeo.dispose();
      parts.lowerRimGeo.dispose();
      parts.capBodyGeo.dispose();
      parts.capCollarGeo.dispose();
      parts.pinGeo.dispose();
      parts.loopGeo.dispose();
      parts.finishTexture.dispose();

      outerShellMat.dispose();
      innerCavityMat.dispose();
      rimBevelMat.dispose();
      capMat.dispose();
      hardwareChromeMat.dispose();

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
    : isHoveringOrnament
      ? 'cursor-pointer'
      : 'cursor-grab';

  return (
    <main
      className={`relative w-screen h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_50%_46%,#1b1b1f_0%,#0e0e11_48%,#070709_100%)] ${cursorClass}`}
    >
      {/* Isolated WebGL mount container */}
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Interactive monochromatic 3D spiral Christmas ornament"
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

      {/* Monochromatic holiday greeting card & icon-only Close ornament button */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6">
        <AnimatePresence>
          {ornamentPhase === 'opened' && (
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
                className="mt-6 sm:mt-7 pointer-events-auto"
              >
                <div className="relative inline-flex items-center justify-center">
                  <button
                    type="button"
                    aria-label="Close ornament"
                    aria-describedby="close-ornament-tooltip"
                    onClick={() => closeHandlerRef.current?.()}
                    className="peer inline-flex items-center justify-center w-11 h-11 rounded-full bg-zinc-950/80 hover:bg-zinc-800/90 border border-zinc-600/50 hover:border-zinc-300/80 text-zinc-300 hover:text-white shadow-[0_4px_18px_rgba(0,0,0,0.65)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <RotateCcw size={16} strokeWidth={1.65} aria-hidden="true" />
                  </button>
                  <span
                    id="close-ornament-tooltip"
                    role="tooltip"
                    className="pointer-events-none absolute top-full mt-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-zinc-950/95 border border-zinc-700/70 font-sans text-[11px] font-normal tracking-[0.04em] text-zinc-200 whitespace-nowrap opacity-0 translate-y-1 peer-hover:opacity-100 peer-hover:translate-y-0 peer-focus-visible:opacity-100 peer-focus-visible:translate-y-0 transition-all duration-150"
                  >
                    Close ornament
                  </span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Subtle single-line interaction cue that fades out once opened */}
      <AnimatePresence>
        {ornamentPhase === 'intact' && !webglUnavailable && (
          <motion.p
            initial={{opacity: 0}}
            animate={{opacity: 0.68}}
            exit={{opacity: 0}}
            transition={{duration: 0.45}}
            className="pointer-events-none fixed bottom-6 inset-x-0 z-20 flex items-center justify-center text-center font-sans font-normal text-xs tracking-[0.05em] text-zinc-400 px-4"
          >
            {isZoomedIn ? (
              'Click ornament to reset zoom'
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
