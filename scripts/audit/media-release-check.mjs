import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Fail closed: candidate review builds may contain previews, release builds may not. */
export function requireReleasedMedia(manifest, publicRoot) {
  if (manifest.sourceAndLicense !== 'verified' || manifest.authorApproval !== 'approved' || !Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('LICENSE_PENDING');
  const listed = new Set();
  for (const asset of manifest.files) {
    if (!asset || typeof asset.path !== 'string' || !/^\/scenes\/[a-zA-Z0-9/._-]+$/.test(asset.path) || asset.path.includes('..') || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('INVALID_MEDIA_MANIFEST');
    if (asset.licenseStatus !== 'approved' || typeof asset.licenseEvidenceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.licenseEvidenceSha256)) throw new Error('LICENSE_PENDING');
    const reviewers = new Set((asset.authorReceipts || []).filter(receipt => receipt.assetSha256 === asset.sha256 && receipt.status === 'approved').map(receipt => receipt.author));
    if (!reviewers.has('Bird') || !reviewers.has('LYL')) throw new Error('MEDIA_AUTHOR_APPROVAL_PENDING');
    const actual = createHash('sha256').update(readFileSync(resolve(publicRoot, asset.path.slice(1)))).digest('hex');
    if (actual !== asset.sha256) throw new Error('MEDIA_DIGEST_MISMATCH');
    if (listed.has(asset.path)) throw new Error('DUPLICATE_MEDIA_ASSET');
    listed.add(asset.path);
  }
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(resolve(directory, entry.name), path);
      else if (!entry.isFile()) throw new Error('INVALID_MEDIA_LINK');
      else if (/\.(webp|png|jpe?g|svg|mp4|webm|mp3|wav|ogg|m4a)$/i.test(entry.name) && !listed.has(path)) throw new Error('UNLISTED_MEDIA_ASSET');
    }
  };
  walk(resolve(publicRoot, 'scenes'), '/scenes');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const publicRoot = resolve(import.meta.dirname, '../../apps/web/public');
  requireReleasedMedia(JSON.parse(readFileSync(resolve(publicRoot, 'scenes/candidate/asset-manifest.json'), 'utf8')), publicRoot);
  console.log('Media release evidence structure and exact asset digests passed; human evidence remains the authors’ responsibility.');
}
