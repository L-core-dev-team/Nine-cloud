import type { MemoryMode, SaveEnvelopeV3 } from '@jiuxiao/contracts';
import type {
  P2CandidateApprovedPlotDigest,
} from './p2-candidate-narrative.js';
import {
  p2CandidateDigestDatabaseName,
  readP2CandidateDigestJobs,
  revalidateP2CandidateDigestForReview,
  toP2CandidatePlotDigestProvenance,
  type P2CandidateDigestJob,
  type P2CandidateDigestSource,
  type P2CandidateDigestSourceRef,
} from './p2-candidate-digest-queue.js';

const REVIEW_DATABASE_NAMES: Readonly<Record<MemoryMode, string>> = {
  continue: 'jiuxiao-plot-digest-review-continue-v1-candidate',
  forgetting: 'jiuxiao-plot-digest-review-forgetting-v1-candidate',
};
const DATABASE_VERSION = 1;
const MODE_STORE = 'mode';
const REVIEW_STORE = 'reviews';

export type P2CandidateDigestReviewDecision = 'approved' | 'rejected';

/** Local review metadata. This is not an author signature or a P6 stage receipt. */
export type P2CandidateDigestReviewRecord = {
  schemaVersion: 1;
  reviewId: string;
  saveId: string;
  branchId: 'root';
  memoryMode: MemoryMode;
  jobId: string;
  digestId: string;
  artifactHash: `sha256:${string}`;
  inputHash: `sha256:${string}`;
  decision: P2CandidateDigestReviewDecision;
  sequence: number;
  reviewedAt: number;
  scope: 'local-candidate-context-only';
};

type ModeRow = { key: 'mode'; memoryMode: MemoryMode; schemaVersion: 1 };
type ReviewWriteResult = { status: 'created' | 'duplicate'; record: P2CandidateDigestReviewRecord };

export type P2CandidateDigestReviewState = {
  jobs: readonly P2CandidateDigestJob[];
  reviews: readonly P2CandidateDigestReviewRecord[];
  approvedPlotDigests: readonly P2CandidateApprovedPlotDigest[];
  staleApprovedDigestIds: readonly string[];
};

/** Appends a local review decision only after re-reading and re-hashing its current source range. */
export async function recordP2CandidateDigestReview(input: {
  save: SaveEnvelopeV3;
  jobId: string;
  expectedArtifactHash: `sha256:${string}`;
  decision: P2CandidateDigestReviewDecision;
  reviewedAt: number;
  resolveSources: (refs: readonly P2CandidateDigestSourceRef[]) => Promise<readonly P2CandidateDigestSource[]>;
}): Promise<ReviewWriteResult> {
  if (!['approved', 'rejected'].includes(input.decision) || !Number.isSafeInteger(input.reviewedAt)
    || input.reviewedAt < 0) throw new Error('P6_DIGEST_REVIEW_DECISION_INVALID');
  const { job, artifact } = await revalidateP2CandidateDigestForReview(input);
  const database = await openDatabase(input.save.memoryMode);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([MODE_STORE, REVIEW_STORE], 'readwrite');
      const modeRequest = transaction.objectStore(MODE_STORE).get('mode');
      const reviewStore = transaction.objectStore(REVIEW_STORE);
      const rowsRequest = reviewStore.index('bySaveId').getAll(input.save.saveId);
      let modeRow: ModeRow | undefined;
      let rows: P2CandidateDigestReviewRecord[] = [];
      let waiting = 2;
      let result: ReviewWriteResult | null = null;
      let failure: Error | null = null;
      const finishReads = () => {
        if (--waiting !== 0 || failure) return;
        try {
          assertModeRow(modeRow, input.save.memoryMode);
          rows = rows.map(validateReviewRecord);
          if (rows.some(row => row.memoryMode !== input.save.memoryMode)) {
            throw new Error('P6_DIGEST_REVIEW_MODE_DATABASE_MISMATCH');
          }
          const matching = rows.filter(row => row.saveId === input.save.saveId
            && row.memoryMode === input.save.memoryMode && row.jobId === job.jobId
            && row.digestId === artifact.digestId && row.artifactHash === input.expectedArtifactHash
            && row.inputHash === job.inputHash).sort(compareReviewSequence);
          const latest = matching.at(-1);
          if (latest?.decision === input.decision) {
            result = { status: 'duplicate', record: latest };
            return;
          }
          const sequence = Math.max(0, ...rows.filter(row => row.saveId === input.save.saveId
            && row.memoryMode === input.save.memoryMode && row.jobId === job.jobId
            && row.digestId === artifact.digestId).map(row => row.sequence)) + 1;
          const record: P2CandidateDigestReviewRecord = {
            schemaVersion: 1,
            reviewId: `${job.jobId}:${sequence}`,
            saveId: input.save.saveId,
            branchId: 'root',
            memoryMode: input.save.memoryMode,
            jobId: job.jobId,
            digestId: artifact.digestId,
            artifactHash: input.expectedArtifactHash,
            inputHash: job.inputHash,
            decision: input.decision,
            sequence,
            reviewedAt: input.reviewedAt,
            scope: 'local-candidate-context-only',
          };
          reviewStore.add(record);
          result = { status: 'created', record };
        } catch (error) {
          failure = error instanceof Error ? error : new Error('P6_DIGEST_REVIEW_WRITE_FAILED');
          try { transaction.abort(); } catch { /* transaction may already be inactive */ }
        }
      };
      modeRequest.onsuccess = () => { modeRow = modeRequest.result as ModeRow | undefined; finishReads(); };
      rowsRequest.onsuccess = () => { rows = rowsRequest.result as P2CandidateDigestReviewRecord[]; finishReads(); };
      modeRequest.onerror = rowsRequest.onerror = () => {
        failure = new Error('P6_DIGEST_REVIEW_READ_FAILED');
        try { transaction.abort(); } catch { /* transaction may already be inactive */ }
      };
      transaction.oncomplete = () => {
        if (result) resolve(result);
        else reject(new Error('P6_DIGEST_REVIEW_WRITE_MISSING'));
      };
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('P6_DIGEST_REVIEW_ABORTED'));
    });
  } finally { database.close(); }
}

export async function readP2CandidateDigestReviewRecords(
  saveId: string,
  memoryMode: MemoryMode,
): Promise<readonly P2CandidateDigestReviewRecord[]> {
  if (!saveId.trim() || !isMemoryMode(memoryMode)) throw new Error('P6_DIGEST_REVIEW_READ_SCOPE_INVALID');
  const database = await openDatabase(memoryMode);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([MODE_STORE, REVIEW_STORE], 'readonly');
      const modeRequest = transaction.objectStore(MODE_STORE).get('mode');
      const rowsRequest = transaction.objectStore(REVIEW_STORE).index('bySaveId').getAll(saveId);
      let modeRow: ModeRow | undefined;
      let rows: P2CandidateDigestReviewRecord[] = [];
      let waiting = 2;
      let failure: Error | null = null;
      const finishReads = () => {
        if (--waiting !== 0 || failure) return;
        try {
          assertModeRow(modeRow, memoryMode);
          const validated = rows.map(validateReviewRecord);
          if (validated.some(row => row.memoryMode !== memoryMode)) throw new Error('P6_DIGEST_REVIEW_MODE_DATABASE_MISMATCH');
          resolve(validated.sort(compareReviewSequence));
        } catch (error) { failure = error instanceof Error ? error : new Error('P6_DIGEST_REVIEW_INVALID'); }
      };
      modeRequest.onsuccess = () => { modeRow = modeRequest.result as ModeRow | undefined; finishReads(); };
      rowsRequest.onsuccess = () => { rows = rowsRequest.result as P2CandidateDigestReviewRecord[]; finishReads(); };
      modeRequest.onerror = rowsRequest.onerror = () => { failure = new Error('P6_DIGEST_REVIEW_READ_FAILED'); };
      transaction.oncomplete = () => failure ? reject(failure) : undefined;
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('P6_DIGEST_REVIEW_ABORTED'));
    });
  } finally { database.close(); }
}

/** Returns only approved, current, source-revalidated summaries to candidate narrative assembly. */
export async function readP2CandidateDigestReviewState(input: {
  save: SaveEnvelopeV3;
  resolveSources: (refs: readonly P2CandidateDigestSourceRef[]) => Promise<readonly P2CandidateDigestSource[]>;
}): Promise<P2CandidateDigestReviewState> {
  const [jobs, reviews] = await Promise.all([
    readP2CandidateDigestJobs(input.save.saveId, input.save.memoryMode),
    readP2CandidateDigestReviewRecords(input.save.saveId, input.save.memoryMode),
  ]);
  const approvedPlotDigests: P2CandidateApprovedPlotDigest[] = [];
  const staleApprovedDigestIds: string[] = [];
  for (const job of jobs) {
    if (!job.artifact || job.status !== 'ready') continue;
    const latest = latestP2CandidateDigestReview(reviews, job);
    if (latest?.decision !== 'approved') continue;
    try {
      const current = await revalidateP2CandidateDigestForReview({ save: input.save, jobId: job.jobId,
        expectedArtifactHash: job.artifactHash!, resolveSources: input.resolveSources });
      const provenance = {
        ...toP2CandidatePlotDigestProvenance(current.artifact),
        approvalStatus: 'approved' as const,
      };
      approvedPlotDigests.push({ provenance, summary: current.artifact.summary,
        sourceIds: [...current.artifact.sourceIds], artifactHash: current.job.artifactHash! });
    } catch {
      staleApprovedDigestIds.push(job.artifact.digestId);
    }
  }
  return { jobs, reviews, approvedPlotDigests, staleApprovedDigestIds };
}

export function latestP2CandidateDigestReview(
  reviews: readonly P2CandidateDigestReviewRecord[],
  job: Pick<P2CandidateDigestJob, 'saveId' | 'memoryMode' | 'jobId' | 'artifact' | 'artifactHash'>,
): P2CandidateDigestReviewRecord | undefined {
  if (!job.artifact) return undefined;
  return reviews.filter(row => row.saveId === job.saveId && row.memoryMode === job.memoryMode
    && row.jobId === job.jobId && row.digestId === job.artifact!.digestId
    && row.artifactHash === job.artifactHash && row.inputHash === job.artifact!.inputHash)
    .sort(compareReviewSequence).at(-1);
}

export function p2CandidateDigestReviewDatabaseName(memoryMode: MemoryMode): string {
  return REVIEW_DATABASE_NAMES[memoryMode];
}

async function openDatabase(memoryMode: MemoryMode): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw new Error('P6_DIGEST_REVIEW_INDEXEDDB_UNAVAILABLE');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REVIEW_DATABASE_NAMES[memoryMode], DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error('P6_DIGEST_REVIEW_DATABASE_OPEN_FAILED'));
    request.onupgradeneeded = () => {
      const database = request.result;
      const modes = database.createObjectStore(MODE_STORE, { keyPath: 'key' });
      modes.put({ key: 'mode', memoryMode, schemaVersion: 1 } satisfies ModeRow);
      const reviews = database.createObjectStore(REVIEW_STORE, { keyPath: 'reviewId' });
      reviews.createIndex('bySaveId', 'saveId', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function validateReviewRecord(value: P2CandidateDigestReviewRecord): P2CandidateDigestReviewRecord {
  if (!value || value.schemaVersion !== 1 || typeof value.reviewId !== 'string' || !value.reviewId.trim()
    || typeof value.saveId !== 'string' || !value.saveId.trim() || value.branchId !== 'root'
    || !isMemoryMode(value.memoryMode) || typeof value.jobId !== 'string' || !value.jobId.trim()
    || typeof value.digestId !== 'string' || !value.digestId.trim()
    || !/^sha256:[0-9a-f]{64}$/i.test(value.artifactHash) || !/^sha256:[0-9a-f]{64}$/i.test(value.inputHash)
    || !['approved', 'rejected'].includes(value.decision) || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || !Number.isSafeInteger(value.reviewedAt) || value.reviewedAt < 0
    || value.scope !== 'local-candidate-context-only' || value.reviewId !== `${value.jobId}:${value.sequence}`) {
    throw new Error('P6_DIGEST_REVIEW_RECORD_INVALID');
  }
  return structuredClone(value);
}

function compareReviewSequence(left: P2CandidateDigestReviewRecord, right: P2CandidateDigestReviewRecord): number {
  return left.sequence - right.sequence || left.reviewedAt - right.reviewedAt || left.reviewId.localeCompare(right.reviewId);
}

function assertModeRow(row: ModeRow | undefined, expectedMode: MemoryMode): asserts row is ModeRow {
  if (!row || row.key !== 'mode' || row.memoryMode !== expectedMode || row.schemaVersion !== 1) {
    throw new Error('P6_DIGEST_REVIEW_MODE_DATABASE_MISMATCH');
  }
}

function isMemoryMode(value: unknown): value is MemoryMode {
  return value === 'continue' || value === 'forgetting';
}
