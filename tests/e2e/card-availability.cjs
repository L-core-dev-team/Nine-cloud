// Actual application UI, synthetic HTTP responses only; no database or model request.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { resolve } = require('node:path');
const net = require('node:net');
(async () => {
  let base = process.env.CARD_UI_BASE, server;
  if (base && !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('LOCAL_UI_REQUIRED');
  if (!base) {
    const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
    const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: resolve(__dirname, '../../apps/web'), windowsHide: true, stdio: 'ignore',
    });
  }
  let browser;
  try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    if (server?.exitCode != null) throw Error('LOCAL_UI_EXITED');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'LOCAL_UI_NOT_READY');
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const results = [];
    for (const width of [360, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage(); const errors = []; let body = { cardImport: false }, status = 200, probes = 0, businessCalls = 0;
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/api/auth/providers') { probes++; return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
        if (pathname.startsWith('/api/card-import')) businessCalls++;
        return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      });
      for (const value of [{ cardImport: false }, {}, { cardImport: 'true' }]) {
        body = value; const response = page.waitForResponse(r => r.url().endsWith('/api/auth/providers'));
        await page.goto(base + '/lobby'); await response;
        await page.getByRole('heading', { name: '选择去处' }).waitFor();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.getByRole('button', { name: /角色卡模式/ }).count(), 0);
      }
      for (const code of [404, 503]) {
        status = code; await page.goto(base + '/cards');
        await page.getByText('当前服务暂未开放角色卡模式。').waitFor();
        assert.equal(await page.getByText('请先登录角色卡所属账号。').count(), 0);
      }
      status = 200; body = { cardImport: true }; await page.goto(base + '/lobby');
      await page.getByRole('button', { name: /角色卡模式/ }).waitFor();
      await page.getByRole('button', { name: /角色卡模式/ }).click();
      await page.getByText('请先登录角色卡所属账号。').waitFor();
      body = { cardImport: false }; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByText('当前服务暂未开放角色卡模式。').waitFor();
      await page.goto(base + '/cards/session/00000000-0000-4000-8000-000000000001');
      await page.getByText('当前服务暂未开放角色卡模式。').waitFor();
      assert.equal(businessCalls, 0); assert.deepEqual(errors, []);
      results.push({ width, probes, falseOrMissingHidden: true, errorsClosed: true, enabledEntry: true, directLinkBlocked: true, focusRevalidated: true, businessCalls });
      await context.close();
    }
    console.log(JSON.stringify({ status: 'PASS', scope: 'MOCK_API_BROWSER_DISPLAY', results }));
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
