import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyPagesPreview } from '../audit/pages-preview-check.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
for (const name of ['@jiuxiao/contracts', '@jiuxiao/content', '@jiuxiao/web']) {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--filter', name, 'build'], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, JIUXIAO_BUILD_TARGET: 'cloudflare-preview' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
verifyPagesPreview();
