// Browser/IndexedDB recovery contract. API responses are synthetic, not rule acceptance evidence.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../..');
let server, browser;
(async () => {
  const port = await new Promise(resolve => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => { const p = socket.address().port; socket.close(() => resolve(p)); });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let owner = 'owner-a', mode = 'lost', posts = [], confirmed = null;
  const save = { schemaVersion: 1, saveId: 'recovery-fixture', canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture', revision: 0, state: { playerId: 'fixture', locationId: 'fixture', elapsedMinutes: 0, facts: {} } };
  const receipt = request => ({ idempotencyKey: request.idempotencyKey, saveId: save.saveId, requestFingerprint: require('./game-receipt-fixture.cjs')(save, request), resultingRevision: 0, decision: { status: 'rejected', revision: 0, code: 'FIXTURE', message: '未推进世界。'.repeat(500) } });
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path === '/api/auth/session') body = { account: { id: owner, kind: 'guest' } };
    else if (path === '/api/auth/providers') body = { email: true, phone: false };
    else if (path === '/api/auth/logout') body = { ok: true };
    else if (path === '/api/saves') body = { saves: [] };
    else if (path.includes('/trash')) body = { archives: [] };
    else if (path.endsWith('/action-suggestions')) body = { actions: [] };
    else if (path.includes('/receipts/')) body = { status: confirmed ? 'confirmed' : 'unknown', receipt: confirmed, revision: 0 };
    else if (path.endsWith('/turns')) {
      const request = route.request().postDataJSON(); posts.push(request);
      if (mode === 'lost') return route.abort('failed');
      body = { receipt: receipt(request) };
    } else body = { save: { ...save, saveId: path.split('/').at(-1) } };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await context.newPage(); const input = page.getByTestId('p2-action-input');
  const open = async (tab, id = save.saveId) => { await tab.goto(`${base}/game/${id}`); await tab.waitForFunction(() => { const t = document.querySelector('[data-testid="p2-action-input"]'); return t && !t.disabled; }); };
  const draftSaved = async (tab, text) => {
    await tab.waitForFunction(async text => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('jiuxiao_cloud_game_ui_v1'); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
      try { const rows = await new Promise(resolve => { const r = db.transaction('scopes').objectStore('scopes').getAll(); r.onsuccess = () => resolve(r.result); }); return rows.some(r => r.draft === text); } finally { db.close(); }
    }, text);
  };
  await open(page);
  const long = '甲'.repeat(8000); await input.fill(long); await draftSaved(page, long);
  await open(page); assert.equal(await input.inputValue(), long);
  const tab = await context.newPage(); await open(tab);
  await input.fill('最新输入'); await draftSaved(page, '最新输入');
  await tab.getByTestId('p2-action-input').fill('旧标签输入');
  await tab.getByTestId('p2-status').filter({ hasText: '草稿未保存' }).waitFor();
  await open(page); assert.equal(await input.inputValue(), '最新输入'); await tab.close();
  await input.fill('断网行动'); await draftSaved(page, '断网行动');
  await page.getByTestId('p2-submit-action').click();
  await page.getByTestId('p2-status').filter({ hasText: '请求未确认' }).waitFor();
  assert.equal(posts.length, 1);
  await open(page); await page.getByTestId('p2-status').filter({ hasText: '结果仍待核实' }).waitFor();
  assert.equal(posts.length, 1, 'refresh must query only');
  assert.equal(await input.inputValue(), '断网行动');
  mode = 'reply'; page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '使用原请求重试', exact: true }).click();
  await page.getByTestId('p2-status').filter({ hasText: '服务端明确拒绝' }).waitFor();
  assert.deepEqual(posts[1], posts[0], 'retry retains the original body and idempotency key');
  assert.equal(await input.inputValue(), '断网行动');
  // Semantic anchor restored across reload, not a document-wide pixel offset.
  await page.locator('.story-reading').hover(); await page.mouse.wheel(0, 350);
  await page.waitForTimeout(250);
  const before = await page.locator('.story-reading').evaluate(e => e.scrollTop);
  assert.ok(before > 0);
  await open(page); await page.waitForTimeout(250);
  const after = await page.locator('.story-reading').evaluate(e => e.scrollTop);
  assert.ok(Math.abs(before - after) < 5, `anchor restore ${before} -> ${after}`);
  mode = 'lost'; await input.fill('已结算但丢失响应'); await draftSaved(page, '已结算但丢失响应');
  await page.getByTestId('p2-submit-action').click(); await page.getByTestId('p2-status').filter({ hasText: '请求未确认' }).waitFor();
  const count = posts.length;
  confirmed = receipt({ ...posts.at(-1), text: '不同的行动' });
  await open(page); await page.getByTestId('p2-status').filter({ hasText: '读取失败' }).waitFor();
  assert.equal(posts.length, count, 'mismatched fingerprint must not trigger POST');
  assert.equal(await input.inputValue(), '已结算但丢失响应');
  confirmed = receipt(posts.at(-1));
  await open(page); await page.getByTestId('p2-status').filter({ hasText: '已从服务端恢复回执' }).waitFor();
  assert.equal(posts.length, count, 'confirmed recovery never POSTs');
  await open(page, 'different-save'); assert.equal(await input.inputValue(), '');
  owner = 'owner-b'; await open(page); assert.equal(await input.inputValue(), '');
  await input.fill('另一账号的草稿'); await draftSaved(page, '另一账号的草稿');
  owner = 'owner-a'; await open(page); assert.equal(await input.inputValue(), '已结算但丢失响应');
  // Use the actual account page logout handler, not a synthetic notification.
  const accountPage = await context.newPage(); await accountPage.goto(`${base}/settings/cloud`);
  accountPage.once('dialog', d => d.accept());
  await accountPage.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByTestId('p2-status').filter({ hasText: '账号已改变' }).waitFor();
  assert.equal(await input.count(), 0);
  await open(page); assert.equal(await input.inputValue(), '');
  owner = 'owner-b'; await open(page); assert.equal(await input.inputValue(), '另一账号的草稿');
  // Corruption fails closed without losing the authoritative save or sending an action.
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('jiuxiao_cloud_game_ui_v1'); r.onsuccess = () => resolve(r.result); });
    await new Promise(resolve => { const tx = db.transaction('scopes', 'readwrite'); const r = tx.objectStore('scopes').openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return; if (c.value.account.includes('owner-b')) c.update({ ...c.value, pending: { idempotencyKey: '../invalid' } }); c.continue(); }; tx.oncomplete = resolve; }); db.close();
  });
  await page.reload(); await page.getByTestId('p2-status').filter({ hasText: '读取失败' }).waitFor();
  assert.equal(posts.length, count); assert.equal(await input.count(), 0);
  const unavailable = await context.newPage();
  await unavailable.addInitScript(() => { IDBFactory.prototype.open = () => { throw new DOMException('fixture quota failure', 'QuotaExceededError'); }; });
  await unavailable.goto(`${base}/game/${save.saveId}`);
  await unavailable.getByTestId('p2-status').filter({ hasText: '读取失败' }).waitFor();
  assert.equal(posts.length, count);
  console.log(JSON.stringify({ mockedApi: true, checks: ['reject different-action receipt', '8000 draft refresh', 'stale-tab conflict', 'refresh GET only', 'explicit identical retry', 'reading anchor restore', 'confirmed receipt recovery', 'save isolation', 'owner isolation', 'logout clears only owner', 'corrupt cache fails closed', 'unavailable storage fails closed'], status: 'PASS' }, null, 2));
  await context.close();
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.kill(); });
