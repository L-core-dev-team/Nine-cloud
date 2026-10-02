#!/usr/bin/env node
// Real API + ephemeral PostgreSQL + local Mailpit. No mock auth, real mailbox or production data.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../..'); const children = [];
const apiPort = 18788, webPort = 15174, origin = `http://127.0.0.1:${webPort}`;
const mailApi = process.env.MAILPIT_API_URL || 'http://127.0.0.1:18025';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(mailApi).hostname), 'Use a local isolated Mailpit only');
execFileSync(process.execPath, [join(root, 'scripts/assert-test-database.mjs')], { stdio: 'inherit' });
function run(file, args, cwd, env) {
  const child = spawn(process.execPath, [file, ...args], { cwd, env: { ...process.env, ...env }, stdio: 'pipe', windowsHide: true });
  child.stdout.on('data', () => {}); child.stderr.on('data', data => process.stderr.write(data)); children.push(child);
}
async function ready(url) { for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error('Local service readiness failed'); }
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
(async () => {
  await ready(`${mailApi}/api/v1/info`);
  run(join(root, 'apps/api/dist/index.js'), [], root, { API_PORT: String(apiPort), DATABASE_URL: process.env.TEST_DATABASE_URL,
    AUTH_ENABLED: 'true', AUTH_PUBLIC_ORIGIN: origin, AUTH_SECRET: randomUUID() + randomUUID(), AUTH_MAIL_FROM: 'test@example.invalid', SMTP_URL: process.env.TEST_SMTP_URL || 'smtp://127.0.0.1:11025' });
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
    await page.getByText('已重试队列。冲突需要逐项选择。', { exact: true }).waitFor();
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
    const output = join(root, 'test-results/cloud'); mkdirSync(output, { recursive: true });
    await page.screenshot({ path: join(output, 'cloud-conflict-390.png'), fullPage: true });
    writeFileSync(join(output, 'report.json'), JSON.stringify({ kind: 'isolated-smtp-postgres-browser', viewports: [[390,844],[430,932],[393,852]], checks: ['SMTP login', 'offline queue survives reload', 'redacted archive roundtrip', 'two-account read refusal', 'two-device CAS conflict', 'restore preserves local original', 'redacted cloud download', 'soft deletion preserves local saves', 'verified backup restoration'] }, null, 2));
    await a.close(); await b.close(); await secondDevice.close();
    console.log('Isolated SMTP/PostgreSQL cloud browser path passed; no real account or provider acceptance claimed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { for (const child of children) child.kill(); });
