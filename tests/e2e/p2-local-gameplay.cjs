#!/usr/bin/env node
// Development-only gameplay acceptance: browser UI journey plus deterministic
// dual-memory, T80, idempotency, and IndexedDB isolation simulations.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdirSync } = require('node:fs');
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

async function waitFor(url, child, stderr) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Vite exited early: ${stderr()}`);
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Vite at ${url}: ${stderr()}`);
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

async function createLocalReviewSave(page, memoryMode) {
  await page.goto(`${page.context()._jiuxiaoOrigin}/new`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: '姓名' }).fill('本机验收行者');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator(`input[name="p2-memory-mode"][value="${memoryMode}"]`).check();
  const screenStart = Date.now();
  await page.getByRole('button', { name: /保存角色并进入/ }).click();
  await page.getByTestId('p2-review-gameplay').waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByTestId('p2-memory-panel').waitFor({ state: 'visible' });
  await page.getByTestId('p2-suggestion-talk-0').waitFor({ state: 'visible' });
  return { saveId: new URL(page.url()).pathname.split('/').at(-1), screenToFirstActionMs: Date.now() - screenStart };
}

async function runT80Simulation(browser, origin, memoryMode) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    page.setDefaultTimeout(120_000);
    const result = await page.evaluate(async ({ memoryMode, saveId }) => {
      const [{ loadP2ReviewGameplayRuntime }, authority, memoryStore] = await Promise.all([
        import('/src/p2-review-gameplay-runtime.ts'),
        import('/src/authoritative-turn-store.ts'),
        import('/src/p2-candidate-memory-store.ts'),
      ]);
      const runtime = await loadP2ReviewGameplayRuntime();
      let save = await runtime.createSave(saveId, memoryMode);
      const created = await authority.createLocalAuthoritativeSave(save);
      if (created.status !== 'created') throw new Error(`T80_SAVE_CREATE_${created.status}`);
      save = created.save;
      const grantCounts = [];
      for (let index = 0; index < 80; index += 1) {
        const idempotencyKey = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
        const intent = {
          saveId,
          actorId: save.state.playerId,
          branchId: 'root',
          expectedRevision: save.revision,
          idempotencyKey,
          kind: 'talk',
          payload: { npcId: 'npc_cenjiu', utterance: index === 0 ? '这石头怎么办' : '不要去望气台' },
        };
        const turn = await authority.commitLocalAuthoritativeTurn({
          intent,
          decide: (action, currentSave, context) => runtime.decide(action, currentSave, context),
          reduce: runtime.reduce,
          authorizeEvents: runtime.authorizeEvents,
        });
        if (turn.status !== 'committed') throw new Error(`T80_TURN_${index + 1}_${turn.status}`);
        save = turn.save;
      }
      const [chain, replay, archive] = await Promise.all([
        authority.verifyLocalEventChain(saveId),
        authority.verifyLocalReplay(saveId, runtime.reduce),
        authority.exportLocalAuthorityArchive(saveId, runtime.reduce),
      ]);
      if (!archive) throw new Error('T80_ARCHIVE_UNAVAILABLE');
      const projection = await memoryStore.syncP2CandidateMemoryProjection(save, archive.observations);
      const recall = runtime.recallHistoricalMemory(
        projection.observations.filter(row => row.npcId === 'npc_cenjiu'),
        '求岑九处理落石', Number(save.state.facts.gameMinute), save.revision,
        memoryMode === 'forgetting',
      );
      const otherMode = memoryMode === 'continue' ? 'forgetting' : 'continue';
      let crossModeFallbackRejected = false;
      try {
        const wrongPolicySave = await runtime.createSave(saveId, otherMode);
        await memoryStore.readP2CandidateMemoryProjection(wrongPolicySave);
      } catch (error) { crossModeFallbackRejected = String(error).includes('MEMORY_PROJECTION_CURSOR_MISSING'); }
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(memoryStore.p2CandidateMemoryDatabaseName(memoryMode), 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('observations', 'readwrite');
        const store = transaction.objectStore('observations');
        const request = store.index('saveId').getAll(saveId);
        request.onsuccess = () => {
          const first = request.result[0];
          if (!first) { reject(new Error('T80_PROJECTION_ROW_MISSING')); return; }
          first.observation.summary = 'tampered projection';
          first.observation.authorizedFacts.summary = 'tampered projection';
          store.put(first);
        };
        transaction.oncomplete = resolve;
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
      database.close();
      let manifestTamperRejected = false;
      try { await memoryStore.readP2CandidateMemoryProjection(save); }
      catch (error) { manifestTamperRejected = String(error).includes('MEMORY_PROJECTION_MANIFEST_MISMATCH'); }
      let projectionConflictRejected = false;
      try { await memoryStore.syncP2CandidateMemoryProjection(save, archive.observations); }
      catch (error) { projectionConflictRejected = String(error).includes('MEMORY_PROJECTION_CONFLICT'); }
      const durableWorldAfterMemoryFailure = await authority.readLocalAuthoritativeSave(saveId);
      const chainAfterMemoryFailure = await authority.verifyLocalEventChain(saveId);
      const names = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map(item => item.name) : [];
      return {
        memoryMode,
        saveRevision: save.revision,
        eventCount: chain.eventCount,
        chainValid: chain.valid,
        replayValid: replay.valid,
        observationCount: archive.observations.length,
        projectedCount: projection.observations.length,
        grantIds: archive.observations.map(row => row.grantId).sort(),
        firstGrantEventId: archive.observations.find(row => row.eventRevision === 1)?.eventId,
        recallStatus: recall.status,
        recalledEventId: recall.status === 'complete' ? recall.eventId : undefined,
        memoryDatabase: memoryStore.p2CandidateMemoryDatabaseName(memoryMode),
        databaseNames: names,
        crossModeFallbackRejected,
        manifestTamperRejected,
        projectionConflictRejected,
        worldRevisionAfterProjectionFailure: durableWorldAfterMemoryFailure.revision,
        authorityChainAfterProjectionFailure: chainAfterMemoryFailure.valid,
      };
    }, { memoryMode, saveId: 'p8-t80-identical-authority-save' });
    assert.deepEqual(pageErrors, []);
    assert.equal(result.saveRevision, 80);
    assert.equal(result.eventCount, 80);
    assert.equal(result.chainValid, true);
    assert.equal(result.replayValid, true);
    assert.equal(result.observationCount, 80);
    assert.equal(result.projectedCount, 80);
    assert.equal(result.databaseNames.includes(result.memoryDatabase), true);
    assert.equal(result.crossModeFallbackRejected, true);
    assert.equal(result.manifestTamperRejected, true);
    assert.equal(result.projectionConflictRejected, true);
    assert.equal(result.worldRevisionAfterProjectionFailure, 80);
    assert.equal(result.authorityChainAfterProjectionFailure, true);
    return result;
  } finally { await context.close(); }
}

async function runP7CatchUpSimulation(browser, origin) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async () => {
      const offline = await import('/src/p2-candidate-offline.ts');
      const store = await import('/src/p2-candidate-offline-store.ts');
      const event = {
        eventId: 'test:rain', version: 'fixture-v1', eventClass: 'environment', actorAbsent: true,
        protagonistInvolved: false, causedByProtagonist: false, reversible: true,
        changesIdentity: false, changesRelationship: false, changesMoralStance: false,
        exclusiveOutcomeCount: 1, requiresPlayerChoice: false, frequency: 'low', weight: 'high',
        resourceOutputs: [{ resourceId: 'fixture:stamina', resourceClass: 'renewable', quantityMicrounits: 1_000_000 }],
      };
      const plan = offline.planP7OfflineCatchUp({
        saveId: 'p7-browser-simulation', memoryMode: 'continue', checkpointId: 'checkpoint-1',
        startedAtMs: 1_000_000, returnedAtMs: 1_000_000 + 24 * 60 * 60_000,
        scheduledEvents: [{ eventId: event.eventId, occurrenceId: 'rain-1', elapsedMinute: 900, repeatOrdinal: 2 }],
        ruptures: [], allowlist: { [event.eventId]: event }, recentAuthorizedOnlineAction: false,
      });
      const first = await store.storeP7CandidateOfflinePlan(plan);
      const duplicate = await store.storeP7CandidateOfflinePlan(plan);
      const laterRetry = offline.planP7OfflineCatchUp({
        saveId: 'p7-browser-simulation', memoryMode: 'continue', checkpointId: 'checkpoint-1',
        startedAtMs: 1_000_000, returnedAtMs: 1_000_000 + 25 * 60 * 60_000,
        scheduledEvents: [{ eventId: event.eventId, occurrenceId: 'rain-1', elapsedMinute: 900, repeatOrdinal: 2 }],
        ruptures: [], allowlist: { [event.eventId]: event }, recentAuthorizedOnlineAction: false,
      });
      const recovered = await store.recoverP7CandidateOfflinePlan({
        saveId: plan.saveId, memoryMode: plan.memoryMode, checkpointId: plan.checkpointId,
      });
      let laterRetryConflictRejected = false;
      try { await store.storeP7CandidateOfflinePlan(laterRetry); }
      catch (error) { laterRetryConflictRejected = String(error).includes('P7_CATCHUP_IDEMPOTENCY_CONFLICT'); }
      const continueRows = await store.readP7CandidateOfflinePlans(plan.saveId, 'continue');
      const forgettingRows = await store.readP7CandidateOfflinePlans(plan.saveId, 'forgetting');
      const altered = { ...plan, window: 'micro' };
      let conflictRejected = false;
      try { await store.storeP7CandidateOfflinePlan(altered); }
      catch (error) { conflictRejected = String(error).includes('P7_CATCHUP_IDEMPOTENCY_CONFLICT'); }
      const name = store.p7CandidateOfflineDatabaseName('continue');
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('catchups', 'readwrite');
        const request = transaction.objectStore('catchups').get(plan.catchUpId);
        request.onsuccess = () => {
          const row = request.result;
          row.plan.elapsedMinutes += 1;
          transaction.objectStore('catchups').put(row);
        };
        transaction.oncomplete = resolve;
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
      db.close();
      let tamperRejected = false;
      try { await store.readP7CandidateOfflinePlans(plan.saveId, 'continue'); }
      catch (error) { tamperRejected = String(error).includes('P7_CATCHUP_STORE_INTEGRITY_CONFLICT'); }
      return {
        first, duplicate, mainWindow: plan.window, settled: plan.environmentSettlements.map(item => item.eventId),
        lossLayerElapsedMinutes: plan.lossLayerElapsedMinutes, continueRows: continueRows.length,
        retryKeptFrozenPlan: recovered?.catchUpId === plan.catchUpId && recovered.elapsedMinutes === plan.elapsedMinutes,
        laterRetryConflictRejected,
        forgettingRows: forgettingRows.length, conflictRejected, tamperRejected,
        databaseNames: [store.p7CandidateOfflineDatabaseName('continue'), store.p7CandidateOfflineDatabaseName('forgetting')],
      };
    });
    assert.deepEqual(result, {
      first: 'stored', duplicate: 'duplicate', mainWindow: 'long', settled: ['test:rain'],
      lossLayerElapsedMinutes: 1440, continueRows: 1, forgettingRows: 0,
      retryKeptFrozenPlan: true, laterRetryConflictRejected: true,
      conflictRejected: true, tamperRejected: true,
      databaseNames: ['jiuxiao-offline-continue-candidate', 'jiuxiao-offline-forgetting-candidate'],
    });
    return result;
  } finally { await context.close(); }
}

(async () => {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const webChild = spawn(process.execPath, [viteFile, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: webRoot,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let webStderr = '';
  webChild.stderr.on('data', chunk => { webStderr += chunk.toString(); });
  let browser;
  let context;
  try {
    await waitFor(origin, webChild, () => webStderr);
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    context._jiuxiaoOrigin = origin;
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    const uiJourney = await createLocalReviewSave(page, 'continue');
    const uiSaveId = uiJourney.saveId;
    mkdirSync(join(root, 'test-results/e2e'), { recursive: true });
    const mobileScreenshot = join(root, 'test-results/e2e/p2-local-mobile-390x844.png');
    await page.screenshot({ path: mobileScreenshot, fullPage: true });
    assert.ok(uiJourney.screenToFirstActionMs <= 3_000, `first local action took ${uiJourney.screenToFirstActionMs}ms`);
    await page.getByTestId('p2-current-location').getByText('芦花渡').waitFor();
    const beforeClarification = await page.evaluate(() => ({
      revision: document.querySelector('[data-testid="p2-revision"]')?.textContent,
      minute: document.querySelector('[data-testid="p2-game-minute"]')?.textContent,
      eventCount: document.querySelector('[data-testid="p2-event-count"]')?.textContent,
    }));
    await page.getByTestId('p2-action-input').fill('打开时光裂缝');
    await page.getByTestId('p2-submit-action').click();
    await page.getByTestId('p2-narrative').waitFor({ state: 'visible' });
    assert.match(await page.getByTestId('p2-narrative').textContent(), /打开时光裂缝/,
      'unknown command is safely echoed in presentation only');
    assert.deepEqual(await page.evaluate(() => ({
      revision: document.querySelector('[data-testid="p2-revision"]')?.textContent,
      minute: document.querySelector('[data-testid="p2-game-minute"]')?.textContent,
      eventCount: document.querySelector('[data-testid="p2-event-count"]')?.textContent,
    })), beforeClarification, 'unknown command clarification must not commit or advance world state');
    const pendingClarificationId = await page.evaluate(async saveId => {
      const authority = await import('/src/authoritative-turn-store.ts');
      const runtime = await import('/src/p2-review-gameplay-runtime.ts');
      const loaded = await runtime.loadP2ReviewGameplayRuntime();
      const archive = await authority.exportLocalAuthorityArchive(saveId, loaded.reduce);
      return {
        interactionId: archive.receipts.find(row => row.receipt.decision.status === 'clarify')?.receipt.decision.interactionId,
        rawInputPersisted: JSON.stringify({ receipts: archive.receipts, events: archive.events,
          observations: archive.observations }).includes('打开时光裂缝'),
      };
    }, uiSaveId);
    assert.ok(pendingClarificationId.interactionId, 'clarification should have a durable interaction id without raw input');
    assert.equal(pendingClarificationId.rawInputPersisted, false, 'raw free text must not enter durable receipts, events, or memory grants');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('p2-review-gameplay').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '0');
    const taskStart = Date.now();
    await page.getByTestId('p2-suggestion-talk-0').click();
    assert.match(await page.getByTestId('p2-action-input').inputValue(), /^对岑九说：/);
    await page.getByTestId('p2-submit-action').click();
    try { await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '1', null, { timeout: 8_000 }); }
    catch { throw new Error(`UI_FIRST_TURN_DID_NOT_COMMIT: status=${await page.getByTestId('p2-status').textContent().catch(() => 'missing')}; errors=${pageErrors.join('|')}; body=${(await page.locator('body').innerText()).slice(-1200)}`); }
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-memory-panel"]')?.textContent.includes('授权观察 1 条'));
    const linkedClarification = await page.evaluate(async ({ saveId, pendingClarificationId }) => {
      const authority = await import('/src/authoritative-turn-store.ts');
      const runtime = await import('/src/p2-review-gameplay-runtime.ts');
      const loaded = await runtime.loadP2ReviewGameplayRuntime();
      const archive = await authority.exportLocalAuthorityArchive(saveId, loaded.reduce);
      return archive.receipts.some(row => row.receipt.clarificationOf === pendingClarificationId);
    }, { saveId: uiSaveId, pendingClarificationId: pendingClarificationId.interactionId });
    assert.equal(linkedClarification, true, 'the next parsed action should link to the unresolved clarification');
    const afterTalk = await page.evaluate(() => ({
      revision: document.querySelector('[data-testid="p2-revision"]')?.textContent,
      minute: document.querySelector('[data-testid="p2-game-minute"]')?.textContent,
      eventCount: document.querySelector('[data-testid="p2-event-count"]')?.textContent,
    }));
    await page.getByTestId('p2-action-input').fill('你还记得岑九处理落石吗？');
    await page.getByTestId('p2-submit-action').click();
    await page.getByTestId('p2-memory-result').waitFor({ state: 'visible' });
    assert.match(await page.getByTestId('p2-memory-result').textContent(), /找到一条可核对记忆/);
    assert.match(await page.getByTestId('p2-memory-result').textContent(), /talk\.occurred|来源事件/);
    assert.deepEqual(await page.evaluate(() => ({
      revision: document.querySelector('[data-testid="p2-revision"]')?.textContent,
      minute: document.querySelector('[data-testid="p2-game-minute"]')?.textContent,
      eventCount: document.querySelector('[data-testid="p2-event-count"]')?.textContent,
    })), afterTalk, 'memory query must not write a turn, event, or game time');

    await page.locator('[data-testid^="p2-structured-acquire_item-"]').click();
    assert.match(await page.getByTestId('p2-action-input').inputValue(), /^拾取/);
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '2');
    await page.locator('[data-testid^="p2-structured-move-"]').first().click();
    assert.match(await page.getByTestId('p2-action-input').inputValue(), /^前往/);
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '3');
    await page.getByTestId('p2-suggestion-use-item-0').click();
    assert.match(await page.getByTestId('p2-action-input').inputValue(), /^使用/);
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '4');
    await page.getByTestId('p2-suggestion-combat-0').click();
    assert.match(await page.getByTestId('p2-action-input').inputValue(), /交战$/);
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '5');
    assert.match(await page.getByTestId('p2-state-facts').textContent(), /已完成，待领取/);
    await page.getByTestId('p2-action-input').fill('去芦花渡');
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '6');
    await page.getByTestId('p2-suggestion-move-0').click();
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '7'
      && document.querySelector('[data-testid="p2-current-location"]')?.textContent === '望气台');
    await page.getByTestId('p2-suggestion-observe-0').click();
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '8');
    await page.getByTestId('p2-action-input').fill('去芦花渡');
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '9');
    await page.locator('[data-testid^="p2-structured-quest-"]').click();
    assert.match(await page.getByTestId('p2-action-input').inputValue(), /^领取任务奖励：/);
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '10');
    const firstTaskSimulationMs = Date.now() - taskStart;
    assert.ok(firstTaskSimulationMs < 180_000, `first task simulation took ${firstTaskSimulationMs}ms`);
    assert.match(await page.getByTestId('p2-state-facts').textContent(), /已领取奖励/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('p2-review-gameplay').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '10');
    assert.equal(pageErrors.length, 0, pageErrors.join('\n'));

    const duplicate = await page.evaluate(async saveId => {
      const [{ loadP2ReviewGameplayRuntime }, authority] = await Promise.all([
        import('/src/p2-review-gameplay-runtime.ts'), import('/src/authoritative-turn-store.ts'),
      ]);
      const runtime = await loadP2ReviewGameplayRuntime();
      const before = await authority.readLocalAuthoritativeSave(saveId);
      const idempotencyKey = crypto.randomUUID();
      const intent = { saveId, actorId: before.state.playerId, branchId: 'root', expectedRevision: before.revision,
        idempotencyKey, kind: 'talk', payload: { npcId: 'npc_cenjiu', utterance: '不要去望气台' } };
      const input = { intent, decide: (action, current, context) => runtime.decide(action, current, context),
        reduce: runtime.reduce, authorizeEvents: runtime.authorizeEvents };
      const first = await authority.commitLocalAuthoritativeTurn(input);
      const second = await authority.commitLocalAuthoritativeTurn(input);
      const after = await authority.readLocalAuthoritativeSave(saveId);
      const archive = await authority.exportLocalAuthorityArchive(saveId, runtime.reduce);
      return { first: first.status, second: second.status, revisionDelta: after.revision - before.revision,
        observations: archive.observations.length, eventCount: archive.events.length };
    }, uiSaveId);
    assert.deepEqual(duplicate, { first: 'committed', second: 'duplicate', revisionDelta: 1, observations: 2, eventCount: 13 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '11');

    const continued = await runT80Simulation(browser, origin, 'continue');
    const forgotten = await runT80Simulation(browser, origin, 'forgetting');
    const p7Simulation = await runP7CatchUpSimulation(browser, origin);
    assert.deepEqual(continued.grantIds, forgotten.grantIds, 'the same frozen authorization set must project to both modes');
    assert.equal(continued.memoryDatabase, 'jiuxiao-memory-continue');
    assert.equal(forgotten.memoryDatabase, 'jiuxiao-memory-forgetting');
    assert.equal(continued.recallStatus, 'complete');
    assert.equal(forgotten.recallStatus, 'forgotten');
    assert.equal(continued.recalledEventId, continued.firstGrantEventId);
    assert.equal(continued.firstGrantEventId, forgotten.firstGrantEventId,
      'both mode stores contain the same event even though forgetting no longer exposes its evidence');

    console.log(JSON.stringify({
      acceptance: 'P2/P3/P4/P5/P8 local candidate simulation; development-only; no production API, DB or model service',
      uiJourney: { saveId: uiSaveId, firstTalkRevision: 1, noWriteMemoryRecall: true,
        acquiredAndUsedItem: true, deterministicCombat: true, taskRewardClaimed: true,
        screenToFirstActionMs: uiJourney.screenToFirstActionMs, firstTaskSimulationMs,
        mobileScreenshot, reloadRecoveredRevision: 10, idempotency: duplicate },
      t80: {
        identicalAuthorizationSet: continued.grantIds.length === 80 && continued.grantIds.every((id, index) => id === forgotten.grantIds[index]),
        continue: { revision: continued.saveRevision, events: continued.eventCount, recall: continued.recallStatus, database: continued.memoryDatabase },
        forgetting: { revision: forgotten.saveRevision, events: forgotten.eventCount, recall: forgotten.recallStatus, database: forgotten.memoryDatabase },
        faultInjection: { crossModeFallbackRejected: continued.crossModeFallbackRejected && forgotten.crossModeFallbackRejected,
          projectionManifestTamperRejected: continued.manifestTamperRejected && forgotten.manifestTamperRejected,
          memoryProjectionConflictRejected: continued.projectionConflictRejected && forgotten.projectionConflictRejected,
          authorityRemainedAtRevision: continued.worldRevisionAfterProjectionFailure,
          eventChainStillValid: continued.authorityChainAfterProjectionFailure && forgotten.authorityChainAfterProjectionFailure },
      },
      p7Candidate: p7Simulation,
      browser: 'Chromium headless 390x844',
      pageErrors,
    }, null, 2));
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await stop(webChild);
  }
})().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
