#!/usr/bin/env node
// Built-web gameplay journey through the authenticated API and real PostgreSQL
// turn transaction. The test-only review plugin supplies the approved rules.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, createHmac, randomBytes, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { once } = require('node:events');
const { existsSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const apiFile = join(root, 'apps/api/dist/index.js');
const pluginFile = join(root, 'apps/api/dist/services/p1-prologue-plugin.js');
const viteFile = join(webRoot, 'node_modules/vite/bin/vite.js');
const apiRequire = createRequire(join(root, 'apps/api/package.json'));
const { Pool } = apiRequire('pg');
const databaseUrl = process.env.TEST_DATABASE_URL;
const evidenceDir = join(root, 'test-results/e2e');

function assertTestDatabase() {
  const result = spawnSync(process.execPath, [join(root, 'scripts/assert-test-database.mjs')], {
    cwd: root, env: process.env, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || 'TEST_DATABASE_URL must name an isolated jiuxiao_test database');
}

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

async function waitFor(url, child, stderr, description) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`${description} exited early: ${stderr()}`);
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description} at ${url}: ${stderr()}`);
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
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL to an isolated jiuxiao_test database');
  assertTestDatabase();
  assert.ok(existsSync(apiFile) && existsSync(pluginFile) && existsSync(viteFile), 'Run pnpm build before pnpm test:e2e');
  assert.ok(existsSync(join(webRoot, 'dist/index.html')), 'Build the production web bundle before the P2 browser journey');
  mkdirSync(evidenceDir, { recursive: true });

  const pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3_000 });
  let ownerId = null;
  const authSecret = randomBytes(32).toString('hex');
  const guestRateLimitKey = createHmac('sha256', authSecret).update('guest-create\0' + '127.0.0.1').digest('hex');
  const apiPort = await availablePort();
  const webPort = await availablePort();
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const createdSaveIds = [];
  let accountSeeded = false;
  let otpRequestCount = 0;
  let expectedRequests = 0;
  let expectedEvents = 0;
  let apiChild;
  let webChild;
  let apiStderr = '';
  let webStderr = '';
  let browser;

  try {
    await pool.query('SELECT 1');

    apiChild = spawn(process.execPath, [apiFile], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: String(apiPort),
        AUTH_ENABLED: 'true', AUTH_PUBLIC_ORIGIN: webOrigin,
        AUTH_SECRET: authSecret,
        AUTH_MAIL_FROM: 'p2-test@example.invalid',
        // The runtime defaults to the Tencent SES API, so the SMTP transport has
        // to be named explicitly. This path only needs the API to boot — mail is
        // never sent — so the unreachable port stays: startup must not depend on
        // a reachable mail server.
        AUTH_MAILER: 'smtp', SMTP_URL: 'smtp://127.0.0.1:1',
        DATABASE_URL: databaseUrl,
        TURN_RULES_MODULE: pluginFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    apiChild.stderr.on('data', chunk => { apiStderr += chunk.toString(); });
    apiChild.stdout.on('data', () => {});
    await waitFor(`${apiOrigin}/ready`, apiChild, () => apiStderr, 'PostgreSQL-backed API');

    webChild = spawn(process.execPath, [viteFile, 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
      cwd: webRoot, env: process.env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    });
    webChild.stderr.on('data', chunk => { webStderr += chunk.toString(); });
    await waitFor(webOrigin, webChild, () => webStderr, 'built web application');

    const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE
      || (process.platform === 'win32' && existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
        ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined);
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    // Forward same-origin production-bundle API requests to the real local API.
    // No gameplay response is stubbed or synthesized by the browser harness.
    await page.route('**/api/**', async route => {
      const source = new URL(route.request().url());
      if (source.pathname === '/api/auth/code' && route.request().method() === 'POST') otpRequestCount += 1;
      const response = await route.fetch({ url: `${apiOrigin}${source.pathname}${source.search}` });
      if (source.pathname === '/api/auth/guest' && route.request().method() === 'POST' && response.ok()) {
        ownerId = (await response.json()).account.id;
        accountSeeded = typeof ownerId === 'string';
      }
      await route.fulfill({ response });
    });

    await page.goto(`${webOrigin}/settings/cloud`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('邮箱').waitFor({ state: 'visible' });
    await page.getByLabel('验证码').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '发送验证码' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '以游客身份继续' }).waitFor({ state: 'visible' });
    await page.goto(`${webOrigin}/new`, { waitUntil: 'domcontentloaded' });
    const initialSession = await page.evaluate(async () => {
      const response = await fetch('/api/auth/session');
      return { status: response.status, body: await response.json() };
    });
    assert.equal(initialSession.status, 401, 'journey must begin without any seeded or existing session');
    await page.getByRole('textbox', { name: '姓名' }).fill('验收行者');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('input[name="p2-memory-mode"][value="forgetting"]').check();
    await page.getByTestId('create-server-game').click();
    await page.getByTestId('p2-cloud-game').waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText('真实遗忘', { exact: true }).waitFor();
    const guestSession = await page.evaluate(async () => {
      const response = await fetch('/api/auth/session');
      return { status: response.status, body: await response.json() };
    });
    assert.equal(guestSession.status, 200);
    assert.equal(guestSession.body.account.kind, 'guest');
    assert.equal(Object.hasOwn(guestSession.body.account, 'email'), false);
    assert.equal(otpRequestCount, 0, 'guest creation must not request or verify an email code');
    assert.ok(ownerId, 'guest creation response must identify the generated owner for scoped cleanup');
    const saveId = new URL(page.url()).pathname.split('/').at(-1);
    assert.match(saveId, /^game-[0-9a-f]{64}$/);
    createdSaveIds.push(saveId);

    const accountRow = await pool.query('SELECT email,is_guest FROM auth_accounts WHERE id=$1', [ownerId]);
    assert.deepEqual(accountRow.rows[0], { email: null, is_guest: true });
    const createRow = await pool.query('SELECT schema_version,memory_mode,revision,snapshot FROM game_saves WHERE id=$1 AND owner_id=$2', [saveId, ownerId]);
    assert.equal(createRow.rows.length, 1);
    assert.equal(createRow.rows[0].schema_version, 3);
    assert.equal(createRow.rows[0].memory_mode, 'forgetting');
    assert.equal(createRow.rows[0].revision, 0);

    await page.getByTestId('p2-action-input').fill('观察渡船');
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '1', null, { timeout: 20_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-narrative"]')?.textContent.includes('渡槽淤了半尺'), null, { timeout: 20_000 });
    expectedRequests = 1;
    expectedEvents = 1;
    assert.match(await page.getByTestId('p2-receipt').textContent(), /observe\.result/);

    const committed = await pool.query(`SELECT s.revision,s.snapshot,s.memory_mode,
      (SELECT count(*)::int FROM turn_requests r WHERE r.save_id=s.id) AS requests,
      (SELECT count(*)::int FROM turn_events e WHERE e.save_id=s.id) AS events,
      (SELECT e.event_type FROM turn_events e WHERE e.save_id=s.id ORDER BY e.sequence DESC LIMIT 1) AS last_event
      FROM game_saves s WHERE s.id=$1 AND s.owner_id=$2`, [saveId, ownerId]);
    assert.equal(committed.rows[0].revision, 1);
    assert.equal(committed.rows[0].memory_mode, 'forgetting');
    assert.equal(committed.rows[0].snapshot.facts.gameMinute, 315);
    assert.equal(committed.rows[0].requests, expectedRequests);
    assert.equal(committed.rows[0].events, expectedEvents);
    assert.equal(committed.rows[0].last_event, 'observe.result');

    const screenshotPath = join(evidenceDir, 'p1-guest-gameplay-turn.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('p2-cloud-game').waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '1', null, { timeout: 20_000 });
    await page.waitForFunction(() => document.body.innerText.includes('游戏分钟') && document.body.innerText.includes('315'), null, { timeout: 20_000 });
    await page.getByTestId('p2-status').getByText('服务端存档已恢复').waitFor({ timeout: 20_000 });
    assert.deepEqual(pageErrors, []);

    console.log(JSON.stringify({
      journey: 'built web -> unseeded zero-identity guest -> server game create -> parseActionText -> PostgreSQL turn -> narrative and receipt -> refresh restore',
      saveId,
      memoryMode: 'forgetting',
      revision: committed.rows[0].revision,
      gameMinute: committed.rows[0].snapshot.facts.gameMinute,
      turnRequests: expectedRequests,
      committedEvents: expectedEvents,
      eventType: committed.rows[0].last_event,
      refreshedRevision: await page.getByTestId('p2-revision').textContent(),
      pageErrors: pageErrors.length,
      screenshot: screenshotPath,
      accountKind: guestSession.body.account.kind,
      otpRequests: otpRequestCount,
      guestEntryAndOriginalEmailControlsVisible: true,
      server: 'real PostgreSQL transaction; isolated test database; no seeded session or email OTP; non-production approved review plugin',
    }, null, 2));
    await context.close();
  } finally {
    await browser?.close();
    await stop(webChild);
    await stop(apiChild);
    try {
      if (accountSeeded) {
        const counts = await pool.query(`SELECT
          (SELECT count(*)::int FROM game_saves WHERE owner_id=$1) AS saves,
          (SELECT count(*)::int FROM turn_requests r JOIN game_saves s ON s.id=r.save_id WHERE s.owner_id=$1) AS requests,
          (SELECT count(*)::int FROM turn_events e JOIN game_saves s ON s.id=e.save_id WHERE s.owner_id=$1) AS events`, [ownerId]);
        const observed = counts.rows[0];
        const expected = { saves: createdSaveIds.length, requests: expectedRequests, events: expectedEvents };
        const safeToClean = Object.keys(expected).every(key => observed[key] === expected[key]);
        if (!safeToClean) {
          console.error(`Preserving P2 gameplay evidence for owner ${ownerId}; expected ${JSON.stringify(expected)}, observed ${JSON.stringify(observed)}.`);
        } else {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await client.query("SELECT set_config('jiuxiao.account_erasure_operation', 'test-cleanup', true)");
            if (createdSaveIds.length) {
              await client.query('DELETE FROM cloud_archive_trash WHERE save_id = ANY($1::text[])', [createdSaveIds]);
              await client.query('DELETE FROM npc_authorized_observation_outbox WHERE save_id = ANY($1::text[])', [createdSaveIds]);
              await client.query('DELETE FROM npc_memory_journals WHERE save_id = ANY($1::text[])', [createdSaveIds]);
              await client.query('DELETE FROM turn_events WHERE save_id = ANY($1::text[])', [createdSaveIds]);
              await client.query('DELETE FROM turn_requests WHERE save_id = ANY($1::text[])', [createdSaveIds]);
              await client.query('DELETE FROM game_saves WHERE id = ANY($1::text[]) AND owner_id=$2', [createdSaveIds, ownerId]);
            }
            await client.query('DELETE FROM auth_sessions WHERE owner_id=$1', [ownerId]);
            await client.query('DELETE FROM auth_accounts WHERE id=$1', [ownerId]);
            await client.query('DELETE FROM account_rate_limits WHERE key=ANY($1::text[])', [
              [createHash('sha256').update(`turn\0${ownerId}`).digest('hex'), guestRateLimitKey],
            ]);
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally { client.release(); }
        }
      }
    } finally { await pool.end(); }
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
