#!/usr/bin/env node
// Real Chromium journey through the dev-only P2 review route. This never opens
// the production API gate and uses the candidate-authored prologue package.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const screenshotPath = join(root, 'docs/acceptance/2026-10-06/P2-gameplay-e2e.png');
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
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Vite server exited early: ${stderr()}`);
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

(async () => {
  assert.ok(existsSync(viteFile), 'Install workspace dependencies before the P2 gameplay E2E');
  mkdirSync(join(root, 'docs/acceptance/2026-10-06'), { recursive: true });
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  let stderr = '';
  const child = spawn(process.execPath, [viteFile, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: webRoot,
    env: { ...process.env, JIUXIAO_API_TARGET: 'http://127.0.0.1:1' },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE
    || (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
  let browser;
  try {
    await waitFor(origin, child, () => stderr);
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(`${origin}/new`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: '姓名' }).fill('验收行者');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('input[name="p2-memory-mode"][value="forgetting"]').check();
    await page.getByRole('button', { name: /保存角色并进入/ }).click();
    await page.getByTestId('p2-review-gameplay').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByRole('button', { name: '观察渡船' }).click();
    assert.equal(await page.getByTestId('p2-action-input').inputValue(), '观察渡船');
    await page.getByRole('button', { name: '提交行动' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '1', null, { timeout: 15_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-narrative"]')?.textContent.includes('渡槽淤了半尺'), null, { timeout: 15_000 });

    const saveId = new URL(page.url()).pathname.split('/').at(-1);
    assert.ok(saveId);
    const firstCommit = await page.evaluate(async id => {
      const store = await import('/src/authoritative-turn-store.ts');
      const runtimeModule = await import('/src/p2-review-gameplay-runtime.ts');
      const runtime = await runtimeModule.loadP2ReviewGameplayRuntime();
      const [save, chain, replay, archive] = await Promise.all([
        store.readLocalAuthoritativeSave(id),
        store.verifyLocalEventChain(id),
        store.verifyLocalReplay(id, runtime.reduce),
        store.exportLocalAuthorityArchive(id, runtime.reduce),
      ]);
      return {
        save,
        chain,
        replay,
        receipt: archive?.receipts.find(row => row.receipt.decision.status === 'accepted')?.receipt ?? null,
      };
    }, saveId);
    assert.equal(firstCommit.save?.revision, 1);
    assert.equal(firstCommit.save?.memoryMode, 'forgetting');
    assert.equal(firstCommit.save?.memoryPolicy?.retrievalVersion, 'forgetting-v1');
    assert.equal(firstCommit.chain.valid, true);
    assert.equal(firstCommit.chain.eventCount, 1);
    assert.equal(firstCommit.replay.valid, true);
    assert.equal(firstCommit.receipt?.decision.status, 'accepted');
    assert.equal(firstCommit.receipt?.decision.events[0]?.type, 'observe.result');
    const canonBytes = readFileSync(join(root, 'packages/content/src/canon-runtime.json'));
    const actualCanonHash = `sha256:${createHash('sha256').update(canonBytes).digest('hex')}`;
    assert.equal(firstCommit.save.canonArtifactHash, actualCanonHash, 'Save hash must match exact canon-runtime.json bytes');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('p2-review-gameplay').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '1', null, { timeout: 15_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-narrative"]')?.textContent.includes('渡槽淤了半尺'), null, { timeout: 15_000 });
    assert.match(await page.getByTestId('p2-status').textContent(), /存档、事件链与规则回放均已核对/);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await page.getByTestId('p2-action-input').fill('去那边');
    await page.getByRole('button', { name: '提交行动' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-status"]')?.textContent.includes('澄清回执已保存'), null, { timeout: 15_000 });
    assert.equal(await page.getByTestId('p2-revision').textContent(), '1');
    assert.equal(await page.getByTestId('p2-event-count').textContent(), '1');

    await page.getByTestId('p2-action-input').fill('去芦花渡');
    await page.getByRole('button', { name: '提交行动' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-status"]')?.textContent.includes('行动被规则拒绝'), null, { timeout: 15_000 });
    assert.equal(await page.getByTestId('p2-revision').textContent(), '1');
    assert.equal(await page.getByTestId('p2-event-count').textContent(), '1');
    assert.match(await page.getByTestId('p2-receipt').textContent(), /ENV_ROUTE_NOT_CONNECTED/);

    const finalLedger = await page.evaluate(async id => {
      const store = await import('/src/authoritative-turn-store.ts');
      const runtimeModule = await import('/src/p2-review-gameplay-runtime.ts');
      const runtime = await runtimeModule.loadP2ReviewGameplayRuntime();
      const [save, chain, replay, archive] = await Promise.all([
        store.readLocalAuthoritativeSave(id), store.verifyLocalEventChain(id),
        store.verifyLocalReplay(id, runtime.reduce), store.exportLocalAuthorityArchive(id, runtime.reduce),
      ]);
      const records = archive?.receipts.map(row => row.receipt) ?? [];
      return {
        revision: save?.revision,
        gameMinute: save?.state.facts.gameMinute,
        chain,
        replay,
        receiptStatuses: records.map(receipt => receipt.decision.status),
        eventCounts: records.map(receipt => receipt.decision.status === 'accepted' ? receipt.decision.events.length : 0),
        rawTextStored: JSON.stringify(records).includes('去那边'),
      };
    }, saveId);
    assert.equal(finalLedger.revision, 1);
    assert.equal(finalLedger.chain.valid, true);
    assert.equal(finalLedger.chain.eventCount, 1);
    assert.equal(finalLedger.replay.valid, true);
    assert.ok(finalLedger.receiptStatuses.includes('accepted'));
    assert.ok(finalLedger.receiptStatuses.includes('clarify'));
    assert.ok(finalLedger.receiptStatuses.includes('rejected'));
    assert.equal(finalLedger.rawTextStored, false, 'Clarification receipt must not store the raw utterance');
    assert.deepEqual(pageErrors, []);

    process.stdout.write(`${JSON.stringify({
      journey: 'create -> parsed observe -> committed narration -> refresh restore -> clarify -> reject',
      revision: finalLedger.revision,
      gameMinute: finalLedger.gameMinute,
      eventCount: finalLedger.chain.eventCount,
      chainValid: finalLedger.chain.valid,
      replayValid: finalLedger.replay.valid,
      receiptStatuses: finalLedger.receiptStatuses,
      canonArtifactHash: actualCanonHash,
      screenshot: screenshotPath,
      pageErrors: pageErrors.length,
    }, null, 2)}\n`);
    await context.close();
  } finally {
    await browser?.close();
    await stop(child);
  }
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
