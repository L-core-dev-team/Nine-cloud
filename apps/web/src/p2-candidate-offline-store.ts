import { canonicalJson } from '@jiuxiao/domain';
import type { MemoryMode } from '@jiuxiao/contracts';
import { P7_CANDIDATE_POLICY, p7CatchUpId, type P7OfflineCatchUpPlan } from './p2-candidate-offline.js';

const DATABASE_NAMES: Readonly<Record<MemoryMode, string>> = {
  continue: 'jiuxiao-offline-continue-v2-candidate',
  forgetting: 'jiuxiao-offline-forgetting-v2-candidate',
};
const DATABASE_VERSION = 1;
const PLAN_STORE = 'catchups';

type StoredP7Plan = {
  catchUpId: string;
  saveId: string;
  memoryMode: MemoryMode;
  policyVersion: string;
  planHash: string;
  plan: P7OfflineCatchUpPlan;
};

export type StoreP7CandidatePlanResult = 'stored' | 'duplicate';

/** Isolated simulation ledger; this store is not connected to the production turn host. */
export async function storeP7CandidateOfflinePlan(plan: P7OfflineCatchUpPlan): Promise<StoreP7CandidatePlanResult> {
  assertPlan(plan);
  const stored: StoredP7Plan = {
    catchUpId: plan.catchUpId,
    saveId: plan.saveId,
    memoryMode: plan.memoryMode,
    policyVersion: plan.policyVersion,
    planHash: await hashJson(plan),
    plan: structuredClone(plan),
  };
  const database = await openDatabase(plan.memoryMode);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(PLAN_STORE, 'readwrite');
      const store = transaction.objectStore(PLAN_STORE);
      const existingRequest = store.get(plan.catchUpId);
      let result: StoreP7CandidatePlanResult = 'stored';
      let failure: Error | null = null;
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result as StoredP7Plan | undefined;
        if (existing) {
          if (existing.saveId !== plan.saveId || existing.memoryMode !== plan.memoryMode
            || existing.policyVersion !== plan.policyVersion || existing.planHash !== stored.planHash
            || canonicalJson(existing.plan) !== canonicalJson(stored.plan)) {
            failure = new Error('P7_CATCHUP_IDEMPOTENCY_CONFLICT');
            try { transaction.abort(); } catch { /* transaction may already be inactive */ }
            return;
          }
          result = 'duplicate';
          return;
        }
        store.add(stored);
      };
      existingRequest.onerror = () => {
        failure = new Error('P7_CATCHUP_STORE_READ_FAILED');
        try { transaction.abort(); } catch { /* transaction may already be inactive */ }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('P7_CATCHUP_STORE_ABORTED'));
      transaction.onerror = () => { /* onabort reports the atomic result */ };
    });
  } finally {
    database.close();
  }
}

/** Reads only one mode's candidate ledger and verifies each stored plan hash. */
export async function readP7CandidateOfflinePlans(saveId: string, memoryMode: MemoryMode): Promise<readonly P7OfflineCatchUpPlan[]> {
  if (!saveId.trim()) throw new Error('P7_CATCHUP_SAVE_SCOPE_INVALID');
  const database = await openDatabase(memoryMode);
  try {
    const rows = await readRows(database, saveId);
    const plans = await Promise.all(rows.map(row => validateStoredRow(row, saveId, memoryMode)));
    return plans.sort((left, right) => left.elapsedMinutes - right.elapsedMinutes
      || (left.catchUpId < right.catchUpId ? -1 : left.catchUpId > right.catchUpId ? 1 : 0));
  } finally {
    database.close();
  }
}

/** Recovers the frozen plan for this checkpoint after interruption. */
export async function recoverP7CandidateOfflinePlan(input: {
  saveId: string;
  memoryMode: MemoryMode;
  checkpointId: string;
}): Promise<P7OfflineCatchUpPlan | null> {
  if (!input.saveId.trim() || !input.checkpointId.trim()
    || !['continue', 'forgetting'].includes(input.memoryMode)) throw new Error('P7_CATCHUP_RECOVERY_SCOPE_INVALID');
  const database = await openDatabase(input.memoryMode);
  try {
    const catchUpId = p7CatchUpId(input.saveId, input.memoryMode, input.checkpointId);
    const row = await readRow(database, catchUpId);
    return row ? await validateStoredRow(row, input.saveId, input.memoryMode) : null;
  } finally {
    database.close();
  }
}

export function p7CandidateOfflineDatabaseName(memoryMode: MemoryMode): string {
  return DATABASE_NAMES[memoryMode];
}

function assertPlan(plan: P7OfflineCatchUpPlan): void {
  if (!plan || plan.policyVersion !== P7_CANDIDATE_POLICY.version || !plan.saveId.trim()
    || !['continue', 'forgetting'].includes(plan.memoryMode) || !plan.checkpointId.trim() || !plan.catchUpId.trim()
    || plan.catchUpId !== p7CatchUpId(plan.saveId, plan.memoryMode, plan.checkpointId, plan.policyVersion)
    || !Number.isSafeInteger(plan.elapsedMinutes) || plan.elapsedMinutes < 0
    || !Number.isSafeInteger(plan.checkpointRevision) || plan.checkpointRevision < 0
    || !Number.isSafeInteger(plan.returnRevision) || plan.returnRevision !== plan.checkpointRevision
    || !Number.isSafeInteger(plan.checkpointGameMinute) || plan.checkpointGameMinute < 0
    || !Number.isSafeInteger(plan.returnGameMinute) || plan.returnGameMinute !== plan.checkpointGameMinute
    || !Array.isArray(plan.environmentSettlements) || !Array.isArray(plan.rejectedOccurrences)
    || !plan.causalReturn || !Array.isArray(plan.causalReturn.background)
    || !Array.isArray(plan.causalReturn.conservativeAutoReleases)) throw new Error('P7_CATCHUP_PLAN_INVALID');
}

async function validateStoredRow(row: StoredP7Plan, saveId: string, memoryMode: MemoryMode): Promise<P7OfflineCatchUpPlan> {
  if (row.saveId !== saveId || row.memoryMode !== memoryMode || row.policyVersion !== P7_CANDIDATE_POLICY.version) {
    throw new Error('P7_CATCHUP_STORE_SCOPE_MISMATCH');
  }
  assertPlan(row.plan);
  if (row.plan.catchUpId !== row.catchUpId || await hashJson(row.plan) !== row.planHash) {
    throw new Error('P7_CATCHUP_STORE_INTEGRITY_CONFLICT');
  }
  return structuredClone(row.plan);
}

function openDatabase(memoryMode: MemoryMode): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('P7_CATCHUP_INDEXEDDB_UNAVAILABLE')); return; }
    const request = indexedDB.open(DATABASE_NAMES[memoryMode], DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PLAN_STORE)) {
        const store = database.createObjectStore(PLAN_STORE, { keyPath: 'catchUpId' });
        store.createIndex('saveId', 'saveId', { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('P7_CATCHUP_INDEXEDDB_OPEN_FAILED'));
  });
}

function readRows(database: IDBDatabase, saveId: string): Promise<StoredP7Plan[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PLAN_STORE, 'readonly');
    const request = transaction.objectStore(PLAN_STORE).index('saveId').getAll(saveId);
    request.onsuccess = () => resolve(request.result as StoredP7Plan[]);
    request.onerror = () => reject(request.error ?? new Error('P7_CATCHUP_STORE_READ_FAILED'));
    transaction.onabort = () => reject(transaction.error ?? new Error('P7_CATCHUP_STORE_READ_ABORTED'));
  });
}

function readRow(database: IDBDatabase, catchUpId: string): Promise<StoredP7Plan | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PLAN_STORE, 'readonly');
    const request = transaction.objectStore(PLAN_STORE).get(catchUpId);
    request.onsuccess = () => resolve(request.result as StoredP7Plan | undefined);
    request.onerror = () => reject(request.error ?? new Error('P7_CATCHUP_STORE_READ_FAILED'));
    transaction.onabort = () => reject(transaction.error ?? new Error('P7_CATCHUP_STORE_READ_ABORTED'));
  });
}

async function hashJson(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('P7_CATCHUP_CRYPTO_UNAVAILABLE');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value))));
  return `sha256:${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
