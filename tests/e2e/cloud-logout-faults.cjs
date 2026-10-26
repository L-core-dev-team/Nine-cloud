// F01 only. All API responses are synthetic; no live authentication or model calls.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { join, resolve } = require('node:path');
const net = require('node:net');
const fs = require('node:fs');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../..');
let server, browser;
(async () => {
  const port = await new Promise(resolve => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => {
      const value = socket.address().port; socket.close(() => resolve(value));
    });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
  const results = [];
  const cases = [
    { name: 'cache success + logout success' },
    { name: 'cache failure + logout success', cacheFails: true },
    { name: 'cache failure + logout failure', cacheFails: true, logoutFails: true },
    { name: 'broadcast constructor failure', broadcast: 'constructor' },
    { name: 'broadcast send failure + cache failure', broadcast: 'send', cacheFails: true },
    { name: 'broadcast close failure', broadcast: 'close' },
    { name: 'broadcast unavailable', broadcast: 'unavailable' },
    { name: 'late old game response after logout', cacheFails: true, late: true },
  ];
  for (const test of cases) {
    const context = await browser.newContext();
    const errors = [], logoutRequests = [], actionPosts = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    let signedOut = false, releaseGame, gameHeld;
    const held = new Promise(resolve => { gameHeld = resolve; });
    const save = { schemaVersion: 1, saveId: 'logout-fixture', canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture', revision: 0, state: { playerId: 'fixture', locationId: 'fixture', elapsedMinutes: 0, facts: {} } };
    await context.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let body = {}, status = 200;
      if (path === '/api/auth/session') {
        if (signedOut) { status = 401; body = { code: 'UNAUTHENTICATED' }; }
        else body = { account: { id: 'owner-a', kind: 'email', email: 'fixture@example.invalid' } };
      } else if (path === '/api/auth/logout') {
        logoutRequests.push({ method: request.method(), owner: request.headers()['x-jiuxiao-account'] });
        status = test.logoutFails ? 503 : 200;
        signedOut = !test.logoutFails; body = test.logoutFails ? { code: 'AUTH_PROVIDER_UNAVAILABLE' } : { ok: true };
      } else if (path === '/api/auth/providers') body = { email: false, phone: false };
      else if (path === '/api/save-index' || path === '/api/save-trash') body = { saves: [], hasMore: false };
      else if (path === '/api/auth/phone/status') body = { phoneLinked: false };
      else if (path === '/api/account/capabilities') body = { available: false };
      else if (path.endsWith('/action-suggestions')) body = { actions: [] };
      else if (path === '/api/games/logout-fixture') {
        if (releaseGame) { gameHeld(); await releaseGame.promise; }
        body = { save };
      } else if (request.method() === 'POST' && path.endsWith('/turns')) {
        actionPosts.push(path); status = 503; body = { code: 'GAME_UNAVAILABLE' };
      } else { errors.push(`Unexpected mocked API: ${path}`); status = 503; body = { code: 'FIXTURE_UNEXPECTED_REQUEST' }; }
      try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
      catch (error) { if (!test.late) throw error; /* The invalidated request may already be aborted. */ }
    });
    const game = await context.newPage();
    await game.goto(`${base}/game/logout-fixture`);
    await game.getByTestId('p2-status').filter({ hasText: '存档已恢复' }).waitFor();
    const sentinels = await game.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('jiuxiao_cloud_game_ui_v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const endpoint = new URL('/api', location.href).href;
      const keys = [];
      await new Promise((resolve, reject) => {
        const tx = db.transaction('scopes', 'readwrite');
        for (const [apiBase, ownerId, saveId] of [[endpoint, 'owner-a', 'sentinel-a1'], [endpoint, 'owner-a', 'sentinel-a2'], [endpoint, 'owner-b', 'sentinel-b'], [endpoint + '-other', 'owner-a', 'sentinel-other-api']]) {
          const account = JSON.stringify([apiBase, ownerId]), key = JSON.stringify([apiBase, ownerId, saveId]);
          keys.push(key); tx.objectStore('scopes').put({ key, account, epoch: 0, version: 1, draft: key, draftVersion: 1, pending: null, history: [] });
        }
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      }); db.close(); return keys;
    });
    if (test.late) {
      let release; const promise = new Promise(resolve => { release = resolve; });
      releaseGame = { promise, release };
      await game.reload({ waitUntil: 'domcontentloaded' }); await held;
    }
    const settings = await context.newPage();
    await settings.goto(`${base}/settings/cloud`);
    const logout = settings.getByRole('button', { name: '退出', exact: true });
    await logout.waitFor(); await settings.waitForFunction(() => !document.querySelector('section.cloud-page')?.matches('[aria-busy="true"]'));
    await settings.evaluate(({ cacheFails, broadcast }) => {
      if (cacheFails) {
        const open = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function(name, ...args) { if (name === 'jiuxiao_cloud_game_ui_v1') throw new DOMException('F01 injected cache failure', 'InvalidStateError'); return open.call(this, name, ...args); };
      }
      if (broadcast === 'constructor') window.BroadcastChannel = class { constructor() { throw new Error('F01 injected constructor failure'); } };
      if (broadcast === 'send') BroadcastChannel.prototype.postMessage = () => { throw new Error('F01 injected send failure'); };
      if (broadcast === 'close') BroadcastChannel.prototype.close = () => { throw new Error('F01 injected close failure'); };
      if (broadcast === 'unavailable') window.BroadcastChannel = undefined;
    }, test);
    await logout.click();
    const notice = settings.locator('.cloud-page > [role="status"]');
    await notice.filter({ hasText: test.logoutFails ? '服务端注销未确认' : '服务端已确认退出' }).waitFor();
    const message = await notice.innerText();
    assert.deepEqual(logoutRequests, [{ method: 'POST', owner: 'owner-a' }], 'cache/broadcast failures never block Logout');
    assert.equal(await logout.count(), test.logoutFails ? 1 : 0);
    assert.equal(await settings.getByText('fixture@example.invalid', { exact: true }).count(), test.logoutFails ? 1 : 0);
    assert.equal(message.includes('可能仍有残留'), !!test.cacheFails);
    const notificationFailed = ['constructor', 'send', 'unavailable'].includes(test.broadcast);
    assert.equal(message.includes('通知未能发送'), notificationFailed);
    assert.equal(message.includes('缓存已清空'), false);
    assert.equal(message.includes('已安全退出'), false);
    if (!notificationFailed) {
      await game.getByTestId('p2-status').filter({ hasText: '账号已改变' }).waitFor();
      assert.equal(await game.locator('#player-intent').count(), 0);
    }
    if (test.late) {
      releaseGame.release();
      // Drain the delayed response before checking that the invalidated view stays empty.
      await game.waitForLoadState('networkidle');
      assert.equal(await game.locator('#player-intent').count(), 0);
      assert.match(await game.getByTestId('p2-status').innerText(), /账号已改变/);
    }
    const remaining = await game.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('jiuxiao_cloud_game_ui_v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const keys = await new Promise((resolve, reject) => { const r = db.transaction('scopes').objectStore('scopes').getAllKeys(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close(); return keys;
    });
    for (let i = 0; i < sentinels.length; i++) assert.equal(remaining.includes(sentinels[i]), i >= 2 || !!test.cacheFails, 'only matching owner + apiBase is cleared');
    assert.deepEqual(actionPosts, []); assert.deepEqual(errors, []);
    results.push({ name: test.name, status: 'PASS', logoutRequests, message, otherOwnerAndEndpointPreserved: true, gamePosts: actionPosts.length });
    await context.close();
  }
  const result = { status: 'PASS', mockedApi: true, liveApiRequests: 0, cases: results };
  if (process.env.UI_LOGOUT_OUTPUT) fs.writeFileSync(process.env.UI_LOGOUT_OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.kill(); });
