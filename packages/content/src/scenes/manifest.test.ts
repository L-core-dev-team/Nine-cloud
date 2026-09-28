import { describe, expect, it } from 'vitest';
import { isSceneId, SCENE_MANIFEST, sceneForLocation } from './manifest.js';

describe('scene manifest', () => {
  it('has four bounded scene ids and no arbitrary remote assets', () => {
    expect(SCENE_MANIFEST.map(scene => scene.id)).toEqual([
      'mountain-gate', 'wilderness', 'sect-town', 'battle-anomaly',
    ]);
    expect(SCENE_MANIFEST.every(scene =>
      [scene.desktopPoster, scene.mobilePoster].every(asset => asset === null || asset.startsWith('/scenes/')),
    )).toBe(true);
  });

  it('maps only known location aliases and falls back to the gate', () => {
    expect(sceneForLocation('坊市')).toBe('sect-town');
    expect(sceneForLocation('异变')).toBe('battle-anomaly');
    expect(sceneForLocation('untrusted://somewhere')).toBe('mountain-gate');
    expect(isSceneId('wilderness')).toBe(true);
    expect(isSceneId('https://example.invalid/image.webp')).toBe(false);
  });
});
