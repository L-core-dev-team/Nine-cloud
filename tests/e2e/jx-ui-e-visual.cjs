#!/usr/bin/env node
// JX-UI-E-01 visual matrix (docs/design/JX-UI-E-01/03-工程实施与验收.md §9.2).
// Production build, offline API (503), every page reachable without a backend,
// seven widths × two themes, plus reduced motion / reduced transparency / 200%
// text at 390 and 1440. Each capture asserts: no horizontal page overflow, the
// shell header is present, the page's primary control is inside the viewport,
// and no text container clips its content. Screenshots: test-results/jx-ui-e/.
const assert = require('node:assert/strict');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const dist = join(root, 'apps/web/dist');
const output = join(root, 'test-results/jx-ui-e');
const widths = [[360, 740], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const pages = [
  { key: 'home', path: '/', primary: '.portal-enter' },
  { key: 'lobby', path: '/lobby', primary: '.lobby-gate' },
  { key: 'world', path: '/world', primary: '.world-view-switch button' },
  { key: 'new', path: '/new', primary: 'main input' },
  { key: 'saves', path: '/saves', primary: 'main button' },
  { key: 'intro', path: '/intro', primary: 'main .primary' },
  { key: 'ai', path: '/settings/ai', primary: 'main button' },
  { key: 'graphics', path: '/settings/graphics', primary: 'main button' },
  { key: 'cloud', path: '/settings/cloud', primary: 'main button' },
  { key: 'cards', path: '/cards', primary: 'main button' },
];
let server;

async function startPreview() {
  assert.ok(existsSync(join(dist, 'index.html')), 'Run pnpm build before the JX-UI-E visual matrix');
  const port = await new Promise(resolvePort => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => { const selected = socket.address().port; socket.close(() => resolvePort(selected)); });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe' });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) return url; } catch {}
    await new Promise(wait => setTimeout(wait, 100));
  }
  throw new Error('Production preview did not start');
}

async function audit(page, target, label) {
  return page.evaluate(({ primary }) => {
    const doc = document.documentElement;
    const header = document.querySelector('.jx-shell > header');
    const control = [...document.querySelectorAll(primary)].find(element => element.getClientRects().length > 0);
    const rect = control?.getBoundingClientRect();
    const clipped = [...document.querySelectorAll('.jx-shell :is(p, h1, h2, h3, button, label, li, span)')].filter(element => {
      const style = getComputedStyle(element);
      if (!['hidden', 'clip'].includes(style.overflowY) || element.closest('[hidden], .jx-visually-hidden, .scene, svg, dialog:not([open])')) return false;
      return element.scrollHeight > element.clientHeight + 2 && element.clientHeight > 0 && element.textContent.trim().length > 0;
    }).map(element => `${element.tagName.toLowerCase()}.${element.className}`.slice(0, 80));
    return {
      overflow: doc.scrollWidth - doc.clientWidth,
      header: !!header && header.getBoundingClientRect().height > 0,
      primaryFound: !!control,
      primaryInViewport: !!rect && rect.width > 0 && rect.left >= -1 && rect.right <= innerWidth + 1,
      clipped: clipped.slice(0, 5),
      layer: document.querySelector('.jx-shell')?.dataset.jxLayer ?? null,
    };
  }, target).then(result => ({ label, ...result }));
}

(async () => {
  mkdirSync(output, { recursive: true });
  const base = await startPreview();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE } : {});
  const records = [];
  const variants = [{ name: 'default' }, { name: 'reduced-motion', widths: [390, 1440], reducedMotion: 'reduce' }, { name: 'reduced-transparency', widths: [390, 1440], transparency: 'reduce' }, { name: 'text-200', widths: [390, 1440], zoomText: true }];
  try {
    for (const variant of variants) {
      for (const [width, height] of widths) {
        if (variant.widths && !variant.widths.includes(width)) continue;
        for (const theme of variant.name === 'default' ? ['night', 'day'] : ['night']) {
          const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: variant.reducedMotion ?? 'no-preference' });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.addInitScript(themeName => { try { localStorage.setItem('jx10_appearance', themeName); } catch {} }, theme);
          await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline visual matrix"}' }));
          if (variant.transparency) {
            const media = await context.newCDPSession(page);
            await media.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
          }
          for (const target of pages) {
            await page.goto(base + target.path, { waitUntil: 'networkidle' });
            if (variant.zoomText) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(250);
            const label = `${variant.name}-${width}-${theme}-${target.key}`;
            const result = await audit(page, target, label);
            await page.screenshot({ path: join(output, `${label}.png`), fullPage: false, animations: 'disabled' });
            records.push({ ...result, errors: [...errors] });
            assert.ok(result.overflow <= 1, `${label}: page must not scroll horizontally (${result.overflow}px)`);
            assert.ok(result.header, `${label}: shell header must render`);
            assert.ok(result.primaryFound && result.primaryInViewport, `${label}: primary control must be present and horizontally inside the viewport`);
            if (!variant.zoomText) assert.deepEqual(result.clipped, [], `${label}: text containers must not clip their content`);
            assert.deepEqual(errors, [], `${label}: no browser errors`);
          }
          await context.close();
        }
      }
    }
    writeFileSync(join(output, 'visual-matrix.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), base: 'vite preview of apps/web/dist, API offline (503)', records }, null, 2)}\n`);
    console.log(`JX-UI-E visual matrix passed: ${records.length} captures (${pages.length} pages; widths ${widths.map(([w]) => w).join('/')}; night+day; reduced motion, reduced transparency and 200% text at 390/1440).`);
  } finally {
    await browser.close();
    server?.kill();
  }
})().catch(error => { console.error(error); server?.kill(); process.exitCode = 1; });
