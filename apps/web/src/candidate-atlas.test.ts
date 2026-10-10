import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CANDIDATE_ILLUSTRATIONS } from './candidate-atlas.js';

type AssetManifest = {
  sourceAndLicense: string;
  authorApproval: string;
  files: Array<{ assetId?: string; collection?: string; topicTag?: string | null; canonId?: string; path: string; sha256: string; visualOnly?: boolean }>;
};

describe('candidate illustration atlas', () => {
  it('maps every supplied still image to a real, hashed local derivative without presenting it as Canon evidence', async () => {
    const manifestUrl = new URL('../public/scenes/candidate/asset-manifest.json', import.meta.url);
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8')) as AssetManifest;
    const illustrations = manifest.files.filter(file => file.visualOnly);
    const ids = new Set(CANDIDATE_ILLUSTRATIONS.map(item => item.id));
    const paths = new Set(illustrations.map(item => item.path));

    expect(manifest).toMatchObject({ sourceAndLicense: 'verified', authorApproval: 'approved', runtimeIntegrated: true });
    // 84 scene/atlas candidates + 4 site assets (2 gate-moonlight stills, favicon, compliance badge) registered in G-05 batches 1-3.
    expect(manifest.files).toHaveLength(88);
    expect(CANDIDATE_ILLUSTRATIONS).toHaveLength(74);
    expect(Object.fromEntries(['world', 'faction', 'system', 'brand', 'texture', 'artifact', 'character', 'atmosphere', 'battle'].map(collection => [
      collection, CANDIDATE_ILLUSTRATIONS.filter(item => item.collection === collection).length,
    ]))).toEqual({ world: 7, faction: 16, system: 14, brand: 4, texture: 3, artifact: 10, character: 10, atmosphere: 6, battle: 4 });
    expect(ids.size).toBe(CANDIDATE_ILLUSTRATIONS.length);
    expect(illustrations).toHaveLength(CANDIDATE_ILLUSTRATIONS.length);
    for (const illustration of CANDIDATE_ILLUSTRATIONS) {
      const record = illustrations.find(item => item.assetId === illustration.id);
      expect(record).toMatchObject({ collection: illustration.collection, topicTag: illustration.topicTag, path: illustration.src, visualOnly: true });
      expect(record).not.toHaveProperty('canonId');
      expect(record?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(paths.has(illustration.src)).toBe(true);
      const localPath = new URL(`../public${illustration.src}`, import.meta.url);
      const bytes = await readFile(localPath);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(record?.sha256);
    }
    for (const file of manifest.files.filter(entry => !entry.visualOnly)) {
      const bytes = await readFile(new URL(`../public${file.path}`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
  });
});
