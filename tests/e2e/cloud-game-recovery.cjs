// Browser/IndexedDB recovery contract. API responses are synthetic, not rule acceptance evidence.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../..');
const fs = require('node:fs');
const width = Number(process.env.UI_RECOVERY_WIDTH || 390);
const output = process.env.UI_RECOVERY_OUTPUT;
let server, browser;
(async () => {
  const port = await new Promise(resolve => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => { const p = socket.address().port; socket.close(() => resolve(p)); });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const traffic = [], errors = [];
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)));
  let owner = 'owner-a', mode = 'lost', posts = [], confirmed = null;
  let listMode = 'normal', releaseList, gameReadStatus = 200;
  const save = { schemaVersion: 1, saveId: 'recovery-fixture', canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture', revision: 0, state: { playerId: 'fixture', locationId: 'fixture', elapsedMinutes: 0, facts: {} } };
  const policy = { mode: 'continue', policyVersion: 'fixture', schemaVersion: 1, clockBasis: 'game-minute+npc-grant-sequence-v1', policyArtifactHash: 'sha256:' + 'a'.repeat(64), cueDictionaryHash: 'sha256:' + 'b'.repeat(64), normalizerVersion: 'fixture', retrievalVersion: 'fixture', visibilityPolicyVersion: 'fixture', visibilityPolicyHash: 'sha256:' + 'c'.repeat(64), createdAtRevision: 0 };
  const lobbyA = [
    { ...save, saveId: 'native-v1' },
    { ...save, schemaVersion: 2, saveId: 'native-v2', memoryMode: 'continue', memoryPolicy: policy },
    { ...save, schemaVersion: 3, saveId: 'native-v3', memoryMode: 'continue', memoryPolicy: policy, canonArtifactHash: 'sha256:' + 'd'.repeat(64), branchId: 'root', parentBranchId: null, forkRevision: 0, createdPolicyVersion: 'fixture', sourceMigrationId: null },
    { ...save, saveId: 'backup-only', state: { ...save.state, facts: { archiveKind: 'local-untrusted-v1' } } },
    { ...save, saveId: 'rules-off' },
  ];
  const receipt = request => ({ idempotencyKey: request.idempotencyKey, saveId: save.saveId, requestFingerprint: require('./game-receipt-fixture.cjs')(save, request), resultingRevision: 0, decision: { status: 'rejected', revision: 0, code: 'FIXTURE', message: '未推进世界。'.repeat(500) } });
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    traffic.push({ path, method: route.request().method() });
    if (path === '/api/auth/session' && owner === null) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"UNAUTHENTICATED"}' });
    if ((path === '/api/saves' || path.startsWith('/api/games/')) && route.request().headers()['x-jiuxiao-account'] && route.request().headers()['x-jiuxiao-account'] !== owner) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"UNAUTHENTICATED"}' });
    const readError = /^\/api\/games\/http-(401|404|503)$/.exec(path);
    if (readError) return route.fulfill({ status: Number(readError[1]), contentType: 'application/json', body: JSON.stringify({ code: readError[1] === '401' ? 'UNAUTHENTICATED' : readError[1] === '404' ? 'NOT_FOUND' : 'GAME_UNAVAILABLE' }) });
    if (path === '/api/games/rules-off/action-suggestions') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'RULES_NOT_READY' }) });
    let body;
    if (path === '/api/auth/session') body = { account: { id: owner, kind: owner === 'owner-life' ? 'email' : 'guest', ...(owner === 'owner-life' ? { email: 'fixture@example.invalid' } : {}) } };
    else if (path === '/api/auth/providers') body = { email: true, phone: false };
    else if (path === '/api/auth/logout') body = { ok: true };
    else if (path === '/api/account/capabilities') body = { close: true, permanentDelete: true };
    else if (path === '/api/account/operation/begin') body = { operationId: 'fixture-operation', phase: 'old' };
    else if (path === '/api/account/operation/verify') body = { phase: 'ready' };
    else if (path === '/api/account/operation/complete') body = { ok: true };
    else if (path === '/api/save-index') body = { items: [], nextOffset: null };
    else if (path === '/api/saves') {
      if (listMode === 'failure') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"CLOUD_UNAVAILABLE"}' });
      const snapshot = owner === 'lobby-a' ? lobbyA : owner === 'lobby-b' ? [{ ...save, saveId: 'owner-b-save' }] : [];
      if (listMode === 'delayed') await new Promise(resolve => { releaseList = resolve; });
      body = { saves: snapshot };
    }
    else if (path.includes('/trash')) body = { archives: [] };
    else if (path.endsWith('/action-suggestions')) body = { actions: [] };
    else if (path.includes('/receipts/')) body = { status: confirmed ? 'confirmed' : 'unknown', receipt: confirmed, revision: 0 };
    else if (path.endsWith('/turns')) {
      const request = route.request().postDataJSON(); posts.push(request);
      if (mode === 'lost') return route.abort('failed');
      if (mode === 'revision') { save.revision = 1; return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({code:'REVISION_CONFLICT',currentRevision:1}) }); }
      body = { receipt: receipt(request) };
    } else {
      const id = path.split('/').at(-1);
      if (gameReadStatus !== 200 && path.startsWith('/api/games/')) return route.fulfill({ status: gameReadStatus, contentType: 'application/json', body: JSON.stringify({ code: gameReadStatus === 404 ? 'NOT_FOUND' : 'GAME_UNAVAILABLE' }) });
      body = { save: lobbyA.find(item => item.saveId === id) || { ...save, saveId: id } };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await context.newPage(); const input = page.getByTestId('p2-action-input');
  if (process.env.UI_RECOVERY_SCOPE === 'lobby') {
    owner = 'lobby-a';
    const localCollision = { schemaVersion: 1, saveId: 'native-v1', name: '合成本地同号', createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z', revision: 0, canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture', character: {}, location: 'fixture', status: 'pending_rules', messages: [] };
    await context.addInitScript(value => { if (!localStorage.getItem('jiuxiao_1_local_saves')) localStorage.setItem('jiuxiao_1_local_saves', JSON.stringify([value])); }, localCollision);
    const region = page.getByRole('region', { name: '云端规则存档', exact: true });
    const continueButton = id => region.getByRole('button', { name: '继续云端存档 ' + id, exact: true });
    const refresh = () => region.getByRole('button', { name: '重新读取云端存档', exact: true }).click();
    await page.goto(base + '/lobby'); await continueButton('native-v3').waitFor();
    assert.equal(await region.locator('.home-save').count(), 4);
    assert.equal(await continueButton('backup-only').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (output) { fs.mkdirSync(output, { recursive: true }); await region.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(output, 'lobby-' + width + '.png') }); }
    for (const id of ['native-v1', 'native-v2', 'native-v3']) {
      await continueButton(id).click(); await page.waitForURL(base + '/game/' + id);
      await page.getByTestId('p2-revision').waitFor();
      if (id === 'native-v1') {
        await page.reload(); await page.getByTestId('p2-revision').waitFor(); assert.equal(await page.locator('#player-intent').count(), 0, 'Explicit cloud entry and reload do not open a same-ID local save');
        await page.locator('.game-rail').getByRole('button', { name: '世界设定', exact: true }).click();
        await page.waitForURL(base + '/world'); assert.equal(await page.locator('.world-return-bar strong').count(), 0, 'Cloud reader does not attach same-ID local character metadata');
        await page.getByRole('button', { name: '返回当前行旅', exact: true }).click(); await page.getByTestId('p2-revision').waitFor();
      }
      await page.getByRole('button', { name: '返回山门', exact: true }).click();
      await page.waitForURL(base + '/lobby'); await continueButton(id).waitFor();
    }
    await page.locator('.lobby-actions').getByRole('button', { name: /继续游玩/ }).click();
    await page.locator('#player-intent').waitFor(); assert.equal(await page.getByTestId('p2-cloud-game').count(), 0);
    await page.goto(base + '/lobby'); await continueButton('rules-off').waitFor();
    await continueButton('rules-off').click();
    await page.getByText('服务器规则尚未就绪，行动输入已停用。', { exact: true }).waitFor();
    assert.equal(await input.isDisabled(), true);
    await page.getByRole('button', { name: '返回山门', exact: true }).click(); await continueButton('native-v1').waitFor();
    gameReadStatus = 404; await continueButton('native-v1').click();
    await region.getByRole('status').filter({ hasText: '当前账号下找不到这份存档' }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/lobby'); assert.equal(await region.locator('.home-save').count(), 0);
    gameReadStatus = 503; await refresh(); await continueButton('native-v1').waitFor(); await continueButton('native-v1').click();
    await region.getByRole('status').filter({ hasText: '暂时无法进入' }).waitFor();
    gameReadStatus = 200; await refresh(); await continueButton('native-v1').waitFor();
    owner = 'lobby-b'; await continueButton('native-v1').click();
    await region.getByRole('status').filter({ hasText: '账号已改变' }).waitFor();
    assert.equal(await region.locator('.home-save').count(), 0); assert.equal(new URL(page.url()).pathname, '/lobby');
    await refresh(); await continueButton('owner-b-save').waitFor(); assert.equal(await continueButton('native-v1').count(), 0);
    owner = 'lobby-a'; await page.evaluate(() => dispatchEvent(new Event('focus'))); await continueButton('native-v1').waitFor();
    assert.equal(await continueButton('owner-b-save').count(), 0);
    listMode = 'delayed'; await refresh();
    await page.waitForFunction(() => document.querySelector('[aria-label="云端规则存档"] .home-save') === null);
    for (let attempt = 0; attempt < 100 && !releaseList; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(typeof releaseList, 'function');
    owner = 'lobby-b'; releaseList(); listMode = 'normal';
    await region.getByRole('status').filter({ hasText: '请登录创建存档时的账号' }).waitFor();
    assert.equal(await region.locator('.home-save').count(), 0, 'Late A list cannot render after account changed to B');
    owner = 'lobby-empty'; await refresh(); await region.getByRole('status').filter({ hasText: '暂无云端规则存档' }).waitFor();
    listMode = 'failure'; await refresh(); await region.getByRole('status').filter({ hasText: '列表暂时无法读取' }).waitFor();
    assert.equal(await region.locator('.home-save').count(), 0);
    listMode = 'normal'; owner = null; await refresh(); await region.getByRole('status').filter({ hasText: '请登录创建存档时的账号' }).waitFor();
    const local = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
    assert.deepEqual(JSON.parse(local).saves, [localCollision], 'Cloud games are not converted to local saves; original same-ID local save stays intact');
    assert.ok(traffic.every(request => request.method === 'GET'));
    assert.deepEqual(errors, []);
    if (output) fs.writeFileSync(join(output, 'lobby-results-' + width + '.json'), JSON.stringify({ status: 'PASS', width, browser: browser.version(), scope: 'SYNTHETIC_EXISTING_API', v1v2v3: true, backupExcluded: true, gameGetBeforeNavigation: true, accountSwitchAndLateResponse: true, read404503: true, rulesUnavailable: true, emptyAndSignedOut: true, localSavesUntouched: true, requests: traffic, posts: 0, errors }, null, 2) + '\n');
    console.log('PASS: existing /api/saves lobby continuation, v1/v2/v3, backup exclusion, owner changes, late response, 404/503, empty, rules gate; zero POST.');
    await context.close(); return;
  }
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
  await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await page.getByTestId('p2-status').filter({ hasText: '请求未确认' }).waitFor();
  assert.equal(posts.length, 1);
  await open(page); await page.getByTestId('p2-status').filter({ hasText: '结果仍待核实' }).waitFor();
  assert.equal(posts.length, 1, 'refresh must query only');
  assert.equal(await input.inputValue(), '断网行动');
  await page.setViewportSize({ width, height: 568 });
  const pendingLayout = await input.boundingBox();
  assert.ok(pendingLayout && pendingLayout.y >= 0 && pendingLayout.y + pendingLayout.height <= 568, JSON.stringify(pendingLayout));
  assert.ok(await page.getByRole('button', { name: '查询行动结果', exact: true }).isVisible());
  for (const name of ['查询行动结果', '使用原请求重试']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width, JSON.stringify(box));
  }
  if (output) { fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: join(output, 'pending-short-' + width + '.png') }); }
  await page.setViewportSize({ width, height: 844 });
  mode = 'reply'; page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '使用原请求重试', exact: true }).click();
  await page.getByTestId('p2-status').filter({ hasText: '服务端明确拒绝' }).waitFor();
  assert.deepEqual(posts[1], posts[0], 'retry retains the original body and idempotency key');
  const retryIndex = traffic.findIndex(r => r.method === 'POST' && r.path.endsWith('/turns'));
  assert.ok(traffic.slice(retryIndex + 1).some(r => r.method === 'GET' && r.path.includes('/receipts/')), 'Recovery performs GET before any explicit retry');
  assert.equal(await input.inputValue(), '断网行动');
  // Semantic anchor restored across reload, not a document-wide pixel offset.
  await page.locator('.story-reading').hover(); await page.mouse.wheel(0, 350);
  await page.waitForTimeout(250);
  const before = await page.locator('.story-reading').evaluate(e => e.scrollTop);
  assert.ok(before > 0);
  await open(page); await page.waitForTimeout(250);
  const after = await page.locator('.story-reading').evaluate(e => e.scrollTop);
  assert.ok(Math.abs(before - after) < 5, `anchor restore ${before} -> ${after}`);
  const postsBeforeWorld = posts.length;
  await page.locator('.game-rail').getByRole('button', { name: '世界设定', exact: true }).click();
  await page.waitForURL(base + '/world');
  await page.getByRole('button', { name: '返回当前行旅', exact: true }).click();
  await page.waitForURL(base + '/game/' + save.saveId);
  await page.getByTestId('p2-status').filter({ hasText: '存档已恢复' }).waitFor();
  await page.waitForTimeout(250);
  const fromWorld = await page.locator('.story-reading').evaluate(e => e.scrollTop);
  assert.ok(Math.abs(after - fromWorld) < 5, `worldbook anchor restore ${after} -> ${fromWorld}`);
  assert.equal(await input.inputValue(), '断网行动');
  assert.equal(posts.length, postsBeforeWorld, 'Worldbook return restores display and draft without POST');
  mode = 'lost'; await input.fill('已结算但丢失响应'); await draftSaved(page, '已结算但丢失响应');
  await page.getByTestId('p2-submit-action').click(); await page.getByTestId('p2-status').filter({ hasText: '请求未确认' }).waitFor();
  let count = posts.length;
  confirmed = receipt({ ...posts.at(-1), text: '不同的行动' });
  await open(page); await page.getByTestId('p2-status').filter({ hasText: '读取失败' }).waitFor();
  assert.equal(posts.length, count, 'mismatched fingerprint must not trigger POST');
  assert.equal(await input.inputValue(), '已结算但丢失响应');
  confirmed = receipt(posts.at(-1));
  await open(page); await page.getByTestId('p2-status').filter({ hasText: '已从服务端恢复回执' }).waitFor();
  assert.equal(posts.length, count, 'confirmed recovery never POSTs');
  confirmed = null; mode = 'revision';
  await input.fill('旧版行动'); await draftSaved(page, '旧版行动');
  await page.getByTestId('p2-submit-action').click();
  await page.getByTestId('p2-status').filter({hasText:'服务端已拒绝旧版本行动'}).waitFor();
  assert.equal(posts.length, count + 1, 'version conflict never automatically resubmits'); count++;
  assert.equal(await input.inputValue(), '旧版行动');
  assert.equal(await page.getByRole('button',{name:'使用原请求重试',exact:true}).count(),0);
  await open(page); assert.equal(await input.inputValue(), '旧版行动'); assert.equal(posts.length,count);
  await open(page, 'different-save'); assert.equal(await input.inputValue(), '');
  await page.evaluate(id => { history.pushState({}, '', '/game/' + id); dispatchEvent(new PopStateEvent('popstate')); }, save.saveId);
  await page.getByTestId('p2-status').filter({ hasText: '存档已恢复' }).waitFor();
  assert.equal(await input.inputValue(), '旧版行动', 'SPA save switch does not retain the previous component input');
  owner = 'owner-b'; await open(page); assert.equal(await input.inputValue(), '');
  await input.fill('另一账号的草稿'); await draftSaved(page, '另一账号的草稿');
  owner = 'owner-a'; await open(page); assert.equal(await input.inputValue(), '旧版行动');
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
  for (const [status, message] of [[401, '需要创建这份存档时使用的游客或邮箱会话'], [404, '账号下找不到这份服务端存档'], [503, '服务器暂时无法确认这次行动']]) {
    await page.goto(`${base}/game/http-${status}`);
    await page.getByTestId('p2-status').filter({ hasText: message }).waitFor();
    assert.equal(await input.count(), 0);
    assert.equal(await page.getByTestId('p2-narrative').count(), 0);
  }
  await page.goto(`${base}/game/rules-off`);
  await page.getByText('服务器规则尚未就绪，行动输入已停用。', { exact: true }).waitFor();
  assert.equal(await input.isDisabled(), true);
  await page.locator('form').evaluate(form => form.requestSubmit());
  assert.equal(posts.length, count, 'RULES_NOT_READY does not submit');
  // Reuse the existing account lifecycle completion UI; clear only its cloud cache scope.
  owner = 'owner-life'; await open(page);
  await input.fill('账户操作前的本机云草稿'); await draftSaved(page, '账户操作前的本机云草稿');
  await accountPage.goto(`${base}/settings/cloud`);
  const lifecycle = accountPage.getByRole('region', { name: '账户生命周期' });
  await lifecycle.locator('select').selectOption('close');
  await lifecycle.getByRole('button', { name: '验证旧邮箱', exact: true }).click();
  await lifecycle.getByLabel('旧邮箱操作验证码').fill('123456');
  await lifecycle.getByRole('button', { name: '核验操作验证码', exact: true }).click();
  await lifecycle.getByLabel('输入 CLOSE_ACCOUNT').fill('CLOSE_ACCOUNT');
  accountPage.once('dialog', dialog => dialog.accept());
  await lifecycle.getByRole('button', { name: '最终确认账户操作', exact: true }).click();
  await page.getByTestId('p2-status').filter({ hasText: '账号已改变' }).waitFor();
  assert.equal(await input.count(), 0);
  await open(page); assert.equal(await input.inputValue(), '');
  owner = 'owner-focus'; await open(page, 'focus-fixture');
  await input.fill('切换前草稿'); await draftSaved(page, '切换前草稿');
  owner = 'owner-next'; await page.evaluate(() => dispatchEvent(new Event('focus')));
  await page.getByTestId('p2-status').filter({ hasText: '账号已改变' }).waitFor();
  assert.equal(await input.count(), 0);
  assert.equal(posts.length, count);
  assert.deepEqual(errors, []);
  const summary = { status: 'PASS', mockedApi: true, width, height: 844, shortHeight: 568, browser: browser.version(), gamePosts: posts.length, requests: traffic, uncaughtErrors: errors, sameKeyRetry: true, refreshGetOnly: true, explicitRetryQueriesFirst: true, rulesUnavailable: true, http401404503: true, accountLifecycleCleanup: true, focusAccountInvalidation: true, worldbookAnchorAndDraftReturn: true, inheritedT1RecoveryChecks: 13 };
  if (output) fs.writeFileSync(join(output, 'results-' + width + '.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ mockedApi: true, checks: ['definitive revision conflict preserves draft without resubmit', 'reject different-action receipt', '8000 draft refresh', 'stale-tab conflict', 'refresh GET only', 'explicit identical retry', 'reading anchor restore', 'confirmed receipt recovery', 'save isolation', 'owner isolation', 'logout clears only owner', 'corrupt cache fails closed', 'unavailable storage fails closed'], status: 'PASS' }, null, 2));
  await context.close();
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.kill(); });
