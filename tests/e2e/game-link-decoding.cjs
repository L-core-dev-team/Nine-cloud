// Route regression using synthetic saves and fully intercepted API traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const dist = path.resolve(process.env.UI_GAME_LINK_DIST || path.join(root, 'apps/web/dist'));
const output = path.resolve(process.env.UI_GAME_LINK_OUTPUT || path.join(root, 'test-results/game-link-decoding'));
const malformed = ['%E0%A4%A', '%', '%2', '%GG', '%C0%AF', '%ED%A0%80', '%FF'];
const legal = ['cloud-plain', '%E4%B9%9D%E9%9C%84', 'cloud%20space', 'cloud%2Fpart', 'cloud%252Fpart', 'cloud+plus', 'cloud%25percent'];
let server, browser;
const results = [], errors = [];
(async () => {
  assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'Build Web first');
  fs.mkdirSync(path.join(output, 'tmp'), { recursive: true });
  process.env.TEMP = path.join(output, 'tmp'); process.env.TMP = process.env.TEMP;
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    let file = path.resolve(dist, '.' + pathname);
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    response.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined), headless: true });
  for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const local = { schemaVersion: 1, saveId: 'link-local', name: '合成本地存档', createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z', revision: 0, canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture', character: { name: '合成人物' }, location: 'fixture', status: 'pending_rules', messages: [{ role: 'assistant', content: '本地原文保持。' }] };
    await context.addInitScript(save => {
      if (!localStorage.getItem('jiuxiao_1_local_saves')) localStorage.setItem('jiuxiao_1_local_saves', JSON.stringify([save]));
    }, local);
    const requests = [], blockedExternal = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { blockedExternal.push(request.url()); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      requests.push({ path: url.pathname, method: request.method() });
      let status = 200, body;
      if (request.method() !== 'GET') { status = 405; body = { code: 'UNEXPECTED_WRITE' }; }
      else if (url.pathname === '/api/auth/session') body = { account: { id: 'synthetic-owner', kind: 'guest' } };
      else if (url.pathname === '/api/games/not-found') { status = 404; body = { code: 'NOT_FOUND' }; }
      else if (url.pathname === '/api/games/unauthorized') { status = 401; body = { code: 'UNAUTHORIZED' }; }
      else if (url.pathname.endsWith('/action-suggestions')) body = { actions: [] };
      else if (url.pathname.startsWith('/api/games/')) body = { save: { schemaVersion: 1, saveId: decodeURIComponent(url.pathname.slice('/api/games/'.length)), canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture', revision: 7, state: { playerId: 'fixture', locationId: 'fixture', elapsedMinutes: 0, facts: { gameMinute: 0 } } } };
      else { status = 404; body = { code: 'NOT_FOUND' }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push({ width, message: error.message, url: page.url() }));
    const cases = [];
    for (const encoded of malformed) {
      const before = requests.length;
      await page.goto(origin + '/game/' + encoded);
      const alert = page.getByRole('alert');
      await alert.getByRole('heading', { name: '游戏链接无效' }).waitFor();
      assert.match(await alert.innerText(), /链接可能不完整或已损坏/);
      assert.equal(await page.getByTestId('p2-cloud-game').count(), 0);
      assert.equal(requests.slice(before).filter(r => r.path.startsWith('/api/games/')).length, 0, 'Invalid links must not mount CloudGame');
      const geometry = await alert.evaluate(element => {
        const r = element.getBoundingClientRect();
        return { width: document.documentElement.scrollWidth, left: r.left, right: r.right };
      });
      assert.ok(geometry.width <= width + 1 && geometry.left >= 0 && geometry.right <= width + 1, JSON.stringify(geometry));
      if (encoded === malformed[0]) {
        await page.screenshot({ path: path.join(output, 'invalid-' + width + '.png') });
        await page.reload(); await alert.waitFor();
      }
      await alert.getByRole('button', { name: '返回大厅', exact: true }).click();
      await page.waitForURL(origin + '/lobby');
      assert.ok((await page.locator('#root').innerText()).length > 0);
      assert.equal(await page.getByRole('alert').count(), 0);
      if (encoded === malformed[0]) {
        await page.screenshot({ path: path.join(output, 'lobby-' + width + '.png') });
        await page.goBack(); await alert.waitFor();
        await page.goForward(); await page.waitForURL(origin + '/lobby');
      }
      cases.push({ encoded, invalidPage: 'PASS', returnToLobby: 'PASS', geometry });
    }
    for (const encoded of legal) {
      const before = requests.length;
      await page.goto(origin + '/game/' + encoded);
      await page.getByTestId('p2-revision').filter({ hasText: '7' }).waitFor();
      const input = page.getByTestId('p2-action-input');
      await input.fill('仅输入，不提交');
      assert.equal(await input.inputValue(), '仅输入，不提交');
      assert.equal(await page.getByRole('alert').count(), 0);
      const apiPath = '/api/games/' + encodeURIComponent(decodeURIComponent(encoded));
      assert.ok(requests.slice(before).some(r => r.path === apiPath && r.method === 'GET'), apiPath);
      if (encoded === legal[0]) await page.screenshot({ path: path.join(output, 'cloud-' + width + '.png') });
      await page.getByRole('button', { name: '返回山门', exact: true }).click();
      await page.waitForURL(origin + '/lobby');
      cases.push({ encoded, decoded: decodeURIComponent(encoded), apiPath, cloudReadAndReturn: 'PASS' });
    }
    await page.goto(origin + '/game/not-found');
    await page.getByRole('heading', { name: '找不到这份存档', exact: true }).waitFor();
    await page.goto(origin + '/game/unauthorized');
    await page.getByTestId('p2-status').filter({ hasText: /需要.*游客或邮箱会话/ }).waitFor();
    await page.goto(origin + '/game/' + local.saveId);
    await page.locator('.story-message p').filter({ hasText: '本地原文保持。' }).waitFor();
    await page.locator('#player-intent').fill('本地未提交输入');
    assert.equal(await page.locator('#player-intent').inputValue(), '本地未提交输入');
    await page.screenshot({ path: path.join(output, 'local-' + width + '.png') });
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves'))), [local]);
    assert.equal(requests.filter(r => r.method !== 'GET').length, 0, 'Navigation and typing must not send any POST');
    assert.deepEqual(blockedExternal, [], 'No external service traffic expected');
    assert.deepEqual(errors, [], 'No unhandled render errors');
    results.push({ width, status: 'PASS', cases, reloadAndHistory: 'PASS', localSaveUnchanged: true, notFoundAndUnauthorized: 'PASS', requests, apiPosts: 0, liveApiRequests: 0 });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ status: 'PASS', scope: 'SYNTHETIC_BROWSER_ONLY', browser: browser.version(), dist, results, errors }, null, 2) + '\n');
  console.log('PASS: 360/390 malformed links, reload/history, lobby return, legal decoding, local/cloud saves, 404/401, zero POST.');
})().catch(error => {
  fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ status: 'FAIL', message: error.message, results, errors }, null, 2) + '\n');
  console.error(error); process.exitCode = 1;
}).finally(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
