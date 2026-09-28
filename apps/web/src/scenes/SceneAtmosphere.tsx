import { useEffect, useRef } from 'react';
import type { SceneId } from '@jiuxiao/content';
import { getCanvasBufferSize, getSceneNumber, resolveGraphicsProfile, type GraphicsSettings } from '../graphics-settings';
import { selectSceneVideo } from '../scene-media';

export type SceneRenderStatus = {
  backend: 'WebGL 2' | 'WebGL' | 'Canvas 2D' | '静态回退';
  fps: number | null;
  renderScale: number;
  targetFps: number;
  sceneId: SceneId;
};

type Props = { sceneId: SceneId; theme: 'night' | 'day'; settings: GraphicsSettings };
type GL = WebGLRenderingContext | WebGL2RenderingContext;

const VERTEX_100 = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() { vUv = (aPosition + 1.0) * 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT_100 = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uScene;
uniform float uFog;
uniform float uDay;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0; float amplitude = 0.5;
  for (int i = 0; i < 4; i++) { value += amplitude * noise(p); p *= 2.03; amplitude *= 0.48; }
  return value;
}
void main() {
  vec2 uv = vUv;
  float time = uTime * 0.012;
  float cloud = fbm(vec2(uv.x * 3.2 + time * 0.16, uv.y * 2.1 - time * 0.12));
  float cloudBand = smoothstep(0.47, 0.86, cloud) * smoothstep(0.05, 0.72, uv.y);
  float lowMist = (1.0 - smoothstep(0.03, 0.32, uv.y)) * (0.28 + 0.72 * fbm(vec2(uv.x * 4.0 - time * 0.28, uv.y * 4.0)));
  float fog = clamp((cloudBand * 0.55 + lowMist * 0.7) * uFog, 0.0, 0.19);

  vec3 coolLight = vec3(0.62, 0.76, 0.86);
  vec3 paleLight = vec3(0.75, 0.78, 0.72);
  vec3 warmLight = vec3(0.91, 0.68, 0.40);
  vec3 emberLight = vec3(0.85, 0.39, 0.22);
  vec3 light = uScene < 0.5 ? coolLight : uScene < 1.5 ? vec3(0.53, 0.68, 0.55) : uScene < 2.5 ? warmLight : emberLight;
  if (uDay > 0.5) light = mix(light, paleLight, 0.56);
  vec3 color = light * fog;
  float alpha = fog;

  if (uScene < 0.5) {
    float waterLine = 1.0 - smoothstep(0.0, 0.11, abs(uv.y - 0.105 - 0.008 * sin(uv.x * 20.0 + time * 4.0)));
    float glimmer = 0.5 + 0.5 * sin(uv.x * 75.0 + time * 18.0 + noise(uv * 17.0) * 3.0);
    float reflection = waterLine * glimmer * 0.055 * uFog;
    color += vec3(0.76, 0.83, 0.86) * reflection;
    alpha = max(alpha, reflection);
  }

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.22));
}
`;

const PARTICLE_VERTEX_100 = `
attribute vec4 aParticle;
uniform float uTime;
uniform float uScene;
uniform float uDay;
varying float vAlpha;
varying vec3 vColor;
void main() {
  float drift = sin(uTime * 0.0012 + aParticle.w * 6.28318) * 0.018;
  float rise = uScene > 2.5 ? 0.00008 : 0.000035;
  float y = fract(aParticle.y + uTime * rise * (0.55 + aParticle.w));
  gl_Position = vec4((aParticle.x + drift) * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = aParticle.z * (uScene > 2.5 ? 1.25 : 1.0);
  vAlpha = (uScene > 2.5 ? 0.42 : 0.24) * (0.55 + 0.45 * sin(uTime * 0.0017 + aParticle.w * 8.0));
  vec3 cold = vec3(0.72, 0.84, 0.92);
  vec3 warm = uScene > 2.5 ? vec3(1.0, 0.46, 0.23) : vec3(0.95, 0.73, 0.46);
  vColor = uScene < 1.5 ? cold : warm;
  if (uDay > 0.5) vColor = mix(vColor, vec3(0.92, 0.91, 0.81), 0.42);
}`;

const PARTICLE_FRAGMENT_100 = `
precision mediump float;
varying float vAlpha;
varying vec3 vColor;
void main() {
  float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
  float glow = 1.0 - smoothstep(0.08, 0.5, distanceFromCenter);
  gl_FragColor = vec4(vColor, vAlpha * glow);
}`;

function createProgramFromSources(gl: GL, vertex: string, fragment: string): WebGLProgram | null {
  const compile = (kind: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(kind);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    return shader;
  };
  const vertexShader = compile(gl.VERTEX_SHADER, vertex);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }
  const program = gl.createProgram();
  if (!program) { gl.deleteShader(vertexShader); gl.deleteShader(fragmentShader); return null; }
  gl.attachShader(program, vertexShader); gl.attachShader(program, fragmentShader); gl.linkProgram(program);
  gl.deleteShader(vertexShader); gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null; }
  return program;
}

function createProgram(gl: GL, version: 1 | 2): WebGLProgram | null {
  const vertex = version === 2
    ? `#version 300 es\nin vec2 aPosition; out vec2 vUv; void main() { vUv=(aPosition+1.0)*0.5; gl_Position=vec4(aPosition,0.0,1.0); }`
    : VERTEX_100;
  const fragment = version === 2
    ? `#version 300 es\n${FRAGMENT_100.replace('varying vec2 vUv;', 'in vec2 vUv;').replace('gl_FragColor', 'outColor').replace('precision mediump float;', 'precision mediump float;\nout vec4 outColor;')}`
    : FRAGMENT_100;
  return createProgramFromSources(gl, vertex, fragment);
}

function createParticleProgram(gl: GL, version: 1 | 2): WebGLProgram | null {
  const vertex = version === 2
    ? `#version 300 es\n${PARTICLE_VERTEX_100
      .replace('attribute vec4 aParticle;', 'in vec4 aParticle;')
      .replace('varying float vAlpha;', 'out float vAlpha;')
      .replace('varying vec3 vColor;', 'out vec3 vColor;')}`
    : PARTICLE_VERTEX_100;
  const fragment = version === 2
    ? `#version 300 es\n${PARTICLE_FRAGMENT_100
      .replace('varying float vAlpha;', 'in float vAlpha;')
      .replace('varying vec3 vColor;', 'in vec3 vColor;')
      .replace('gl_FragColor', 'outColor')
      .replace('precision mediump float;', 'precision mediump float;\nout vec4 outColor;')}`
    : PARTICLE_FRAGMENT_100;
  return createProgramFromSources(gl, vertex, fragment);
}

function createParticleData(): Float32Array {
  const values = new Float32Array(96 * 4);
  const fraction = (value: number) => value - Math.floor(value);
  for (let index = 0; index < 96; index += 1) {
    const offset = index * 4;
    values[offset] = fraction(Math.sin((index + 1) * 127.1) * 43758.5453);
    values[offset + 1] = fraction(Math.sin((index + 1) * 78.233) * 19341.3471);
    values[offset + 2] = 2.4 + (index % 4) * 1.15;
    values[offset + 3] = fraction((index + 1) * 0.6180339);
  }
  return values;
}

function postStatus(status: SceneRenderStatus): void {
  window.dispatchEvent(new CustomEvent<SceneRenderStatus>('jx:scene-render-status', { detail: status }));
}

export function SceneAtmosphere({ sceneId, theme, settings }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const atmosphereRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    const narrow = window.matchMedia?.('(max-width: 720px)') ?? null;
    let selectedSource = '';
    const clearSource = () => {
      video.pause();
      video.classList.remove('is-playing');
      video.removeAttribute('src');
      video.removeAttribute('poster');
      video.dataset.sceneSource = '';
      video.load();
      selectedSource = '';
    };
    const synchronize = () => {
      const selection = selectSceneVideo({
        sceneId,
        narrowViewport: narrow?.matches ?? window.innerWidth <= 720,
        enabled: settings.sceneVideoEnabled,
        dataSaver: settings.dataSaver,
        reducedMotion: settings.reducedMotion,
        systemReducedMotion: reducedMotion?.matches ?? false,
      });
      if (!selection) { clearSource(); return; }
      if (selection.src !== selectedSource) {
        video.pause();
        video.classList.remove('is-playing');
        video.poster = selection.poster;
        video.src = selection.src;
        video.dataset.sceneSource = selection.src;
        selectedSource = selection.src;
        video.load();
      }
      void video.play().catch(() => video.classList.remove('is-playing'));
    };
    const onPlaying = () => video.classList.add('is-playing');
    const onError = () => { video.pause(); video.classList.remove('is-playing'); };
    video.muted = true;
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    window.addEventListener('resize', synchronize);
    narrow?.addEventListener('change', synchronize);
    reducedMotion?.addEventListener('change', synchronize);
    synchronize();
    return () => {
      window.removeEventListener('resize', synchronize);
      narrow?.removeEventListener('change', synchronize);
      reducedMotion?.removeEventListener('change', synchronize);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      clearSource();
    };
  }, [sceneId, settings.dataSaver, settings.reducedMotion, settings.sceneVideoEnabled]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const fallbackCanvas = fallbackCanvasRef.current;
    const atmosphere = atmosphereRef.current;
    if (!canvas || !fallbackCanvas || !atmosphere) return;
    const sceneNumber = getSceneNumber(sceneId);
    const env = {
      devicePixelRatio: window.devicePixelRatio || 1,
      hardwareConcurrency: navigator.hardwareConcurrency || 2,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      webglAvailable: false,
    };
    let currentSettings = settingsRef.current;
    let profile = resolveGraphicsProfile(currentSettings, env);
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    let mediaReducedMotion = motionQuery?.matches ?? false;
    let staticMotion = currentSettings.reducedMotion || mediaReducedMotion;
    const contextOptions = { alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'default' as WebGLPowerPreference };
    let gl: GL | null = null;
    let version: 1 | 2 = 1;
    try {
      const webgl2 = canvas.getContext('webgl2', contextOptions) as WebGL2RenderingContext | null;
      if (webgl2) { gl = webgl2; version = 2; }
      else gl = canvas.getContext('webgl', contextOptions) as WebGLRenderingContext | null;
    } catch { gl = null; }
    const program = gl ? createProgram(gl, version) : null;
    const particleProgram = gl ? createParticleProgram(gl, version) : null;
    let glReady = Boolean(gl && program && particleProgram);
    // Auto quality must use the context that successfully compiled on this
    // canvas, not a separate capability probe or an optimistic assumption.
    env.webglAvailable = glReady;
    profile = resolveGraphicsProfile(currentSettings, env);
    // Canvas context types are mutually exclusive. Keep the 2D recovery path
    // on its own canvas so shader compilation or a later GPU reset can fall back.
    const ctx2d = fallbackCanvas.getContext('2d');
    let gpuLost = false;
    const constrainFallbackProfile = () => {
      if (glReady && !gpuLost) return;
      profile = { ...profile, maxRenderScale: Math.min(profile.maxRenderScale, 0.8), particleCount: Math.min(profile.particleCount, 24), fogStrength: Math.min(profile.fogStrength, 0.7) };
    };
    let live = true;
    let raf = 0;
    let lastPaint = -Infinity;
    let reportAt = performance.now();
    let reportFrames = 0;
    let measuredFps: number | null = null;
    let currentScale = Math.min(profile.maxRenderScale, currentSettings.renderScale / 100);
    constrainFallbackProfile();
    currentScale = Math.min(currentScale, profile.maxRenderScale);
    let effectiveRenderScale = currentScale;
    let lastAdaptAt = performance.now();
    let displaySamples: number[] = [];
    let lastCallbackAt = 0;
    let backend: SceneRenderStatus['backend'] = glReady ? version === 2 ? 'WebGL 2' : 'WebGL' : ctx2d ? 'Canvas 2D' : '静态回退';
    const setBackend = (next: SceneRenderStatus['backend']) => {
      backend = next;
      canvas.classList.toggle('is-active', next === 'WebGL 2' || next === 'WebGL');
      fallbackCanvas.classList.toggle('is-active', next === 'Canvas 2D');
      atmosphere.classList.toggle('is-static', next === '静态回退');
      postStatus(baseStatus());
    };
    const baseStatus = (): SceneRenderStatus => ({ backend, fps: measuredFps, renderScale: effectiveRenderScale, targetFps: profile.targetFps, sceneId });
    const shouldAnimate = () => !staticMotion && (profile.fogStrength > 0 || profile.particleCount > 0);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const pixelBudgets: Record<Exclude<GraphicsSettings['quality'], 'auto'>, number> = {
        cinematic: 4_194_304, extreme: 4_194_304, high: 3_145_728,
        balanced: 2_097_152, economy: 1_310_720, standard: 917_504,
      };
      const maxPixels = !glReady || gpuLost ? 1_048_576 : pixelBudgets[profile.quality];
      const size = getCanvasBufferSize(rect.width, rect.height, window.devicePixelRatio || 1, currentScale, maxPixels);
      const { width, height } = size;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const fallbackSize = ctx2d && (!glReady || gpuLost) ? size : { width: 1, height: 1 };
      if (fallbackCanvas.width !== fallbackSize.width || fallbackCanvas.height !== fallbackSize.height) {
        fallbackCanvas.width = fallbackSize.width; fallbackCanvas.height = fallbackSize.height;
      }
      effectiveRenderScale = Math.min(width / rect.width, height / rect.height) / Math.max(0.5, window.devicePixelRatio || 1);
      if (gl) gl.viewport(0, 0, width, height);
      postStatus(baseStatus());
    };

    let buffer: WebGLBuffer | null = null;
    let particleBuffer: WebGLBuffer | null = null;
    let positionLocation = -1;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    let particleAttributeLocation = -1;
    let particleUniforms: Record<string, WebGLUniformLocation | null> = {};
    const bindGL = (): boolean => {
      if (!gl || !program || !particleProgram) return false;
      buffer = gl.createBuffer();
      particleBuffer = gl.createBuffer();
      if (!buffer || !particleBuffer) {
        if (buffer) gl.deleteBuffer(buffer);
        if (particleBuffer) gl.deleteBuffer(particleBuffer);
        buffer = null; particleBuffer = null;
        return false;
      }
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      positionLocation = gl.getAttribLocation(program, 'aPosition');
      if (positionLocation < 0) return false;
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(['uTime', 'uScene', 'uFog', 'uDay'].map(name => [name, gl.getUniformLocation(program, name)]));
      if (Object.values(uniforms).some(location => location === null)) return false;
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, createParticleData(), gl.STATIC_DRAW);
      particleAttributeLocation = gl.getAttribLocation(particleProgram, 'aParticle');
      if (particleAttributeLocation < 0) return false;
      particleUniforms = Object.fromEntries(['uTime', 'uScene', 'uDay'].map(name => [name, gl.getUniformLocation(particleProgram, name)]));
      if (Object.values(particleUniforms).some(location => location === null) || gl.getError() !== gl.NO_ERROR) return false;
      return true;
    };
    let glInitialized = false;
    if (glReady) {
      try { glInitialized = bindGL(); } catch { glInitialized = false; }
    }
    if (glReady && !glInitialized) {
      if (gl && buffer) gl.deleteBuffer(buffer);
      if (gl && particleBuffer) gl.deleteBuffer(particleBuffer);
      buffer = null; particleBuffer = null;
      glReady = false;
      env.webglAvailable = false;
      profile = resolveGraphicsProfile(currentSettings, env);
      constrainFallbackProfile();
      currentScale = Math.min(profile.maxRenderScale, currentSettings.renderScale / 100);
    }
    backend = glReady ? version === 2 ? 'WebGL 2' : 'WebGL' : ctx2d ? 'Canvas 2D' : '静态回退';

    const draw2d = (time: number) => {
      if (!ctx2d) return;
      const width = canvas.width; const height = canvas.height;
      ctx2d.clearRect(0, 0, width, height);
      if (currentSettings.atmosphereEnabled) {
        const x = (Math.sin(time * 0.00008) + 1) * 0.5 * width;
        const mist = ctx2d.createRadialGradient(x, height * 0.72, 0, x, height * 0.72, width * 0.55);
        mist.addColorStop(0, theme === 'day' ? 'rgba(238,242,236,.075)' : 'rgba(174,196,211,.085)');
        mist.addColorStop(1, 'rgba(170,190,206,0)');
        ctx2d.fillStyle = mist; ctx2d.fillRect(0, 0, width, height);
      }
      if (profile.particleCount > 0) {
        const palette = sceneNumber === 3 ? '235,164,111' : theme === 'day' ? '248,244,229' : '202,218,226';
        for (let index = 0; index < Math.min(profile.particleCount, 96); index += 1) {
          const seed = index * 127.1 + 311.7;
          const x = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1 * width + Math.sin(time * 0.00035 + index) * width * 0.014;
          const y = (((Math.cos(seed * 1.31) * 24634.6345) % 1 + 1) % 1 * height + time * (0.004 + index % 5 * 0.0005)) % height;
          const radius = Math.max(0.8, width * (0.0006 + (index % 4) * 0.00024));
          ctx2d.beginPath(); ctx2d.fillStyle = `rgba(${palette},${0.12 + (index % 3) * 0.045})`; ctx2d.arc(x, y, radius, 0, Math.PI * 2); ctx2d.fill();
        }
      }
    };

    const draw = (time: number) => {
      if (gl && program && glReady && !gpuLost) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        // WebGL vertex attribute bindings belong to the context, not to a
        // program. The particle pass can reuse this attribute index, so
        // restore the fullscreen quad buffer before every background draw.
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1f(uniforms.uTime ?? null, time);
        gl.uniform1f(uniforms.uScene ?? null, sceneNumber);
        gl.uniform1f(uniforms.uFog ?? null, profile.fogStrength);
        gl.uniform1f(uniforms.uDay ?? null, theme === 'day' ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (particleProgram && particleBuffer && particleAttributeLocation >= 0 && profile.particleCount > 0) {
          gl.useProgram(particleProgram);
          gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
          gl.enableVertexAttribArray(particleAttributeLocation);
          gl.vertexAttribPointer(particleAttributeLocation, 4, gl.FLOAT, false, 0, 0);
          gl.uniform1f(particleUniforms.uTime ?? null, time);
          gl.uniform1f(particleUniforms.uScene ?? null, sceneNumber);
          gl.uniform1f(particleUniforms.uDay ?? null, theme === 'day' ? 1 : 0);
          gl.drawArrays(gl.POINTS, 0, profile.particleCount);
        }
      } else draw2d(time);
    };

    const render = (time: number) => {
      if (!live || document.hidden) return;
      if (lastCallbackAt > 0) {
        const delta = time - lastCallbackAt;
        if (delta > 1 && delta < 100) { displaySamples.push(delta); if (displaySamples.length > 60) displaySamples.shift(); }
      }
      lastCallbackAt = time;
      const interval = 1000 / profile.targetFps;
      if (time - lastPaint >= interval - 0.4) {
        draw(time);
        lastPaint = time;
        reportFrames += 1;
        if (time - reportAt >= 1000) {
          measuredFps = Math.round(reportFrames * 1000 / (time - reportAt));
          const rafAverage = displaySamples.length ? displaySamples.reduce((sum, sample) => sum + sample, 0) / displaySamples.length : 1000 / 60;
          const displayCeiling = Math.max(30, Math.min(240, 1000 / rafAverage));
          const effectiveTarget = Math.min(profile.targetFps, displayCeiling);
          if (currentSettings.dynamicResolution && !currentSettings.dataSaver && !staticMotion && time - lastAdaptAt > 2400) {
            const ratio = measuredFps / Math.max(1, effectiveTarget);
            if (ratio < 0.76 && currentScale > 0.55) { currentScale = Math.max(0.55, currentScale - 0.06); resize(); lastAdaptAt = time; }
            else if (ratio > 0.96 && currentScale < profile.maxRenderScale) { currentScale = Math.min(profile.maxRenderScale, currentScale + 0.025); resize(); lastAdaptAt = time; }
          }
          reportAt = time; reportFrames = 0; postStatus(baseStatus());
        }
      }
      if (shouldAnimate()) raf = requestAnimationFrame(render);
    };

    const onContextLost = (event: Event) => {
      event.preventDefault(); gpuLost = true; cancelAnimationFrame(raf);
      env.webglAvailable = false;
      profile = resolveGraphicsProfile(currentSettings, env);
      constrainFallbackProfile();
      currentScale = Math.min(currentScale, 0.8, profile.maxRenderScale);
      resize();
      setBackend(ctx2d ? 'Canvas 2D' : '静态回退');
      measuredFps = ctx2d ? measuredFps : 0;
      if (ctx2d) {
        draw(performance.now());
        measuredFps = shouldAnimate() ? measuredFps : 0;
        if (shouldAnimate() && !document.hidden) raf = requestAnimationFrame(render);
      }
    };
    const onVisibility = () => {
      if (document.hidden) { cancelAnimationFrame(raf); postStatus(baseStatus()); }
      else if (live && shouldAnimate()) { reportAt = performance.now(); reportFrames = 0; lastPaint = -Infinity; raf = requestAnimationFrame(render); }
    };
    const onMotionPreference = (event: MediaQueryListEvent) => {
      mediaReducedMotion = event.matches;
      staticMotion = currentSettings.reducedMotion || mediaReducedMotion;
      cancelAnimationFrame(raf);
      if (!shouldAnimate()) {
        draw(performance.now()); measuredFps = 0; postStatus(baseStatus());
      } else if (!document.hidden && live) {
        reportAt = performance.now(); reportFrames = 0; lastPaint = -Infinity; raf = requestAnimationFrame(render);
      }
    };
    const onSettingsChanged = (event: Event) => {
      const next = (event as CustomEvent<GraphicsSettings>).detail;
      if (!next || typeof next !== 'object') return;
      currentSettings = next;
      profile = resolveGraphicsProfile(next, env);
      constrainFallbackProfile();
      currentScale = Math.min(profile.maxRenderScale, next.renderScale / 100);
      staticMotion = next.reducedMotion || mediaReducedMotion;
      cancelAnimationFrame(raf);
      resize();
      lastPaint = -Infinity;
      if (!shouldAnimate()) {
        cancelAnimationFrame(raf); draw(performance.now()); measuredFps = 0; postStatus(baseStatus());
      } else if (!document.hidden && live) {
        reportAt = performance.now(); reportFrames = 0; raf = requestAnimationFrame(render);
      }
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    window.addEventListener('resize', resize);
    window.addEventListener('jx:graphics-settings-changed', onSettingsChanged);
    document.addEventListener('visibilitychange', onVisibility);
    motionQuery?.addEventListener('change', onMotionPreference);
    setBackend(backend);
    resize();
    draw(0);
    postStatus(baseStatus());
    if (shouldAnimate()) raf = requestAnimationFrame(render);
    else { measuredFps = 0; postStatus({ ...baseStatus(), fps: 0 }); }

    return () => {
      live = false; cancelAnimationFrame(raf); observer?.disconnect(); window.removeEventListener('resize', resize);
      window.removeEventListener('jx:graphics-settings-changed', onSettingsChanged);
      document.removeEventListener('visibilitychange', onVisibility); motionQuery?.removeEventListener('change', onMotionPreference);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (gl && buffer) gl.deleteBuffer(buffer);
      if (gl && particleBuffer) gl.deleteBuffer(particleBuffer);
      if (gl && program && !gpuLost) gl.deleteProgram(program);
      if (gl && particleProgram && !gpuLost) gl.deleteProgram(particleProgram);
    };
  }, [sceneId, theme]);

  return <div ref={atmosphereRef} className="scene-atmosphere" aria-hidden="true"><video ref={videoRef} className="scene-atmosphere-video" muted loop playsInline preload="none" /><canvas ref={canvasRef} className="scene-atmosphere-canvas scene-atmosphere-webgl" /><canvas ref={fallbackCanvasRef} className="scene-atmosphere-canvas scene-atmosphere-2d" /><div className="scene-atmosphere-still" /></div>;
}
