#!/usr/bin/env node
// P1 fail-closed preflight only: an unrecognized rule module must not bypass
// AUTHOR_RULES_GATE. The approved non-production candidate journey is separate.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { once } = require('node:events');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');

const root = resolve(__dirname, '../..');
const apiFile = join(root, 'apps/api/dist/index.js');
const candidateModule = join(root, 'packages/content/dist/prologue/prologue-v1.rulebook-candidate.js');
const apiRequire = createRequire(join(root, 'apps/api/package.json'));
const { Pool } = apiRequire('pg');
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

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

async function waitFor(url, child, stderr) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`P1 API exited before readiness: ${stderr()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}: ${stderr()}`);
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  const exit = await Promise.race([exited.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 5_000))]);
  if (!exit) {
    const killed = once(child, 'exit');
    child.kill('SIGKILL');
    await killed;
  }
}

(async () => {
  assert.ok(testDatabaseUrl, 'Set TEST_DATABASE_URL to a disposable jiuxiao_test database');
  assertTestDatabase();
  assert.ok(existsSync(apiFile), 'Run pnpm build before pnpm test:e2e');
  assert.ok(existsSync(candidateModule), 'Build the candidate rule module before the gate preflight');

  const pool = new Pool({ connectionString: testDatabaseUrl, max: 2, connectionTimeoutMillis: 3_000 });
  const ownerId = `p1-pr6-${randomUUID()}`;
  const email = `${ownerId}@example.invalid`;
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const saveId = `p1-save-${randomUUID()}`;
  const unknownSaveId = `p1-missing-${randomUUID()}`;
  const requestId = randomUUID();
  const quotaKey = createHash('sha256').update(`turn\0${ownerId}`).digest('hex');
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  let child;
  let childStderr = '';
  let seededSave = false;

  try {
    await pool.query('SELECT 1');
    await pool.query('INSERT INTO auth_accounts (id, email) VALUES ($1, $2)', [ownerId, email]);
    await pool.query('INSERT INTO auth_sessions (token_hash, owner_id, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')', [tokenHash, ownerId]);

    child = spawn(process.execPath, [apiFile], {
      cwd: root,
      env: {
        ...process.env,
        API_HOST: '127.0.0.1',
        API_PORT: String(port),
        AUTH_ENABLED: 'true',
        AUTH_PUBLIC_ORIGIN: origin,
        AUTH_SECRET: randomBytes(32).toString('hex'),
        AUTH_MAIL_FROM: 'p1-test@example.invalid',
        SMTP_URL: 'smtp://127.0.0.1:1',
        DATABASE_URL: testDatabaseUrl,
        // A raw content rulebook path is not the approved review plugin path.
        TURN_RULES_MODULE: candidateModule,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stderr.on('data', chunk => { childStderr += chunk.toString(); });
    child.stdout.on('data', () => {});

    const health = await waitFor(`${origin}/health`, child, () => childStderr);
    assert.equal((await health.json()).saveSchemaVersion, 3);
    const ready = await waitFor(`${origin}/ready`, child, () => childStderr);
    assert.equal((await ready.json()).status, 'ready');

    const session = await fetch(`${origin}/api/auth/session`, {
      headers: { cookie: `jx_session=${token}`, origin },
    });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).account.id, ownerId);

    const headers = { 'content-type': 'application/json', cookie: `jx_session=${token}`, origin };
    const create = await fetch(`${origin}/api/games`, {
      method: 'POST', headers,
      body: JSON.stringify({ idempotencyKey: `create-${randomUUID()}`, choices: { name: 'P1 门禁探针' } }),
    });
    assert.equal(create.status, 503);
    assert.deepEqual(await create.json(), { code: 'RULES_NOT_READY' });
    const savesAfterCreate = await pool.query('SELECT count(*)::int AS count FROM game_saves WHERE owner_id = $1', [ownerId]);
    assert.equal(savesAfterCreate.rows[0].count, 0, 'blocked game creation must not persist a save');

    const snapshot = {
      schemaVersion: 1, saveId, revision: 0, canonVersion: 'p1-gate-fixture',
      ruleVersion: 'p1-gate-fixture', memoryPolicyVersion: 'p1-gate-fixture',
      state: { playerId: 'p1-player', locationId: 'loc_luhuadu', elapsedMinutes: 0, facts: {} },
    };
    await pool.query(`INSERT INTO game_saves
      (id, owner_id, revision, schema_version, canon_version, rule_version, memory_policy_version, snapshot)
      VALUES ($1, $2, 0, 1, 'p1-gate-fixture', 'p1-gate-fixture', 'p1-gate-fixture', $3::jsonb)`,
    [saveId, ownerId, JSON.stringify(snapshot)]);
    seededSave = true;

    const postTurn = async (targetSaveId, key) => fetch(`${origin}/api/turns`, {
      method: 'POST', headers,
      body: JSON.stringify({
        intent: {
          kind: 'move', saveId: targetSaveId, actorId: 'p1-player', expectedRevision: 0,
          idempotencyKey: key, payload: { destinationId: 'loc_luhuadu' },
        },
        requestNarrative: true,
      }),
    });
    const responses = await Promise.all([
      postTurn(saveId, requestId),
      postTurn(saveId, requestId),
      postTurn(unknownSaveId, randomUUID()),
    ]);
    for (const response of responses) {
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { code: 'RULES_NOT_READY' });
    }

    const persisted = await pool.query(`SELECT
      (SELECT revision FROM game_saves WHERE id = $1 AND owner_id = $2) AS revision,
      (SELECT count(*)::int FROM turn_requests WHERE save_id = $1) AS requests,
      (SELECT count(*)::int FROM turn_events WHERE save_id = $1) AS events,
      (SELECT count(*)::int FROM npc_memory_journals WHERE save_id = $1) AS memories`, [saveId, ownerId]);
    assert.deepEqual(persisted.rows[0], { revision: 0, requests: 0, events: 0, memories: 0 });
    console.log('PR-6 fail-closed preflight passed: the unrecognized rulebook module did not bypass AUTHOR_RULES_GATE; no save, receipt, event, or NPC-memory write occurred.');
    console.log('This is only a negative gate check; authenticated non-production gameplay is covered by p1-authenticated-candidate.cjs.');
  } finally {
    if (child) await stop(child);
    try {
      const remaining = await pool.query(`SELECT
        (SELECT count(*)::int FROM game_saves WHERE owner_id = $1) AS saves,
        (SELECT count(*)::int FROM turn_requests r JOIN game_saves s ON s.id = r.save_id WHERE s.owner_id = $1) AS requests,
        (SELECT count(*)::int FROM turn_events e JOIN game_saves s ON s.id = e.save_id WHERE s.owner_id = $1) AS events,
        (SELECT count(*)::int FROM npc_memory_journals n JOIN game_saves s ON s.id = n.save_id WHERE s.owner_id = $1) AS memories,
        (SELECT revision FROM game_saves WHERE id = $2 AND owner_id = $1) AS revision`, [ownerId, saveId]);
      const counts = remaining.rows[0];
      const expectedSaves = seededSave ? 1 : 0;
      const safeToClean = counts.saves === expectedSaves && counts.requests === 0 && counts.events === 0 &&
        counts.memories === 0 && (!seededSave || counts.revision === 0);
      if (!safeToClean) {
        console.error(`Preserving P1 E2E database evidence for owner ${ownerId}; observed ${JSON.stringify(counts)}.`);
      } else {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query("SELECT set_config('jiuxiao.account_erasure_operation', 'test-cleanup', true)");
          const saveIds = seededSave ? [saveId] : [];
          if (saveIds.length) {
            await client.query('DELETE FROM cloud_archive_trash WHERE save_id = ANY($1::text[])', [saveIds]);
            await client.query('DELETE FROM npc_authorized_observation_outbox WHERE save_id = ANY($1::text[])', [saveIds]);
            await client.query('DELETE FROM npc_memory_journals WHERE save_id = ANY($1::text[])', [saveIds]);
            await client.query('DELETE FROM turn_events WHERE save_id = ANY($1::text[])', [saveIds]);
            await client.query('DELETE FROM turn_requests WHERE save_id = ANY($1::text[])', [saveIds]);
            await client.query('DELETE FROM game_saves WHERE id = ANY($1::text[]) AND owner_id = $2', [saveIds, ownerId]);
          }
          await client.query('DELETE FROM auth_sessions WHERE owner_id = $1', [ownerId]);
          await client.query('DELETE FROM auth_accounts WHERE id = $1', [ownerId]);
          await client.query('DELETE FROM account_rate_limits WHERE key = $1', [quotaKey]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    } finally {
      await pool.end();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
