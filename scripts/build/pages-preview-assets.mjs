// Static app-shell assets stay separate from the public-demo runtime-media approval gate.
export const pagesPreviewStaticAssets = Object.freeze([
  Object.freeze({
    path: '/favicon.svg',
    sha256: '8b68e4d0c46ca5429e755acf1630c0875ae7b4f4f1dc666cfe10f3d50099ccc3',
  }),
  Object.freeze({
    path: '/compliance/beian-police.png',
    sha256: '8dfecad0dfcb3dc584f2c2447943eefb1fd65a058856eb0611e2c56ddc4c1fe1',
  }),
]);

const requiredScenePaths = Object.freeze([
  '/scenes/gate-moonlight.webp',
  '/scenes/gate-moonlight-mobile.webp',
]);

export function resolvePagesPreviewAssets(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('PAGES_PREVIEW_MEDIA_MANIFEST_UNEXPECTED');
  const byPath = new Map();
  for (const asset of files) {
    if (!asset || typeof asset.path !== 'string' || byPath.has(asset.path)) {
      throw new Error('PAGES_PREVIEW_MEDIA_MANIFEST_PATH_INVALID');
    }
    byPath.set(asset.path, asset);
  }

  for (const expected of pagesPreviewStaticAssets) {
    const asset = byPath.get(expected.path);
    if (!asset || asset.sha256 !== expected.sha256 || asset.licenseStatus !== 'approved') {
      throw new Error(`PAGES_PREVIEW_STATIC_ASSET_APPROVAL_MISMATCH: ${expected.path}`);
    }
    const approvers = new Set((asset.authorReceipts ?? [])
      .filter(receipt => receipt.assetSha256 === asset.sha256 && receipt.status === 'approved')
      .map(receipt => receipt.author));
    if (!approvers.has('LYL') || !approvers.has('Bird')) {
      throw new Error(`PAGES_PREVIEW_STATIC_ASSET_RECEIPTS_MISSING: ${expected.path}`);
    }
  }

  const staticPaths = new Set(pagesPreviewStaticAssets.map(asset => asset.path));
  const runtimeAssets = [];
  for (const asset of files) {
    if (staticPaths.has(asset.path)) continue;
    if (!/^\/scenes\/[a-zA-Z0-9/._-]+$/.test(asset.path) || asset.path.includes('..')
      || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      throw new Error(`PAGES_PREVIEW_MEDIA_MANIFEST_ENTRY_INVALID: ${asset.path}`);
    }
    runtimeAssets.push(asset);
  }

  const runtimeByPath = new Map(runtimeAssets.map(asset => [asset.path, asset]));
  for (const path of requiredScenePaths) {
    if (!runtimeByPath.has(path)) throw new Error(`PAGES_PREVIEW_REQUIRED_SCENE_ASSET_MISSING: ${path}`);
  }
  const requiredPaths = new Set(requiredScenePaths);
  const resolvedRuntimeAssets = [
    ...runtimeAssets.filter(asset => !requiredPaths.has(asset.path)),
    ...requiredScenePaths.map(path => runtimeByPath.get(path)),
  ];

  return { staticAssets: pagesPreviewStaticAssets, runtimeAssets: resolvedRuntimeAssets };
}
