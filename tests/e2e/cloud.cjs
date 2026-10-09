#!/usr/bin/env node
// Real API + ephemeral PostgreSQL + local Mailpit. No mock auth, real mailbox or production data.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { connect, createServer } = require('node:net');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../..'); const children = [];
let apiPort, webPort, origin;
const mailApi = process.env.MAILPIT_API_URL || 'http://127.0.0.1:18025';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(mailApi).hostname), 'Use a local isolated Mailpit only');
execFileSync(process.execPath, [join(root, 'scripts/assert-test-database.mjs')], { stdio: 'inherit' });
async function availablePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('Could not reserve a local test port')); return; }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}
function run(file, args, cwd, env) {
  const child = spawn(process.execPath, [file, ...args], { cwd, env: { ...process.env, ...env }, stdio: 'pipe', windowsHide: true });
  child.stdout.on('data', () => {}); child.stderr.on('data', data => process.stderr.write(data)); children.push(child);
}
async function ready(url) { for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error('Local service readiness failed'); }
async function readySmtp(host, port) {
  assert.ok(['127.0.0.1', 'localhost'].includes(host), 'Use a loopback SMTP service only');
  for (let i = 0; i < 100; i++) {
    const connected = await new Promise(resolve => {
      const socket = connect({ host, port });
      let settled = false; let greeting = '';
      const finish = value => { if (settled) return; settled = true; socket.destroy(); resolve(value); };
      socket.setTimeout(250);
      socket.on('data', chunk => {
        greeting += chunk.toString('ascii');
        if (greeting.includes('\n')) finish(/^220[ -]/.test(greeting));
      });
      socket.once('error', () => finish(false));
      socket.once('timeout', () => finish(false));
    });
    if (connected) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Local SMTP readiness failed');
}
async function login(page, email) {
  await page.goto(`${origin}/settings/cloud`); await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  try { await page.getByText('验证码已发送，10 分钟内有效。', { exact: true }).waitFor(); }
  catch (error) { console.error('Isolated login notice:', await page.getByRole('status').allTextContents()); throw error; }
  let code;
  for (let i = 0; i < 40; i++) {
    const response = await fetch(`${mailApi}/api/v1/message/latest`);
    if (response.ok) { const mail = await response.json(); if (mail.To?.some(to => to.Address === email)) code = mail.Text?.match(/验证码：(\d{6})/)?.[1]; }
    if (code) break; await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(code, 'Test SMTP delivery must reach the isolated inbox');
  await page.getByLabel('验证码', { exact: true }).fill(code); await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByText('已登录。', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), await page.evaluate(() => document.documentElement.clientWidth), 'Cloud mobile page must not overflow horizontally');
}
async function latestCode(email) {
  for (let i=0;i<40;i++) { const response=await fetch(`${mailApi}/api/v1/message/latest`);if(response.ok){const mail=await response.json();const code=mail.To?.some(to=>to.Address===email)&&mail.Text?.match(/验证码：(\d{6})/)?.[1];if(code)return code;}await new Promise(r=>setTimeout(r,100)); }
  throw new Error('Isolated account-operation SMTP delivery failed');
}
(async () => {
  apiPort = await availablePort(); webPort = await availablePort(); origin = `http://127.0.0.1:${webPort}`;
  await ready(`${mailApi}/api/v1/info`);
  const smtp = new URL(process.env.TEST_SMTP_URL || 'smtp://127.0.0.1:11025');
  await readySmtp(smtp.hostname, Number(smtp.port || 587));
  run(join(root, 'apps/api/dist/index.js'), [], root, { API_PORT: String(apiPort), DATABASE_URL: process.env.TEST_DATABASE_URL,
    // This path really does deliver: the login flow reads the six-digit code back
    // out of the isolated Mailpit inbox. The runtime defaults to the Tencent SES
    // API, so SMTP has to be requested explicitly or the API refuses to start
    // and none of the mail assertions below would ever be exercised.
    AUTH_ENABLED: 'true', AUTH_MAILER: 'smtp', AUTH_PUBLIC_ORIGIN: origin, AUTH_SECRET: randomUUID() + randomUUID(), AUTH_MAIL_FROM: 'test@example.invalid', SMTP_URL: process.env.TEST_SMTP_URL || 'smtp://127.0.0.1:11025' });
  run(join(root, 'apps/web/node_modules/vite/bin/vite.js'), ['preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], join(root, 'apps/web'), { JIUXIAO_API_TARGET: `http://127.0.0.1:${apiPort}` });
  await ready(`http://127.0.0.1:${apiPort}/ready`); await ready(origin);
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const a = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await a.newPage();
    const local = { schemaVersion: 1, saveId: `cloud-e2e-${randomUUID()}`, name: '原始手机存档', createdAt: '2026-10-01', updatedAt: '2026-10-01', revision: 7,
      canonVersion: 'test-canon', ruleVersion: 'not-signed', memoryPolicyVersion: 'test-memory', character: { name: '原始角色', apiKey: 'never-upload-this-key' }, location: 'gate', status: 'pending_rules', messages: ['完整旧剧情'] };
    await page.addInitScript(save => { if (!localStorage.getItem('jiuxiao_1_local_saves')) localStorage.setItem('jiuxiao_1_local_saves', JSON.stringify([save])); }, local);
    await login(page, `a-${randomUUID()}@example.invalid`);
    await a.setOffline(true); await page.getByRole('button', { name: '备份到云端', exact: true }).click();
    await page.getByText(/操作未完成/).waitFor(); await page.getByRole('button', { name: '取消待上传', exact: true }).waitFor();
    await a.setOffline(false); await page.reload(); await page.getByRole('button', { name: '重试待上传', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已上传 1 份；0 份失败，0 份需核对冲突。' }).waitFor();
    const remote = await page.evaluate(async () => (await (await fetch('/api/saves')).json()).saves[0]);
    assert.equal(remote.revision, 0); assert.equal(remote.state.facts.localArchive.revision, 7);
    assert.ok(!JSON.stringify(remote).includes('never-upload-this-key'));
    await page.reload(); await page.getByRole('button', { name: '恢复为本地副本', exact: true }).waitFor();
    const b = await browser.newContext({ viewport: { width: 430, height: 932 } }); const pageB = await b.newPage();
    await login(pageB, `b-${randomUUID()}@example.invalid`);
    assert.equal(await pageB.getByRole('button', { name: '恢复为本地副本', exact: true }).count(), 0);
    assert.equal(await pageB.evaluate(async id => (await fetch(`/api/saves/${encodeURIComponent(id)}`)).status, remote.saveId), 404);
    const secondDevice = await browser.newContext({ viewport: { width: 393, height: 852 } }); await secondDevice.addCookies(await a.cookies());
    const pageC = await secondDevice.newPage(); await pageC.goto(`${origin}/settings/cloud`); await pageC.getByRole('button', { name: '恢复为本地副本', exact: true }).click();
    await pageC.getByText(/后续备份仍绑定此云档/).waitFor();
    const next = { ...remote, revision: 1, state: { ...remote.state, facts: { ...remote.state.facts, cloudMutationId: randomUUID(), localArchive: { ...remote.state.facts.localArchive, name: '另一台设备修改' } } } };
    assert.equal(await pageC.evaluate(async input => (await fetch(`/api/saves/${encodeURIComponent(input.save.saveId)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })).status, { expectedRevision: 0, save: next }), 200);
    await page.getByRole('button', { name: '备份到云端', exact: true }).click(); await page.getByRole('button', { name: '云端另存本地副本', exact: true }).waitFor();
    await page.getByRole('button', { name: '云端另存本地副本', exact: true }).click(); await page.getByText('云端版本已另存本地副本，原档保留。', { exact: true }).waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves')));
    assert.equal(saved.length, 2); assert.equal(saved.find(s => s.saveId === local.saveId).name, local.name); assert.ok(saved.some(s => s.name.includes('另一台设备修改')));
    const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '导出云档', exact: true }).click();
    const download = await downloadPromise; const exported = readFileSync(await download.path(), 'utf8');
    assert.equal(JSON.parse(exported).save.name, '另一台设备修改'); assert.ok(!exported.includes('never-upload-this-key'));
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '删除云档', exact: true }).click();
    await page.getByText('云档已移至回收区，本地档与待上传队列保留。', { exact: true }).waitFor();
    assert.equal(await page.evaluate(async id => (await fetch(`/api/saves/${encodeURIComponent(id)}`)).status, remote.saveId), 404);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves'))), saved);
    await page.getByRole('button', { name: '恢复删除的云档', exact: true }).click();
    await page.getByText('完整性校验通过，云档已恢复。', { exact: true }).waitFor();
    const recovered = await page.evaluate(async id => (await (await fetch(`/api/saves/${encodeURIComponent(id)}`)).json()).save, remote.saveId);
    assert.equal(recovered.revision, 3); assert.deepEqual(recovered.state, next.state);
    const accountBefore = await page.evaluate(async()=>(await(await fetch('/api/auth/session')).json()).account);
    const accountDownloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出账号全部资料',exact:true}).click();
    const accountDownload=await accountDownloadPromise;const accountText=readFileSync(await accountDownload.path(),'utf8');const accountBundle=JSON.parse(accountText);
    assert.equal(accountBundle.account.id,accountBefore.id);assert.equal(accountBundle.client.independentLocalSaves.length,2);assert.ok(accountBundle.data.saves.some(row=>row.id===remote.saveId));assert.ok(!accountText.includes('never-upload-this-key'));assert.ok(!accountText.includes('session_hash'));
    const newEmail=`changed-${randomUUID()}@example.invalid`;await page.getByLabel('新邮箱',{exact:true}).fill(newEmail);await page.getByRole('button',{name:'验证旧邮箱',exact:true}).click();
    await page.getByText('验证码已发送到旧邮箱。',{exact:true}).waitFor();
    await page.getByLabel('旧邮箱操作验证码',{exact:true}).fill(await latestCode(accountBefore.email));await page.getByRole('button',{name:'核验操作验证码',exact:true}).click();
    await page.getByText('旧邮箱验证通过，验证码已发送到新邮箱。',{exact:true}).waitFor();
    await page.getByLabel('新邮箱操作验证码',{exact:true}).fill(await latestCode(newEmail));await page.getByRole('button',{name:'核验操作验证码',exact:true}).click();
    await page.getByLabel('输入 CHANGE_EMAIL',{exact:true}).fill('CHANGE_EMAIL');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'最终确认账户操作',exact:true}).click();
    await page.getByText('账户操作完成，所有会话已退出。本机独立存档保留。',{exact:true}).waitFor();
    assert.equal(await pageC.evaluate(async()=>(await fetch('/api/auth/session')).status),401);await login(page,newEmail);
    assert.equal((await page.evaluate(async()=>(await(await fetch('/api/auth/session')).json()).account)).id,accountBefore.id);
    const output = join(root, 'test-results/cloud'); mkdirSync(output, { recursive: true });
    await page.screenshot({ path: join(output, 'cloud-conflict-390.png'), fullPage: true });
    writeFileSync(join(output, 'report.json'), JSON.stringify({ kind: 'isolated-smtp-postgres-browser', viewports: [[390,844],[430,932],[393,852]], checks: ['SMTP login', 'offline queue survives reload', 'redacted archive roundtrip', 'two-account read refusal', 'two-device CAS conflict', 'restore preserves local original', 'redacted cloud download', 'soft deletion preserves local saves', 'verified backup restoration', 'full account export excludes credentials', 'old then new email proof', 'email change revokes other device session', 'new email login keeps same owner'] }, null, 2));
    await a.close(); await b.close(); await secondDevice.close();
    console.log('Isolated SMTP/PostgreSQL cloud browser path passed; no real account or provider acceptance claimed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { for (const child of children) child.kill(); });
