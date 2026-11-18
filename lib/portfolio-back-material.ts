import * as THREE from 'three';

export interface PortfolioBackMaterialHandle {
  material: THREE.ShaderMaterial;
  setColorMix: (mix: number) => void;
  dispose: () => void;
}

export function createPortfolioBackMaterial(options: {
  bgHex: number;
  iconUrl: string;
  iconFraction: number;
  anisotropy: number;
}): PortfolioBackMaterialHandle {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
  }

  const iconTex = new THREE.CanvasTexture(canvas);
  iconTex.colorSpace = THREE.SRGBColorSpace;
  iconTex.wrapS = THREE.ClampToEdgeWrapping;
  iconTex.wrapT = THREE.ClampToEdgeWrapping;
  iconTex.anisotropy = options.anisotropy;
  iconTex.minFilter = THREE.LinearMipmapLinearFilter;
  iconTex.magFilter = THREE.LinearFilter;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uIconMap: {value: iconTex},
      uBgColor: {value: new THREE.Color(options.bgHex)},
      uIconFraction: {value: options.iconFraction},
      uColorMix: {value: 0},
      uHasIcon: {value: 0},
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uIconMap;
      uniform vec3 uBgColor;
      uniform float uIconFraction;
      uniform float uColorMix;
      uniform float uHasIcon;
      varying vec2 vUv;

      void main() {
        float halfSpan = uIconFraction * 0.5;
        float minB = 0.5 - halfSpan;
        float maxB = 0.5 + halfSpan;

        vec2 d = max(fwidth(vUv) * 0.85, vec2(0.001));
        float inX = smoothstep(minB - d.x, minB + d.x, vUv.x) * (1.0 - smoothstep(maxB - d.x, maxB + d.x, vUv.x));
        float inY = smoothstep(minB - d.y, minB + d.y, vUv.y) * (1.0 - smoothstep(maxB - d.y, maxB + d.y, vUv.y));
        float mask = inX * inY * uHasIcon;

        vec2 iconUv = clamp((vUv - vec2(minB)) / uIconFraction, 0.001, 0.999);
        vec4 tex = texture2D(uIconMap, iconUv);
        float lum = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 iconRgb = mix(vec3(lum), tex.rgb, uColorMix);

        vec3 finalRgb = mix(uBgColor, iconRgb, mask * tex.a);
        gl_FragColor = vec4(finalRgb, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: false,
    depthWrite: true,
    toneMapped: false,
  });

  let disposed = false;
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (disposed || !ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size, size);
    iconTex.needsUpdate = true;
    material.uniforms.uHasIcon.value = 1;
  };
  img.src = options.iconUrl;

  return {
    material,
    setColorMix: (mix: number) => {
      material.uniforms.uColorMix.value = mix;
    },
    dispose: () => {
      disposed = true;
      iconTex.dispose();
      material.dispose();
    },
  };
}
