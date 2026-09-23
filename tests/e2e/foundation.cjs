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
      assert.equal(await page.locator('h1').innerText(), '山门尚未开启');
      assert.equal(await page.locator('button').count(), 0, 'Unimplemented actions must not be advertised');
      assert.ok((await page.locator('body').innerText()).includes('存档契约版本 1'));
      await page.close();
    }
  } finally { await browser.close(); }
  console.log('S1 Web/API browser smoke passed at mobile and desktop viewports');
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { for (const child of children) child.kill(); });
