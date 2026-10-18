// Isolated presentation regression; API replies are synthetic, never live rules evidence.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../..');
const runName = process.argv[2];
if(runName !== undefined && !/^[a-z0-9-]+$/.test(runName))throw Error('Invalid unique run name');
const output = runName ? join(root, 'docs/integration/handover-02', runName) : join(root, 'test-results/cloud-game-shell');
let server, browser;
(async () => {
  mkdirSync(output, { recursive: !runName });
  const port = await new Promise(resolve => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe' });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
  const results = [];
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) for (const theme of ['night', 'day']) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => localStorage.setItem('jx10_appearance', theme), theme);
    const save = { schemaVersion: 1, saveId: 'cloud-ui-fixture', canonVersion: 'synthetic-canon', ruleVersion: 'synthetic-rules', memoryPolicyVersion: 'synthetic-memory', revision: 0, state: { playerId: 'synthetic-player', locationId: 'synthetic-location', elapsedMinutes: 0, facts: { gameMinute: 0 } } };
    let submissions = 0, failNext = false;
    await page.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      let body, status = 200;
      if (pathname === '/api/auth/session') body = { account: {id:'synthetic-owner',kind:'guest'} };
      else if (pathname.endsWith('/action-suggestions')) body = { actions: [{ id: 'synthetic', kind: 'observe', label: '测试观察', text: '测试行动' }] };
      else if (pathname.endsWith('/turns')) {
        submissions++;
        const request = route.request().postDataJSON();
        assert.equal(request.expectedRevision, 0); assert.equal(request.requestNarrative, true);
        assert.equal(request.text, failNext ? '保留未确认行动' : '测试行动');
        if (failNext) { status = 503; body = { code: 'ENV_UNAVAILABLE' }; }
        else body = { receipt: { idempotencyKey: request.idempotencyKey, saveId: save.saveId, requestFingerprint: require('./game-receipt-fixture.cjs')(save, request), decision: { status: 'rejected', code: 'INPUT_SYNTHETIC', message: '测试回执：行动未获接受。'.repeat(400), revision: 0 }, resultingRevision: 0 } };
      } else if (pathname.endsWith('/' + save.saveId)) body = { save };
      else { status = 503; body = { code: 'AUTH_PROVIDER_UNAVAILABLE' }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`${base}/game/${save.saveId}`);
    const input = page.getByTestId('p2-action-input'); await input.waitFor();
    await page.getByRole('button', { name: '存档状态', exact: true }).click();
    await page.getByRole('dialog', { name: '存档状态详情' }).waitFor(); await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: '存档状态', exact: true }).evaluate(element => element === document.activeElement), true);
    await page.getByText('当前可尝试的行动', { exact: true }).click();
    await page.getByRole('button', { name: '测试观察', exact: true }).click();
    assert.equal(await input.inputValue(), '测试行动');
    await page.getByTestId('p2-submit-action').click(); await page.getByTestId('p2-narrative').waitFor();
    assert.equal(submissions, 1); assert.equal(await page.getByTestId('p2-revision').innerText(), '0');
    const geometry = await page.evaluate(() => {
      const reading = document.querySelector('.story-reading'); const input = document.querySelector('#p2-action-input'); const button = document.querySelector('[data-testid="p2-submit-action"]');
      const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
      const r = button.getBoundingClientRect();
      return { document: document.documentElement.scrollHeight, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth, reading: rect(reading), input: rect(input), button: rect(button), clickable: button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
    });
    assert.ok(geometry.document <= geometry.height + 1 && geometry.overflow <= 1, JSON.stringify(geometry));
    assert.ok(geometry.reading.height >= 24 && geometry.input.top >= 0 && geometry.button.bottom <= viewport.height + 1 && geometry.clickable, JSON.stringify(geometry));
    await page.locator('.story-reading').evaluate(element => { element.scrollTop = 220; }); await page.waitForTimeout(100);
    await page.getByRole('button', { name: '世界设定', exact: true }).last().click();
    await page.getByRole('button', { name: '返回当前行旅', exact: true }).click(); await input.waitFor();
    failNext = true; await input.fill('保留未确认行动'); await page.getByTestId('p2-submit-action').click();
    await page.getByTestId('p2-status').filter({ hasText: '请求未确认' }).waitFor();
    assert.equal(await input.inputValue(), '保留未确认行动'); assert.equal(submissions, 2);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(output, `${viewport.width}-${theme}.png`) });
    results.push({ viewport, theme, geometry, status: 'PASS' }); await context.close();
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ mockedApi: true, realRules: false, results }, null, 2));
  console.log(`CloudGame presentation: ${results.length} layout, receipt, input recovery and navigation journeys PASS.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.kill(); });
