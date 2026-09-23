#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const apiPort = 18787;
const webPort = 15173;
const children = [];

function run(script, args, cwd, env = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd, env: { ...process.env, ...env }, stdio: 'pipe', windowsHide: true,
  });
  children.push(child);
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  return child;
}

async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

(async () => {
  const apiFile = join(root, 'apps/api/dist/index.js');
  const viteFile = join(webRoot, 'node_modules/vite/bin/vite.js');
  assert.ok(existsSync(apiFile) && existsSync(viteFile), 'Run pnpm build before test:e2e');
  run(apiFile, [], root, { API_PORT: String(apiPort) });
  run(viteFile, ['preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], webRoot);
  const response = await ready(`http://127.0.0.1:${apiPort}/health`);
  assert.equal((await response.json()).saveSchemaVersion, 1);
  await ready(`http://127.0.0.1:${webPort}/`);
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    for (const [width, height] of [[390, 844], [1366, 768]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`http://127.0.0.1:${webPort}/`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      assert.equal(await page.locator('h1').innerText(), '先看见路，\n再踏入世界。');
      assert.ok((await page.locator('body').innerText()).includes('新开一局'));
      assert.ok((await page.locator('body').innerText()).includes('阅读世界设定'));
      await page.getByRole('button', { name: '新开一局' }).click();
      assert.equal(await page.locator('h2').innerText(), '把自己写进山门。');
      assert.equal(await page.locator('input').count(), 7);
      assert.equal(await page.locator('select').count(), 1);
      assert.equal(await page.locator('textarea').count(), 2);
      await page.locator('input').nth(0).fill(`测试修士-${width}`);
      await page.getByRole('button', { name: '保存角色并进入' }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`);
      assert.ok((await page.locator('body').innerText()).includes('待规则接入'));
      await page.goto(`http://127.0.0.1:${webPort}/`);
      assert.ok((await page.locator('body').innerText()).includes('继续游玩'));
      await page.getByRole('button', { name: '继续游玩' }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`);
      await page.goto(`http://127.0.0.1:${webPort}/`);
      await page.getByRole('button', { name: '阅读世界设定' }).click();
      assert.equal(await page.locator('h2').innerText(), '世界设定');
      await page.goto(`http://127.0.0.1:${webPort}/settings/ai`);
      assert.equal(await page.locator('h2').innerText(), '青鱼推荐配置');
      assert.equal(await page.locator('.roles .role-field').count(), 5);
      await page.getByRole('button', { name: '填入候选值' }).click();
      await page.getByRole('button', { name: '保存当前会话配置' }).click();
      assert.ok((await page.locator('body').innerText()).includes('请填写实际 Model ID'));
      for (let index = 0; index < 5; index += 1) {
        await page.locator('.roles .role-field input').nth(index).fill(`provider/model-${index}`);
      }
      await page.getByRole('button', { name: '保存当前会话配置' }).click();
      assert.ok((await page.locator('body').innerText()).includes('已保存到当前浏览器会话'));
      assert.ok((await page.locator('body').innerText()).includes('契约 v1'));
      await page.goto(`http://127.0.0.1:${webPort}/`);
      await page.getByRole('button', { name: '菜单' }).click();
      const importInput = page.locator('aside input[type="file"]');
      const legacyJson = JSON.stringify({ messages: [{ role: 'user', content: '旧档正文' }], status: '姓名：迁移修士' });
      const [backup] = await Promise.all([
        page.waitForEvent('download'),
        importInput.setInputFiles({ name: 'legacy-chat.json', mimeType: 'application/json', buffer: Buffer.from(legacyJson) }),
      ]);
      assert.ok(backup.suggestedFilename().startsWith('九霄-导入前原文备份-'));
      assert.equal(await page.locator('h2').innerText(), '导入旧局');
      await page.goto(`http://127.0.0.1:${webPort}/`);
      assert.ok((await page.locator('body').innerText()).includes('继续游玩'));
      await page.close();
    }
  } finally { await browser.close(); }
  console.log('S2 navigation, character save/continue, API smoke passed at mobile and desktop viewports');
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { for (const child of children) child.kill(); });
