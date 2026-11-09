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
  const homeRecords = [];
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
    for (const theme of ['night', 'day']) for (const width of [320, 390, 720, 1366, 1440, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto(base, { waitUntil: 'networkidle' });
      const media = await context.newCDPSession(page);
      await media.send('Emulation.setEmulatedMedia', { features: [
        { name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-reduced-transparency', value: 'no-preference' },
      ] });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => {
        const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          header: box(document.querySelector('.landing-shell > header')),
          title: box(document.querySelector('.hero-mark')),
          entry: box(document.querySelector('.portal-enter')),
          tools: [...document.querySelectorAll('.header-tools button')].map(box),
          text: document.querySelector('.hero-mark').textContent,
        };
      });
      assert.ok(geometry.overflow <= 1, `no horizontal overflow: ${JSON.stringify({ width, geometry })}`);
      assert.equal(geometry.text, '九霄');
      assert.ok(geometry.title.y > geometry.header.bottom, 'floating toolbar must not obscure the brand title');
      assert.ok(geometry.entry.y > geometry.title.bottom && geometry.entry.bottom < (width < 800 ? 844 : 900), 'entry remains visible in the first viewport');
      for (const tool of geometry.tools) assert.ok(tool.width >= 44 && tool.height >= 44, 'toolbar tools retain touch targets');
      await page.screenshot({ path: join(output, `home-${theme}-${width}.png`) });
      homeRecords.push({ width, theme, geometry });
      await page.locator('.portal-enter').click();
      await page.waitForURL('**/lobby');
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const media = await context.newCDPSession(page);
    await media.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-reduced-motion', value: 'no-preference' },
      { name: 'prefers-reduced-transparency', value: 'no-preference' },
    ] });
    await page.goto(base, { waitUntil: 'networkidle' });
    const entry = page.locator('.portal-enter');
    const bounds = await entry.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.25);
    await page.waitForFunction(() => document.querySelector('.portal-enter').style.getPropertyValue('--jx-glass-pointer-x') !== '');
    const point = await entry.evaluate(element => element.style.getPropertyValue('--jx-glass-pointer-x'));
    assert.ok(parseFloat(point) < 35, 'local light coordinates follow the real pointer');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.portal-enter').style.getPropertyValue('--jx-glass-pointer-x') === '');
    await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height * 0.25);
    await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
    assert.equal(await entry.evaluate(element => element.style.getPropertyValue('--jx-glass-pointer-x')), '', 'reduced motion stops pointer light');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.querySelector('.jx-shell').dataset.jxDataSaver = 'true');
    assert.equal(await page.locator('.scene-mist').first().evaluate(element => getComputedStyle(element).animationName), 'none', 'data saver also stops the existing CSS scene motion');
    await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.75);
    await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
    assert.equal(await entry.evaluate(element => element.style.getPropertyValue('--jx-glass-pointer-x')), '', 'data saver stops pointer light');
    await page.evaluate(() => delete document.querySelector('.jx-shell').dataset.jxDataSaver);
    await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.75);
    await page.waitForFunction(() => document.querySelector('.portal-enter').style.getPropertyValue('--jx-glass-pointer-x') !== '');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await entry.evaluate(element => element.style.getPropertyValue('--jx-glass-pointer-x')), '', 'losing window focus clears light');
    await context.close();
    const faultContext = await browser.newContext();
    const faultPage = await faultContext.newPage();
    await faultPage.route('**/assets/GraphicsSettings-*.js', route => route.abort());
    await faultPage.goto(`${base}/settings/graphics`, { waitUntil: 'networkidle' });
    await faultPage.getByRole('heading', { name: '页面暂时无法打开' }).waitFor();
    assert.ok(await faultPage.locator('.jx-shell > header').isVisible(), 'a failed route module retains navigation');
    await faultPage.getByRole('button', { name: '返回山门', exact: true }).click();
    await faultPage.waitForURL('**/lobby');
    await faultContext.close();
    writeFileSync(join(output, 'audit.json'), JSON.stringify({ status: 'PASS', browser: browser.version(), records, homeRecords, pointerLight: 'motion/data-saver/window-focus guards passed', moduleFailure: 'header and return navigation preserved' }, null, 2));
    console.log(`Spatial UI: PASS ${records.length} world selection cases, ${homeRecords.length} homepage frames, pointer-light guards`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { server?.kill(); });
