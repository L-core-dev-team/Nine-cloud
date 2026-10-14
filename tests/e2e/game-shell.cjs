#!/usr/bin/env node
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const root = resolve(__dirname, '../..');
const output = join(root, 'test-results/ui-final');
let server;

async function startPreview() {
  if (process.env.UI_BASE_URL) return process.env.UI_BASE_URL;
  assert.ok(existsSync(join(root, 'apps/web/dist/index.html')), 'Run pnpm build first');
  const port = await new Promise(resolve => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => {
      const port = socket.address().port; socket.close(() => resolve(port));
    });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe' });
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) return url; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('UI preview did not start');
}

async function checkFrame(page) {
  const geometry = await page.evaluate(() => {
    const reading = document.querySelector('.story-reading');
    const composer = document.querySelector('.intent-composer');
    const input = document.querySelector('#player-intent');
    const submit = composer.querySelector('button[type=submit]');
    const box = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
    return { viewport: innerHeight, document: document.documentElement.scrollHeight, horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth, outerScroll: scrollY, reading: box(reading), composer: box(composer), input: box(input), inputFontSize: parseFloat(getComputedStyle(input).fontSize), submit: box(submit), overflow: getComputedStyle(reading).overflowY };
  });
  assert.ok(geometry.document <= geometry.viewport + 1, JSON.stringify(geometry));
  assert.equal(geometry.horizontal, 0, 'game has no horizontal overflow');
  assert.equal(geometry.outerScroll, 0, 'only the story scrolls');
  assert.equal(geometry.overflow, 'auto');
  assert.ok(geometry.inputFontSize >= 16, `touch input stays at or above 16px to prevent mobile Safari auto-zoom: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.reading.height >= 24, `story remains readable: ${JSON.stringify(geometry)}`);
  for (const target of ['input', 'submit']) {
    assert.ok(geometry[target].top >= 0 && geometry[target].bottom <= geometry.viewport + 1, `${target} must stay in the viewport: ${JSON.stringify(geometry)}`);
    assert.ok(geometry[target].bottom <= geometry.composer.bottom + 1, `${target} must not be clipped by the composer`);
  }
  return geometry;
}

const mediaSessions = new WeakMap();
async function emulateVisualPreferences(page, { reducedMotion, reducedTransparency }) {
  let session = mediaSessions.get(page);
  if (!session) { session = await page.context().newCDPSession(page); mediaSessions.set(page, session); }
  await session.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: reducedMotion },
    { name: 'prefers-reduced-transparency', value: reducedTransparency },
  ] });
}

(async () => {
  mkdirSync(output, { recursive: true });
  const base = await startPreview();
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const results = [];
  const noBlurResults = [];
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
      for (const theme of ['night', 'day']) {
        const context = await browser.newContext({ viewport, acceptDownloads: true });
        const page = await context.newPage();
        await emulateVisualPreferences(page, { reducedMotion: 'no-preference', reducedTransparency: 'no-preference' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const prefix = `${viewport.width}-${theme}`;
        const shot = name => page.screenshot({ path: join(output, `${prefix}-${name}.png`), fullPage: false });
        try {
          await page.goto(base);
          await page.getByRole('button', { name: '进入世界', exact: true }).waitFor();
          if (theme === 'day') await page.getByRole('button', { name: '切换到晴昼配色' }).click();
          const headerGlassFilter = await page.locator('.jx-shell > header').evaluate(element => getComputedStyle(element).backdropFilter);
          const headerControlGlassFilter = await page.locator('.jx-shell > header .theme-toggle').evaluate(element => getComputedStyle(element).backdropFilter);
          assert.match(headerGlassFilter, /blur\(12px\)/, `The ${theme} global navigation keeps its glass material: ${headerGlassFilter}`);
          assert.equal(headerControlGlassFilter, 'none', `The ${theme} navigation labels do not stack a second glass surface: ${headerControlGlassFilter}`);
          const saveGlassFilter = await page.locator('.landing-read-save').evaluate(element => getComputedStyle(element).backdropFilter);
          assert.match(saveGlassFilter, /blur\(1px\).*saturate\(1\.18\)/, `The ${theme} landing keeps its clear, saturated glass save action: ${saveGlassFilter}`);
          const toolbarTop = (await page.locator('.jx-shell > header').boundingBox()).y;
          await page.evaluate(() => window.scrollTo(0, 360));
          await page.waitForTimeout(80);
          assert.ok(Math.abs((await page.locator('.jx-shell > header').boundingBox()).y - toolbarTop) < 2, 'primary navigation stays floating while the scene scrolls underneath');
          await page.evaluate(() => window.scrollTo(0, 0));
          await shot('home');
          await page.getByRole('button', { name: '菜单', exact: true }).click();
          const menuGlassFilter = await page.locator('.jx-shell > aside').evaluate(element => getComputedStyle(element).backdropFilter);
          assert.match(menuGlassFilter, /blur\(20px\)/, `The ${theme} navigation popover keeps a legible glass material: ${menuGlassFilter}`);
          const menuOverlayFilter = await page.locator('.menu-overlay').evaluate(element => getComputedStyle(element).backdropFilter);
          assert.equal(menuOverlayFilter, 'none', `The ${theme} menu uses a light dimmer without blurring the whole screen: ${menuOverlayFilter}`);
          await shot('menu');
          await page.getByRole('button', { name: '菜单', exact: true }).click();
          await page.getByRole('button', { name: '进入世界', exact: true }).click();
          await shot('lobby');
          await page.getByRole('button', { name: /^新开一局/ }).click();
          await page.locator('.form input').first().fill('UI 回归修士');
          await page.reload();
          assert.equal(await page.locator('.form input').first().inputValue(), 'UI 回归修士');
          await shot('character');
          await page.getByRole('button', { name: '下一步', exact: true }).click();
          await page.getByRole('textbox', { name: '修为', exact: true }).fill('炼气期');
          await page.getByRole('button', { name: '下一步', exact: true }).click();
          await page.getByRole('button', { name: /^保存角色并进入/ }).click();
          await page.locator('.game-topline h1').waitFor();
          await checkFrame(page);
          await page.evaluate(() => document.fonts.ready);
          const emptyGeometry = await page.locator('.story-reading').evaluate(element => ({
            chapterBottom: element.querySelector('.chapter-mark').getBoundingClientRect().bottom,
            emptyLabelTop: element.querySelector('.story-opening > span').getBoundingClientRect().top,
          }));
          assert.ok(emptyGeometry.emptyLabelTop >= emptyGeometry.chapterBottom, `Empty-state text must not overlap the chapter label: ${JSON.stringify(emptyGeometry)}`);

          const fixture = { name: '长局 UI 回归', saveId: `ui-long-${prefix}`, messages: Array.from({ length: 90 }, (_, index) => ({ role: 'assistant', content: `第${index}段：` + '月色落在山路上，行者沿溪谷前行。'.repeat(12) })), player: { name: '长局 UI 回归' }, world: { location: '山门' }, intel: { note: '旧版情报必须保留' }, stm: ['旧版短期记忆'], ltm: ['旧版长期记忆'] };
          const bytes = Buffer.from(JSON.stringify(fixture));
          await page.getByRole('button', { name: '菜单', exact: true }).click();
          assert.match(await page.locator('.jx-shell > aside').evaluate(element => getComputedStyle(element).backdropFilter), /blur\(20px\)/);
          const [backup] = await Promise.all([page.waitForEvent('download'), page.locator('aside input[type=file]').setInputFiles({ name: 'ui-long.json', mimeType: 'application/json', buffer: bytes })]);
          assert.deepEqual(readFileSync(await backup.path()), bytes, 'import makes an exact original backup');
          await page.getByRole('button', { name: '导入此档', exact: true }).click();
          await page.locator('.game-topline h1').filter({ hasText: '长局 UI 回归' }).waitFor();
          const geometry = await checkFrame(page);
          assert.equal(await page.locator('.story-message').count(), 80);
          await page.locator('#player-intent').fill('仍未提交的行旅草稿');
          const top = await page.locator('.story-reading').evaluate(element => { element.scrollTop = 600; return element.scrollTop; });
          assert.ok(top > 0);
          await shot('game');
          for (const label of ['角色状态', '综合情报', '星记忆']) {
            await page.getByRole('button', { name: label, exact: true }).click();
            const dialog = page.getByRole('dialog', { name: `${label}详情`, exact: true });
            await dialog.waitFor();
            await page.keyboard.press('Tab');
            assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, 'focus stays inside the modal');
            await page.keyboard.press('Escape');
            await dialog.waitFor({ state: 'detached' });
            assert.equal(await page.getByRole('button', { name: label, exact: true }).evaluate(element => element === document.activeElement), true, 'focus returns to the opening button');
            assert.equal(await page.locator('.story-reading').evaluate(element => element.scrollTop), top);
          }
          await page.getByRole('button', { name: '旧档资料与迁移核对', exact: true }).click();
          await page.getByRole('dialog').waitFor();
          assert.ok((await page.locator('.legacy-archive').innerText()).includes('旧档内容与迁移核对'));
          await page.keyboard.press('Escape');
          await page.locator('.game-tools').getByRole('button', { name: '世界设定', exact: true }).click();
          await page.locator('.worldbook-entry').first().waitFor();
          assert.equal(await page.locator('.worldbook-entry').count(), 34);
          assert.match(await page.locator('.worldbook-categories').evaluate(element => getComputedStyle(element).backdropFilter), /blur\(12px\)/, 'worldbook filters share one grouped glass surface');
          if (viewport.width <= 520) {
            assert.equal(await page.locator('.worldbook-categories').evaluate(element => getComputedStyle(element).marginInlineStart), '-4px', 'mobile category rail uses its intended optical bleed');
            assert.equal(await page.locator('.world-return-bar').evaluate(element => getComputedStyle(element).marginInlineStart), '-4px', 'mobile world return bar uses its intended optical bleed');
          }
          assert.equal(await page.locator('.worldbook-categories button').first().evaluate(element => getComputedStyle(element).backdropFilter), 'none', 'worldbook items do not stack glass over their group surface');
          const search = page.getByRole('searchbox', { name: '搜索已审核世界设定' });
          await search.fill('天工阁');
          await page.getByRole('heading', { name: '天工阁', exact: true }).waitFor();
          await shot('world');
          await page.getByRole('button', { name: '返回当前行旅', exact: true }).click();
          await page.waitForFunction(expected => Math.abs(document.querySelector('.story-reading')?.scrollTop - expected) <= 2, top);
          assert.equal(await page.locator('#player-intent').inputValue(), '仍未提交的行旅草稿');
          await page.reload();
          await page.locator('.game-topline h1').waitFor();
          assert.equal(await page.locator('#player-intent').inputValue(), '仍未提交的行旅草稿');
          await page.waitForFunction(expected => Math.abs(document.querySelector('.story-reading')?.scrollTop - expected) <= 2, top);
          const [exported] = await Promise.all([page.waitForEvent('download'), page.locator('.game-tools').getByRole('button', { name: '导出存档', exact: true }).click()]);
          const saved = JSON.parse(readFileSync(await exported.path(), 'utf8')).save;
          assert.equal(saved.messages.length, 90, 'presentation limit does not truncate the save');
          assert.deepEqual(saved.legacyArchive.payload.ltm, fixture.ltm);
          await page.getByRole('button', { name: '收入待处理', exact: true }).click();
          await page.getByText(/行动已加入本地待处理队列/).waitFor();
          assert.equal(await page.locator('#player-intent').inputValue(), '');
          assert.ok((await page.locator('.game-statusline').innerText()).includes('存档版本 0'), 'UI does not settle rules');
          await checkFrame(page);
          await page.setViewportSize({ width: 844, height: 390 });
          await checkFrame(page);
          await page.setViewportSize({ width: 390, height: 430 });
          await checkFrame(page);
          await page.setViewportSize(viewport);

          await page.goto(`${base}/settings/ai`);
          await page.getByRole('heading', { name: '选择设置方式', exact: true }).waitFor();
          await shot('ai');
          await page.goto(`${base}/settings/graphics`);
          await page.getByRole('heading', { name: '山河光景', exact: true }).waitFor();
          assert.equal(await page.locator('.scene-choice').first().evaluate(element => getComputedStyle(element).backdropFilter), 'none', 'scene options stay in the content layer until activated');
          await page.getByRole('checkbox', { name: /^减少动态效果/ }).check();
          await page.emulateMedia({ reducedMotion: 'reduce' });
          assert.equal(await page.getByRole('button', { name: '启用水声', exact: true }).isVisible(), true, 'audio stays opt-in');
          await shot('graphics');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
          await page.route('**/api/auth/**', route => {
            const path = new URL(route.request().url()).pathname;
            if (path.endsWith('/providers')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ email: false, phone: false }) });
            return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AUTH_PROVIDER_UNAVAILABLE' } }) });
          });
          await page.goto(`${base}/settings/cloud`);
          await page.getByText('手机号和邮箱登录当前均不可用；你可以继续使用本地存档。', { exact: true }).waitFor();
          assert.equal(await page.getByRole('button', { name: '登录', exact: true }).isDisabled(), true);
          assert.equal(await page.getByRole('button', { name: '发送验证码', exact: true }).isDisabled(), true);
          await shot('cloud-unavailable');
          await page.route('**/*.webp', route => route.abort());
          await page.goto(base);
          const enter = page.getByRole('button', { name: '进入世界', exact: true });
          await enter.waitFor();
          await page.getByText(/^已有 [1-9]\d* 份本地存档$/, { exact: true }).waitFor();
          assert.equal(await enter.evaluate(element => {
            const r = element.getBoundingClientRect();
            return element.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
          }), true, 'missing artwork never blocks the world entrance');
          assert.equal(await page.locator('.scene-cloud-drift-one').evaluate(element => getComputedStyle(element).animationName), 'none', 'reduced motion applies even when images fail');
          await enter.click();
          await page.getByRole('button', { name: /^继续游玩/ }).waitFor();
          assert.deepEqual(errors, []);
          results.push({ viewport, theme, status: 'PASS', geometry });
        } finally { await context.close(); }
      }
    }
    for (const { viewport, theme } of [
      { viewport: { width: 390, height: 844 }, theme: 'night' },
      { viewport: { width: 1440, height: 900 }, theme: 'day' },
    ]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce', hasTouch: viewport.width < 500 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(themeName => {
        localStorage.setItem('jx10_appearance', themeName);
        if (themeName === 'day') document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.dataset.testNoBackdrop = 'true';
          style.textContent = '*, *::before, *::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }';
          document.head.append(style);
        }, { once: true });
      }, theme);
      await emulateVisualPreferences(page, { reducedMotion: 'reduce', reducedTransparency: theme === 'night' ? 'reduce' : 'no-preference' });
      try {
        await page.goto(base);
        await page.locator('.landing-read-save').waitFor({ state: 'visible' });
        assert.equal(await page.locator('header').evaluate(element => getComputedStyle(element).backdropFilter), 'none');
        if (theme === 'night') {
          assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), true);
          assert.equal(await page.locator('.landing-read-save').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(11, 27, 41)', 'reduced transparency uses the night opaque surface');
        }
        if (viewport.width < 500) {
          const mobileHeroMinHeight = await page.locator('.hero').evaluate(element => parseFloat(getComputedStyle(element).minHeight));
          assert.ok(Math.abs(mobileHeroMinHeight - Math.max(620, viewport.height - 96)) <= 1, `The floating-toolbar homepage reserves its first-viewport content area in the no-blur path: ${mobileHeroMinHeight}px`);
        }
        await page.screenshot({ path: join(output, `no-blur-${theme}-${viewport.width}.png`), fullPage: false });
        await page.getByRole('button', { name: '读取存档', exact: true }).click();
        await page.getByRole('heading', { name: '存档管理', exact: true }).waitFor();
        await page.goto(`${base}/settings/ai`);
        await page.getByRole('heading', { name: '选择设置方式', exact: true }).waitFor();
        await page.goto(`${base}/world`);
        await page.getByRole('searchbox', { name: '搜索已审核世界设定' }).waitFor();
        await page.goto(`${base}/settings/graphics`);
        await page.getByRole('heading', { name: '山河光景', exact: true }).waitFor();
        assert.deepEqual(errors, []);
        noBlurResults.push({ viewport, theme, status: 'PASS', backdropFilter: 'none', reducedMotion: true, reducedTransparency: theme === 'night' ? 'reduce' : 'no-preference' });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); if (server) server.kill(); }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceStatus: execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' }).trim(), results, noBlurResults, realDevices: 'NOT RUN', realKeyboard: 'NOT RUN', backend: 'NOT RUN' }, null, 2));
  console.log(`PASS: ${results.length} viewport/theme journeys and ${noBlurResults.length} no-blur fallback journeys; long story, visible input/submit, import/export, modal focus, world return, refresh, landscape, reduced height and fallback routes. Screenshots: ${output}`);
})().catch(error => { if (server) server.kill(); console.error(error); process.exitCode = 1; });
