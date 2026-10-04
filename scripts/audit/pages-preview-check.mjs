import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

export function verifyPagesPreview() {
  const root = fileURLToPath(new URL('../../apps/web/dist/', import.meta.url));
  if (!existsSync(join(root, 'index.html'))) throw new Error('Pages index.html missing');
  if (existsSync(join(root, '404.html'))) throw new Error('Top-level 404.html would disable Pages SPA fallback');
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else {
        const name = relative(root, path).replaceAll('\\', '/');
        if (!/^index\.html$|^assets\/[^/]+\.(js|css)$|^fonts\/(ma-shan-zheng-brand\.woff2|OFL-MaShanZheng\.txt)$/.test(name)) {
          throw new Error(`Unexpected Pages preview asset: ${name}`);
        }
      }
    }
  }
  inspect(root);
  console.log('Pages preview output checked: SPA entry, bundled frontend and OFL font only; candidate media excluded.');
}
