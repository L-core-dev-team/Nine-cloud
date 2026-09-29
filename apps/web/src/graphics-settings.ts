import type { SceneId } from '@jiuxiao/content/scenes';

export type GraphicsQuality = 'auto' | 'cinematic' | 'extreme' | 'high' | 'balanced' | 'economy' | 'standard';
export type TargetFrameRate = 30 | 60 | 90 | 120;

export type GraphicsSettings = {
  quality: GraphicsQuality;
  targetFps: TargetFrameRate;
  renderScale: number;
  dynamicResolution: boolean;
  reducedMotion: boolean;
  atmosphereEnabled: boolean;
  particlesEnabled: boolean;
  dataSaver: boolean;
  sceneVideoEnabled: boolean;
  ambienceVolume: number;
};

export type RendererEnvironment = {
  devicePixelRatio: number;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  webglAvailable: boolean;
};

export type GraphicsProfile = {
  quality: Exclude<GraphicsQuality, 'auto'>;
  targetFps: TargetFrameRate;
  maxRenderScale: number;
  particleCount: number;
  fogStrength: number;
};

export type CanvasBufferSize = { width: number; height: number };

export const GRAPHICS_STORAGE_KEY = 'jx10_graphics_v1';
export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  quality: 'auto',
  targetFps: 60,
  renderScale: 100,
  dynamicResolution: true,
  reducedMotion: false,
  atmosphereEnabled: true,
  particlesEnabled: true,
  dataSaver: false,
  sceneVideoEnabled: false,
  ambienceVolume: 32,
};

const QUALITY_LIMITS: Record<Exclude<GraphicsQuality, 'auto'>, { scale: number; particles: number; fog: number }> = {
  cinematic: { scale: 1.25, particles: 88, fog: 1 },
  extreme: { scale: 1.35, particles: 96, fog: 1 },
  high: { scale: 1.15, particles: 68, fog: 0.92 },
  balanced: { scale: 1, particles: 42, fog: 0.78 },
  economy: { scale: 0.82, particles: 20, fog: 0.55 },
  standard: { scale: 0.65, particles: 8, fog: 0.35 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isQuality(value: unknown): value is GraphicsQuality {
  return value === 'auto' || value === 'cinematic' || value === 'extreme' || value === 'high'
    || value === 'balanced' || value === 'economy' || value === 'standard';
}

function isTargetFps(value: unknown): value is TargetFrameRate {
  return value === 30 || value === 60 || value === 90 || value === 120;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numericClamp(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : fallback;
}

export function loadGraphicsSettings(storage?: Pick<Storage, 'getItem'>): GraphicsSettings {
  try {
    const raw = storage?.getItem(GRAPHICS_STORAGE_KEY) ?? (typeof localStorage === 'undefined' ? null : localStorage.getItem(GRAPHICS_STORAGE_KEY));
    if (!raw) return { ...DEFAULT_GRAPHICS_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_GRAPHICS_SETTINGS };
    return {
      quality: isQuality(parsed.quality) ? parsed.quality : DEFAULT_GRAPHICS_SETTINGS.quality,
      targetFps: isTargetFps(parsed.targetFps) ? parsed.targetFps : DEFAULT_GRAPHICS_SETTINGS.targetFps,
      renderScale: numericClamp(parsed.renderScale, DEFAULT_GRAPHICS_SETTINGS.renderScale, 50, 135),
      dynamicResolution: booleanOr(parsed.dynamicResolution, DEFAULT_GRAPHICS_SETTINGS.dynamicResolution),
      reducedMotion: booleanOr(parsed.reducedMotion, DEFAULT_GRAPHICS_SETTINGS.reducedMotion),
      atmosphereEnabled: booleanOr(parsed.atmosphereEnabled, DEFAULT_GRAPHICS_SETTINGS.atmosphereEnabled),
      particlesEnabled: booleanOr(parsed.particlesEnabled, DEFAULT_GRAPHICS_SETTINGS.particlesEnabled),
      dataSaver: booleanOr(parsed.dataSaver, DEFAULT_GRAPHICS_SETTINGS.dataSaver),
      sceneVideoEnabled: booleanOr(parsed.sceneVideoEnabled, DEFAULT_GRAPHICS_SETTINGS.sceneVideoEnabled),
      ambienceVolume: numericClamp(parsed.ambienceVolume, DEFAULT_GRAPHICS_SETTINGS.ambienceVolume, 0, 80),
    };
  } catch {
    return { ...DEFAULT_GRAPHICS_SETTINGS };
  }
}

export function saveGraphicsSettings(settings: GraphicsSettings, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    target?.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Rendering preferences are optional; callers keep the in-memory settings.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('jx:graphics-settings-changed', { detail: settings }));
}

export function detectRendererEnvironment(): RendererEnvironment {
  let webglAvailable = false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    webglAvailable = Boolean(gl);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* Headless or restricted browser: report the static fallback. */ }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    devicePixelRatio: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
    hardwareConcurrency: nav.hardwareConcurrency || 2,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    webglAvailable,
  };
}

export function resolveGraphicsProfile(settings: GraphicsSettings, environment: RendererEnvironment): GraphicsProfile {
  let quality = settings.quality;
  if (quality === 'auto') {
    quality = environment.webglAvailable && environment.hardwareConcurrency >= 8
      && environment.deviceMemory !== null && environment.deviceMemory >= 8
      ? 'high'
      : environment.webglAvailable && environment.hardwareConcurrency >= 4 ? 'balanced' : 'economy';
  }
  const limits = QUALITY_LIMITS[quality];
  const requestedFps = settings.dataSaver ? 30 : settings.targetFps;
  const targetFps: TargetFrameRate = requestedFps === 120 ? 120 : requestedFps === 90 ? 90 : requestedFps === 60 ? 60 : 30;
  const dprScaleLimit = environment.devicePixelRatio > 2.5 ? 1.1 : 1.35;
  return {
    quality,
    targetFps,
    maxRenderScale: Math.min(limits.scale, settings.renderScale / 100, dprScaleLimit),
    particleCount: settings.particlesEnabled && !settings.dataSaver ? limits.particles : 0,
    fogStrength: settings.atmosphereEnabled ? limits.fog : 0,
  };
}

export function getSceneNumber(sceneId: SceneId): number {
  switch (sceneId) {
    case 'mountain-gate': return 0;
    case 'wilderness': return 1;
    case 'sect-town': return 2;
    case 'battle-anomaly': return 3;
  }
}

/** Bound the backing store by both device-pixel scale and a total pixel budget. */
export function getCanvasBufferSize(
  logicalWidth: number,
  logicalHeight: number,
  devicePixelRatio: number,
  renderScale: number,
  maxPixels: number,
  maxSide = 4096,
): CanvasBufferSize {
  const width = Number.isFinite(logicalWidth) ? Math.max(0, logicalWidth) : 0;
  const height = Number.isFinite(logicalHeight) ? Math.max(0, logicalHeight) : 0;
  if (!width || !height) return { width: 1, height: 1 };
  const dpr = Number.isFinite(devicePixelRatio) ? Math.min(2.5, Math.max(0.5, devicePixelRatio)) : 1;
  const scale = Number.isFinite(renderScale) ? Math.min(1.35, Math.max(0.5, renderScale)) : 1;
  const pixelBudget = Number.isFinite(maxPixels) ? Math.max(1, maxPixels) : 1_572_864;
  const sideLimit = Number.isFinite(maxSide) ? Math.max(1, Math.floor(maxSide)) : 4096;
  const requestedScale = dpr * scale;
  const boundedScale = Math.min(
    requestedScale,
    sideLimit / width,
    sideLimit / height,
    Math.sqrt(pixelBudget / (width * height)),
  );
  return {
    width: Math.max(1, Math.min(sideLimit, Math.floor(width * boundedScale))),
    height: Math.max(1, Math.min(sideLimit, Math.floor(height * boundedScale))),
  };
}
