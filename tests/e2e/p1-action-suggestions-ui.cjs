#!/usr/bin/env node
// Browser integration check for the authenticated gameplay affordance.
// The viewport is emulated; this is not physical-device evidence.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { existsSync } = require('node:fs');
const net = require('node:net');
const { join, resolve } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const viteFile = join(webRoot, 'node_modules/vite/bin/vite.js');

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitFor(url, child, stderr) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`P1 UI preview exited early: ${stderr()}`);
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}: ${stderr()}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  if (await Promise.race([exited.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 5_000))])) return;
  const killed = once(child, 'exit');
  child.kill('SIGKILL');
  await killed;
}

function mockSave() {
  const digest = `sha256:${'a'.repeat(64)}`;
  const memoryPolicy = {
    mode: 'continue', policyVersion: 'p1-memory-policy-v1', schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1', policyArtifactHash: digest,
    cueDictionaryHash: digest, normalizerVersion: 'cue-normalizer-v1',
    retrievalVersion: 'continue-v1', visibilityPolicyVersion: 'visibility-v1',
    visibilityPolicyHash: digest, createdAtRevision: 0,
  };
  return {
    schemaVersion: 2, saveId: 'save-ui-p1', canonVersion: 'candidate-canon-v1',
    ruleVersion: 'p1-review-rules-v1', memoryPolicyVersion: memoryPolicy.policyVersion,
    memoryMode: 'continue', memoryPolicy, revision: 0,
    state: { playerId: 'player-ui-p1', locationId: 'loc_luhuadu', elapsedMinutes: 0,
      facts: { gameMinute: 300 } },
  };
}

(async () => {
  assert.ok(existsSync(viteFile), 'Run pnpm build before pnpm test:e2e');
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  let child;
  let childStderr = '';
  let browser;
  try {
    child = spawn(process.execPath, [viteFile, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: webRoot, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    });
    child.stderr.on('data', chunk => { childStderr += chunk.toString(); });
    await waitFor(`${origin}/`, child, () => childStderr);

    const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const save = mockSave();
    await page.route('**/api/auth/session', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ account: { id: 'owner-ui-p1', email: 'owner-ui-p1@example.invalid' } }) }));
    await page.route('**/api/saves', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ saves: [save] }) }));
    await page.route('**/api/games/save-ui-p1/action-suggestions', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 0, actions: [
        { id: 'move:loc_wangqitai', kind: 'move', label: '前往望气台', text: '去望气台' },
      ] }) }));

    await page.goto(`${origin}/turns`, { waitUntil: 'domcontentloaded' });
    const savePicker = page.locator('select').first();
    await savePicker.selectOption('save-ui-p1', { timeout: 3_000 });
    const startedAt = Date.now();
    const suggestion = page.getByRole('button', { name: '前往望气台' });
    await suggestion.waitFor({ state: 'visible', timeout: 3_000 });
    const visibleMs = Date.now() - startedAt;
    assert.ok(visibleMs <= 3_000, `first state-derived action took ${visibleMs} ms`);
    await suggestion.click();
    assert.equal(await page.locator('select').nth(1).inputValue(), 'free_text');
    assert.equal(await page.getByRole('textbox', { name: '行动意图' }).inputValue(), '去望气台');
    console.log(`P1 action suggestion UI passed at emulated 390x844: visible in ${visibleMs} ms; selected suggestion remained editable free text.`);
    console.log('This browser viewport test does not satisfy the separate 15-minute physical-device acceptance gate.');
  } finally {
    await browser?.close();
    await stop(child);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
