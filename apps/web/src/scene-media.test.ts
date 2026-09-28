import { describe, expect, it } from 'vitest';
import { selectSceneVideo } from './scene-media.js';

const base = { enabled: true, dataSaver: false, reducedMotion: false, systemReducedMotion: false };

describe('selectSceneVideo', () => {
  it('uses only the video composed for the current aspect class', () => {
    expect(selectSceneVideo({ ...base, sceneId: 'mountain-gate', narrowViewport: false })).toMatchObject({
      src: '/scenes/candidate/mountain-gate.loop.mp4',
      poster: '/scenes/candidate/mountain-gate.desktop.webp',
    });
    expect(selectSceneVideo({ ...base, sceneId: 'wilderness', narrowViewport: true })).toMatchObject({
      src: '/scenes/candidate/wilderness.loop.mp4',
      poster: '/scenes/candidate/wilderness.mobile.webp',
    });
    expect(selectSceneVideo({ ...base, sceneId: 'sect-town', narrowViewport: false })).toBeNull();
    expect(selectSceneVideo({ ...base, sceneId: 'mountain-gate', narrowViewport: true })).toBeNull();
    expect(selectSceneVideo({ ...base, sceneId: 'wilderness', narrowViewport: false })).toBeNull();
  });

  it('never selects video when motion or data saving is disabled', () => {
    for (const override of [{ enabled: false }, { dataSaver: true }, { reducedMotion: true }, { systemReducedMotion: true }]) {
      expect(selectSceneVideo({ ...base, ...override, sceneId: 'mountain-gate', narrowViewport: false })).toBeNull();
    }
  });
});
