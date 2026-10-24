// Presentation-only regression on the built candidate. All API traffic is intercepted.
// Real publication/permission evidence remains in T1-V2 b0a22eb7; this is not rules evidence.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../..');
const output = join(root, 'test-results/r3-minimal');
const note = '本地历史文字，来源未经服务端验证，不代表权威回执或世界事实。';
let server, browser;
(async () => {
  mkdirSync(output, { recursive: true });
  const socket = net.createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe' });
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  writeFileSync(join(output, 'preview-process.json'), JSON.stringify({ pid: server.pid, port }) + '\n');
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) throw Error('Preview exited');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Preview ready');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const results = [];
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
    const context = await browser.newContext({ viewport });
    const now = '2026-10-24T00:00:00.000Z';
    const local = { schemaVersion: 1, saveId: 'r3-local', name: '合成历史对照', createdAt: now, updatedAt: now, revision: 0, canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture', character: {}, location: '本机历史', status: 'pending_rules', messages: [{ role: 'assistant', content: 'SYNTHETIC_LOCAL_HISTORY' }] };
    const fixtures = [local, { ...local, saveId: 'r3-empty', messages: [] }];
    await context.addInitScript(saves => localStorage.setItem('jiuxiao_1_local_saves', JSON.stringify(saves)), fixtures);
    const cloud = { schemaVersion: 1, saveId: 'r3-cloud', canonVersion: 'synthetic-canon', ruleVersion: 'synthetic-rules', memoryPolicyVersion: 'synthetic-memory', revision: 0, state: { playerId: 'synthetic-player', locationId: 'synthetic-location', elapsedMinutes: 0, facts: { gameMinute: 0 } } };
    let mockedPosts = 0;
    const errors = [];
    await context.route('**/api/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      let body, status = 200;
      if (pathname === '/api/auth/session') body = { account: { id: 'synthetic-owner', kind: 'guest' } };
      else if (pathname.endsWith('/action-suggestions')) body = { actions: [] };
      else if (pathname === '/api/games/r3-cloud/turns' && request.method() === 'POST') {
        mockedPosts++;
        const input = request.postDataJSON();
        assert.equal(input.expectedRevision, 0);
        body = { receipt: { idempotencyKey: input.idempotencyKey, saveId: cloud.saveId, requestFingerprint: `sha256:v1:${'0'.repeat(64)}`, decision: { status: 'rejected', code: 'INPUT_SYNTHETIC', message: '合成服务端回执正文', revision: 0 }, resultingRevision: 0 }, narrative: { text: 'SYNTHETIC_SERVER_BODY' } };
      } else if (pathname === '/api/games/r3-cloud') body = { save: cloud };
      else { status = 404; body = { code: 'NOT_FOUND' }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/game/r3-local');
    const notice = page.getByTestId('local-history-unverified');
    await notice.waitFor();
    assert.equal(await notice.innerText(), note);
    await page.getByText('SYNTHETIC_LOCAL_HISTORY', { exact: true }).waitFor();
    assert.ok(await notice.isVisible());
    const geometry = await notice.evaluate(element => {
      const n = element.getBoundingClientRect(), story = document.querySelector('.story-message').getBoundingClientRect();
      return { x: n.x, right: n.right, bottom: n.bottom, beforeStory: n.bottom <= story.y, scrollWidth: document.documentElement.scrollWidth };
    });
    assert.ok(geometry.x >= 0 && geometry.right <= viewport.width + 1 && geometry.bottom <= viewport.height && geometry.beforeStory && geometry.scrollWidth <= viewport.width + 1, JSON.stringify(geometry));
    assert.equal(mockedPosts, 0);
    await page.screenshot({ path: join(output, `local-${viewport.width}.png`) });
    await page.goto(base + '/game/r3-empty');
    await page.getByText('山门未启', { exact: true }).waitFor();
    assert.equal(await notice.count(), 0);
    assert.equal(mockedPosts, 0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves')));
    for (const fixture of fixtures) assert.deepEqual(saved.find(save => save.saveId === fixture.saveId), fixture);
    await page.goto(base + '/game/r3-cloud');
    await page.getByTestId('p2-action-input').fill('合成展示测试');
    await page.getByTestId('p2-submit-action').click();
    await page.getByTestId('p2-narrative').filter({ hasText: 'SYNTHETIC_SERVER_BODY' }).waitFor();
    assert.equal(await notice.count(), 0);
    assert.ok(!(await page.locator('body').innerText()).includes(note));
    assert.equal(await page.getByTestId('p2-revision').innerText(), '0');
    assert.equal(mockedPosts, 1);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(output, `cloud-${viewport.width}.png`) });
    results.push({ viewport, geometry, localWarning: true, emptyUnmarked: true, syntheticServerBodyUnmarked: true, localSaveUnchanged: true, cloudRevisionUnchanged: true, mockedPosts, liveApiRequests: 0 });
    await context.close();
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ status: 'PASS', scope: 'MOCKED_API_PRESENTATION_ONLY', browser: browser.version(), results }, null, 2) + '\n');
  console.log('R3_PASS: 3 viewports; local/empty/server-body controls; unchanged local saves and cloud revision; no live API traffic.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
});
