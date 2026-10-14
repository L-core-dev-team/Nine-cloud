import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireReleasedMedia } from '../../scripts/audit/media-release-check.mjs';
import { resolveWebBuildTarget } from '../../scripts/build/build-target.mjs';

const webRoot = fileURLToPath(new URL('./', import.meta.url));
const pagesApprovedFont: Plugin = { name: 'pages-approved-font', apply: 'build', generateBundle() {
  for (const name of ['ma-shan-zheng-brand.woff2', 'OFL-MaShanZheng.txt']) {
    this.emitFile({ type: 'asset', fileName: `fonts/${name}`, source: readFileSync(new URL(`./public/fonts/${name}`, import.meta.url)) });
  }
} };

// Vite runs in production mode for `pnpm build`, but the workspace build needs a
// testable bundle that still contains the candidate scene media (the foundation
// e2e asserts those posters are served) even though their licences are pending.
// The release licence gate therefore stays opt-in through an explicit target, and
// CI proves it fails closed in a dedicated `JIUXIAO_BUILD_TARGET=release` step.
//
// The risk that gate must not carry is a silent typo: `relese` or `staging` used
// to behave exactly like `test`, skipping the audit with no signal. Recognise the
// intended targets explicitly and reject anything else, so a misspelling is a
// build error rather than an unlicensed bundle.
const BUILD_TARGET = resolveWebBuildTarget();
const preview1 = process.env.JIUXIAO_RELEASE_CHANNEL === 'preview-1';
if (preview1 && BUILD_TARGET !== 'release') throw new Error('PREVIEW_1_REQUIRES_RELEASE_MEDIA_GATE');
// `release` audits the media receipts; `cloudflare-preview` packages via its own
// approval-gated copier; `test` is the workspace/e2e bundle. Anything else — a
// typo, an unknown CI variable — must fail rather than silently skip the gate.
// Unknown targets and Pages test builds are rejected by the shared resolver.

function requirePublicPreviewApi(raw: string | undefined) {
  // A frontend-only preview is allowed without a backend. The transport rejects
  // API requests in that case, rather than calling a localhost or SPA endpoint.
  if (!raw?.trim()) return;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('VITE_API_BASE_URL must be an absolute HTTPS staging API URL.'); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.pathname.replace(/\/+$/, '') !== '/api'
    || hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '[::1]' || hostname.startsWith('127.')) {
    throw new Error('Pages preview VITE_API_BASE_URL must be a public HTTPS URL ending in /api; localhost is not usable.');
  }
}

export default defineConfig(({ mode }) => {
  const pagesPreview = BUILD_TARGET === 'cloudflare-preview';
  const releaseBuild = BUILD_TARGET === 'release';
  if (pagesPreview) requirePublicPreviewApi(loadEnv(mode, webRoot, 'VITE_').VITE_API_BASE_URL);
  return {
    define: { 'import.meta.env.JIUXIAO_PAGES_PREVIEW': JSON.stringify(pagesPreview), 'import.meta.env.JIUXIAO_PREVIEW_1': JSON.stringify(preview1) },
    // Do not copy public/ wholesale into a Pages preview. The preview packager copies
    // only runtime scene media after an explicit public-demo approval flag; release
    // builds continue to use the stricter media receipt gate below.
    publicDir: pagesPreview ? false : 'public',
    plugins: [react(), { name: 'media-release-gate', apply: 'build', buildStart() {
      if (releaseBuild) {
        const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
        requireReleasedMedia(JSON.parse(readFileSync(new URL('./public/scenes/candidate/asset-manifest.json', import.meta.url), 'utf8')), publicRoot);
      }
    } }, ...(pagesPreview ? [pagesApprovedFont] : [])],
    server: { port: 5173, strictPort: true,
      proxy: { '/api': { target: process.env.JIUXIAO_API_TARGET || 'http://127.0.0.1:8787', changeOrigin: false } },
    },
  };
});
