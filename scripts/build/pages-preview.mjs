import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPagesPreview } from '../audit/pages-preview-check.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const includeApprovedMedia = process.argv.includes('--include-user-approved-media');
for (const name of ['@jiuxiao/contracts', '@jiuxiao/content', '@jiuxiao/domain', '@jiuxiao/web']) {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--filter', name, 'build'], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, JIUXIAO_BUILD_TARGET: 'cloudflare-preview' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

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

  const publicRoot = resolve(root, 'apps/web/public');
  const outputRoot = resolve(root, 'apps/web/dist');
  const manifestPath = resolve(publicRoot, 'scenes/candidate/asset-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.files) || manifest.files.length !== 54) {
    throw new Error('PUBLIC_DEMO_RUNTIME_MEDIA_MANIFEST_UNEXPECTED');
  }
  const assets = [
    { path: '/scenes/gate-moonlight.webp', sha256: '7a1995a609ce04a8af2b32a1918b8e38ed3e880f08325ee55c375cf8e5b29dea' },
    { path: '/scenes/gate-moonlight-mobile.webp', sha256: 'fa4ab0e8e7080bd040a0b1b2dd6895b65e43e31770fd03e003b6dcb73989c740' },
    ...manifest.files,
  ];

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
  console.log(`Included ${assets.length} explicitly approved runtime media files in the public-demo package.`);
}

verifyPagesPreview({ includeApprovedMedia });
