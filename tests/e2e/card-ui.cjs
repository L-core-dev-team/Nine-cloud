// Only synthetic responses; no real API, database, or model is contacted.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { resolve, join } = require('node:path');
const { mkdirSync } = require('node:fs');
const net = require('node:net');
const root = resolve(__dirname, '../..');
// Keep browser profiles and downloads inside this worktree, including on Windows.
const temp = join(root, 'test-results', 'card-ui-temp');
mkdirSync(temp, { recursive: true });
process.env.TEMP = temp; process.env.TMP = temp; process.env.TMPDIR = temp;
const { chromium } = require('playwright');
let server, browser;
const CARD = '11111111-1111-4111-8111-111111111111', IMP = '22222222-2222-4222-8222-222222222222', BOOK = '33333333-3333-4333-8333-333333333333';
const parsed = { kind: 'card', format: 'v3', name: '测试角色', document: { data: { name: '测试角色', first_mes: '测试开场', description: '<script>window.cardExecuted=1</script>' } }, warnings: [], assetRefs: ['https://invalid.example/asset'] };

(async () => {
  const port = await new Promise(resolve => { const socket = net.createServer().listen(0, '127.0.0.1', () => { const n = socket.address().port; socket.close(() => resolve(n)); }); });
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, windowsHide: true, stdio: 'pipe' });
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/apps/web/card-ui-fixture.html`)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready, 'test server did not start');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) for (const theme of ['night', 'day']) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], traffic = [], actions = [];
    await page.addInitScript(() => {
      window.__cardScrollStorageOps = [];
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) { if (this === sessionStorage && key.startsWith('jiuxiao_1_game_scroll_')) window.__cardScrollStorageOps.push(['get', key]); return get.call(this, key); };
      Storage.prototype.setItem = function (key, value) { if (this === sessionStorage && key.startsWith('jiuxiao_1_game_scroll_')) window.__cardScrollStorageOps.push(['set', key]); return set.call(this, key, value); };
    });
    page.on('pageerror', e => errors.push(e.message));
    let imports = [], cards = [], sessions = [], pendingKey = null, actionMode = 'no-model', history = [], owner = 'owner-a', conflict = false, lostSession = false, firstSessionId = '', statusChecks = 0;
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== base) { traffic.push(`external:${url.origin}`); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      traffic.push(`${req.method()} ${url.pathname}${url.search}`);
      if(url.pathname==='/api/auth/session')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({account:{id:owner}})});
      assert.equal(req.headers()['x-jiuxiao-account'], owner);
      assert.ok(url.pathname.startsWith('/api/card-import/'), url.pathname);
      const path = url.pathname.slice('/api/card-import'.length), method = req.method();
      let status = 200, body;
      if (path === '/imports' && method === 'GET') body = imports;
      else if (path === '/cards' && method === 'GET') body = cards;
      else if(path==='/library/page' && method==='GET') body={items:cards,nextCursor:null};
      else if (path === '/sessions' && method === 'GET') body = sessions;
      else if(path==='/personas' && method==='GET') body=[];
      else if(path==='/worldbooks/global' && method==='GET') body=[];
      else if(path.endsWith('/requests') && method==='GET') body=[];
      else if(path.endsWith('/group') && method==='GET'){status=409;body={error:'NOT_GROUP_SESSION'};}
      else if (path === '/imports' && method === 'POST') {
        const data = req.postDataJSON(); assert.equal(data.rightsConfirmed, true);
        const item = data.filename === 'bad.json' ? { id: '44444444-4444-4444-8444-444444444444', filename: data.filename, kind: 'card', sha256: 'c', error: 'INVALID_JSON', parsed: null } : data.kind === 'worldbook' ? { id: BOOK, filename: data.filename, kind: 'worldbook', sha256: 'a', error: null, parsed: { kind: 'worldbook', format: 'worldbook-json', name: '书', document: { entries: [] }, warnings: [], assetRefs: [] } } : { id: IMP, filename: data.filename, kind: 'card', sha256: 'b', error: null, parsed };
        const exists = imports.some(i => i.id === item.id); if (!exists) imports.push(item); body = { ...item, duplicate: exists };
      } else if (path === `/imports/${IMP}`) body = imports.find(i => i.id === IMP);
      else if (path === '/cards' && method === 'POST') {
        const data = req.postDataJSON(); assert.deepEqual(data.links, [{ uri: 'https://invalid.example/asset', importId: BOOK }]);
        if (conflict) { status = 409; body = { error: 'CONFIRMATION_CONFLICT' }; }
        else { const card = { id: CARD, import_id: IMP, parent_id: null, metadata: { source: data.source, notes: data.notes, links: data.links }, parsed }; if (!cards.length) cards.push(card); body = card; conflict = true; }
      } else if (path === `/cards/${CARD}` && method === 'GET') body = cards[0];
      else if (path === `/cards/${CARD}` && method === 'DELETE') { status = 409; body = { error: 'RESOURCE_IN_USE' }; }
      else if (path === `/imports/${IMP}/original`) return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from([0, 1, 2, 255]) });
      else if (path === '/sessions' && method === 'POST') { const data = req.postDataJSON(); if (firstSessionId) assert.equal(data.id, firstSessionId); else firstSessionId = data.id; if (viewport.width === 360) history = Array.from({ length: 101 }, (_, i) => ({ key: `history-${i}`, action: `历史行动 ${i}`, narrative: `历史剧情 ${i}`, resulting_revision: i + 1 })); const item = { id: data.id, card_id: data.cardId, revision: history.length }; sessions = [item]; body = item; if (!lostSession) { lostSession = true; return route.abort('failed'); } }
      else if (/^\/sessions\/[^/]+$/.test(path) && method === 'GET') body = { ...sessions[0], revision: history.length, greeting:'测试开场' };
      else if (path.endsWith('/history')) { const after = Number(url.searchParams.get('after')); body = history.filter(x => x.resulting_revision > after).slice(0, 100); }
      else if (path.endsWith('/actions')) {
        const data = req.postDataJSON(); actions.push(data);
        if (actionMode === 'no-model') { status = 503; body = { error: 'MODEL_NOT_CONFIGURED' }; }
        else if (actionMode === 'lost') { pendingKey = data.idempotencyKey; actionMode = 'pending'; return route.abort('failed'); }
        else if (actionMode === 'complete') { assert.notEqual(data.idempotencyKey, pendingKey); const row = { key: data.idempotencyKey, action: data.action, narrative: '模拟剧情', resulting_revision: history.length + 1 }; history.push(row); body = { ...row, status: 'completed' }; }
      } else if (path.endsWith('/recover')) { assert.ok(path.includes(pendingKey)); body = { key: pendingKey, status: 'failed', error: 'GENERATION_EXPIRED' }; }
      else if (path.includes('/requests/')) { assert.ok(path.includes(pendingKey)); body = { key: pendingKey, status: statusChecks++ ? 'pending' : 'unknown' }; }
      else if (/^\/sessions\/[^/]+$/.test(path) && method === 'DELETE') { sessions = []; status = 204; }
      else throw new Error(`Unhandled request ${method} ${path}`);
      return route.fulfill(status === 204 ? { status } : { status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`${base}/apps/web/card-ui-fixture.html?theme=${theme}`);
    await page.getByText('角色卡资料已读取。').waitFor();
    const upload = page.getByRole('button', { name: '上传并核对' }); assert.equal(await upload.isDisabled(), true);
    await page.getByLabel('文件类型').selectOption('worldbook');
    await page.getByLabel('选择文件').setInputFiles({ name: 'book.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.getByLabel('我确认有权上传并使用此文件。').check(); await upload.click(); await page.getByText('文件已保存，请核对识别结果。').waitFor();
    await page.getByLabel('文件类型').selectOption('card');
    await page.getByLabel('选择文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') }); assert.equal(await upload.isDisabled(), true); await page.getByLabel('我确认有权上传并使用此文件。').check(); await upload.click(); await page.getByText('识别失败：INVALID_JSON', { exact: false }).first().waitFor();
    await page.getByLabel('选择文件').setInputFiles({ name: 'card.json', mimeType: 'application/json', buffer: Buffer.from('{}') }); assert.equal(await upload.isDisabled(), true); await page.getByLabel('我确认有权上传并使用此文件。').check(); await upload.click();
    await page.getByRole('heading', { name: '核对：card.json' }).waitFor(); await page.getByText('查看解析资料', { exact: false }).click();
    assert.equal(await page.evaluate(() => window.cardExecuted), undefined);
    await upload.click(); await page.getByText('相同文件已存在，已显示原导入结果。').waitFor();
    await page.getByRole('button', { name: '确认并保存版本' }).click(); await page.getByText('请为每个资源地址选择导入文件。').waitFor();
    await page.getByLabel(/资源地址/).selectOption(BOOK); await page.getByRole('button', { name: '确认并保存版本' }).click(); await page.getByText('角色卡版本已确认保存。').waitFor();
    await page.getByRole('button', { name: '确认并保存版本' }).click(); await page.getByText('该导入项已有不同的确认结果', { exact: false }).waitFor();
    const download = page.waitForEvent('download'); await page.getByRole('region', { name: '导入核对' }).getByRole('button', { name: '下载原文件' }).click(); assert.equal((await download).suggestedFilename(), 'original.bin');
    page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '删除' }).first().click(); await page.getByText('资料仍被其他卡片或版本引用', { exact: false }).waitFor();
    await page.getByRole('button', { name: '开始会话' }).click(); await page.getByRole('button',{name:'确认创建',exact:true}).click(); await page.getByText('建局结果尚未确认', { exact: false }).waitFor();
    if (viewport.width === 360 && theme === 'night') await page.evaluate(id => { sessionStorage.setItem(`jiuxiao_1_game_scroll_${id}`, '428'); sessionStorage.setItem(`jiuxiao_1_game_scroll_card-${id}`, '529'); window.__cardScrollStorageOps = []; }, firstSessionId);
    await page.getByRole('button', { name: '确认创建', exact: true }).click(); await page.getByRole('heading', { name: '角色卡会话' }).waitFor();
    await page.getByText('会话已读取', { exact: false }).waitFor(); await page.getByText('测试开场').waitFor(); if (viewport.width === 360) assert.ok(traffic.some(x => x.includes('history?after=100'))); const input = page.getByLabel('角色卡行动');
    if (viewport.width === 360 && theme === 'night') {
      const reading = page.locator('.story-reading'); assert.equal(await reading.evaluate(el => el.scrollTop), 0);
      const position = await reading.evaluate(el => { el.dispatchEvent(new Event('wheel')); el.scrollTop = 600; el.dispatchEvent(new Event('scroll')); return el.scrollTop; }); assert.ok(position > 0);
    }
    await input.fill('测试行动'); await page.getByRole('button', { name: '提交行动' }).click(); await page.getByText('角色卡模型尚未配置。').waitFor(); assert.equal(await input.inputValue(), '测试行动');
    actionMode = 'lost'; await page.getByRole('button', { name: '提交行动' }).click(); await page.getByText('本次结果未知', { exact: false }).waitFor(); assert.equal(await page.getByRole('button', { name: '提交行动' }).isDisabled(), true);
    await page.getByRole('button', { name: '查询原请求' }).click(); await page.getByText('服务端尚未确认这次请求', { exact: false }).waitFor(); assert.equal(await page.getByRole('button', { name: '提交行动' }).isDisabled(), true);
    await page.getByRole('button', { name: '查询原请求' }).click(); await page.getByText('行动仍在处理', { exact: false }).waitFor();
    await page.getByRole('button', { name: '核对过期请求' }).click(); await page.getByText('行动未完成：请求已过期，未再生成。', { exact: false }).waitFor();
    assert.equal(actions.length, 2); await page.getByRole('button', { name: '准备新行动' }).click(); actionMode = 'complete'; await page.getByRole('button', { name: '提交行动' }).click(); await page.getByText('模拟剧情').waitFor(); assert.equal(actions.length, 3);
    const geometry = await page.evaluate(() => { const input = document.querySelector('#card-action'), button = document.querySelector('.intent-composer button'); const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; }; return { width: document.documentElement.scrollWidth - innerWidth, input: rect(input), button: rect(button), reading: rect(document.querySelector('.story-reading')) }; });
    assert.ok(geometry.width <= 1 && geometry.input.top >= 0 && geometry.button.bottom <= viewport.height + 1 && geometry.reading.height >= 24, JSON.stringify(geometry));
    assert.equal(traffic.filter(x => x.startsWith('external:')).length, 0); assert.deepEqual(errors, []);
    await page.getByRole('button', { name: '返回卡库' }).click(); await page.getByText('角色卡资料已读取。').waitFor();
    if (viewport.width === 360 && theme === 'night') {
      await page.getByRole('button', { name: '继续', exact: true }).click(); await page.getByText('会话已读取', { exact: false }).waitFor();
      assert.equal(await page.locator('.story-reading').evaluate(el => el.scrollTop), 0);
      const evidence = await page.evaluate(id => { const operations = [...window.__cardScrollStorageOps]; return { operations, native: sessionStorage.getItem(`jiuxiao_1_game_scroll_${id}`), prefixed: sessionStorage.getItem(`jiuxiao_1_game_scroll_card-${id}`) }; }, firstSessionId);
      assert.deepEqual(evidence, { operations: [], native: '428', prefixed: '529' });
      await page.getByRole('button', { name: '返回卡库' }).click(); await page.getByText('角色卡资料已读取。').waitFor();
    }
    page.once('dialog', d => d.accept()); await page.getByRole('heading', { name: '会话', exact: true }).locator('..').getByRole('button', { name: '删除' }).click(); await page.getByText('暂无会话。').waitFor();
    owner = 'owner-b'; imports = []; cards = []; sessions = []; await page.getByRole('button', { name: '切换测试账号' }).click(); await page.getByText('还没有保存的卡片。').waitFor();
    assert.ok(traffic.some(x => x.includes('/requests/'))); console.log(JSON.stringify({ viewport, theme, status: 'PASS', syntheticApi: true, actions: actions.length }));
    await context.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.kill(); });
