#!/usr/bin/env node
// Authenticated, non-production journey through the exact approved P1 review plugin.
// This does not satisfy the separate zero-configuration guest acceptance gate.
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
const pluginFile = join(root, 'apps/api/dist/services/p1-prologue-plugin.js');
const apiRequire = createRequire(join(root, 'apps/api/package.json'));
const { Pool } = apiRequire('pg');
const databaseUrl = process.env.TEST_DATABASE_URL;

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

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  if (await Promise.race([exited.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 5_000))])) return;
  const killed = once(child, 'exit');
  child.kill('SIGKILL');
  await killed;
}

async function waitFor(url, child, stderr) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`P1 candidate API exited early: ${stderr()}`);
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}: ${stderr()}`);
}

(async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL to a disposable jiuxiao_test database');
  assertTestDatabase();
  assert.ok(existsSync(apiFile), 'Run pnpm build before pnpm test:e2e');
  assert.ok(existsSync(pluginFile), 'Build the exact review-only P1 plugin before pnpm test:e2e');

  const pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3_000 });
  const ownerId = `p1-candidate-${randomUUID()}`;
  const email = `${ownerId}@example.invalid`;
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const quotaKey = createHash('sha256').update(`turn\0${ownerId}`).digest('hex');
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const headers = { 'content-type': 'application/json', cookie: `jx_session=${token}`, origin };
  const createdSaveIds = [];
  const savesWithAcceptedTurns = new Set();
  let expectedRequests = 0;
  let expectedEvents = 0;
  let expectedObservations = 0;
  let child;
  let childStderr = '';
  let accountSeeded = false;

  try {
    await pool.query('SELECT 1');
    await pool.query('INSERT INTO auth_accounts (id, email) VALUES ($1, $2)', [ownerId, email]);
    await pool.query('INSERT INTO auth_sessions (token_hash, owner_id, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')', [tokenHash, ownerId]);
    accountSeeded = true;

    child = spawn(process.execPath, [apiFile], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        API_HOST: '127.0.0.1',
        API_PORT: String(port),
        AUTH_ENABLED: 'true',
        AUTH_PUBLIC_ORIGIN: origin,
        AUTH_SECRET: randomBytes(32).toString('hex'),
        AUTH_MAIL_FROM: 'p1-test@example.invalid',
        SMTP_URL: 'smtp://127.0.0.1:1',
        DATABASE_URL: databaseUrl,
        TURN_RULES_MODULE: pluginFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stderr.on('data', chunk => { childStderr += chunk.toString(); });
    child.stdout.on('data', () => {});

    const health = await waitFor(`${origin}/health`, child, () => childStderr);
    assert.equal((await health.json()).saveSchemaVersion, 2);
    await waitFor(`${origin}/ready`, child, () => childStderr);
    const session = await fetch(`${origin}/api/auth/session`, { headers: { cookie: `jx_session=${token}`, origin } });
    assert.equal(session.status, 200);

    async function createGame(memoryMode) {
      const response = await fetch(`${origin}/api/games`, {
        method: 'POST', headers,
        body: JSON.stringify({ idempotencyKey: `create-${randomUUID()}`, choices: { memoryMode } }),
      });
      assert.equal(response.status, 201, await response.clone().text());
      const body = await response.json();
      assert.equal(body.save.schemaVersion, 2);
      assert.equal(body.save.memoryMode, memoryMode);
      assert.equal(body.save.memoryPolicy.mode, memoryMode);
      createdSaveIds.push(body.save.saveId);
      return body.save;
    }

    async function act(save, kind, payload, key = randomUUID(), requestNarrative = false) {
      const intent = {
        kind, saveId: save.saveId, actorId: save.state.playerId,
        branchId: 'root', expectedRevision: save.revision, idempotencyKey: key, payload,
      };
      const response = await fetch(`${origin}/api/turns`, {
        method: 'POST', headers,
        body: JSON.stringify({ intent, requestNarrative }),
      });
      assert.equal(response.status, 200, await response.clone().text());
      const result = await response.json();
      expectedRequests++;
      if (result.status === 'decision') {
        assert.notEqual(result.receipt.decision.status, 'accepted');
        assert.ok(!('events' in result.receipt.decision) || result.receipt.decision.events.length === 0);
        assert.equal(result.receipt.resultingRevision, save.revision);
        return { result, intent };
      }
      assert.equal(result.status, 'accepted');
      if (requestNarrative) assert.equal(result.narrative?.status, 'received');
      assert.equal(result.receipt.branchId, 'root');
      assert.equal(result.receipt.rng.draws, 0);
      assert.equal(result.receipt.rng.seed, null);
      expectedEvents += result.receipt.decision.events.length;
      const directNpcEvents = result.receipt.decision.events.filter(event => event.type === 'talk.occurred').length;
      expectedObservations += directNpcEvents;
      savesWithAcceptedTurns.add(save.saveId);
      return { result, intent };
    }

    // First prove that a hard rejection leaves the save usable at its original revision.
    let forgetting = await createGame('forgetting');
    const invalid = await act(forgetting, 'move', { destinationId: 'loc_unlisted' });
    assert.equal(invalid.result.receipt.decision.status, 'rejected');
    const afterReject = await pool.query('SELECT revision FROM game_saves WHERE id=$1 AND owner_id=$2', [forgetting.saveId, ownerId]);
    assert.equal(afterReject.rows[0].revision, 0);

    const talk = await act(forgetting, 'talk', { npcId: 'npc_cenjiu', utterance: '这石头怎么办' }, randomUUID(), true);
    assert.equal(talk.result.receipt.decision.status, 'accepted');
    assert.equal(talk.result.receipt.decision.events[0].type, 'talk.occurred');
    assert.equal(talk.result.narrative.source, 'deterministic');
    assert.ok(talk.result.narrative.text.includes('我这把骨头，搬不动那些石头。你自己掂量。'));
    forgetting.revision++;
    const duplicate = await fetch(`${origin}/api/turns`, {
      method: 'POST', headers,
      body: JSON.stringify({ intent: talk.intent, requestNarrative: true }),
    });
    assert.equal(duplicate.status, 200);
    const duplicateResult = await duplicate.json();
    assert.equal(duplicateResult.duplicate, true);
    assert.equal(duplicateResult.receipt.decision.events[0].id, talk.result.receipt.decision.events[0].id);
    assert.equal(duplicateResult.narrative.text, talk.result.narrative.text);

    const toWangqitai = await act(forgetting, 'move', { destinationId: 'loc_wangqitai' });
    assert.equal(toWangqitai.result.receipt.decision.status, 'accepted');
    forgetting.revision++;
    const scan = await act(forgetting, 'observe', { targetId: 'obstacle_rockslide', method: 'scan' });
    assert.equal(scan.result.receipt.decision.events[0].payload.clueId, 'clue_rockslide');
    forgetting.revision++;
    const bypass = await act(forgetting, 'move', { destinationId: 'loc_luhuadu' });
    assert.equal(bypass.result.receipt.decision.events[0].type, 'move.bypassed');
    forgetting.revision++;
    const bypassQuest = await act(forgetting, 'quest', { questId: 'quest_first_clearance', choiceId: 'claim_reward' });
    assert.equal(bypassQuest.result.receipt.decision.events[0].type, 'quest.reward_claimed');
    forgetting.revision++;

    let continuing = await createGame('continue');
    const continueTalk = await act(continuing, 'talk', { npcId: 'npc_cenjiu', utterance: '这石头怎么办' }, randomUUID(), true);
    assert.equal(continueTalk.result.receipt.decision.events[0].type, 'talk.occurred');
    assert.equal(continueTalk.result.narrative.source, 'deterministic');
    continuing.revision++;
    const pickup = await act(continuing, 'acquire_item', { itemId: 'item_bishuifu', quantity: 1 });
    assert.equal(pickup.result.receipt.decision.events[0].type, 'item.acquired');
    continuing.revision++;
    const toBerm = await act(continuing, 'move', { destinationId: 'subloc_ferry_berm' });
    assert.equal(toBerm.result.receipt.decision.status, 'accepted');
    continuing.revision++;
    const ward = await act(continuing, 'use_item', { itemId: 'item_bishuifu', targetId: 'subloc_ferry_berm' });
    assert.equal(ward.result.receipt.decision.events[0].type, 'item.consumed');
    continuing.revision++;
    const combat = await act(continuing, 'combat', { targetId: 'npc_shuiyuya' });
    assert.equal(combat.result.receipt.decision.events[0].type, 'combat.resolved');
    assert.equal(combat.result.receipt.decision.events[0].payload.outcome, 'clear');
    continuing.revision++;
    const combatQuest = await act(continuing, 'quest', { questId: 'quest_first_clearance', choiceId: 'claim_reward' });
    assert.equal(combatQuest.result.receipt.decision.events[0].type, 'quest.reward_claimed');
    continuing.revision++;

    const rows = await pool.query(`SELECT s.id,s.revision,s.schema_version,s.memory_mode,s.memory_policy,s.snapshot,
      j.revision AS journal_revision,j.payload AS journal_payload,
      (SELECT count(*)::int FROM turn_requests r WHERE r.save_id=s.id) AS requests,
      (SELECT count(*)::int FROM turn_events e WHERE e.save_id=s.id) AS events,
      (SELECT count(*)::int FROM npc_authorized_observation_outbox o WHERE o.save_id=s.id) AS observations
      FROM game_saves s LEFT JOIN npc_memory_journals j ON j.save_id=s.id
      WHERE s.owner_id=$1 ORDER BY s.id`, [ownerId]);
    assert.equal(rows.rows.length, 2);
    const byMode = new Map(rows.rows.map(row => [row.memory_mode, row]));
    assert.equal(byMode.get('forgetting').revision, 5);
    assert.equal(byMode.get('continue').revision, 6);
    assert.equal(byMode.get('forgetting').journal_revision, 5);
    assert.equal(byMode.get('continue').journal_revision, 6);
    assert.equal(byMode.get('forgetting').observations, 1);
    assert.equal(byMode.get('continue').observations, 1);
    for (const [mode, expectedPolicy, expectedMinute, expectedRevision] of [
      ['forgetting', 'forgetting-v1', 390, 5],
      ['continue', 'continue-v1', 405, 6],
    ]) {
      const row = byMode.get(mode);
      assert.equal(row.revision, expectedRevision);
      assert.equal(row.snapshot.facts.gameMinute, expectedMinute);
      assert.equal(row.snapshot.facts.questState.status, 'completed');
      assert.equal(row.snapshot.facts.questState.rewardClaimed, true);
      assert.equal(row.journal_payload.memories[0].policyVersion, expectedPolicy);
      assert.equal(row.journal_payload.memories[0].npcId, 'npc_cenjiu');
      assert.equal(row.journal_payload.memories[0].observations.length, 1);
    }
    assert.equal(rows.rows.reduce((sum, row) => sum + row.requests, 0), expectedRequests);
    assert.equal(rows.rows.reduce((sum, row) => sum + row.events, 0), expectedEvents);
    assert.ok(rows.rows.every(row => row.schema_version === 2));
    assert.ok(rows.rows.every(row => row.memory_policy.mode === row.memory_mode));

    console.log(`Authenticated P1 review-runtime journey passed: ${expectedRequests} turn requests, ${expectedEvents} committed events, ${expectedObservations} direct-NPC memory grants; both Continue and Forgetting saves completed first clearance by different deterministic paths.`);
    console.log('This is an email-session, non-production candidate test. The zero-configuration guest ≤3-minute acceptance gate remains open.');
  } finally {
    await stop(child);
    try {
      if (accountSeeded) {
        const counts = await pool.query(`SELECT
          (SELECT count(*)::int FROM game_saves WHERE owner_id=$1) AS saves,
          (SELECT count(*)::int FROM turn_requests r JOIN game_saves s ON s.id=r.save_id WHERE s.owner_id=$1) AS requests,
          (SELECT count(*)::int FROM turn_events e JOIN game_saves s ON s.id=e.save_id WHERE s.owner_id=$1) AS events,
          (SELECT count(*)::int FROM npc_memory_journals j JOIN game_saves s ON s.id=j.save_id WHERE s.owner_id=$1) AS journals,
          (SELECT count(*)::int FROM npc_authorized_observation_outbox o JOIN game_saves s ON s.id=o.save_id WHERE s.owner_id=$1) AS observations`, [ownerId]);
        const observed = counts.rows[0];
        const expected = {
          saves: createdSaveIds.length,
          requests: expectedRequests,
          events: expectedEvents,
          journals: savesWithAcceptedTurns.size,
          observations: expectedObservations,
        };
        const safeToClean = Object.keys(expected).every(key => observed[key] === expected[key]);
        if (!safeToClean) {
          console.error(`Preserving P1 candidate evidence for owner ${ownerId}; expected ${JSON.stringify(expected)}, observed ${JSON.stringify(observed)}.`);
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
            await client.query('DELETE FROM account_rate_limits WHERE key=$1', [quotaKey]);
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
  console.error(error);
  process.exitCode = 1;
});
