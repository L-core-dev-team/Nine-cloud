#!/usr/bin/env node
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { chromium } = require('playwright');
const { runDesignAcceptance } = require('./design-acceptance.cjs');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const webPort = 15174;
const viteFile = join(webRoot, 'node_modules/vite/bin/vite.js');
const children = [];

async function ready(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

(async () => {
  assertBuild();
  const server = spawn(process.execPath, [viteFile, 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: webRoot, stdio: 'inherit', windowsHide: true,
  });
  children.push(server);
  await ready(`http://127.0.0.1:${webPort}/`);
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    await runDesignAcceptance(browser, `http://127.0.0.1:${webPort}`, join(root, 'test-results/e2e'));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { for (const child of children) child.kill(); });

function assertBuild() {
  assert(existsSync(join(webRoot, 'dist/index.html')) && existsSync(viteFile), 'Run pnpm build before design acceptance');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
