// Layout and interaction simulation only; no real inbox or account mutations.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdirSync, existsSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../..');
const out = join(root, 'test-results/cloud-settings-layout');
const origin = 'http://127.0.0.1:15205';
const owner = { id: 'layout-fixture-owner', email: 'traveller@example.invalid' };
let vite;
async function main() {
  mkdirSync(out, { recursive: true });
  vite = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '15205', '--strictPort'], { cwd: join(root, 'apps/web'), env: process.env, stdio: 'pipe', windowsHide: true });
  vite.stderr.on('data', data => process.stderr.write(data));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ executablePath: existsSync(edge) ? edge : undefined });
  const evidence = [];
  try {
    for (const width of [320, 390, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      let populated = false;
      let operationBegun = false;
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let body = { code: 'NOT_FOUND' }; let status = 404;
        if (path === '/api/auth/session') { body = { account: owner }; status = 200; }
        if (path === '/api/auth/providers') { body = { email: true, phone: false }; status = 200; }
        if (path === '/api/auth/phone/status') { body = { code: 'NOT_ENABLED' }; status = 503; }
        if (path === '/api/save-index') { body = { saves: populated ? [{ saveId: 'fixture-cloud-save', name: '一段非常长的存档名称用于确认窄屏布局仍然可以完整显示而不会超出边界', revision: 8 }] : [], hasMore: populated }; status = 200; }
        if (path === '/api/save-trash') { body = { saves: [], hasMore: false }; status = 200; }
        if (path === '/api/account/capabilities') { body = { close: true, permanentDelete: false }; status = 200; }
        if (path === '/api/account/operation/begin') { assert.equal(route.request().postDataJSON().newEmail, 'new@example.invalid'); operationBegun = true; body = { operationId: 'mock-operation', phase: 'old' }; status = 200; }
        if (path === '/api/account/operation/cancel') { operationBegun = false; body = { status: 'cancelled' }; status = 200; }
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.goto(`${origin}/settings/cloud`);
      try { await page.getByText(owner.email, { exact: true }).waitFor(); }
      catch (error) { await page.screenshot({ path: join(out, `failure-${width}.png`), fullPage: true }); console.error('Fixture page:', await page.locator('main').innerText(), errors); throw error; }
      await page.getByText('没有待处理的上传。', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '上一页', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: '重试待上传', exact: true }).isDisabled(), true);
      for (const theme of ['night', 'day']) {
        await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
        const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, h2: [...document.querySelectorAll('.cloud-page h2')].map(e => parseFloat(getComputedStyle(e).fontSize)), buttons: [...document.querySelectorAll('.cloud-page button')].filter(e => e.getClientRects().length).map(e => ({ size: parseFloat(getComputedStyle(e).fontSize), height: e.getBoundingClientRect().height, radius: getComputedStyle(e).borderRadius })) }));
        assert.equal(metrics.overflow, false);
        assert.ok(metrics.h2.every(s => s === 18));
        assert.ok(metrics.buttons.every(b => b.size === 14 && b.height >= 44 && b.radius !== '0px'));
        await page.screenshot({ path: join(out, `${width}-${theme}.png`), fullPage: true });
        evidence.push({ width, theme, ...metrics });
      }
      await page.locator('.cloud-security > summary').click();
      await page.getByLabel('新邮箱', { exact: true }).fill('new@example.invalid');
      await page.getByRole('button', { name: '验证旧邮箱', exact: true }).click();
      await page.getByLabel('旧邮箱操作验证码', { exact: true }).waitFor();
      assert.equal(operationBegun, true);
      await page.getByRole('button', { name: '取消账户操作', exact: true }).click();
      await page.getByRole('button', { name: '验证旧邮箱', exact: true }).waitFor();
      assert.equal(operationBegun, false);
      populated = true; await page.reload();
      await page.getByRole('button', { name: '恢复为本地副本', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '下一页', exact: true }).isEnabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual(errors, []);
      await context.close();
    }
    writeFileSync(join(out, 'evidence.json'), JSON.stringify({ kind: 'simulated-auth-layout', status: 'PASS', cases: evidence }, null, 2));
    console.log('PASS: 320/390/1366px, night/day, empty/populated cloud saves, accessible account operation begin/cancel, no overflow or page errors. API responses simulated.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => vite?.kill());
