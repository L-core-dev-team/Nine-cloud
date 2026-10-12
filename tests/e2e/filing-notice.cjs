#!/usr/bin/env node
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { join, resolve } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const filingRecords = [
  { label: '蜀ICP备2026059848号-1', href: 'https://beian.miit.gov.cn/' },
  { label: '川公网安备51012202002714号', href: 'https://beian.mps.gov.cn/#/query/webSearch?code=51012202002714' },
];

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolvePort(port));
    });
  });
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

(async () => {
  assert.ok(existsSync(join(webRoot, 'dist/index.html')), 'Build the web app before checking filing notices');
  const port = await availablePort();
  const server = spawn(process.execPath, [join(webRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: webRoot, stdio: 'pipe', windowsHide: true });
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  let browser;
  try {
    const origin = `http://127.0.0.1:${port}`;
    await waitFor(origin);
    const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const results = [];
    for (const width of [320, 390, 1366]) {
      const page = await browser.newPage({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
      await page.goto(origin);
      const filingNav = page.locator('footer .footer-filings');
      await filingNav.waitFor({ state: 'visible' });
      const rendered = await filingNav.evaluate(element => {
        const links = [...element.querySelectorAll('a')];
        const badge = element.querySelector('img');
        const box = element.getBoundingClientRect();
        const footer = element.closest('footer').getBoundingClientRect();
        return {
          links: links.map(link => ({ label: link.innerText.trim(), href: link.getAttribute('href'), target: link.target, rel: link.rel })),
          badge: { loaded: badge.complete && badge.naturalWidth > 0, naturalWidth: badge.naturalWidth, width: badge.getBoundingClientRect().width, height: badge.getBoundingClientRect().height, beforeLabel: badge.nextElementSibling?.textContent?.trim() },
          centerOffset: Math.abs(box.left + box.width / 2 - innerWidth / 2),
          footerBottomGap: footer.bottom - box.bottom,
          viewportWidth: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
        };
      });

      assert.deepEqual(rendered.links.map(({ label, href }) => ({ label, href })), filingRecords, `Both approved filing records render at ${width}px`);
      assert.ok(rendered.links.every(link => link.target === '_blank' && link.rel.split(/\s+/).includes('noreferrer')), 'Both official query links open safely in a new tab');
      assert.ok(rendered.badge.loaded && rendered.badge.naturalWidth > 0, 'The approved public-security badge loads');
      assert.equal(rendered.badge.beforeLabel, filingRecords[1].label, 'The public-security badge precedes its exact filing label');
      assert.equal(rendered.badge.width, 20);
      assert.equal(rendered.badge.height, 20);
      assert.ok(rendered.centerOffset <= 2, `Filing row is centered at ${width}px: ${rendered.centerOffset}px offset`);
      assert.ok(rendered.footerBottomGap >= 0 && rendered.footerBottomGap <= 24, `Filing row stays at the page footer at ${width}px`);
      assert.ok(rendered.documentWidth <= rendered.viewportWidth + 1, `No horizontal overflow at ${width}px`);
      results.push({ width, status: 'PASS', centerOffset: rendered.centerOffset, badgeLoaded: rendered.badge.loaded, documentWidth: rendered.documentWidth });
      await page.close();
    }
    console.log(`Filing notice browser check: ${JSON.stringify(results)}`);
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
