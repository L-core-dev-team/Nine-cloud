import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';

export function verifyPagesPreview({ includeApprovedMedia = false } = {}) {
  const root = fileURLToPath(new URL('../../apps/web/dist/', import.meta.url));
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  if (!existsSync(join(root, 'index.html'))) throw new Error('Pages index.html missing');
  if (existsSync(join(root, '404.html'))) throw new Error('Top-level 404.html would disable Pages SPA fallback');
  const expected = new Set([
    'index.html',
    'fonts/ma-shan-zheng-brand.woff2',
    'fonts/OFL-MaShanZheng.txt',
  ]);
  const mediaDigests = new Map();
  if (includeApprovedMedia) {
    const publicRoot = resolve(repoRoot, 'apps/web/public');
    const manifest = JSON.parse(readFileSync(resolve(publicRoot, 'scenes/candidate/asset-manifest.json'), 'utf8'));
    const assets = [
      { path: '/scenes/gate-moonlight.webp', sha256: '7a1995a609ce04a8af2b32a1918b8e38ed3e880f08325ee55c375cf8e5b29dea' },
      { path: '/scenes/gate-moonlight-mobile.webp', sha256: 'fa4ab0e8e7080bd040a0b1b2dd6895b65e43e31770fd03e003b6dcb73989c740' },
      ...manifest.files,
    ];
    if (!Array.isArray(manifest.files) || assets.length !== 56) {
      throw new Error('Pages preview runtime media count mismatch');
    }
    for (const asset of assets) {
      if (typeof asset.path !== 'string' || !/^\/scenes\/[a-zA-Z0-9/._-]+$/.test(asset.path)
        || asset.path.includes('..') || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
        throw new Error('Invalid Pages preview runtime media entry');
      }
      const name = asset.path.slice(1);
      expected.add(name);
      mediaDigests.set(name, asset.sha256);
    }

    const imageAssets = assets.filter((asset) => asset.path.endsWith('.webp'));
    const fallbackManifest = JSON.parse(readFileSync(resolve(repoRoot, 'apps/web/pages-preview-media/fallback-manifest.json'), 'utf8'));
    if (fallbackManifest.recordType !== 'ios-jpeg-fallback-manifest'
      || !Array.isArray(fallbackManifest.files)
      || fallbackManifest.files.length !== imageAssets.length) {
      throw new Error('Pages preview iOS JPEG fallback count mismatch');
    }
    const approvedImagesByPath = new Map(imageAssets.map((asset) => [asset.path, asset]));
    const coveredWebpPaths = new Set();
    for (const fallback of fallbackManifest.files) {
      const approved = approvedImagesByPath.get(fallback.webpPath);
      if (!approved || approved.sha256 !== fallback.webpSha256
        || typeof fallback.jpegPath !== 'string'
        || !/^\/scenes\/[a-zA-Z0-9/._-]+\.jpg$/.test(fallback.jpegPath)
        || fallback.jpegPath.includes('..')
        || fallback.jpegPath !== fallback.webpPath.replace(/\.webp$/, '.jpg')
        || !/^[a-f0-9]{64}$/.test(fallback.jpegSha256)
        || coveredWebpPaths.has(fallback.webpPath)) {
        throw new Error('Pages preview iOS JPEG fallback entry is invalid');
      }
      const name = fallback.jpegPath.slice(1);
      expected.add(name);
      mediaDigests.set(name, fallback.jpegSha256);
      coveredWebpPaths.add(fallback.webpPath);
    }
    if (coveredWebpPaths.size !== imageAssets.length) {
      throw new Error('Pages preview iOS JPEG fallback coverage is incomplete');
    }
  }
  const found = new Set();
  const bundles = new Set();
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else {
        const name = relative(root, path).replaceAll('\\', '/');
        if (/^assets\/[^/]+\.(js|css)$/.test(name)) {
          bundles.add(name);
          continue;
        }
        if (!expected.has(name)) {
          throw new Error(`Unexpected Pages preview asset: ${name}`);
        }
        found.add(name);
      }
    }
  }
  inspect(root);
  for (const name of expected) {
    if (!found.has(name)) throw new Error(`Pages preview asset missing: ${name}`);
  }
  const jsBundles = [...bundles].filter((name) => name.endsWith('.js'));
  const cssBundles = [...bundles].filter((name) => name.endsWith('.css'));
  const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
  if (jsBundles.length < 1 || cssBundles.length !== 1
    || !jsBundles.some((name) => indexHtml.includes(name))
    || !cssBundles.some((name) => indexHtml.includes(name))) {
    throw new Error('Pages preview must contain JS and CSS entry bundles referenced by index.html');
  }
  for (const [name, expectedDigest] of mediaDigests) {
    const actualDigest = createHash('sha256').update(readFileSync(join(root, name))).digest('hex');
    if (actualDigest !== expectedDigest) throw new Error(`Pages preview media digest mismatch: ${name}`);
  }
  console.log(includeApprovedMedia
    ? `Pages preview output checked: SPA entry, frontend bundles, OFL font and ${mediaDigests.size} approved runtime media files/fallbacks.`
    : 'Pages preview output checked: SPA entry, frontend bundles and OFL font; runtime media excluded.');
}
