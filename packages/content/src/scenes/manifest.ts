/**
 * Fixed scene identities. Runtime code may select an id from this list, but
 * content or model output can never supply an asset URL.
 *
 * Only the mountain gate currently has reviewed image assets. Other scenes
 * deliberately use a procedural atmosphere until visual/audio assets pass
 * the two-author content review.
 */
export const SCENE_MANIFEST = [
  {
    id: 'mountain-gate',
    name: '山门',
    aliases: ['山门', '临江仙', '中州天枢域'],
    desktopPoster: '/scenes/gate-moonlight.webp',
    mobilePoster: '/scenes/gate-moonlight-mobile.webp',
    assetStatus: 'project-reviewed',
    atmosphere: 'mist-water',
  },
  {
    id: 'wilderness',
    name: '野外',
    aliases: ['野外', '荒野', '秘境', '山林'],
    desktopPoster: null,
    mobilePoster: null,
    assetStatus: 'procedural-placeholder',
    atmosphere: 'wind-pollen',
  },
  {
    id: 'sect-town',
    name: '宗门与城镇',
    aliases: ['宗门', '城镇', '坊市', '宗门城镇'],
    desktopPoster: null,
    mobilePoster: null,
    assetStatus: 'procedural-placeholder',
    atmosphere: 'lantern-mist',
  },
  {
    id: 'battle-anomaly',
    name: '战斗与异变',
    aliases: ['战斗', '异变', '战场'],
    desktopPoster: null,
    mobilePoster: null,
    assetStatus: 'procedural-placeholder',
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
