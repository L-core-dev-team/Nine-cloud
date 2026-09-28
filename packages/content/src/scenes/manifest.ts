/**
 * Fixed scene identities. Runtime code may select an id from this list, but
 * content or model output can never supply an asset URL.
 *
 * The supplied scene art is wired as an internal candidate preview. Its
 * source/license and two-author release approval are still pending.
 */
export const SCENE_MANIFEST = [
  {
    id: 'mountain-gate',
    name: '山门',
    aliases: ['山门', '临江仙', '中州天枢域'],
    desktopPoster: '/scenes/candidate/mountain-gate.desktop.webp',
    mobilePoster: '/scenes/candidate/mountain-gate.mobile.webp',
    video: '/scenes/candidate/mountain-gate.loop.mp4',
    assetStatus: 'candidate-internal',
    atmosphere: 'mist-water',
  },
  {
    id: 'wilderness',
    name: '野外',
    aliases: ['野外', '荒野', '秘境', '山林'],
    desktopPoster: '/scenes/candidate/wilderness.desktop.webp',
    mobilePoster: '/scenes/candidate/wilderness.mobile.webp',
    video: '/scenes/candidate/wilderness.loop.mp4',
    assetStatus: 'candidate-internal',
    atmosphere: 'wind-pollen',
  },
  {
    id: 'sect-town',
    name: '宗门与城镇',
    aliases: ['宗门', '城镇', '坊市', '宗门城镇'],
    desktopPoster: '/scenes/candidate/sect-town.desktop.webp',
    mobilePoster: '/scenes/candidate/sect-town.mobile.webp',
    assetStatus: 'candidate-internal',
    atmosphere: 'lantern-mist',
  },
  {
    id: 'battle-anomaly',
    name: '战斗与异变',
    aliases: ['战斗', '异变', '战场'],
    desktopPoster: '/scenes/candidate/battle-anomaly.desktop.webp',
    mobilePoster: '/scenes/candidate/battle-anomaly.mobile.webp',
    assetStatus: 'candidate-internal',
    atmosphere: 'embers',
  },
] as const;

export type SceneId = (typeof SCENE_MANIFEST)[number]['id'];
export type SceneManifestEntry = (typeof SCENE_MANIFEST)[number];

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && SCENE_MANIFEST.some(scene => scene.id === value);
}

/** Exact, bounded location mapping. Unknown legacy names stay at the gate. */
export function sceneForLocation(location: string): SceneId {
  const normalized = location.trim();
  const match = SCENE_MANIFEST.find(scene => scene.aliases.some(alias => alias === normalized));
  return match?.id ?? 'mountain-gate';
}
