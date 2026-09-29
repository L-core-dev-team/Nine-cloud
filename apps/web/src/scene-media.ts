import { SCENE_MANIFEST, type SceneId } from '@jiuxiao/content/scenes';

export type SceneVideoSelection = { src: string; poster: string };

/** Only static, app-owned files may be selected here. */
export function selectSceneVideo(input: {
  sceneId: SceneId;
  narrowViewport: boolean;
  enabled: boolean;
  dataSaver: boolean;
  reducedMotion: boolean;
  systemReducedMotion: boolean;
}): SceneVideoSelection | null {
  if (!input.enabled || input.dataSaver || input.reducedMotion || input.systemReducedMotion) return null;
  if ((input.sceneId === 'mountain-gate' && input.narrowViewport)
    || (input.sceneId === 'wilderness' && !input.narrowViewport)) return null;
  const scene = SCENE_MANIFEST.find(candidate => candidate.id === input.sceneId);
  if (!scene || !('video' in scene) || !scene.video) return null;
  const poster = input.narrowViewport ? scene.mobilePoster : scene.desktopPoster;
  return poster ? { src: scene.video, poster } : null;
}
