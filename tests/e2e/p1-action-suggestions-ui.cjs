#!/usr/bin/env node
// Browser integration check for the authenticated gameplay affordance.
// The viewport is emulated; this is not physical-device evidence.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
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
    child = spawn(process.execPath, [viteFile, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: webRoot, env: { ...process.env, VITE_ENABLE_INTERNAL_TURN_WORKSPACE: 'true' },
      stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
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
    let committed = false;
    await page.route('**/api/saves/save-ui-p1', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ save: committed ? { ...save, revision: 1, state: { ...save.state, elapsedMinutes: 15,
        facts: { ...save.state.facts, gameMinute: 315 } } } : save }) }));
    await page.route('**/api/turns', async route => {
      const request = route.request().postDataJSON();
      const intent = request.intent;
      const eventId = '11111111-1111-4111-8111-111111111111';
      const receipt = {
        idempotencyKey: intent.idempotencyKey,
        saveId: intent.saveId,
        requestFingerprint: `sha256:v1:${createHash('sha256').update(canonical(intent)).digest('hex')}`,
        branchId: 'root', rulesVersion: save.ruleVersion, clockMinute: 315,
        rng: { seed: null, draws: 0 },
        decision: { status: 'accepted', outcome: 'success', nextRevision: 1, events: [{
          id: eventId, saveId: save.saveId, branchId: 'root', type: 'PLAYER_MOVED', beforeRevision: 0, afterRevision: 1,
          occurredAt: '2026-10-05T12:00:00.000Z', source: 'RULES', ruleVersion: save.ruleVersion,
          payload: { stateDelta: { timeChange: 15, locationChange: { before: 'loc_luhuadu', after: 'loc_wangqitai' }, factChanges: [] } },
        }] },
        resultingRevision: 1,
      };
      committed = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ receipt }) });
    });

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
    await page.getByRole('button', { name: '提交行动' }).click();
    const eventView = page.locator('[data-event-id="11111111-1111-4111-8111-111111111111"][data-state-revision="1"]');
    await eventView.waitFor({ state: 'visible', timeout: 3_000 });
    assert.match(await eventView.innerText(), /状态修订 1/);
    assert.match(await eventView.innerText(), /地点：loc_luhuadu → loc_wangqitai/);
    console.log(`P1 action suggestion UI passed at emulated 390x844: visible in ${visibleMs} ms; suggestion stayed editable. Receipt change is bound to event 11111111 and state revision 1.`);
    console.log('This browser viewport test does not satisfy the separate 15-minute physical-device acceptance gate.');
  } finally {
    await browser?.close();
    await stop(child);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error('INVALID_JSON');
  return result;
}
