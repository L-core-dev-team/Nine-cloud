import type { MemoryMode, SaveEnvelopeV3, TurnReceipt } from '@jiuxiao/contracts';
import { canonicalJson } from '@jiuxiao/domain';
import type { PlotDigestProvenance } from './p2-candidate-narrative.js';

const DATABASE_NAMES: Readonly<Record<MemoryMode, string>> = {
  continue: 'jiuxiao-plot-digest-continue-candidate',
  forgetting: 'jiuxiao-plot-digest-forgetting-candidate',
};
const DATABASE_VERSION = 1;
const MODE_STORE = 'mode';
const JOB_STORE = 'jobs';
const MAX_SOURCE_COUNT = 500;
const MAX_SOURCE_TEXT_LENGTH = 4000;
const MAX_DIGEST_LENGTH = 1800;

export type P2CandidateDigestSource = {
  sourceId: string;
  eventIds: readonly string[];
  saveId: string;
  branchId: 'root';
  memoryMode: MemoryMode;
  revision: number;
  visibility: 'player-visible';
  authorization: 'committed-player-receipt';
  text: string;
};

export type P2CandidateDigestJobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'stale';
export type P2CandidateDigestSourceRef = Pick<P2CandidateDigestSource, 'sourceId' | 'eventIds' | 'revision'>;

export type P2CandidateDigestArtifact = {
  digestId: string;
  saveId: string;
  branchId: 'root';
  memoryMode: MemoryMode;
  fromRevision: number;
  throughRevision: number;
  coveredEventIds: readonly string[];
  sourceIds: readonly string[];
  generatorVersion: string;
  promptVersion: string;
  inputHash: `sha256:${string}`;
  outputHash: `sha256:${string}`;
  modelVendor: string | null;
  modelId: string | null;
  approvalStatus: 'pending';
  rebuildStatus: 'ready';
  summary: string;
  createdAt: number;
};

export type P2CandidateDigestJob = {
  schemaVersion: 1;
  jobId: string;
  saveId: string;
  branchId: 'root';
  memoryMode: MemoryMode;
  policyArtifactHash: string;
  fromRevision: number;
  throughRevision: number;
  sourceRefs: readonly P2CandidateDigestSourceRef[];
  inputHash: `sha256:${string}`;
  generatorVersion: string;
  promptVersion: string;
  status: P2CandidateDigestJobStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  retryAt: number;
  leaseToken: string | null;
  leaseUntil: number | null;
  failureCode: string | null;
  artifact: P2CandidateDigestArtifact | null;
  artifactHash: `sha256:${string}` | null;
};

type ModeRow = { key: 'mode'; memoryMode: MemoryMode; schemaVersion: 1 };
type EnqueueResult = { status: 'queued' | 'duplicate'; jobId: string };
type RunResult = {
  status: 'completed' | 'idle' | 'budget-limited';
  completed: number;
  failed: number;
  stale: number;
  reservedCostMicros: number;
};

export type P2CandidateDigestAdapter = {
  readonly adapterId: string;
  readonly generatorVersion: string;
  readonly promptVersion: string;
  readonly modelVendor: string | null;
  readonly modelId: string | null;
  /** Maximum provider charge in micro-units before making a request. */
  readonly quoteMaxCostMicros: (job: Readonly<P2CandidateDigestJob>) => number;
  readonly build: (input: {
    readonly job: Readonly<P2CandidateDigestJob>;
    readonly sources: readonly P2CandidateDigestSource[];
    /** Provider adapters should send this unchanged as their idempotency key. */
    readonly idempotencyKey: string;
  }) => Promise<{ summary: string; sourceIds: readonly string[]; billedCostMicros: number }>;
};

export type RunP2CandidateDigestQueueOptions = {
  save: SaveEnvelopeV3;
  adapter: P2CandidateDigestAdapter;
  resolveSources: (refs: readonly P2CandidateDigestSourceRef[]) => Promise<readonly P2CandidateDigestSource[]>;
  /** Per-drain ceiling. Defaults to zero, which permits only free adapters. */
  maxCostMicros?: number;
  maxJobs?: number;
  maxConcurrency?: number;
  leaseMilliseconds?: number;
  now?: () => number;
};

/**
 * Builds safe, player-visible digest inputs from accepted receipts only.
 * It deliberately excludes free text, candidate parser input and NPC-private memory.
 */
export function buildP2CandidateDigestSourcesFromReceipts(input: {
  save: SaveEnvelopeV3;
  receipts: readonly TurnReceipt[];
  narrate: (receipt: TurnReceipt) => string;
}): readonly P2CandidateDigestSource[] {
  assertCandidateSave(input.save);
  if (!Array.isArray(input.receipts) || typeof input.narrate !== 'function') {
    throw new Error('P6_DIGEST_RECEIPT_SOURCE_INVALID');
  }
  const sources: P2CandidateDigestSource[] = [];
  const revisions = new Set<number>();
  for (const receipt of input.receipts) {
    if (receipt.saveId !== input.save.saveId || receipt.resultingRevision > input.save.revision
      || receipt.decision.status !== 'accepted' || receipt.decision.events.length === 0) continue;
    if (revisions.has(receipt.resultingRevision)) throw new Error('P6_DIGEST_RECEIPT_REVISION_DUPLICATE');
    revisions.add(receipt.resultingRevision);
    const eventIds = receipt.decision.events.map((event: { id: string }) => event.id);
    if (new Set(eventIds).size !== eventIds.length) throw new Error('P6_DIGEST_RECEIPT_EVENTS_DUPLICATE');
    const text = input.narrate(receipt).trim();
    if (!text || text.length > MAX_SOURCE_TEXT_LENGTH) throw new Error('P6_DIGEST_RECEIPT_TEXT_INVALID');
    sources.push({
      sourceId: `receipt:${input.save.saveId}:${receipt.resultingRevision}`,
      eventIds,
      saveId: input.save.saveId,
      branchId: 'root',
      memoryMode: input.save.memoryMode,
      revision: receipt.resultingRevision,
      visibility: 'player-visible',
      authorization: 'committed-player-receipt',
      text,
    });
  }
  return sources.sort(compareSource);
}

/** Enqueues a versioned digest job; payload text is hashed but never stored in IndexedDB. */
export async function enqueueP2CandidateDigestRebuild(input: {
  save: SaveEnvelopeV3;
  sources: readonly P2CandidateDigestSource[];
  fromRevision: number;
  throughRevision: number;
  generatorVersion: string;
  promptVersion: string;
  now?: number;
}): Promise<EnqueueResult> {
  assertCandidateSave(input.save);
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(input.fromRevision) || input.fromRevision < 0
    || !Number.isSafeInteger(input.throughRevision) || input.throughRevision < input.fromRevision
    || input.throughRevision > input.save.revision
    || !validVersion(input.generatorVersion) || !validVersion(input.promptVersion)
    || !Number.isSafeInteger(now) || now < 0) throw new Error('P6_DIGEST_JOB_INPUT_INVALID');
  const sources = canonicalSources(input.save, input.sources, input.fromRevision, input.throughRevision);
  const inputHash = await digestHash({
    saveId: input.save.saveId,
    branchId: input.save.branchId,
    memoryMode: input.save.memoryMode,
    policyArtifactHash: input.save.memoryPolicy.policyArtifactHash,
    fromRevision: input.fromRevision,
    throughRevision: input.throughRevision,
    generatorVersion: input.generatorVersion,
    promptVersion: input.promptVersion,
    sources,
  });
  const sourceRefs = sources.map(({ sourceId, eventIds, revision }) => ({ sourceId, eventIds: [...eventIds], revision }));
  const jobId = await jobIdFor({
    saveId: input.save.saveId, memoryMode: input.save.memoryMode, policyArtifactHash: input.save.memoryPolicy.policyArtifactHash,
    fromRevision: input.fromRevision, throughRevision: input.throughRevision, sourceRefs, inputHash,
    generatorVersion: input.generatorVersion, promptVersion: input.promptVersion,
  });
  const job: P2CandidateDigestJob = {
    schemaVersion: 1, jobId, saveId: input.save.saveId, branchId: 'root', memoryMode: input.save.memoryMode,
    policyArtifactHash: input.save.memoryPolicy.policyArtifactHash,
    fromRevision: input.fromRevision, throughRevision: input.throughRevision, sourceRefs,
    inputHash, generatorVersion: input.generatorVersion, promptVersion: input.promptVersion,
    status: 'queued', attempts: 0, createdAt: now, updatedAt: now, retryAt: now,
    leaseToken: null, leaseUntil: null, failureCode: null, artifact: null, artifactHash: null,
  };
  const database = await openDatabase(input.save.memoryMode);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([MODE_STORE, JOB_STORE], 'readwrite');
      const modeRequest = transaction.objectStore(MODE_STORE).get('mode');
      const existingRequest = transaction.objectStore(JOB_STORE).get(jobId);
      let modeRow: ModeRow | undefined;
      let existing: P2CandidateDigestJob | undefined;
      let result: EnqueueResult = { status: 'queued', jobId };
      let failure: Error | null = null;
      const commit = () => {
        if (failure || !modeRow || existingRequest.readyState !== 'done' || modeRequest.readyState !== 'done') return;
        try {
          assertModeRow(modeRow, input.save.memoryMode);
          if (existing) {
            assertStoredJob(existing, input.save.memoryMode);
            if (existing.inputHash !== inputHash || existing.jobId !== jobId) throw new Error('P6_DIGEST_IDEMPOTENCY_CONFLICT');
            result = { status: 'duplicate', jobId };
          } else transaction.objectStore(JOB_STORE).add(job);
        } catch (error) {
          failure = error instanceof Error ? error : new Error('P6_DIGEST_ENQUEUE_FAILED');
          try { transaction.abort(); } catch { /* transaction may already be inactive */ }
        }
      };
      modeRequest.onsuccess = () => { modeRow = modeRequest.result as ModeRow | undefined; commit(); };
      existingRequest.onsuccess = () => { existing = existingRequest.result as P2CandidateDigestJob | undefined; commit(); };
      modeRequest.onerror = existingRequest.onerror = () => {
        failure = new Error('P6_DIGEST_ENQUEUE_READ_FAILED');
        try { transaction.abort(); } catch { /* transaction may already be inactive */ }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('P6_DIGEST_ENQUEUE_ABORTED'));
      transaction.onerror = () => { /* onabort reports the atomic result */ };
    });
  } finally { database.close(); }
}

/** Reads and validates one save/mode queue. Raw source text is absent by design. */
export async function readP2CandidateDigestJobs(saveId: string, memoryMode: MemoryMode): Promise<readonly P2CandidateDigestJob[]> {
  if (!saveId.trim() || !isMemoryMode(memoryMode)) throw new Error('P6_DIGEST_READ_SCOPE_INVALID');
  const database = await openDatabase(memoryMode);
  try {
    const { modeRow, rows } = await readJobs(database, saveId);
    assertModeRow(modeRow, memoryMode);
    const jobs = await Promise.all(rows.map(async row => { assertStoredJob(row, memoryMode); return validateJobHashes(row); }));
    return jobs.sort((left, right) => left.createdAt - right.createdAt || left.jobId.localeCompare(right.jobId));
  } finally { database.close(); }
}

/**
 * Resumes durable jobs with bounded per-run cost, concurrency and job count.
 * A provider may be called at least once after a tab crash; it must honor jobId as its idempotency key.
 */
export async function runP2CandidateDigestQueue(options: RunP2CandidateDigestQueueOptions): Promise<RunResult> {
  assertCandidateSave(options.save);
  if (!validVersion(options.adapter.generatorVersion) || !validVersion(options.adapter.promptVersion)
    || !options.adapter.adapterId.trim() || typeof options.resolveSources !== 'function') {
    throw new Error('P6_DIGEST_ADAPTER_INVALID');
  }
  const maxCostMicros = options.maxCostMicros ?? 0;
  const maxJobs = options.maxJobs ?? 3;
  const maxConcurrency = options.maxConcurrency ?? 1;
  const leaseMilliseconds = options.leaseMilliseconds ?? 30_000;
  const now = options.now ?? Date.now;
  if (!Number.isSafeInteger(maxCostMicros) || maxCostMicros < 0 || !Number.isSafeInteger(maxJobs) || maxJobs < 1 || maxJobs > 20
    || !Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 4
    || !Number.isSafeInteger(leaseMilliseconds) || leaseMilliseconds < 1000 || typeof now !== 'function') {
    throw new Error('P6_DIGEST_QUEUE_POLICY_INVALID');
  }
  const stats: RunResult = { status: 'idle', completed: 0, failed: 0, stale: 0, reservedCostMicros: 0 };
  let started = 0;
  let budgetLimited = false;
  const workers = Array.from({ length: maxConcurrency }, async () => {
    while (started < maxJobs) {
      const currentTime = now();
      if (!Number.isSafeInteger(currentTime) || currentTime < 0) throw new Error('P6_DIGEST_CLOCK_INVALID');
      const jobs = await readP2CandidateDigestJobs(options.save.saveId, options.save.memoryMode);
      const next = jobs.find(job => (job.status === 'queued' && job.retryAt <= currentTime)
        || (job.status === 'running' && (job.leaseUntil ?? Infinity) <= currentTime));
      if (!next) break;
      if (next.generatorVersion !== options.adapter.generatorVersion || next.promptVersion !== options.adapter.promptVersion) {
        if (await markQueuedDigestStale(options.save.memoryMode, next.jobId, currentTime)) stats.stale += 1;
        continue;
      }
      const quote = options.adapter.quoteMaxCostMicros(next);
      if (!Number.isSafeInteger(quote) || quote < 0) throw new Error('P6_DIGEST_COST_QUOTE_INVALID');
      if (stats.reservedCostMicros + quote > maxCostMicros) { budgetLimited = true; break; }
      stats.reservedCostMicros += quote;
      started += 1;
      const claim = await claimJob({ mode: options.save.memoryMode, jobId: next.jobId, now: currentTime,
        leaseMilliseconds, maxConcurrency });
      if (!claim) { stats.reservedCostMicros -= quote; started -= 1; break; }
      try {
        const sourceRows = await options.resolveSources(next.sourceRefs);
        const sources = canonicalSources(options.save, sourceRows, next.fromRevision, next.throughRevision);
        if (await digestHash({
          saveId: next.saveId, branchId: next.branchId, memoryMode: next.memoryMode,
          policyArtifactHash: next.policyArtifactHash, fromRevision: next.fromRevision,
          throughRevision: next.throughRevision, generatorVersion: next.generatorVersion,
          promptVersion: next.promptVersion, sources,
        }) !== next.inputHash) throw new Error('P6_DIGEST_SOURCE_STALE');
        const generated = await options.adapter.build({ job: next, sources, idempotencyKey: next.jobId });
        const artifact = await validateGeneratedArtifact(next, sources, options.adapter, generated, currentTime);
        if (artifact.billedCostMicros > quote) throw new Error('P6_DIGEST_COST_QUOTE_EXCEEDED');
        const artifactHash = await digestHash(artifact.value);
        await finishJob(options.save.memoryMode, next.jobId, claim.leaseToken,
          { status: 'ready', artifact: artifact.value, artifactHash, now: now() });
        stats.completed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const stale = message.startsWith('P6_DIGEST_SOURCE_') || message === 'P6_DIGEST_VERSION_CHANGED'
          || message === 'P6_DIGEST_ADAPTER_SOURCE_NOT_AUTHORIZED';
        await finishJob(options.save.memoryMode, next.jobId, claim.leaseToken, {
          status: stale ? 'stale' : 'retry',
          code: stale ? 'SOURCE_RANGE_CHANGED' : message === 'P6_DIGEST_COST_QUOTE_EXCEEDED' ? 'COST_QUOTE_EXCEEDED' : 'ADAPTER_FAILED',
          maxFailures: 3,
          retryAt: now() + Math.min(60_000, 1000 * 2 ** next.attempts),
          now: now(),
        });
        if (stale) stats.stale += 1;
        else stats.failed += 1;
      }
    }
  });
  await Promise.all(workers);
  if (stats.completed || stats.failed || stats.stale) stats.status = 'completed';
  else if (budgetLimited) stats.status = 'budget-limited';
  return stats;
}

/** The built-in zero-cost adapter selects source excerpts without paraphrasing or inventing facts. */
export function createP2CandidateExtractiveDigestAdapter(): P2CandidateDigestAdapter {
  return {
    adapterId: 'jiuxiao-extractive-candidate-v1',
    generatorVersion: 'extractive-receipt-v1',
    promptVersion: 'none',
    modelVendor: null,
    modelId: null,
    quoteMaxCostMicros: () => 0,
    build: async ({ sources }) => {
      const selected = sources.slice(-8);
      const excerpts = selected.map(source => firstSentence(source.text));
      const summary = excerpts.join('；').slice(0, MAX_DIGEST_LENGTH).trim();
      if (!summary) throw new Error('P6_DIGEST_ADAPTER_EMPTY_OUTPUT');
      return { summary, sourceIds: selected.map(source => source.sourceId), billedCostMicros: 0 };
    },
  };
}

/** Approved digests remain player-visible and cannot grant an NPC extra knowledge. */
export function toP2CandidatePlotDigestProvenance(artifact: P2CandidateDigestArtifact): PlotDigestProvenance {
  if (!artifact || artifact.approvalStatus !== 'pending' || artifact.rebuildStatus !== 'ready') {
    throw new Error('P6_DIGEST_ARTIFACT_NOT_REVIEWABLE');
  }
  return {
    digestId: artifact.digestId, saveId: artifact.saveId, branchId: artifact.branchId,
    fromRevision: artifact.fromRevision, throughRevision: artifact.throughRevision,
    coveredEventIds: [...artifact.coveredEventIds], generatorVersion: artifact.generatorVersion,
    promptVersion: artifact.promptVersion, inputHash: artifact.inputHash, outputHash: artifact.outputHash,
    modelVendor: artifact.modelVendor, modelId: artifact.modelId,
    approvalStatus: artifact.approvalStatus, rebuildStatus: artifact.rebuildStatus,
  };
}

export function p2CandidateDigestDatabaseName(memoryMode: MemoryMode): string {
  return DATABASE_NAMES[memoryMode];
}

async function validateGeneratedArtifact(
  job: P2CandidateDigestJob,
  sources: readonly P2CandidateDigestSource[],
  adapter: P2CandidateDigestAdapter,
  generated: { summary: string; sourceIds: readonly string[]; billedCostMicros: number },
  now: number,
): Promise<{ value: P2CandidateDigestArtifact; billedCostMicros: number }> {
  if (!generated || typeof generated.summary !== 'string' || !generated.summary.trim()
    || generated.summary.length > MAX_DIGEST_LENGTH || !Array.isArray(generated.sourceIds)
    || !generated.sourceIds.length || generated.sourceIds.length > sources.length
    || new Set(generated.sourceIds).size !== generated.sourceIds.length
    || !Number.isSafeInteger(generated.billedCostMicros) || generated.billedCostMicros < 0) {
    throw new Error('P6_DIGEST_ADAPTER_OUTPUT_INVALID');
  }
  const sourcesById = new Map(sources.map(source => [source.sourceId, source]));
  const selected = generated.sourceIds.map(id => {
    const source = sourcesById.get(id);
    if (!source) throw new Error('P6_DIGEST_ADAPTER_SOURCE_NOT_AUTHORIZED');
    return source;
  });
  const value: P2CandidateDigestArtifact = {
    digestId: `digest:${job.jobId}`,
    saveId: job.saveId,
    branchId: job.branchId,
    memoryMode: job.memoryMode,
    fromRevision: job.fromRevision,
    throughRevision: job.throughRevision,
    coveredEventIds: [...new Set(selected.flatMap(source => source.eventIds))],
    sourceIds: selected.map(source => source.sourceId),
    generatorVersion: job.generatorVersion,
    promptVersion: job.promptVersion,
    inputHash: job.inputHash,
    outputHash: await digestHash({ summary: generated.summary, sourceIds: selected.map(source => source.sourceId) }),
    modelVendor: adapter.modelVendor,
    modelId: adapter.modelId,
    approvalStatus: 'pending',
    rebuildStatus: 'ready',
    summary: generated.summary.trim(),
    createdAt: now,
  };
  return { value, billedCostMicros: generated.billedCostMicros };
}

function canonicalSources(
  save: SaveEnvelopeV3,
  sources: readonly P2CandidateDigestSource[],
  fromRevision: number,
  throughRevision: number,
): P2CandidateDigestSource[] {
  if (!Array.isArray(sources) || !sources.length || sources.length > MAX_SOURCE_COUNT) throw new Error('P6_DIGEST_SOURCE_SET_INVALID');
  const sourceIds = new Set<string>();
  const eventIds = new Set<string>();
  const canonical = sources.map(source => {
    if (!source || source.saveId !== save.saveId || source.branchId !== 'root' || source.memoryMode !== save.memoryMode
      || source.visibility !== 'player-visible' || source.authorization !== 'committed-player-receipt'
      || !source.sourceId.trim() || source.sourceId.length > 300 || !Number.isSafeInteger(source.revision)
      || source.revision < fromRevision || source.revision > throughRevision
      || !Array.isArray(source.eventIds) || !source.eventIds.length || source.eventIds.length > 100
      || !source.text.trim() || source.text.length > MAX_SOURCE_TEXT_LENGTH) throw new Error('P6_DIGEST_SOURCE_NOT_AUTHORIZED');
    if (sourceIds.has(source.sourceId)) throw new Error('P6_DIGEST_SOURCE_ID_DUPLICATE');
    sourceIds.add(source.sourceId);
    for (const eventId of source.eventIds) {
      if (!eventId.trim() || eventId.length > 300 || eventIds.has(eventId)) throw new Error('P6_DIGEST_EVENT_ID_INVALID');
      eventIds.add(eventId);
    }
    return {
      sourceId: source.sourceId,
      eventIds: [...source.eventIds],
      saveId: source.saveId,
      branchId: source.branchId,
      memoryMode: source.memoryMode,
      revision: source.revision,
      visibility: source.visibility,
      authorization: source.authorization,
      text: source.text.trim(),
    } satisfies P2CandidateDigestSource;
  });
  return canonical.sort(compareSource);
}

function compareSource(left: P2CandidateDigestSource, right: P2CandidateDigestSource): number {
  return left.revision - right.revision || left.sourceId.localeCompare(right.sourceId);
}

function firstSentence(text: string): string {
  const first = text.trim().split(/(?<=[。！？.!?])\s*/u)[0]?.trim() ?? '';
  return first || text.trim().slice(0, 200);
}

function assertCandidateSave(save: SaveEnvelopeV3): void {
  if (!save || save.schemaVersion !== 3 || save.branchId !== 'root'
    || !isMemoryMode(save.memoryMode) || !save.saveId.trim() || !save.memoryPolicy?.policyArtifactHash
    || !Number.isSafeInteger(save.revision) || save.revision < 0) throw new Error('P6_DIGEST_SAVE_SCOPE_INVALID');
}

function isMemoryMode(value: unknown): value is MemoryMode {
  return value === 'continue' || value === 'forgetting';
}

function validVersion(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

async function jobIdFor(input: Pick<P2CandidateDigestJob, 'saveId' | 'memoryMode' | 'policyArtifactHash' | 'fromRevision'
  | 'throughRevision' | 'sourceRefs' | 'inputHash' | 'generatorVersion' | 'promptVersion'>): Promise<string> {
  const digest = await digestHash({ saveId: input.saveId, branchId: 'root', memoryMode: input.memoryMode,
    policyArtifactHash: input.policyArtifactHash, fromRevision: input.fromRevision, throughRevision: input.throughRevision,
    sourceRefs: input.sourceRefs, inputHash: input.inputHash, generatorVersion: input.generatorVersion, promptVersion: input.promptVersion });
  return `p2-candidate-digest-v1:${digest.slice('sha256:'.length)}`;
}

async function digestHash(value: unknown): Promise<`sha256:${string}`> {
  if (!globalThis.crypto?.subtle) throw new Error('P6_DIGEST_CRYPTO_UNAVAILABLE');
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function openDatabase(memoryMode: MemoryMode): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('P6_DIGEST_INDEXEDDB_UNAVAILABLE')); return; }
    const request = indexedDB.open(DATABASE_NAMES[memoryMode], DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MODE_STORE)) database.createObjectStore(MODE_STORE, { keyPath: 'key' });
      if (!database.objectStoreNames.contains(JOB_STORE)) {
        const jobs = database.createObjectStore(JOB_STORE, { keyPath: 'jobId' });
        jobs.createIndex('saveId', 'saveId', { unique: false });
      }
      request.transaction?.objectStore(MODE_STORE).put({ key: 'mode', memoryMode, schemaVersion: 1 } satisfies ModeRow);
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('P6_DIGEST_INDEXEDDB_OPEN_FAILED'));
  });
}

function readJobs(database: IDBDatabase, saveId: string): Promise<{ modeRow: ModeRow; rows: P2CandidateDigestJob[] }> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MODE_STORE, JOB_STORE], 'readonly');
    const modeRequest = transaction.objectStore(MODE_STORE).get('mode');
    const jobsRequest = transaction.objectStore(JOB_STORE).index('saveId').getAll(saveId);
    let modeRow: ModeRow | undefined;
    let rows: P2CandidateDigestJob[] = [];
    let waiting = 2;
    const done = () => { if (--waiting === 0) modeRow ? resolve({ modeRow, rows }) : reject(new Error('P6_DIGEST_MODE_ROW_MISSING')); };
    modeRequest.onsuccess = () => { modeRow = modeRequest.result as ModeRow | undefined; done(); };
    jobsRequest.onsuccess = () => { rows = jobsRequest.result as P2CandidateDigestJob[]; done(); };
    modeRequest.onerror = jobsRequest.onerror = () => reject(new Error('P6_DIGEST_READ_FAILED'));
    transaction.onabort = () => reject(transaction.error ?? new Error('P6_DIGEST_READ_ABORTED'));
  });
}

async function claimJob(input: { mode: MemoryMode; jobId: string; now: number; leaseMilliseconds: number; maxConcurrency: number }): Promise<{ leaseToken: string } | null> {
  const database = await openDatabase(input.mode);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MODE_STORE, JOB_STORE], 'readwrite');
    const modeRequest = transaction.objectStore(MODE_STORE).get('mode');
    const jobsRequest = transaction.objectStore(JOB_STORE).getAll();
    let modeRow: ModeRow | undefined;
    let rows: P2CandidateDigestJob[] = [];
    let waiting = 2;
    let claim: { leaseToken: string } | null = null;
    let failure: Error | null = null;
    const done = () => {
      if (--waiting !== 0 || failure) return;
      try {
        assertModeRow(modeRow, input.mode);
        const current = rows.find(row => row.jobId === input.jobId);
        if (!current || current.memoryMode !== input.mode || current.status === 'ready' || current.status === 'failed' || current.status === 'stale') return;
        const active = rows.filter(row => row.saveId === current.saveId && row.memoryMode === input.mode
          && row.status === 'running' && (row.leaseUntil ?? 0) > input.now);
        if (active.length >= input.maxConcurrency) return;
        if (current.status === 'queued' && current.retryAt > input.now) return;
        if (current.status === 'running' && (current.leaseUntil ?? Infinity) > input.now) return;
        const leaseToken = crypto.randomUUID();
        const next: P2CandidateDigestJob = { ...current, status: 'running', updatedAt: input.now,
          leaseToken, leaseUntil: input.now + input.leaseMilliseconds };
        transaction.objectStore(JOB_STORE).put(next);
        claim = { leaseToken };
      } catch (error) {
        failure = error instanceof Error ? error : new Error('P6_DIGEST_CLAIM_FAILED');
        try { transaction.abort(); } catch { /* transaction may already be inactive */ }
      }
    };
    modeRequest.onsuccess = () => { modeRow = modeRequest.result as ModeRow | undefined; done(); };
    jobsRequest.onsuccess = () => { rows = jobsRequest.result as P2CandidateDigestJob[]; done(); };
    modeRequest.onerror = jobsRequest.onerror = () => {
      failure = new Error('P6_DIGEST_CLAIM_READ_FAILED');
      try { transaction.abort(); } catch { /* transaction may already be inactive */ }
    };
    transaction.oncomplete = () => { database.close(); resolve(claim); };
    transaction.onabort = () => { database.close(); reject(failure ?? transaction.error ?? new Error('P6_DIGEST_CLAIM_ABORTED')); };
  });
}

async function markQueuedDigestStale(mode: MemoryMode, jobId: string, now: number): Promise<boolean> {
  const database = await openDatabase(mode);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(JOB_STORE, 'readwrite');
      const store = transaction.objectStore(JOB_STORE);
      const request = store.get(jobId);
      let changed = false;
      let failure: Error | null = null;
      request.onsuccess = () => {
        const job = request.result as P2CandidateDigestJob | undefined;
        if (!job || job.status !== 'queued') return;
        store.put({ ...job, status: 'stale', updatedAt: now, failureCode: 'GENERATOR_VERSION_CHANGED' } satisfies P2CandidateDigestJob);
        changed = true;
      };
      request.onerror = () => { failure = new Error('P6_DIGEST_STALE_READ_FAILED'); try { transaction.abort(); } catch { /* inactive */ } };
      transaction.oncomplete = () => resolve(changed);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('P6_DIGEST_STALE_ABORTED'));
    });
  } finally { database.close(); }
}

async function finishJob(
  mode: MemoryMode,
  jobId: string,
  leaseToken: string | null,
  outcome: { status: 'ready'; artifact: P2CandidateDigestArtifact; artifactHash: `sha256:${string}`; now: number }
    | { status: 'stale'; code: string; now: number }
    | { status: 'retry'; code: string; maxFailures: number; retryAt: number; now: number },
): Promise<void> {
  const database = await openDatabase(mode);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(JOB_STORE, 'readwrite');
      const store = transaction.objectStore(JOB_STORE);
      const request = store.get(jobId);
      let failure: Error | null = null;
      request.onsuccess = () => {
        const job = request.result as P2CandidateDigestJob | undefined;
        if (!job || job.status !== 'running' || !leaseToken || job.leaseToken !== leaseToken) return;
        let next: P2CandidateDigestJob;
        if (outcome.status === 'ready') {
          next = { ...job, status: 'ready', updatedAt: outcome.now, leaseToken: null, leaseUntil: null,
            failureCode: null, artifact: outcome.artifact, artifactHash: outcome.artifactHash };
        } else if (outcome.status === 'stale') {
          next = { ...job, status: 'stale', updatedAt: outcome.now, leaseToken: null, leaseUntil: null,
            failureCode: outcome.code, artifact: null, artifactHash: null };
        } else {
          const attempts = job.attempts + 1;
          const failed = attempts >= outcome.maxFailures;
          next = { ...job, status: failed ? 'failed' : 'queued', attempts, updatedAt: outcome.now,
            retryAt: outcome.retryAt, leaseToken: null, leaseUntil: null, failureCode: outcome.code,
            artifact: null, artifactHash: null };
        }
        store.put(next);
      };
      request.onerror = () => { failure = new Error('P6_DIGEST_FINISH_READ_FAILED'); try { transaction.abort(); } catch { /* inactive */ } };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('P6_DIGEST_FINISH_ABORTED'));
    });
  } finally { database.close(); }
}

async function validateJobHashes(job: P2CandidateDigestJob): Promise<P2CandidateDigestJob> {
  const expectedId = await jobIdFor(job);
  if (expectedId !== job.jobId || !/^sha256:[0-9a-f]{64}$/i.test(job.inputHash)) throw new Error('P6_DIGEST_JOB_INTEGRITY_CONFLICT');
  if (job.artifact) {
    if (!job.artifactHash || await digestHash(job.artifact) !== job.artifactHash
      || job.artifact.approvalStatus !== 'pending' || job.artifact.saveId !== job.saveId
      || job.artifact.memoryMode !== job.memoryMode || job.artifact.inputHash !== job.inputHash) {
      throw new Error('P6_DIGEST_ARTIFACT_INTEGRITY_CONFLICT');
    }
  } else if (job.artifactHash !== null || job.status === 'ready') throw new Error('P6_DIGEST_ARTIFACT_MISSING');
  return structuredClone(job);
}

function assertStoredJob(job: P2CandidateDigestJob, memoryMode: MemoryMode): void {
  if (!job || job.schemaVersion !== 1 || job.memoryMode !== memoryMode || job.branchId !== 'root'
    || typeof job.saveId !== 'string' || !job.saveId.trim() || !job.policyArtifactHash
    || !['queued', 'running', 'ready', 'failed', 'stale'].includes(job.status)
    || !Array.isArray(job.sourceRefs) || job.sourceRefs.length < 1 || job.sourceRefs.length > MAX_SOURCE_COUNT
    || !Number.isSafeInteger(job.fromRevision) || !Number.isSafeInteger(job.throughRevision)
    || job.fromRevision < 0 || job.throughRevision < job.fromRevision
    || !Number.isSafeInteger(job.attempts) || job.attempts < 0
    || !Number.isSafeInteger(job.createdAt) || !Number.isSafeInteger(job.updatedAt) || !Number.isSafeInteger(job.retryAt)
    || !validVersion(job.generatorVersion) || !validVersion(job.promptVersion)) throw new Error('P6_DIGEST_JOB_INVALID');
  if (job.status === 'running' && (!job.leaseToken || !Number.isSafeInteger(job.leaseUntil))) throw new Error('P6_DIGEST_LEASE_INVALID');
  if (job.status !== 'running' && (job.leaseToken !== null || job.leaseUntil !== null)) throw new Error('P6_DIGEST_LEASE_INVALID');
}

function assertModeRow(row: ModeRow | undefined, expectedMode: MemoryMode): asserts row is ModeRow {
  if (!row || row.key !== 'mode' || row.memoryMode !== expectedMode || row.schemaVersion !== 1) {
    throw new Error('P6_DIGEST_MODE_DATABASE_MISMATCH');
  }
}
