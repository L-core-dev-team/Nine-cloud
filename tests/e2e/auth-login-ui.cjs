#!/usr/bin/env node
// Browser contract for the login UI. All auth/API responses are intercepted;
// this verifies client wiring only and does not stand in for provider acceptance.
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const webPort = 15175;
const apiPort = 15176;
const origin = `http://127.0.0.1:${webPort}`;
let phoneProviderEnabled = true;
const phoneCodeRequests = [];
let vite;
const api = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let body = null;
  if (chunks.length) {
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return sendJson(response, 400, { code: 'INVALID_REQUEST' }); }
  }
  const path = new URL(request.url || '/', `http://127.0.0.1:${apiPort}`).pathname;
  if (path === '/api/auth/providers') return sendJson(response, 200, {
    email: true, phone: phoneProviderEnabled,
    privacyPolicyUrl: 'https://play.example.invalid/privacy', privacyPolicyVersion: 'test-v1',
  });
  if (path === '/api/auth/session') return sendJson(response, 401, { code: 'UNAUTHENTICATED' });
  if (path === '/api/auth/phone/code' && request.method === 'POST') {
    phoneCodeRequests.push(body);
    return sendJson(response, 202, { status: 'sent', resendAfterSeconds: 60 });
  }
  if (path === '/api/auth/phone/verify' && request.method === 'POST') {
    return sendJson(response, 200, { account: { id: 'browser-test-owner', email: 'phone-user@example.invalid' }, expiresAt: '2026-10-07T00:00:00Z' }, {
      'set-cookie': 'jx_session=browser-test-session; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure',
    });
  }
  if (path === '/api/auth/phone/status') return sendJson(response, 200, { phoneLinked: true });
  if (path === '/api/save-index' || path === '/api/save-trash') return sendJson(response, 200, { saves: [], hasMore: false });
  return sendJson(response, 404, { code: 'NOT_FOUND' });
});

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders });
  response.end(JSON.stringify(body));
}

async function waitReady(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* Vite is still starting. */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw new Error('Local web server readiness failed');
}

async function main() {
  await new Promise((resolveListen, rejectListen) => {
    api.once('error', rejectListen);
    api.listen(apiPort, '127.0.0.1', resolveListen);
  });
  vite = spawn(process.execPath, [join(webRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: webRoot,
    env: { ...process.env, VITE_TURNSTILE_SITE_KEY: 'test-turnstile-site-key', JIUXIAO_API_TARGET: `http://127.0.0.1:${apiPort}` },
    stdio: 'pipe',
    windowsHide: true,
  });
  vite.stdout.on('data', () => {});
  vite.stderr.on('data', data => process.stderr.write(data));
  await waitReady(origin);
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const browserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await browserContext.newPage();
    await page.addInitScript(() => {
      window.turnstile = {
        render(_container, options) {
          queueMicrotask(() => options.callback('test-captcha-token-1234567890'));
          return 'test-widget';
        },
        remove() {},
      };
    });

    await page.goto(`${origin}/settings/cloud`);
    await page.getByRole('heading', { name: '云档', exact: true }).waitFor();
    await page.getByRole('button', { name: '手机号验证码', exact: true }).waitFor();
    await page.getByRole('button', { name: '手机号验证码', exact: true }).click();
    await page.getByLabel(/手机号（国际格式/).fill('+14155550100');
    const sendSms = page.getByRole('button', { name: '发送短信验证码', exact: true });
    await sendSms.waitFor({ state: 'visible' });
    for (let i = 0; i < 40 && !(await sendSms.isEnabled()); i++) await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
    assert.equal(await sendSms.isEnabled(), true, 'Turnstile success should enable SMS request');
    await sendSms.click();
    await page.getByText('短信验证码已请求；请在验证码有效期内完成登录。', { exact: true }).waitFor();
    assert.deepEqual(phoneCodeRequests, [{ phone: '+14155550100', captchaToken: 'test-captcha-token-1234567890' }]);

    await page.getByLabel('短信验证码', { exact: true }).fill('123456');
    await page.getByRole('button', { name: '手机号登录', exact: true }).click();
    await page.getByText('已登录。', { exact: true }).waitFor();
    await page.getByText('手机号：已绑定（号码不在此页面保存或展示）。解绑需要重新验证当前邮箱。', { exact: true }).waitFor();
    await page.getByText('phone-user@example.invalid', { exact: true }).waitFor();

    phoneProviderEnabled = false;
    const closedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const closedPage = await closedContext.newPage();
    await closedPage.goto(`${origin}/settings/cloud`);
    await closedPage.getByText('手机号登录当前关闭；可使用邮箱登录。', { exact: true }).waitFor();
    assert.equal(await closedPage.getByRole('button', { name: '手机号验证码', exact: true }).count(), 0);
    await closedContext.close(); await browserContext.close();
    console.log('Mocked login browser flow passed: Turnstile token, SMS request, phone OTP login, and fail-closed provider UI. No real provider behavior claimed.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  vite?.kill();
  api.close();
});
