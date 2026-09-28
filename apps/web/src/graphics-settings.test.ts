import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAPHICS_SETTINGS,
  GRAPHICS_STORAGE_KEY,
  getCanvasBufferSize,
  loadGraphicsSettings,
  resolveGraphicsProfile,
  saveGraphicsSettings,
} from './graphics-settings';

function storageWith(raw: string | null) {
  let current = raw;
  return {
    getItem: () => current,
    setItem: (_key: string, value: string) => { current = value; },
    value: () => current,
  };
}

describe('graphics preferences', () => {
  it('falls back safely for missing or malformed local settings', () => {
    expect(loadGraphicsSettings(storageWith(null))).toEqual(DEFAULT_GRAPHICS_SETTINGS);
    expect(loadGraphicsSettings(storageWith('{broken')).quality).toBe('auto');
  });

  it('bounds persisted values and rejects unknown quality and frame limits', () => {
    const source = storageWith(JSON.stringify({ quality: 'pretend-raytracing', targetFps: 241, renderScale: 999, ambienceVolume: -10, dataSaver: true }));
    const settings = loadGraphicsSettings(source);
    expect(settings.quality).toBe('auto');
    expect(settings.targetFps).toBe(60);
    expect(settings.renderScale).toBe(135);
    expect(settings.ambienceVolume).toBe(0);
    expect(settings.dataSaver).toBe(true);
  });

  it('persists only local rendering preferences', () => {
    const target = storageWith(null);
    saveGraphicsSettings({ ...DEFAULT_GRAPHICS_SETTINGS, quality: 'high' }, target);
    expect(target.value()).not.toBeNull();
    expect(JSON.parse(target.value() || '{}')).toMatchObject({ quality: 'high' });
    expect(target.value()).not.toContain('apiKey');
  });

  it('applies the selected local load limit and uses a bounded automatic profile', () => {
    const capable = { devicePixelRatio: 1.5, hardwareConcurrency: 16, deviceMemory: 16, webglAvailable: true };
    const extreme = resolveGraphicsProfile({ ...DEFAULT_GRAPHICS_SETTINGS, quality: 'extreme', targetFps: 120 }, capable);
    expect(extreme.quality).toBe('extreme');
    expect(extreme.targetFps).toBe(120);
    expect(extreme.particleCount).toBeGreaterThan(0);

    const economy = resolveGraphicsProfile({ ...DEFAULT_GRAPHICS_SETTINGS, quality: 'high', dataSaver: true }, capable);
    expect(economy.targetFps).toBe(30);
    expect(economy.particleCount).toBe(0);

    const fallback = resolveGraphicsProfile(DEFAULT_GRAPHICS_SETTINGS, { ...capable, webglAvailable: false, hardwareConcurrency: 2, deviceMemory: 2 });
    expect(fallback.quality).toBe('economy');
    expect(fallback.maxRenderScale).toBeLessThanOrEqual(0.82);

    const unknownMemory = resolveGraphicsProfile(DEFAULT_GRAPHICS_SETTINGS, { ...capable, deviceMemory: null });
    expect(unknownMemory.quality).toBe('balanced');
  });

  it('uses the declared preference key', () => {
    expect(GRAPHICS_STORAGE_KEY).toBe('jx10_graphics_v1');
  });

  it('bounds high-DPI canvas buffers by both side and total-pixel budgets', () => {
    const desktop = getCanvasBufferSize(3840, 2160, 2, 1.35, 8_294_400);
    expect(desktop.width).toBeLessThanOrEqual(4096);
    expect(desktop.height).toBeLessThanOrEqual(4096);
    expect(desktop.width * desktop.height).toBeLessThanOrEqual(8_294_400);

    const fallback = getCanvasBufferSize(390, 844, 3, 1.35, 1_572_864);
    expect(fallback.width * fallback.height).toBeLessThanOrEqual(1_572_864);
    expect(getCanvasBufferSize(0, 100, 1, 1, 1)).toEqual({ width: 1, height: 1 });
  });
});
