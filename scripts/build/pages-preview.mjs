import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPagesPreview } from '../audit/pages-preview-check.mjs';
import { resolvePagesPreviewAssets } from './pages-preview-assets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const includeApprovedMedia = process.argv.includes('--include-user-approved-media');
for (const name of ['@jiuxiao/contracts', '@jiuxiao/content', '@jiuxiao/domain', '@jiuxiao/web']) {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--filter', name, 'build'], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    env: {
      ...process.env,
      JIUXIAO_BUILD_TARGET: 'cloudflare-preview',
      VITE_IOS_JPEG_FALLBACK: name === '@jiuxiao/web' && includeApprovedMedia ? 'true' : 'false',
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const publicRoot = resolve(root, 'apps/web/public');
const outputRoot = resolve(root, 'apps/web/dist');
const manifestPath = resolve(publicRoot, 'scenes/candidate/asset-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const { staticAssets, runtimeAssets } = resolvePagesPreviewAssets(manifest.files);
for (const asset of staticAssets) {
  const source = resolve(publicRoot, `.${asset.path}`);
  const destination = resolve(outputRoot, `.${asset.path}`);
  const sourceRelative = relative(publicRoot, source);
  const outputRelative = relative(outputRoot, destination);
  if (isAbsolute(sourceRelative) || sourceRelative.startsWith('..')
    || isAbsolute(outputRelative) || outputRelative.startsWith('..')) {
    throw new Error('PUBLIC_DEMO_COMPLIANCE_ASSET_PATH_OUTSIDE_ROOT');
  }
  if (!existsSync(source)) throw new Error(`PUBLIC_DEMO_STATIC_ASSET_MISSING: ${asset.path}`);
  const actualDigest = createHash('sha256').update(readFileSync(source)).digest('hex');
  if (actualDigest !== asset.sha256) throw new Error(`PUBLIC_DEMO_STATIC_ASSET_DIGEST_MISMATCH: ${asset.path}`);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
console.log(`Included ${staticAssets.length} approved hash-verified static asset(s) in the public-demo package.`);

if (includeApprovedMedia) {
  const approvalPath = resolve(root, 'docs/audit/public-demo-media-approval.json');
  if (!existsSync(approvalPath)) throw new Error('PUBLIC_DEMO_MEDIA_APPROVAL_RECORD_MISSING');
  const approval = JSON.parse(readFileSync(approvalPath, 'utf8'));
  if (approval.recordType !== 'user-attested-public-demo-media-approval'
    || approval.attestedBy !== 'LYL'
    || approval.scope !== 'runtime-media-in-apps-web-public-scenes'
    || approval.reportedApprovers?.includes('LYL') !== true
    || approval.reportedApprovers?.includes('Bird') !== true
    || approval.directBirdSignature !== false) {
    throw new Error('PUBLIC_DEMO_MEDIA_APPROVAL_RECORD_INVALID');
  }

  if (runtimeAssets.length === 0) {
    throw new Error('PUBLIC_DEMO_RUNTIME_MEDIA_MANIFEST_UNEXPECTED');
  }
  const assets = runtimeAssets;

  for (const asset of assets) {
    if (typeof asset.path !== 'string' || !/^\/scenes\/[a-zA-Z0-9/._-]+$/.test(asset.path)
      || asset.path.includes('..') || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      throw new Error('PUBLIC_DEMO_RUNTIME_MEDIA_ENTRY_INVALID');
    }
    const source = resolve(publicRoot, `.${asset.path}`);
    const destination = resolve(outputRoot, `.${asset.path}`);
    const sourceRelative = relative(publicRoot, source);
    const outputRelative = relative(outputRoot, destination);
    if (isAbsolute(sourceRelative) || sourceRelative.startsWith('..')
      || isAbsolute(outputRelative) || outputRelative.startsWith('..')) {
      throw new Error('PUBLIC_DEMO_RUNTIME_MEDIA_PATH_OUTSIDE_ROOT');
    }
    if (!existsSync(source)) throw new Error(`PUBLIC_DEMO_RUNTIME_MEDIA_MISSING: ${asset.path}`);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }

  const approvedImages = assets.filter((asset) => asset.path.endsWith('.webp'));
  const fallbackManifestPath = resolve(root, 'apps/web/pages-preview-media/fallback-manifest.json');
  const fallbackSourceRoot = resolve(root, 'apps/web/pages-preview-media');
  const fallbackManifest = JSON.parse(readFileSync(fallbackManifestPath, 'utf8'));
  if (fallbackManifest.recordType !== 'ios-jpeg-fallback-manifest'
    || !Array.isArray(fallbackManifest.files)
    || fallbackManifest.files.length !== approvedImages.length) {
    throw new Error('PUBLIC_DEMO_IOS_FALLBACK_MANIFEST_UNEXPECTED');
  }

  const approvedByPath = new Map(approvedImages.map((asset) => [asset.path, asset]));
  const coveredWebpPaths = new Set();
  for (const fallback of fallbackManifest.files) {
    const approved = approvedByPath.get(fallback.webpPath);
    if (!approved || fallback.webpSha256 !== approved.sha256
      || typeof fallback.jpegPath !== 'string'
      || !/^\/scenes\/[a-zA-Z0-9/._-]+\.jpg$/.test(fallback.jpegPath)
      || fallback.jpegPath.includes('..')
      || fallback.jpegPath !== fallback.webpPath.replace(/\.webp$/, '.jpg')
      || !/^[a-f0-9]{64}$/.test(fallback.jpegSha256)
      || coveredWebpPaths.has(fallback.webpPath)) {
      throw new Error('PUBLIC_DEMO_IOS_FALLBACK_ENTRY_INVALID');
    }

    const source = resolve(fallbackSourceRoot, `.${fallback.jpegPath}`);
    const destination = resolve(outputRoot, `.${fallback.jpegPath}`);
    const sourceRelative = relative(fallbackSourceRoot, source);
    const outputRelative = relative(outputRoot, destination);
    if (isAbsolute(sourceRelative) || sourceRelative.startsWith('..')
      || isAbsolute(outputRelative) || outputRelative.startsWith('..')) {
      throw new Error('PUBLIC_DEMO_IOS_FALLBACK_PATH_OUTSIDE_ROOT');
    }
    if (!existsSync(source)) throw new Error(`PUBLIC_DEMO_IOS_FALLBACK_MISSING: ${fallback.jpegPath}`);
    const actualDigest = createHash('sha256').update(readFileSync(source)).digest('hex');
    if (actualDigest !== fallback.jpegSha256) {
      throw new Error(`PUBLIC_DEMO_IOS_FALLBACK_DIGEST_MISMATCH: ${fallback.jpegPath}`);
    }
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    coveredWebpPaths.add(fallback.webpPath);
  }
  if (coveredWebpPaths.size !== approvedImages.length) {
    throw new Error('PUBLIC_DEMO_IOS_FALLBACK_COVERAGE_INCOMPLETE');
  }
  console.log(`Included ${assets.length} approved runtime media files and ${coveredWebpPaths.size} iOS JPEG fallbacks in the public-demo package.`);
}

verifyPagesPreview({ includeApprovedMedia });
