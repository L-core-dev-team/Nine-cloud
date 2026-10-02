import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireReleasedMedia } from '../../scripts/audit/media-release-check.mjs';

export default defineConfig({ plugins: [react(), { name: 'media-release-gate', apply: 'build', buildStart() {
  if (process.env.JIUXIAO_BUILD_TARGET === 'release') {
    const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
    requireReleasedMedia(JSON.parse(readFileSync(new URL('./public/scenes/candidate/asset-manifest.json', import.meta.url), 'utf8')), publicRoot);
  }
} }], server: { port: 5173, strictPort: true,
  proxy: { '/api': { target: process.env.JIUXIAO_API_TARGET || 'http://127.0.0.1:8787', changeOrigin: false } },
} });
