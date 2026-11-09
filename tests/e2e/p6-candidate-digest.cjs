#!/usr/bin/env node
// Candidate-only P6 queue simulation. Uses local committed receipts and no model service.
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
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitFor(url, child, stderr) {
  for (let index = 0; index < 120; index += 1) {
    if (child.exitCode !== null) throw new Error(`Vite exited early: ${stderr()}`);
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for Vite: ${stderr()}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  if (await Promise.race([exited.then(() => true), new Promise(resolveWait => setTimeout(() => resolveWait(false), 5000))])) return;
  const killed = once(child, 'exit');
  child.kill('SIGKILL');
  await killed;
}

(async () => {
  const port = await availablePort();
  const child = spawn(process.execPath, [viteFile, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: webRoot, stdio: 'pipe', windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  let browser;
  try {
    const origin = `http://127.0.0.1:${port}`;
    await waitFor(origin, child, () => stderr);
    const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async () => {
      const [runtimeModule, authority, queue] = await Promise.all([
        import('/src/p2-review-gameplay-runtime.ts'),
        import('/src/authoritative-turn-store.ts'),
        import('/src/p2-candidate-digest-queue.ts'),
      ]);
      const reviewModule = await import('/src/p2-candidate-digest-review.ts');
      const runtime = await runtimeModule.loadP2ReviewGameplayRuntime();
      const mode = 'continue';
      const saveId = `p6-queue-${crypto.randomUUID()}`;
      let save = await runtime.createSave(saveId, mode);
      const created = await authority.createLocalAuthoritativeSave(save);
      if (created.status !== 'created') throw new Error(`P6_SAVE_CREATE_${created.status}`);
      save = created.save;

      async function commitTalk(index) {
        const suggestion = runtime.actionSuggestions(save).talk[index - 1];
        if (!suggestion) throw new Error('P6_TALK_SUGGESTION_MISSING');
        const parsed = runtime.parse({ text: suggestion.text, save, idempotencyKey: crypto.randomUUID() });
        if (parsed.status !== 'ready') throw new Error(`P6_TALK_PARSE_${parsed.status}`);
        if (parsed.intent.kind !== 'talk') throw new Error('P6_TALK_INTENT_MISMATCH');
        const committed = await authority.commitLocalAuthoritativeTurn({ intent: parsed.intent,
          decide: (action, current, context) => runtime.decide(action, current, context),
          reduce: runtime.reduce, authorizeEvents: runtime.authorizeEvents });
        if (committed.status !== 'committed') throw new Error(`P6_TALK_COMMIT_${committed.status}`);
        save = committed.save;
      }
      await commitTalk(1);
      await commitTalk(2);
      const archive = await authority.exportLocalAuthorityArchive(saveId, runtime.reduce);
      if (!archive) throw new Error('P6_ARCHIVE_MISSING');
      const allSources = queue.buildP2CandidateDigestSourcesFromReceipts({
        save, receipts: archive.receipts.map(row => row.receipt), narrate: runtime.narrate,
      });
      if (allSources.length !== 2) throw new Error(`P6_SOURCE_COUNT_${allSources.length}`);
      const firstSources = allSources.filter(source => source.revision === 1);
      const secondSources = allSources.filter(source => source.revision === 2);
      const versions = { generatorVersion: 'p6-fixture-generator-v1', promptVersion: 'fixture-prompt-v1' };
      const enqueueInput = { save, sources: firstSources, fromRevision: 1, throughRevision: 1, ...versions, now: 1000 };
      const first = await queue.enqueueP2CandidateDigestRebuild(enqueueInput);
      const duplicate = await queue.enqueueP2CandidateDigestRebuild(enqueueInput);
      if (first.status !== 'queued' || duplicate.status !== 'duplicate' || first.jobId !== duplicate.jobId) {
        throw new Error('P6_IDEMPOTENT_ENQUEUE_FAILED');
      }

      const databaseName = queue.p2CandidateDigestDatabaseName(mode);
      const rawJob = await new Promise((resolveRaw, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('jobs', 'readonly');
          const get = tx.objectStore('jobs').get(first.jobId);
          get.onsuccess = () => { db.close(); resolveRaw(get.result); };
          get.onerror = () => { db.close(); reject(get.error); };
        };
      });
      const serializedJob = JSON.stringify(rawJob);
      if (serializedJob.includes(firstSources[0].text)) throw new Error('P6_RAW_TEXT_PERSISTED');

      // Simulate a worker process disappearing after acquiring its lease.
      await new Promise((resolveWrite, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('jobs', 'readwrite');
          const store = tx.objectStore('jobs');
          const get = store.get(first.jobId);
          get.onsuccess = () => store.put({ ...get.result, status: 'running', leaseToken: 'interrupted-worker', leaseUntil: 5000 });
          tx.oncomplete = () => { db.close(); resolveWrite(); };
          tx.onabort = () => { db.close(); reject(tx.error); };
        };
      });

      let builds = 0;
      const adapter = {
        adapterId: 'fixture-costed-adapter', ...versions, modelVendor: 'synthetic', modelId: 'fixture',
        quoteMaxCostMicros: () => 5,
        build: async ({ sources, idempotencyKey }) => {
          builds += 1;
          if (idempotencyKey !== first.jobId) throw new Error('P6_IDEMPOTENCY_KEY_NOT_PASSED');
          return { summary: '合成摘要，仅用于测试。', sourceIds: [sources[0].sourceId], billedCostMicros: 4 };
        },
      };
      const resolveSources = async refs => {
        const currentArchive = await authority.exportLocalAuthorityArchive(saveId, runtime.reduce);
        const currentSave = await authority.readLocalAuthoritativeSave(saveId);
        if (!currentArchive || !currentSave) throw new Error('P6_SOURCE_ARCHIVE_GONE');
        const candidates = queue.buildP2CandidateDigestSourcesFromReceipts({
          save: currentSave, receipts: currentArchive.receipts.map(row => row.receipt), narrate: runtime.narrate,
        });
        const byId = new Map(candidates.map(source => [source.sourceId, source]));
        return refs.map(ref => byId.get(ref.sourceId));
      };
      const blocked = await queue.runP2CandidateDigestQueue({ save, adapter, resolveSources, now: () => 10_000 });
      if (blocked.status !== 'budget-limited' || builds !== 0) throw new Error('P6_ZERO_BUDGET_DID_NOT_BLOCK');
      const recovered = await queue.runP2CandidateDigestQueue({ save, adapter, resolveSources, maxCostMicros: 5, now: () => 10_000 });
      if (recovered.completed !== 1 || builds !== 1) throw new Error('P6_EXPIRED_LEASE_RECOVERY_FAILED');
      let jobs = await queue.readP2CandidateDigestJobs(saveId, mode);
      const ready = jobs.find(job => job.jobId === first.jobId);
      if (!ready || ready.status !== 'ready' || !ready.artifact || ready.artifact.approvalStatus !== 'pending') {
        throw new Error('P6_PENDING_ARTIFACT_NOT_READY');
      }

      // A changed source snapshot must be stale, and an invented source ID must never become a citation.
      const badInput = { save, sources: secondSources, fromRevision: 2, throughRevision: 2,
        generatorVersion: 'p6-fixture-generator-v1', promptVersion: 'fixture-prompt-v2', now: 1000 };
      const badJob = await queue.enqueueP2CandidateDigestRebuild(badInput);
      const badAdapter = { ...adapter, promptVersion: 'fixture-prompt-v2', build: async () => ({
        summary: '伪造来源', sourceIds: ['forged-source'], billedCostMicros: 0,
      }) };
      const rejected = await queue.runP2CandidateDigestQueue({ save, adapter: badAdapter,
        resolveSources: async refs => refs.map(ref => ({ ...secondSources[0], sourceId: ref.sourceId })),
        maxCostMicros: 5, now: () => 20_000 });
      jobs = await queue.readP2CandidateDigestJobs(saveId, mode);
      const staleJob = jobs.find(job => job.jobId === badJob.jobId);
      if (!staleJob || staleJob.status !== 'stale' || staleJob.artifact !== null) throw new Error('P6_SOURCE_TAMPER_NOT_REJECTED');

      const concurrencyVersions = { generatorVersion: 'p6-concurrency-fixture-v1', promptVersion: 'concurrency-prompt-v1' };
      const concurrencyJobs = await Promise.all([
        queue.enqueueP2CandidateDigestRebuild({ save, sources: firstSources, fromRevision: 1, throughRevision: 1,
          ...concurrencyVersions, now: 1000 }),
        queue.enqueueP2CandidateDigestRebuild({ save, sources: secondSources, fromRevision: 2, throughRevision: 2,
          ...concurrencyVersions, now: 1000 }),
      ]);
      let activeBuilds = 0;
      let maximumActiveBuilds = 0;
      const concurrencyAdapter = {
        adapterId: 'fixture-concurrency-adapter', ...concurrencyVersions, modelVendor: null, modelId: null,
        quoteMaxCostMicros: () => 0,
        build: async ({ sources }) => {
          activeBuilds += 1;
          maximumActiveBuilds = Math.max(maximumActiveBuilds, activeBuilds);
          await new Promise(resolveDelay => setTimeout(resolveDelay, 80));
          activeBuilds -= 1;
          return { summary: '并发上限模拟摘句。', sourceIds: [sources[0].sourceId], billedCostMicros: 0 };
        },
      };
      const runConcurrentWorker = () => queue.runP2CandidateDigestQueue({ save, adapter: concurrencyAdapter,
        resolveSources, maxCostMicros: 0, maxConcurrency: 1, maxJobs: 2, now: () => 30_000 });
      const concurrentRuns = await Promise.all([runConcurrentWorker(), runConcurrentWorker()]);
      jobs = await queue.readP2CandidateDigestJobs(saveId, mode);
      const storedConcurrencyJobs = concurrencyJobs.map(item => jobs.find(job => job.jobId === item.jobId));
      if (maximumActiveBuilds !== 1 || storedConcurrencyJobs.some(job => job?.status !== 'ready')
        || concurrentRuns.reduce((total, item) => total + item.completed, 0) !== 2) {
        throw new Error('P6_CONCURRENCY_LIMIT_OR_RESUME_FAILED');
      }

      const retryVersions = { generatorVersion: 'p6-retry-fixture-v1', promptVersion: 'retry-prompt-v1' };
      const retryJob = await queue.enqueueP2CandidateDigestRebuild({ save, sources: secondSources,
        fromRevision: 2, throughRevision: 2, ...retryVersions, now: 1000 });
      let transientFailure = true;
      const retryAdapter = {
        adapterId: 'fixture-retry-adapter', ...retryVersions, modelVendor: null, modelId: null,
        quoteMaxCostMicros: () => 0,
        build: async ({ sources }) => {
          if (transientFailure) { transientFailure = false; throw new Error('simulated secret-bearing network failure'); }
          return { summary: '重试后生成的摘句。', sourceIds: [sources[0].sourceId], billedCostMicros: 0 };
        },
      };
      const failedOnce = await queue.runP2CandidateDigestQueue({ save, adapter: retryAdapter, resolveSources,
        maxCostMicros: 0, now: () => 40_000 });
      let retryRows = await queue.readP2CandidateDigestJobs(saveId, mode);
      const queuedRetry = retryRows.find(job => job.jobId === retryJob.jobId);
      if (failedOnce.failed !== 1 || !queuedRetry || queuedRetry.status !== 'queued'
        || queuedRetry.attempts !== 1 || queuedRetry.failureCode !== 'ADAPTER_FAILED'
        || JSON.stringify(queuedRetry).includes('secret-bearing')) throw new Error('P6_TRANSIENT_RETRY_POLICY_FAILED');
      const retried = await queue.runP2CandidateDigestQueue({ save, adapter: retryAdapter, resolveSources,
        maxCostMicros: 0, now: () => 42_000 });
      retryRows = await queue.readP2CandidateDigestJobs(saveId, mode);
      const recoveredRetry = retryRows.find(job => job.jobId === retryJob.jobId);
      if (retried.completed !== 1 || recoveredRetry?.status !== 'ready') throw new Error('P6_TRANSIENT_RETRY_RECOVERY_FAILED');

      const otherModeJobs = await queue.readP2CandidateDigestJobs(saveId, 'forgetting');
      const continueJobs = await queue.readP2CandidateDigestJobs(saveId, 'continue');
      if (otherModeJobs.length !== 0 || continueJobs.length !== 5
        || queue.p2CandidateDigestDatabaseName('continue') === queue.p2CandidateDigestDatabaseName('forgetting')) {
        throw new Error('P6_MODE_ISOLATION_FAILED');
      }

      const blockedProvenance = queue.toP2CandidatePlotDigestProvenance(ready.artifact);
      const context = runtime.narrativeContext(save, null, null, archive.observations.map(item => item.eventId));
      const { buildP2CandidateNarrativeContext } = await import('/src/p2-candidate-narrative.ts');
      const withDraft = buildP2CandidateNarrativeContext({ save, receipt: null, memoryEvidence: null,
        authorizedEventIds: archive.observations.map(item => item.eventId), approvedPlotDigests: [{
          provenance: blockedProvenance, summary: ready.artifact.summary,
          sourceIds: ready.artifact.sourceIds, artifactHash: ready.artifactHash,
        }] });
      if (withDraft.digestProvenance.length !== 0 || withDraft.sourceCatalog.some(item => item.sourceId === blockedProvenance.digestId)) {
        throw new Error('P6_UNREVIEWED_DIGEST_ENTERED_NARRATIVE_CONTEXT');
      }
      const approveInput = { save, jobId: ready.jobId, expectedArtifactHash: ready.artifactHash,
        decision: 'approved', reviewedAt: 50_000, resolveSources };
      const approved = await reviewModule.recordP2CandidateDigestReview(approveInput);
      const duplicateApproval = await reviewModule.recordP2CandidateDigestReview(approveInput);
      const approvedState = await reviewModule.readP2CandidateDigestReviewState({ save, resolveSources });
      const approvedContext = runtime.narrativeContext(save, null, null,
        archive.observations.map(item => item.eventId), approvedState.approvedPlotDigests);
      if (approved.status !== 'created' || duplicateApproval.status !== 'duplicate'
        || approvedContext.approvedPlotDigests.length !== 1
        || approvedContext.approvedPlotDigests[0].summary !== ready.artifact.summary
        || approvedContext.sourceCatalog.some(item => item.kind === 'plot-digest' && item.visibility !== 'player-visible')) {
        throw new Error('P6_APPROVED_DIGEST_CONTEXT_FAILED');
      }
      const staleApprovedState = await reviewModule.readP2CandidateDigestReviewState({ save,
        resolveSources: async refs => refs.map(ref => ({ ...firstSources[0], text: `${firstSources[0].text} 已变化`,
          sourceId: ref.sourceId, eventIds: [...ref.eventIds], revision: ref.revision })) });
      if (staleApprovedState.approvedPlotDigests.length !== 0
        || !staleApprovedState.staleApprovedDigestIds.includes(ready.artifact.digestId)) {
        throw new Error('P6_STALE_APPROVAL_REMAINED_IN_CONTEXT');
      }
      const rejectedReview = await reviewModule.recordP2CandidateDigestReview({ ...approveInput,
        decision: 'rejected', reviewedAt: 50_001 });
      const rejectedState = await reviewModule.readP2CandidateDigestReviewState({ save, resolveSources });
      if (rejectedReview.status !== 'created' || rejectedState.approvedPlotDigests.length !== 0
        || rejectedState.reviews.filter(row => row.jobId === ready.jobId).map(row => row.decision).join(',') !== 'approved,rejected') {
        throw new Error('P6_REVIEW_REJECTION_HISTORY_FAILED');
      }
      let staleApprovalRejected = false;
      try {
        await reviewModule.recordP2CandidateDigestReview({ ...approveInput, decision: 'approved', reviewedAt: 50_002,
          resolveSources: async refs => refs.map(ref => ({ ...secondSources[0], sourceId: ref.sourceId })) });
      } catch (error) { staleApprovalRejected = error.message === 'P6_DIGEST_SOURCE_STALE'; }
      if (!staleApprovalRejected) throw new Error('P6_STALE_SOURCE_REVIEW_NOT_REJECTED');
      const otherModeReviews = await reviewModule.readP2CandidateDigestReviewRecords(saveId, 'forgetting');
      if (otherModeReviews.length !== 0
        || reviewModule.p2CandidateDigestReviewDatabaseName('continue') === reviewModule.p2CandidateDigestReviewDatabaseName('forgetting')) {
        throw new Error('P6_REVIEW_MODE_ISOLATION_FAILED');
      }
      return {
        mode,
        idempotentEnqueue: first.status === 'queued' && duplicate.status === 'duplicate',
        sourceTextNotPersisted: !serializedJob.includes(firstSources[0].text),
        zeroBudgetBlocksProvider: blocked.status === 'budget-limited' && builds === 1,
        expiredLeaseRecovered: recovered.completed === 1,
        candidatePendingReview: ready.artifact.approvalStatus,
        inventedSourceRejectedAsStale: staleJob.status,
        modeIsolation: [queue.p2CandidateDigestDatabaseName('continue'), queue.p2CandidateDigestDatabaseName('forgetting')],
        unreviewedDigestExcluded: withDraft.digestProvenance.length === 0,
        review: { first: approved.status, duplicate: duplicateApproval.status, approvedContextCount: approvedContext.approvedPlotDigests.length,
          decisionHistory: rejectedState.reviews.filter(row => row.jobId === ready.jobId).map(row => row.decision),
          rejectedContextCount: rejectedState.approvedPlotDigests.length,
          staleApprovalRemovedFromContext: staleApprovedState.approvedPlotDigests.length === 0
            && staleApprovedState.staleApprovedDigestIds.includes(ready.artifact.digestId),
          staleSourceRejected: staleApprovalRejected },
        contextWithoutDigest: context.digestProvenance.length,
        forgedSourceResult: rejected.failed === 0 && rejected.stale === 1,
        transientRetry: { afterFailure: queuedRetry.status, attempts: queuedRetry.attempts,
          afterRetry: recoveredRetry.status },
        concurrency: { requested: 1, observedMaximum: maximumActiveBuilds,
          jobsReady: storedConcurrencyJobs.every(job => job?.status === 'ready') },
      };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/new`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: '姓名' }).fill('摘要队列验收行者');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('input[name="p2-memory-mode"][value="continue"]').check();
    await page.getByRole('button', { name: /保存角色并进入/ }).click();
    await page.getByTestId('p2-review-gameplay').waitFor({ state: 'visible' });
    await page.getByTestId('p2-suggestion-talk-0').click();
    await page.getByTestId('p2-submit-action').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '1');
    await page.getByTestId('p6-build-digest').click();
    await page.getByTestId('p6-digest-artifact').waitFor({ state: 'visible' });
    const pendingDigestPreview = await page.getByTestId('p6-digest-artifact').innerText();
    await page.getByTestId('p6-review-approve').click();
    await page.getByTestId('p6-digest-status').filter({ hasText: '已记入本机候选审核记录' }).waitFor({ state: 'visible' });
    await page.getByTestId('p2-narrative-context').locator('summary').click();
    await page.getByTestId('p6-approved-digest-context').waitFor({ state: 'visible' });
    const approvedContextVisible = await page.getByTestId('p6-approved-digest-context').isVisible();
    await page.getByTestId('p6-review-reject').click();
    await page.getByTestId('p6-digest-status').filter({ hasText: '已记入本机拒绝记录' }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="p6-approved-digest-context"]').length === 0);
    const uiJourney = {
      revision: await page.getByTestId('p2-revision').textContent(),
      digestStatus: await page.getByTestId('p6-digest-status').textContent(),
      digestPreview: pendingDigestPreview,
      approvedContextVisible,
      reviewAfterReject: await page.getByTestId('p6-digest-artifact').innerText(),
      viewportWidth: 390,
      documentWidth: await page.evaluate(() => document.documentElement.scrollWidth),
    };
    assert.equal(result.idempotentEnqueue, true);
    assert.equal(result.sourceTextNotPersisted, true);
    assert.equal(result.zeroBudgetBlocksProvider, true);
    assert.equal(result.expiredLeaseRecovered, true);
    assert.equal(result.candidatePendingReview, 'pending');
    assert.equal(result.inventedSourceRejectedAsStale, 'stale');
    assert.equal(result.unreviewedDigestExcluded, true);
    assert.equal(result.review.first, 'created');
    assert.equal(result.review.duplicate, 'duplicate');
    assert.equal(result.review.approvedContextCount, 1);
    assert.deepEqual(result.review.decisionHistory, ['approved', 'rejected']);
    assert.equal(result.review.rejectedContextCount, 0);
    assert.equal(result.review.staleApprovalRemovedFromContext, true);
    assert.equal(result.review.staleSourceRejected, true);
    assert.equal(result.forgedSourceResult, true);
    assert.equal(result.transientRetry.afterFailure, 'queued');
    assert.equal(result.transientRetry.attempts, 1);
    assert.equal(result.transientRetry.afterRetry, 'ready');
    assert.equal(result.concurrency.observedMaximum, 1);
    assert.equal(result.concurrency.jobsReady, true);
    assert.equal(uiJourney.revision, '1');
    assert.match(uiJourney.digestPreview, /待本机复核/);
    assert.equal(uiJourney.approvedContextVisible, true);
    assert.match(uiJourney.reviewAfterReject, /本机已拒绝/);
    assert.ok(uiJourney.documentWidth <= uiJourney.viewportWidth, 'P6 panel must not create mobile horizontal overflow');
    assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
    console.log(JSON.stringify({ acceptance: 'P6 local candidate queue; synthetic adapter only; no provider billed', ...result,
      uiJourney, browser: 'Chromium headless 390x844', pageErrors }, null, 2));
  } finally {
    await browser?.close();
    await stop(child);
  }
})().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });
