#!/usr/bin/env node
// Real Chromium coverage for IndexedDB v2 -> v3 upgrade, durable replay,
// concurrent compare-and-swap, and transaction rollback after a constraint error.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
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

async function waitFor(url, child, getStderr) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`P2 Vite server exited early: ${getStderr()}`);
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}: ${getStderr()}`);
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
  assert.ok(existsSync(viteFile), 'Install workspace dependencies before the P2 browser test');
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  let childStderr = '';
  const child = spawn(process.execPath, [viteFile, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: webRoot,
    env: { ...process.env, JIUXIAO_API_TARGET: 'http://127.0.0.1:1' },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  child.stderr.on('data', chunk => { childStderr += chunk.toString(); });

  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE
    || (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
  let browser;
  try {
    await waitFor(origin, child, () => childStderr);
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const context = await browser.newContext();
      const page = await context.newPage();
    await page.route('**/__p2-idb-test__', route => route.fulfill({
      status: 200, contentType: 'text/html', body: '<!doctype html><html><body>P2 IndexedDB test origin</body></html>',
    }));
    await page.goto(`${origin}/__p2-idb-test__`, { waitUntil: 'domcontentloaded' });

    const migration = await page.evaluate(async () => {
      const databaseName = 'jiuxiao-1';
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('DELETE_DATABASE_FAILED'));
        request.onblocked = () => reject(new Error('DELETE_DATABASE_BLOCKED'));
      });
      await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 2);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('saves', { keyPath: 'saveId' });
          request.result.createObjectStore('meta', { keyPath: 'key' });
        };
        request.onerror = () => reject(request.error ?? new Error('SEED_V2_OPEN_FAILED'));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(['saves', 'meta'], 'readwrite');
          transaction.objectStore('saves').put({
            schemaVersion: 1,
            saveId: 'legacy-draft-v2',
            name: 'legacy draft',
            createdAt: '2026-10-05T00:00:00.000Z',
            updatedAt: '2026-10-05T00:00:00.000Z',
            revision: 0,
            canonVersion: 'legacy-unverified',
            ruleVersion: 'rules-not-signed',
            memoryPolicyVersion: 'legacy-unknown',
            character: {}, location: 'legacy', status: 'pending_rules', messages: [],
          });
          transaction.objectStore('meta').put({ key: 'revision', value: 4 });
          transaction.oncomplete = () => { database.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error ?? new Error('SEED_V2_WRITE_FAILED'));
        };
      });

      const store = await import('/src/authoritative-turn-store.ts');
      const initial = {
        schemaVersion: 3, saveId: 'p2-browser-save', canonVersion: 'canon-test', canonArtifactHash: `sha256:${'d'.repeat(64)}`, ruleVersion: 'rules-test-v1',
        memoryPolicyVersion: 'continue-v1', memoryMode: 'continue',
        memoryPolicy: {
          mode: 'continue', policyVersion: 'continue-v1', schemaVersion: 1,
          clockBasis: 'game-minute+npc-grant-sequence-v1',
          policyArtifactHash: `sha256:${'a'.repeat(64)}`,
          cueDictionaryHash: `sha256:${'b'.repeat(64)}`,
          normalizerVersion: 'unicode-nfc-v1', retrievalVersion: 'continue-v1',
          visibilityPolicyVersion: 'visibility-v1', visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
          createdAtRevision: 0,
        },
        branchId: 'root', parentBranchId: null, forkRevision: 0,
        createdPolicyVersion: 'continue-v1', sourceMigrationId: null,
        revision: 0,
        state: { playerId: 'p2-player', locationId: 'gate-a', elapsedMinutes: 0, facts: { gameMinute: 0 } },
      };
      const created = await store.createLocalAuthoritativeSave(initial);
      const upgraded = await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => reject(request.error ?? new Error('VERIFY_UPGRADE_OPEN_FAILED'));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('saves', 'readonly');
          const read = transaction.objectStore('saves').get('legacy-draft-v2');
          read.onsuccess = () => resolve({ version: database.version, save: read.result });
          read.onerror = () => reject(read.error ?? new Error('VERIFY_LEGACY_READ_FAILED'));
          transaction.oncomplete = () => database.close();
        };
      });
      return { version: upgraded.version, legacySave: upgraded.save, created: created.status };
    });
    assert.equal(migration.version, 3, 'application must upgrade the existing v2 database to v3');
    assert.equal(migration.legacySave?.saveId, 'legacy-draft-v2', 'the migration must preserve existing draft rows');
    assert.equal(migration.created, 'created');

    const baseSetup = await page.evaluate(async () => {
      const store = await import('/src/authoritative-turn-store.ts');
      const save = await store.readLocalAuthoritativeSave('p2-browser-save');
      return { revision: save?.revision, chain: await store.verifyLocalEventChain('p2-browser-save') };
    });
    assert.equal(baseSetup.revision, 0);
    assert.deepEqual(baseSetup.chain, { valid: true, eventCount: 0, headHash: '0'.repeat(64) });

    const secondPage = await context.newPage();
    await secondPage.route('**/__p2-idb-test__', route => route.fulfill({
      status: 200, contentType: 'text/html', body: '<!doctype html><html><body>P2 IndexedDB test origin</body></html>',
    }));
    await secondPage.goto(`${origin}/__p2-idb-test__`, { waitUntil: 'domcontentloaded' });
    const concurrent = await Promise.all([
      page.evaluate(async ({ key, destinationId }) => {
        const store = await import('/src/authoritative-turn-store.ts');
        const reduce = (state, event) => ({
          ...state,
          locationId: String(event.payload.destinationId),
          elapsedMinutes: state.elapsedMinutes + 15,
          facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
        });
        const intent = {
          saveId: 'p2-browser-save', actorId: 'p2-player', branchId: 'root', expectedRevision: 0,
          idempotencyKey: key, kind: 'move', payload: { destinationId },
        };
        const decide = (_action, save) => ({
          status: 'accepted', outcome: 'success', nextRevision: save.revision + 1,
          events: [{
            id: crypto.randomUUID(), saveId: save.saveId, branchId: 'root', type: 'PLAYER_MOVED',
            beforeRevision: save.revision, afterRevision: save.revision + 1,
            occurredAt: '2026-10-05T12:00:00.000Z', source: 'RULES', ruleVersion: save.ruleVersion,
            payload: { destinationId },
          }],
        });
        const stableGrantIdV2 = (saveId, branchId, npcId, eventId, policyVersion) => {
          const encoder = new TextEncoder();
          return `grant:v2:${[saveId, branchId, npcId, eventId, policyVersion]
            .map(part => `${encoder.encode(part).byteLength}:${part}`).join('')}`;
        };
        const authorizeEvents = events => events.map(event => {
          const authorizationPolicyVersion = 'visibility-v1';
          const summary = '一名目击者看见旅人经过。';
          return {
            grantId: stableGrantIdV2(event.saveId, 'root', 'npc-witness', event.id, authorizationPolicyVersion),
            grantIdVersion: 2, saveId: event.saveId, branchId: 'root', npcId: 'npc-witness', eventId: event.id, memoryClass: 'unclassified', memoryClass: 'unclassified',
            eventRevision: event.afterRevision, observedAtMinute: 15, channel: 'witnessed', authorizationPolicyVersion,
            authorizedFields: ['summary'], authorizedFacts: { summary }, summary,
          };
        });
        return store.commitLocalAuthoritativeTurn({ intent, decide, reduce, authorizeEvents });
      }, { key: '55555555-5555-4555-8555-555555555551', destinationId: 'gate-b' }),
      secondPage.evaluate(async ({ key, destinationId }) => {
        const store = await import('/src/authoritative-turn-store.ts');
        const reduce = (state, event) => ({
          ...state,
          locationId: String(event.payload.destinationId),
          elapsedMinutes: state.elapsedMinutes + 15,
          facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
        });
        const intent = {
          saveId: 'p2-browser-save', actorId: 'p2-player', branchId: 'root', expectedRevision: 0,
          idempotencyKey: key, kind: 'move', payload: { destinationId },
        };
        const decide = (_action, save) => ({
          status: 'accepted', outcome: 'success', nextRevision: save.revision + 1,
          events: [{
            id: crypto.randomUUID(), saveId: save.saveId, branchId: 'root', type: 'PLAYER_MOVED',
            beforeRevision: save.revision, afterRevision: save.revision + 1,
            occurredAt: '2026-10-05T12:00:00.000Z', source: 'RULES', ruleVersion: save.ruleVersion,
            payload: { destinationId },
          }],
        });
        const stableGrantIdV2 = (saveId, branchId, npcId, eventId, policyVersion) => {
          const encoder = new TextEncoder();
          return `grant:v2:${[saveId, branchId, npcId, eventId, policyVersion]
            .map(part => `${encoder.encode(part).byteLength}:${part}`).join('')}`;
        };
        const authorizeEvents = events => events.map(event => {
          const authorizationPolicyVersion = 'visibility-v1';
          const summary = '一名目击者看见旅人经过。';
          return {
            grantId: stableGrantIdV2(event.saveId, 'root', 'npc-witness', event.id, authorizationPolicyVersion),
            grantIdVersion: 2, saveId: event.saveId, branchId: 'root', npcId: 'npc-witness', eventId: event.id, memoryClass: 'unclassified', memoryClass: 'unclassified',
            eventRevision: event.afterRevision, observedAtMinute: 15, channel: 'witnessed', authorizationPolicyVersion,
            authorizedFields: ['summary'], authorizedFacts: { summary }, summary,
          };
        });
        return store.commitLocalAuthoritativeTurn({ intent, decide, reduce, authorizeEvents });
      }, { key: '55555555-5555-4555-8555-555555555552', destinationId: 'gate-c' }),
    ]);
    const statuses = concurrent.map(result => result.status).sort();
    assert.deepEqual(statuses, ['committed', 'revision_conflict'], 'concurrent tabs must commit at most one stale-revision action');
    const committed = concurrent.find(result => result.status === 'committed');
    assert.ok(committed && committed.status === 'committed');
    assert.equal(committed.save.revision, 1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    const afterReload = await page.evaluate(async winnerKey => {
      const store = await import('/src/authoritative-turn-store.ts');
      const reduce = (state, event) => ({
        ...state,
        locationId: String(event.payload.destinationId),
        elapsedMinutes: state.elapsedMinutes + 15,
        facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
      });
      const countRows = () => new Promise((resolve, reject) => {
        const request = indexedDB.open('jiuxiao-1');
        request.onerror = () => reject(request.error ?? new Error('COUNT_OPEN_FAILED'));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(['turnEvents', 'turnReceipts', 'authorizedObservationOutbox'], 'readonly');
          let events;
          let receipts;
          let outbox;
          transaction.objectStore('turnEvents').count().onsuccess = event => { events = event.target.result; };
          transaction.objectStore('turnReceipts').count().onsuccess = event => { receipts = event.target.result; };
          transaction.objectStore('authorizedObservationOutbox').count().onsuccess = event => { outbox = event.target.result; };
          transaction.oncomplete = () => { database.close(); resolve({ events, receipts, outbox }); };
          transaction.onerror = () => reject(transaction.error ?? new Error('COUNT_TRANSACTION_FAILED'));
        };
      });
      return {
        save: await store.readLocalAuthoritativeSave('p2-browser-save'),
        receipt: await store.readLocalTurnReceipt('p2-browser-save', winnerKey),
        replay: await store.verifyLocalReplay('p2-browser-save', reduce),
        chain: await store.verifyLocalEventChain('p2-browser-save'),
        counts: await countRows(),
      };
    }, committed.receipt.idempotencyKey);
    assert.equal(afterReload.save?.revision, 1);
    assert.equal(afterReload.receipt?.resultingRevision, 1);
    assert.equal(afterReload.replay.valid, true);
    assert.equal(afterReload.chain.eventCount, 1);
    assert.equal(afterReload.counts.events, 1);
    assert.equal(afterReload.counts.receipts, 1);
    assert.equal(afterReload.counts.outbox, 1);

    const retriedAfterReload = await page.evaluate(async ({ winnerKey, destinationId }) => {
      const store = await import('/src/authoritative-turn-store.ts');
      const reduce = (state, event) => ({
        ...state,
        locationId: String(event.payload.destinationId),
        elapsedMinutes: state.elapsedMinutes + 15,
        facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
      });
      const intent = {
        saveId: 'p2-browser-save', actorId: 'p2-player', branchId: 'root', expectedRevision: 0,
        idempotencyKey: winnerKey, kind: 'move', payload: { destinationId },
      };
      const decide = (_action, save) => ({
        status: 'accepted', outcome: 'success', nextRevision: save.revision + 1,
        events: [{
          id: crypto.randomUUID(), saveId: save.saveId, branchId: 'root', type: 'PLAYER_MOVED',
          beforeRevision: save.revision, afterRevision: save.revision + 1,
          occurredAt: '2026-10-05T12:00:00.000Z', source: 'RULES', ruleVersion: save.ruleVersion,
          payload: { destinationId },
        }],
      });
      const result = await store.commitLocalAuthoritativeTurn({ intent, decide, reduce });
      return {
        status: result.status,
        receipt: result.receipt,
        save: await store.readLocalAuthoritativeSave('p2-browser-save'),
        replay: await store.verifyLocalReplay('p2-browser-save', reduce),
        chain: await store.verifyLocalEventChain('p2-browser-save'),
      };
    }, {
      winnerKey: committed.receipt.idempotencyKey,
      destinationId: committed.receipt.decision.events[0].payload.destinationId,
    });
    assert.equal(retriedAfterReload.status, 'duplicate', 'retry after a browser reload must return the original receipt');
    assert.deepEqual(retriedAfterReload.receipt, committed.receipt);
    assert.equal(retriedAfterReload.save?.revision, 1);
    assert.equal(retriedAfterReload.save?.state.elapsedMinutes, 15);
    assert.equal(retriedAfterReload.replay.valid, true);
    assert.equal(retriedAfterReload.chain.eventCount, 1);

    // Make the next accepted event reuse the existing event ID. IndexedDB's
    // unique record key aborts the transaction after writes have been queued.
    // Verify that the receipt, snapshot, event, outbox, checkpoint and head all
    // roll back together. This is a deterministic abort injection, not a game rule.
    const rollback = await page.evaluate(async winnerKey => {
      const store = await import('/src/authoritative-turn-store.ts');
      const before = await store.readLocalAuthoritativeSave('p2-browser-save');
      const winner = await store.readLocalTurnReceipt('p2-browser-save', winnerKey);
      const reduce = (state, event) => ({
        ...state,
        locationId: String(event.payload.destinationId),
        elapsedMinutes: state.elapsedMinutes + 15,
        facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
      });
      const intent = {
        saveId: 'p2-browser-save', actorId: 'p2-player', branchId: 'root', expectedRevision: before.revision,
        idempotencyKey: '55555555-5555-4555-8555-555555555553', kind: 'move', payload: { destinationId: 'gate-d' },
      };
      const decide = (_action, save) => ({
        status: 'accepted', outcome: 'success', nextRevision: save.revision + 1,
        events: [{
          id: winner.decision.events[0].id, saveId: save.saveId, branchId: 'root', type: 'PLAYER_MOVED',
          beforeRevision: save.revision, afterRevision: save.revision + 1,
          occurredAt: '2026-10-05T12:15:00.000Z', source: 'RULES', ruleVersion: save.ruleVersion,
          payload: { destinationId: 'gate-d' },
        }],
      });
      const stableGrantIdV2 = (saveId, branchId, npcId, eventId, policyVersion) => {
        const encoder = new TextEncoder();
        return `grant:v2:${[saveId, branchId, npcId, eventId, policyVersion]
          .map(part => `${encoder.encode(part).byteLength}:${part}`).join('')}`;
      };
      const authorizeEvents = events => events.map(event => {
        const authorizationPolicyVersion = 'visibility-v1';
        const summary = '一名目击者看见旅人经过。';
        return {
          grantId: stableGrantIdV2(event.saveId, 'root', 'npc-witness', event.id, authorizationPolicyVersion),
          grantIdVersion: 2, saveId: event.saveId, branchId: 'root', npcId: 'npc-witness', eventId: event.id, memoryClass: 'unclassified',
          eventRevision: event.afterRevision, observedAtMinute: 30, channel: 'witnessed', authorizationPolicyVersion,
          authorizedFields: ['summary'], authorizedFacts: { summary }, summary,
        };
      });
      const result = await store.commitLocalAuthoritativeTurn({
        intent, decide, reduce, authorizeEvents,
      });
      const countRows = () => new Promise((resolve, reject) => {
        const request = indexedDB.open('jiuxiao-1');
        request.onerror = () => reject(request.error ?? new Error('COUNT_OPEN_FAILED'));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(['turnEvents', 'turnReceipts', 'authorizedObservationOutbox'], 'readonly');
          let events;
          let receipts;
          let outbox;
          transaction.objectStore('turnEvents').count().onsuccess = event => { events = event.target.result; };
          transaction.objectStore('turnReceipts').count().onsuccess = event => { receipts = event.target.result; };
          transaction.objectStore('authorizedObservationOutbox').count().onsuccess = event => { outbox = event.target.result; };
          transaction.oncomplete = () => { database.close(); resolve({ events, receipts, outbox }); };
          transaction.onerror = () => reject(transaction.error ?? new Error('COUNT_TRANSACTION_FAILED'));
        };
      });
      return {
        status: result.status,
        save: await store.readLocalAuthoritativeSave('p2-browser-save'),
        receipt: await store.readLocalTurnReceipt('p2-browser-save', '55555555-5555-4555-8555-555555555553'),
        replay: await store.verifyLocalReplay('p2-browser-save', reduce),
        chain: await store.verifyLocalEventChain('p2-browser-save'),
        counts: await countRows(),
      };
    }, committed.receipt.idempotencyKey);
    assert.equal(rollback.status, 'unavailable', 'the intentional unique-key collision must abort the IndexedDB transaction');
    assert.equal(rollback.save?.revision, 1);
    assert.equal(rollback.receipt, null, 'no receipt may survive an aborted transaction');
    assert.equal(rollback.replay.valid, true);
    assert.equal(rollback.chain.eventCount, 1);
    assert.equal(rollback.counts.events, 1);
    assert.equal(rollback.counts.receipts, 1);
    assert.equal(rollback.counts.outbox, 1, 'the aborted transaction must not leave a partial authorized memory grant');

    const longSession = await page.evaluate(async () => {
      const store = await import('/src/authoritative-turn-store.ts');
      const reduce = (state, event) => ({
        ...state,
        locationId: String(event.payload.destinationId),
        elapsedMinutes: state.elapsedMinutes + 15,
        facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
      });
      const startedAt = performance.now();
      for (let revision = 2; revision <= 101; revision += 1) {
        const before = await store.readLocalAuthoritativeSave('p2-browser-save');
        const suffix = String(revision).padStart(12, '0');
        const key = `00000000-0000-4000-8000-${suffix}`;
        const eventId = `00000001-0000-4000-8000-${suffix}`;
        const destinationId = `gate-${revision}`;
        const intent = {
          saveId: before.saveId, actorId: 'p2-player', branchId: 'root', expectedRevision: before.revision,
          idempotencyKey: key, kind: 'move', payload: { destinationId },
        };
        const decide = (_action, save) => ({
          status: 'accepted', outcome: 'success', nextRevision: save.revision + 1,
          events: [{
            id: eventId, saveId: save.saveId, branchId: 'root', type: 'PLAYER_MOVED',
            beforeRevision: save.revision, afterRevision: save.revision + 1,
            occurredAt: new Date(Date.UTC(2026, 9, 5, 12, revision - 1)).toISOString(),
            source: 'RULES', ruleVersion: save.ruleVersion, payload: { destinationId },
          }],
        });
        const result = await store.commitLocalAuthoritativeTurn({ intent, decide, reduce });
        if (result.status !== 'committed') throw new Error(`P2_LONG_SESSION_COMMIT_${revision}_${result.status}`);
      }
      const elapsedMs = Math.round(performance.now() - startedAt);
      return {
        elapsedMs,
        save: await store.readLocalAuthoritativeSave('p2-browser-save'),
        replay: await store.verifyLocalReplay('p2-browser-save', reduce),
        chain: await store.verifyLocalEventChain('p2-browser-save'),
      };
    });
    assert.equal(longSession.save?.revision, 101, '100 sequential local turns must advance exactly 100 revisions');
    assert.equal(longSession.save?.state.elapsedMinutes, 1515);
    assert.equal(longSession.replay.valid, true);
    assert.equal(longSession.replay.eventCount, 101);
    assert.equal(longSession.chain.valid, true);
    assert.equal(longSession.chain.eventCount, 101);

    const crashSeed = await page.evaluate(async () => {
      const store = await import('/src/authoritative-turn-store.ts');
      const source = await store.readLocalAuthoritativeSave('p2-browser-save');
      const crashSave = {
        ...structuredClone(source), saveId: 'p2-page-close-save', revision: 0,
        parentBranchId: null, forkRevision: 0,
        memoryPolicy: { ...structuredClone(source.memoryPolicy), createdAtRevision: 0 },
        state: structuredClone(source.state),
      };
      return (await store.createLocalAuthoritativeSave(crashSave)).status;
    });
    assert.equal(crashSeed, 'created');

    // Close the page after its authoritative readwrite transaction has been
    // opened. This covers browser-page interruption and recovery, not OS-level
    // process kill or power-loss durability.
    const pendingKey = '00000002-0000-4000-8000-000000000002';
    const pendingEventId = '00000002-0000-4000-8000-000000000001';
    const transactionOpened = await page.evaluate(async ({ idempotencyKey, eventId }) => {
      const store = await import('/src/authoritative-turn-store.ts');
      const reduce = (state, event) => ({
        ...state,
        locationId: String(event.payload.destinationId),
        elapsedMinutes: state.elapsedMinutes + 15,
        facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
      });
      const intent = {
        saveId: 'p2-page-close-save', actorId: 'p2-player', branchId: 'root', expectedRevision: 0,
        idempotencyKey, kind: 'move', payload: { destinationId: 'crash-target' },
      };
      const decide = (_action, save) => ({
        status: 'accepted', outcome: 'success', nextRevision: 1,
        events: [{
          id: eventId, saveId: save.saveId, branchId: 'root', type: 'PLAYER_MOVED',
          beforeRevision: 0, afterRevision: 1, occurredAt: '2026-10-05T13:00:00.000Z',
          source: 'RULES', ruleVersion: save.ruleVersion, payload: { destinationId: 'crash-target' },
        }],
      });
      const started = new Promise(resolve => window.addEventListener('p2-authoritative-write-open', () => resolve('write-open'), { once: true }));
      const original = IDBDatabase.prototype.transaction;
      let signaled = false;
      IDBDatabase.prototype.transaction = function (stores, mode, options) {
        const transaction = original.call(this, stores, mode, options);
        const names = Array.isArray(stores) ? stores : [stores];
        if (!signaled && mode === 'readwrite' && names.includes('turnEvents') && names.includes('turnReceipts')) {
          signaled = true;
          window.dispatchEvent(new Event('p2-authoritative-write-open'));
        }
        return transaction;
      };
      const pending = store.commitLocalAuthoritativeTurn({ intent, decide, reduce });
      pending.then(result => { window.__p2PendingWriteResult = result.status; }, () => { window.__p2PendingWriteResult = 'rejected'; });
      try { return await started; }
      finally { IDBDatabase.prototype.transaction = original; }
    }, { idempotencyKey: pendingKey, eventId: pendingEventId });
    assert.equal(transactionOpened, 'write-open');
    await page.close();

    const recoveryPage = await context.newPage();
    await recoveryPage.route('**/__p2-idb-test__', route => route.fulfill({
      status: 200, contentType: 'text/html', body: '<!doctype html><html><body>P2 recovery origin</body></html>',
    }));
    await recoveryPage.goto(`${origin}/__p2-idb-test__`, { waitUntil: 'domcontentloaded' });
    const interrupted = await recoveryPage.evaluate(async idempotencyKey => {
      const store = await import('/src/authoritative-turn-store.ts');
      const reduce = (state, event) => ({
        ...state,
        locationId: String(event.payload.destinationId),
        elapsedMinutes: state.elapsedMinutes + 15,
        facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
      });
      const count = await new Promise((resolve, reject) => {
        const request = indexedDB.open('jiuxiao-1');
        request.onerror = () => reject(request.error ?? new Error('RECOVERY_COUNT_OPEN_FAILED'));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(['turnEvents', 'turnReceipts'], 'readonly');
          const events = transaction.objectStore('turnEvents').index('saveId').getAll('p2-page-close-save');
          const receipts = transaction.objectStore('turnReceipts').index('saveId').getAll('p2-page-close-save');
          transaction.oncomplete = () => { database.close(); resolve({ events: events.result, receipts: receipts.result }); };
          transaction.onerror = () => reject(transaction.error ?? new Error('RECOVERY_COUNT_FAILED'));
        };
      });
      return {
        save: await store.readLocalAuthoritativeSave('p2-page-close-save'),
        receipt: await store.readLocalTurnReceipt('p2-page-close-save', idempotencyKey),
        replay: await store.verifyLocalReplay('p2-page-close-save', reduce),
        chain: await store.verifyLocalEventChain('p2-page-close-save'),
        eventCount: count.events.length,
        receiptCount: count.receipts.length,
      };
    }, pendingKey);
    assert.ok([0, 1].includes(interrupted.save?.revision), 'interrupted commit may be wholly absent or wholly committed');
    assert.equal(interrupted.eventCount, interrupted.save?.revision);
    assert.equal(interrupted.receiptCount, interrupted.save?.revision);
    assert.equal(interrupted.receiptCount, interrupted.receipt ? 1 : 0);
    assert.equal(interrupted.replay.valid, true);
    assert.equal(interrupted.chain.valid, true);

    const recovered = await recoveryPage.evaluate(async ({ idempotencyKey, eventId }) => {
      const store = await import('/src/authoritative-turn-store.ts');
      const reduce = (state, event) => ({
        ...state,
        locationId: String(event.payload.destinationId),
        elapsedMinutes: state.elapsedMinutes + 15,
        facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
      });
      const intent = {
        saveId: 'p2-page-close-save', actorId: 'p2-player', branchId: 'root', expectedRevision: 0,
        idempotencyKey, kind: 'move', payload: { destinationId: 'crash-target' },
      };
      const decide = (_action, save) => ({
        status: 'accepted', outcome: 'success', nextRevision: 1,
        events: [{
          id: eventId, saveId: save.saveId, branchId: 'root', type: 'PLAYER_MOVED',
          beforeRevision: 0, afterRevision: 1, occurredAt: '2026-10-05T13:00:00.000Z',
          source: 'RULES', ruleVersion: save.ruleVersion, payload: { destinationId: 'crash-target' },
        }],
      });
      const retried = await store.commitLocalAuthoritativeTurn({ intent, decide, reduce });
      return {
        status: retried.status,
        save: await store.readLocalAuthoritativeSave('p2-page-close-save'),
        replay: await store.verifyLocalReplay('p2-page-close-save', reduce),
        chain: await store.verifyLocalEventChain('p2-page-close-save'),
      };
    }, { idempotencyKey: pendingKey, eventId: pendingEventId });
    assert.ok(['committed', 'duplicate'].includes(recovered.status));
    assert.equal(recovered.save?.revision, 1);
    assert.equal(recovered.replay.valid, true);
    assert.equal(recovered.chain.valid, true);

    const backupJson = await recoveryPage.evaluate(async () => {
      const store = await import('/src/authoritative-turn-store.ts');
      const reduce = (state, event) => ({
        ...state,
        locationId: String(event.payload.destinationId),
        elapsedMinutes: state.elapsedMinutes + 15,
        facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
      });
      const archive = await store.exportLocalAuthorityArchive('p2-page-close-save', reduce);
      if (!archive) throw new Error('P2_BACKUP_SOURCE_NOT_FOUND');
      return JSON.stringify(archive);
    });
    const backupRoundTrip = await recoveryPage.evaluate(async archiveJson => {
      const store = await import('/src/authoritative-turn-store.ts');
      const reduce = (state, event) => ({
        ...state,
        locationId: String(event.payload.destinationId),
        elapsedMinutes: state.elapsedMinutes + 15,
        facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute ?? 0) + 15 },
      });
      const deleted = await new Promise((resolve, reject) => {
        const request = indexedDB.open('jiuxiao-1');
        request.onerror = () => reject(request.error ?? new Error('BACKUP_DELETE_OPEN_FAILED'));
        request.onsuccess = () => {
          const database = request.result;
          const names = ['authoritativeSaves', 'turnEvents', 'turnReceipts', 'authorizedObservationOutbox', 'turnIntegrity', 'turnCheckpoints'];
          const transaction = database.transaction(names, 'readwrite');
          transaction.objectStore('authoritativeSaves').delete('p2-page-close-save');
          transaction.objectStore('turnIntegrity').delete('p2-page-close-save');
          for (const name of ['turnEvents', 'turnReceipts', 'authorizedObservationOutbox', 'turnCheckpoints']) {
            const store = transaction.objectStore(name);
            const keys = store.index('saveId').getAllKeys('p2-page-close-save');
            keys.onsuccess = () => { for (const key of keys.result) store.delete(key); };
          }
          transaction.oncomplete = () => { database.close(); resolve(true); };
          transaction.onerror = () => reject(transaction.error ?? new Error('BACKUP_DELETE_FAILED'));
        };
      });
      const restored = await store.restoreLocalAuthorityArchive(archiveJson, reduce);
      return {
        deleted,
        restored: restored.status,
        save: await store.readLocalAuthoritativeSave('p2-page-close-save'),
        replay: await store.verifyLocalReplay('p2-page-close-save', reduce),
        chain: await store.verifyLocalEventChain('p2-page-close-save'),
      };
    }, backupJson);
    assert.equal(backupRoundTrip.deleted, true);
    assert.equal(backupRoundTrip.restored, 'restored');
    assert.equal(backupRoundTrip.save?.revision, 1);
    assert.equal(backupRoundTrip.replay.valid, true);
    assert.equal(backupRoundTrip.chain.valid, true);

    console.log(`P2 Chromium IndexedDB: v2->v3 upgrade, durable replay, cross-tab CAS, post-reload idempotent retry, atomic rollback, 100-turn replay (${longSession.elapsedMs} ms), page-close recovery, and full archive restore passed.`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await stop(child);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
