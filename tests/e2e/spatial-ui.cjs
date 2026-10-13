const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');

const root = resolve(__dirname, '../..');
const output = join(root, 'test-results/spatial-ui');
let server;

async function preview() {
  assert.ok(existsSync(join(root, 'apps/web/dist/index.html')), 'Build the current source before testing');
  const port = await new Promise(resolvePort => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const selected = probe.address().port;
      probe.close(() => resolvePort(selected));
    });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe' });
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(base)).ok) return base; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error('Spatial UI preview did not start');
}

async function selectedMaterial(button) {
  return button.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundImage, fill: style.backgroundColor, border: style.borderTopColor };
  });
}

(async () => {
  mkdirSync(output, { recursive: true });
  const base = await preview();
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const records = [];
  try {
    for (const theme of ['night', 'day']) for (const touch of [false, true]) {
      const context = await browser.newContext({ viewport: { width: touch ? 390 : 1366, height: 844 }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/world`, { waitUntil: 'networkidle' });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const text = page.locator('.world-view-switch button').nth(0);
      const atlas = page.locator('.world-view-switch button').nth(1);
      await page.locator('.worldbook-entry').first().waitFor();
      assert.equal(await text.getAttribute('aria-pressed'), 'true');
      assert.equal(await atlas.getAttribute('aria-pressed'), 'false');
      const active = await selectedMaterial(text);
      const inactive = await selectedMaterial(atlas);
      assert.notDeepEqual(active, inactive, 'selected view must have a distinct material');
      if (touch) await atlas.tap();
      else { await atlas.focus(); await page.keyboard.press('Enter'); }
      await page.locator('#world-atlas-panel').waitFor();
      assert.equal(await atlas.getAttribute('aria-pressed'), 'true');
      assert.equal(await text.getAttribute('aria-pressed'), 'false');
      assert.deepEqual(await selectedMaterial(atlas), active, 'selection material must follow the active button');
      assert.deepEqual(await selectedMaterial(text), inactive, 'old selection must clear');
      if (touch) await text.tap();
      else { await text.focus(); await page.keyboard.press('Space'); }
      await page.locator('#world-text-panel').waitFor();
      assert.equal(await text.getAttribute('aria-pressed'), 'true');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(output, `world-${theme}-${touch ? 'touch' : 'keyboard'}.png`) });
      records.push({ theme, touch, selectedMaterial: active, errors });
      await context.close();
    }
    writeFileSync(join(output, 'audit.json'), JSON.stringify({ status: 'PASS', browser: browser.version(), records }, null, 2));
    console.log(`Spatial UI: PASS ${records.length} world selection cases`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { server?.kill(); });
