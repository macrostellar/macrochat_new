import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';
import { colors } from '@/theme/colors';

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform bool uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform bool uTransparent;
uniform float uLightMode;

varying vec2 vUv;

#define NUM_LAYER 5.0
#define STAR_COLOR_CUTOFF 0.18
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 quantumPalette(float seed) {
  float hue = 0.53 + fract(seed * 17.13) * 0.18;
  float sat = 0.45 + fract(seed * 29.7) * 0.35;
  float val = 0.65 + fract(seed * 41.3) * 0.9;
  vec3 base = hsv2rgb(vec3(hue, sat, val));
  float glowBoost = smoothstep(0.3, 0.9, fract(seed * 73.1));
  base = mix(base, vec3(0.12, 0.94, 0.88), glowBoost * 0.55);
  return base;
}

float starIntensity(float seed) {
  return mix(0.45, 1.45, fract(seed * 79.3));
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);

  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      vec3 base = quantumPalette(seed + floor(uHueShift));
      float satBoost = 0.45 + uSaturation * 0.8;
      base = hsv2rgb(vec3(0.52 + fract(seed * 17.0) * 0.12, satBoost, 0.85 + fract(seed * 11.0) * 0.55));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;

      float star = Star(gv - offset - pad, flareSize);
      vec3 color = base * starIntensity(seed);

      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      star *= twinkle;

      col += star * size * color;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;

  vec2 mouseNorm = uMouse - vec2(0.5);

  if (uAutoCenterRepulsion > 0.0) {
    vec2 centerUV = vec2(0.0, 0.0);
    float centerDist = length(uv - centerUV);
    vec2 repulsion = normalize(uv - centerUV) * (uAutoCenterRepulsion / (centerDist + 0.1));
    uv += repulsion * 0.05;
  } else if (uMouseRepulsion) {
    vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = normalize(uv - mousePosUV) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;
  } else {
    vec2 mouseOffset = mouseNorm * 0.1 * uMouseActiveFactor;
    uv += mouseOffset;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;

  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uLightMode > 0.5) {
    float energy = max(max(col.r, col.g), col.b);
    float coverage = clamp(smoothstep(0.0, 0.42, energy) * 0.92, 0.0, 0.92);
    vec3 ink = clamp(col * 0.48, 0.0, 0.82);
    gl_FragColor = vec4(mix(vec3(1.0), ink, coverage), 1.0);
  } else if (uTransparent) {
    float alpha = length(col);
    alpha = smoothstep(0.0, 0.3, alpha);
    alpha = min(alpha, 1.0);
    gl_FragColor = vec4(col, alpha);
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
}
`;

const galaxyConfig = {
  focal: [0.5, 0.5] as [number, number],
  rotation: [1.0, 0.0] as [number, number],
  starSpeed: 0.5,
  density: 1,
  hueShift: 140,
  disableAnimation: false,
  speed: 1,
  mouseInteraction: true,
  glowIntensity: 0.3,
  saturation: 0,
  mouseRepulsion: true,
  twinkleIntensity: 0.3,
  rotationSpeed: 0.1,
  repulsionStrength: 2,
} as const;

export function QuantumField() {
  const ctnDom = useRef<HTMLDivElement | null>(null);
  const targetMousePos = useRef({ x: 0.5, y: 0.5 });
  const smoothMousePos = useRef({ x: 0.5, y: 0.5 });
  const targetMouseActive = useRef(0.0);
  const smoothMouseActive = useRef(0.0);

  useEffect(() => {
    if (Platform.OS !== 'web' || !ctnDom.current) return;

    const ctn = ctnDom.current;
    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
    const gl = renderer.gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.canvas.style.position = 'absolute';
    gl.canvas.style.inset = '0';
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';
    gl.canvas.style.display = 'block';
    gl.canvas.style.pointerEvents = 'none';

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height) },
        uFocal: { value: new Float32Array(galaxyConfig.focal) },
        uRotation: { value: new Float32Array(galaxyConfig.rotation) },
        uStarSpeed: { value: galaxyConfig.starSpeed },
        uDensity: { value: galaxyConfig.density },
        uHueShift: { value: galaxyConfig.hueShift },
        uSpeed: { value: galaxyConfig.speed },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uGlowIntensity: { value: galaxyConfig.glowIntensity },
        uSaturation: { value: galaxyConfig.saturation },
        uMouseRepulsion: { value: galaxyConfig.mouseRepulsion },
        uTwinkleIntensity: { value: galaxyConfig.twinkleIntensity },
        uRotationSpeed: { value: galaxyConfig.rotationSpeed },
        uRepulsionStrength: { value: galaxyConfig.repulsionStrength },
        uMouseActiveFactor: { value: 0 },
        uAutoCenterRepulsion: { value: galaxyConfig.disableAnimation ? 0.18 : 0 },
        uTransparent: { value: true },
        uLightMode: { value: 0 },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      const scale = 1;
      renderer.setSize(ctn.offsetWidth * scale, ctn.offsetHeight * scale);
      program.uniforms.uResolution.value = new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
    }

    function update(time: number) {
      program.uniforms.uTime.value = time * 0.001;
      program.uniforms.uStarSpeed.value = galaxyConfig.starSpeed + ((time * 0.001) % 1) * 0.05;

      smoothMousePos.current.x += (targetMousePos.current.x - smoothMousePos.current.x) * 0.08;
      smoothMousePos.current.y += (targetMousePos.current.y - smoothMousePos.current.y) * 0.08;
      smoothMouseActive.current += (targetMouseActive.current - smoothMouseActive.current) * 0.08;

      program.uniforms.uMouse.value[0] = smoothMousePos.current.x;
      program.uniforms.uMouse.value[1] = smoothMousePos.current.y;
      program.uniforms.uMouseActiveFactor.value = galaxyConfig.mouseInteraction ? smoothMouseActive.current : 0;

      renderer.render({ scene: mesh });
      requestAnimationFrame(update);
    }

    function handleMouseMove(event: MouseEvent | PointerEvent) {
      const x = event.clientX / window.innerWidth;
      const y = 1 - event.clientY / window.innerHeight;
      targetMousePos.current = {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      };
      targetMouseActive.current = 1;
    }

    function handleMouseLeave() {
      targetMouseActive.current = 0;
    }

    function handleWheel(event: WheelEvent) {
      targetMousePos.current.y = Math.min(1, Math.max(0, targetMousePos.current.y + event.deltaY * 0.0007));
      targetMouseActive.current = 1;
    }

    ctn.style.pointerEvents = 'none';
    ctn.style.touchAction = 'none';

    window.addEventListener('resize', resize, false);
    window.addEventListener('mousemove', handleMouseMove as EventListener);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('pointermove', handleMouseMove as EventListener);
    window.addEventListener('pointerleave', handleMouseLeave);
    window.addEventListener('wheel', handleWheel, { passive: true });

    resize();
    requestAnimationFrame(update);
    ctn.appendChild(gl.canvas);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove as EventListener);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('pointermove', handleMouseMove as EventListener);
      window.removeEventListener('pointerleave', handleMouseLeave);
      window.removeEventListener('wheel', handleWheel);
      ctn.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  if (Platform.OS !== 'web') {
    return <View style={[styles.fallback, { pointerEvents: 'none' }]} />;
  }

  return <div ref={ctnDom} style={webGalaxyStyle} />;
}

const webGalaxyStyle = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  backgroundColor: 'rgba(3, 11, 20, 0.95)',
  backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(9, 173, 255, 0.16), transparent 28%), radial-gradient(circle at 70% 70%, rgba(57, 255, 20, 0.10), transparent 26%)',
} as const;

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.navy950,
  },
});
