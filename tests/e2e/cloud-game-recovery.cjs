#!/usr/bin/env node
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const saveId = 'ui-recovery-contract';
const evidence = join(root, 'docs/acceptance/2026-10-12/evidence/390-night-cloud-recovery.png');
let server;

async function startDevServer() {
  if (process.env.UI_BASE_URL) return process.env.UI_BASE_URL;
  const port = await new Promise(resolvePort => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => {
      const selectedPort = socket.address().port;
      socket.close(() => resolvePort(selectedPort));
    });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe',
  });
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) return url; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error('Cloud game recovery development server did not start');
}

(async () => {
  const base = await startDevServer();
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  const requests = [];
  const committedEventIds = new Set();
  let save = {
    schemaVersion: 1, saveId, canonVersion: 'canon-fixture-v1', ruleVersion: 'rules-fixture-v1',
    memoryPolicyVersion: 'legacy-unknown', revision: 0,
    state: { playerId: 'fixture-player', locationId: 'mountain-gate', elapsedMinutes: 0, facts: { gameMinute: 0 } },
  };
  let receipt;

  page.on('pageerror', error => pageErrors.push(error.message));
  await context.route('**/api/games/ui-recovery-contract**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' && pathname === `/api/games/${saveId}`) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ save }) });
    }
    if (request.method() === 'GET' && pathname === `/api/games/${saveId}/action-suggestions`) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: [] }) });
    }
    if (request.method() === 'POST' && pathname === `/api/games/${saveId}/turns`) {
      const body = request.postDataJSON();
      requests.push(body);
      if (requests.length === 1) {
        // Simulate the commit succeeding while the response is lost in transit.
        const eventId = '1555c113-e841-4d0d-ae4c-6f219273ae72';
        committedEventIds.add(eventId);
        save = { ...save, revision: 1, state: { ...save.state, elapsedMinutes: 1, facts: { ...save.state.facts, gameMinute: 1 } } };
        const event = {
          id: eventId, saveId, type: 'CLOCK_ADVANCED', beforeRevision: 0, afterRevision: 1,
          occurredAt: '2026-10-12T00:00:00.000Z', source: 'RULES', ruleVersion: 'rules-fixture-v1', branchId: 'root',
          payload: { action: 'fixture-recovery' },
        };
        receipt = {
          idempotencyKey: body.idempotencyKey, saveId, requestFingerprint: `sha256:v1:${'a'.repeat(64)}`,
          branchId: 'root', rulesVersion: 'rules-fixture-v1', clockMinute: 1, rng: { seed: null, draws: 0 },
          decision: { status: 'accepted', outcome: 'success', events: [event], nextRevision: 1 }, resultingRevision: 1,
        };
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'TURN_UNAVAILABLE' }) });
      }
      assert.equal(body.idempotencyKey, receipt.idempotencyKey, 'recovery must use the original request key');
      assert.equal(body.text, requests[0].text, 'recovery must retain the exact original action');
      assert.equal(body.expectedRevision, requests[0].expectedRevision, 'recovery must retain the original revision');
      assert.equal(body.requestNarrative, false, 'recovery must not request a second generated narrative');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ receipt, narrative: { status: 'not_requested' } }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  try {
    await page.goto(`${base}/game/${saveId}`, { waitUntil: 'networkidle' });
    await page.getByTestId('p2-action-input').waitFor({ state: 'visible' });
    await page.getByTestId('p2-action-input').fill('沿山路走到石阶旁');
    await page.getByTestId('p2-submit-action').click();
    await page.getByRole('button', { name: '核对本次提交' }).waitFor({ state: 'visible' });
    assert.match(await page.getByTestId('p2-status').innerText(), /服务器暂时无法确认这次行动/);
    assert.equal(await page.getByTestId('p2-action-input').inputValue(), '沿山路走到石阶旁', 'uncertain submit must preserve the action text');

    await page.getByRole('button', { name: '核对本次提交' }).click();
    await page.getByTestId('p2-receipt').waitFor({ state: 'visible' });
    await page.getByTestId('p2-status').getByText(/行动已确认，当前存档已同步/).waitFor();
    assert.equal(await page.getByTestId('p2-revision').innerText(), '1');
    assert.equal(requests.length, 2, 'one original submit and one explicit reconciliation are expected');
    assert.equal(requests[0].requestNarrative, true);
    assert.deepEqual([...committedEventIds], ['1555c113-e841-4d0d-ae4c-6f219273ae72'], 'the mock server must commit one event for both requests');
    assert.equal(await page.getByTestId('p2-narrative').innerText(), '行动已确认。');
    const visibleText = await page.locator('body').innerText();
    assert.doesNotMatch(visibleText, /TURN_UNAVAILABLE|CLOUD_503|INVALID_CLOUD_RESPONSE/);
    assert.deepEqual(pageErrors, [], `the recovery route must have no browser errors: ${pageErrors.join('; ')}`);

    mkdirSync(join(root, 'docs/acceptance/2026-10-12/evidence'), { recursive: true });
    const screenshot = await page.screenshot({ path: evidence, fullPage: true, animations: 'disabled' });
    const guardedCases = [];
    for (const scenario of ['refresh-failure', 'foreign-save', 'foreign-key', 'version-mismatch', 'recovery-gate', 'missing-after-refresh']) {
      const scenarioContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const scenarioPage = await scenarioContext.newPage();
      const posts = [];
      let committed = false;
      let refreshFails = scenario === 'refresh-failure';
      await scenarioContext.route('**/api/games/ui-recovery-contract**', route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const fulfill = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (request.method() === 'GET' && pathname === `/api/games/${saveId}`) {
          if (committed && scenario === 'missing-after-refresh') return fulfill(404, { code: 'NOT_FOUND' });
          if (committed && refreshFails) return fulfill(503, { code: 'SAVE_UNAVAILABLE' });
          return fulfill(200, { save: { ...save, revision: committed ? 1 : 0 } });
        }
        if (pathname.endsWith('/action-suggestions')) return fulfill(200, { actions: [] });
        if (request.method() === 'POST') {
          const body = request.postDataJSON();
          posts.push(body);
          if (scenario === 'version-mismatch') return fulfill(409, { code: 'VERSION_MISMATCH' });
          const ack = { ...receipt, idempotencyKey: body.idempotencyKey };
          if (scenario === 'recovery-gate' && posts.length < 3) {
            committed = true;
            return fulfill(503, { code: posts.length === 1 ? 'TURN_UNAVAILABLE' : 'RULES_NOT_READY' });
          }
          if (posts.length === 1 && scenario === 'foreign-save') return fulfill(200, { receipt: { ...ack, saveId: 'another-save' } });
          if (posts.length === 1 && scenario === 'foreign-key') return fulfill(200, { receipt: { ...ack, idempotencyKey: 'f8933fbe-8a31-4118-90c7-fde308a0048f' } });
          committed = true;
          return fulfill(200, { receipt: ack });
        }
        return fulfill(404, { code: 'NOT_FOUND' });
      });
      try {
        await scenarioPage.goto(`${base}/game/${saveId}`, { waitUntil: 'networkidle' });
        await scenarioPage.getByTestId('p2-action-input').fill('继续沿石阶前行');
        await scenarioPage.getByTestId('p2-submit-action').click();
        if (scenario === 'refresh-failure') {
          await scenarioPage.getByTestId('p2-status').getByText(/最新存档暂未刷新/).waitFor();
          assert.equal(await scenarioPage.getByTestId('p2-submit-action').isDisabled(), true, 'a stale snapshot must not permit another turn');
          assert.equal(await scenarioPage.getByTestId('p2-receipt').count(), 1, 'a refresh failure must retain the confirmed receipt');
          refreshFails = false;
          await scenarioPage.getByRole('button', { name: '重新读取存档', exact: true }).click();
          await scenarioPage.waitForFunction(() => !document.querySelector('[data-testid="p2-action-input"]').disabled);
          assert.equal(await scenarioPage.getByTestId('p2-revision').innerText(), '1');
          assert.equal(posts.length, 1, 'refreshing a confirmed result must not resubmit the action');
        } else if (scenario === 'missing-after-refresh') {
          await scenarioPage.getByRole('heading', { name: '找不到这份存档', exact: true }).waitFor();
          assert.equal(await scenarioPage.getByTestId('p2-revision').count(), 0, 'a no-longer-readable save must not retain the previous account snapshot on screen');
          assert.equal(await scenarioPage.getByTestId('p2-receipt').count(), 0);
          assert.equal(await scenarioPage.getByRole('button', { name: '回到首页', exact: true }).isVisible(), true);
        } else if (scenario === 'version-mismatch') {
          await scenarioPage.getByRole('button', { name: '查看存档列表', exact: true }).waitFor();
          assert.equal(await scenarioPage.getByTestId('p2-submit-action').isDisabled(), true);
          assert.equal(await scenarioPage.getByTestId('p2-action-input').inputValue(), '继续沿石阶前行');
          await scenarioPage.getByRole('button', { name: '查看存档列表', exact: true }).click();
          await scenarioPage.waitForURL('**/lobby');
        } else if (scenario === 'recovery-gate') {
          await scenarioPage.getByRole('button', { name: '核对本次提交', exact: true }).click();
          await scenarioPage.getByTestId('p2-status').getByText(/服务器规则尚未就绪/).waitFor();
          assert.equal(await scenarioPage.getByTestId('p2-action-input').isDisabled(), true, 'a pre-settlement retry failure must retain the unknown original outcome');
          await scenarioPage.getByRole('button', { name: '核对本次提交', exact: true }).click();
          await scenarioPage.getByTestId('p2-status').getByText(/行动已确认，当前存档已同步/).waitFor();
          assert.equal(posts.length, 3);
          assert.ok(posts.every(post => post.idempotencyKey === posts[0].idempotencyKey));
          assert.equal(posts.filter(post => post.requestNarrative).length, 1);
        } else {
          await scenarioPage.getByRole('button', { name: '核对本次提交', exact: true }).waitFor();
          assert.equal(await scenarioPage.getByTestId('p2-receipt').count(), 0, 'a foreign receipt must not be displayed as this turn');
          assert.equal(await scenarioPage.getByTestId('p2-revision').innerText(), '0');
          await scenarioPage.getByRole('button', { name: '核对本次提交', exact: true }).click();
          await scenarioPage.getByTestId('p2-status').getByText(/行动已确认，当前存档已同步/).waitFor();
          assert.equal(posts[1].idempotencyKey, posts[0].idempotencyKey);
          assert.equal(posts[1].requestNarrative, false);
        }
        guardedCases.push(scenario);
      } finally { await scenarioContext.close(); }
    }
    console.log(JSON.stringify({
      result: 'PASS', viewport: '390x844', requests: requests.length,
      idempotencyKey: requests[0].idempotencyKey, committedEvents: committedEventIds.size,
      narrativeRequests: requests.filter(value => value.requestNarrative).length,
      finalRevision: save.revision, guardedCases, screenshot: evidence,
      screenshotSha256: createHash('sha256').update(screenshot).digest('hex').toUpperCase(),
    }, null, 2));
  } finally {
    await browser.close();
    if (server && !server.killed) server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
