import {
  assertAuthorizedObservationOutboxRecord,
  canonicalJson,
  type AuthorizedObservationOutboxRecord,
  type AuthorizedRecallObservation,
} from '@jiuxiao/domain';
import type { MemoryMode, SaveEnvelopeV3 } from '@jiuxiao/contracts';

const DATABASE_NAMES: Readonly<Record<MemoryMode, string>> = {
  continue: 'jiuxiao-memory-continue',
  forgetting: 'jiuxiao-memory-forgetting',
};
const DATABASE_VERSION = 1;
const MODE_STORE = 'mode';
const OBSERVATION_STORE = 'observations';
const CURSOR_STORE = 'cursors';
const MAX_PROJECTION_ROWS = 100_000;

type ModeRow = { key: 'mode'; memoryMode: MemoryMode; schemaVersion: 1 };
type StoredObservation = {
  grantId: string;
  saveId: string;
  branchId: 'root';
  npcId: string;
  memoryMode: MemoryMode;
  policyArtifactHash: string;
  observation: AuthorizedObservationOutboxRecord;
  supersessions: AuthorizedRecallObservation['supersessions'];
};
type ProjectionCursor = {
  saveId: string;
  branchId: 'root';
  memoryMode: MemoryMode;
  policyArtifactHash: string;
  throughRevision: number;
  manifestHash: string;
};

export type CandidateMemoryProjectionSnapshot = {
  memoryMode: MemoryMode;
  throughRevision: number;
  manifestHash: string;
  observations: readonly AuthorizedRecallObservation[];
};

/**
 * Idempotently projects the mode-neutral, transaction-frozen authority outbox
 * into a mode-specific IndexedDB database. Rules never depend on this write.
 */
export async function syncP2CandidateMemoryProjection(
  save: SaveEnvelopeV3,
  sourceObservations: readonly AuthorizedObservationOutboxRecord[],
): Promise<CandidateMemoryProjectionSnapshot> {
  assertCandidateSave(save);
  if (!Array.isArray(sourceObservations) || sourceObservations.length > MAX_PROJECTION_ROWS) {
    throw new Error('MEMORY_PROJECTION_SOURCE_INVALID');
  }
  const expectedByGrant = new Map<string, StoredObservation>();
  for (const observation of sourceObservations) {
    assertAuthorizedObservationOutboxRecord(observation);
    if (observation.saveId !== save.saveId || observation.branchId !== save.branchId
      || observation.eventRevision > save.revision) throw new Error('MEMORY_PROJECTION_SOURCE_SCOPE_MISMATCH');
    const stored: StoredObservation = {
      grantId: observation.grantId,
      saveId: observation.saveId,
      branchId: observation.branchId,
      npcId: observation.npcId,
      memoryMode: save.memoryMode,
      policyArtifactHash: save.memoryPolicy.policyArtifactHash,
      observation: structuredClone(observation),
      supersessions: [],
    };
    if (expectedByGrant.has(stored.grantId)) throw new Error('MEMORY_PROJECTION_DUPLICATE_GRANT');
    expectedByGrant.set(stored.grantId, stored);
  }
  const sortedExpected = [...expectedByGrant.values()].sort(compareGrantId);
  const manifestHash = await hashJson(sortedExpected.map(row => ({
    grantId: row.grantId,
    observation: row.observation,
    supersessions: row.supersessions,
  })));
  const database = await openModeDatabase(save.memoryMode);
  try {
    await writeProjection(database, save, expectedByGrant, manifestHash);
    return await readProjection(database, save);
  } finally {
    database.close();
  }
}

/** Reads only the selected save/mode partition and rejects stale or mixed data. */
export async function readP2CandidateMemoryProjection(
  save: SaveEnvelopeV3,
): Promise<CandidateMemoryProjectionSnapshot> {
  assertCandidateSave(save);
  const database = await openModeDatabase(save.memoryMode);
  try {
    return await readProjection(database, save);
  } finally {
    database.close();
  }
}

/** Exposed for low-cost acceptance checks; the values are fixed and mode-specific. */
export function p2CandidateMemoryDatabaseName(mode: MemoryMode): string {
  return DATABASE_NAMES[mode];
}

function assertCandidateSave(save: SaveEnvelopeV3): void {
  if (!save || save.schemaVersion !== 3 || save.branchId !== 'root'
    || (save.memoryMode !== 'continue' && save.memoryMode !== 'forgetting')
    || !save.memoryPolicy?.policyArtifactHash || !Number.isSafeInteger(save.revision) || save.revision < 0) {
    throw new Error('MEMORY_PROJECTION_SAVE_POLICY_INVALID');
  }
}

function openModeDatabase(mode: MemoryMode): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('MEMORY_INDEXEDDB_UNAVAILABLE')); return; }
    const request = indexedDB.open(DATABASE_NAMES[mode], DATABASE_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MODE_STORE)) database.createObjectStore(MODE_STORE, { keyPath: 'key' });
      if (!database.objectStoreNames.contains(OBSERVATION_STORE)) {
        const observations = database.createObjectStore(OBSERVATION_STORE, { keyPath: 'grantId' });
        observations.createIndex('saveId', 'saveId', { unique: false });
        observations.createIndex('saveNpc', ['saveId', 'npcId'], { unique: false });
      }
      if (!database.objectStoreNames.contains(CURSOR_STORE)) database.createObjectStore(CURSOR_STORE, { keyPath: 'saveId' });
      request.transaction?.objectStore(MODE_STORE).put({ key: 'mode', memoryMode: mode, schemaVersion: 1 } satisfies ModeRow);
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) { database.close(); return; }
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('MEMORY_INDEXEDDB_OPEN_FAILED'));
    request.onblocked = () => { blocked = true; reject(new Error('MEMORY_INDEXEDDB_OPEN_BLOCKED')); };
  });
}

function writeProjection(
  database: IDBDatabase,
  save: SaveEnvelopeV3,
  expectedByGrant: ReadonlyMap<string, StoredObservation>,
  manifestHash: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MODE_STORE, OBSERVATION_STORE, CURSOR_STORE], 'readwrite');
    const modeRequest = transaction.objectStore(MODE_STORE).get('mode');
    const rowsRequest = transaction.objectStore(OBSERVATION_STORE).index('saveId').getAll(save.saveId);
    const cursorRequest = transaction.objectStore(CURSOR_STORE).get(save.saveId);
    let waiting = 3;
    let modeRow: ModeRow | undefined;
    let rows: StoredObservation[] = [];
    let cursor: ProjectionCursor | undefined;
    let failed: Error | null = null;
    const abort = (message: string) => {
      failed = new Error(message);
      try { transaction.abort(); } catch { /* transaction may already be inactive */ }
    };
    const finishRequest = () => {
      waiting -= 1;
      if (waiting !== 0 || failed) return;
      if (!modeRow || modeRow.memoryMode !== save.memoryMode || modeRow.schemaVersion !== 1) {
        abort('MEMORY_MODE_DATABASE_MISMATCH'); return;
      }
      if (!Array.isArray(rows)) { abort('MEMORY_PROJECTION_ROWS_INVALID'); return; }
      const expectedIds = new Set(expectedByGrant.keys());
      for (const row of rows) {
        const expected = expectedByGrant.get(row.grantId);
        if (!expectedIds.has(row.grantId) || !sameObservationRow(row, expected!)) {
          abort('MEMORY_PROJECTION_CONFLICT'); return;
        }
      }
      if (cursor && (cursor.saveId !== save.saveId || cursor.branchId !== save.branchId
        || cursor.memoryMode !== save.memoryMode || cursor.policyArtifactHash !== save.memoryPolicy.policyArtifactHash
        || !Number.isSafeInteger(cursor.throughRevision) || cursor.throughRevision < 0
        || cursor.throughRevision > save.revision
        || (cursor.throughRevision === save.revision && cursor.manifestHash !== manifestHash))) {
        abort('MEMORY_PROJECTION_CURSOR_CONFLICT'); return;
      }
      const store = transaction.objectStore(OBSERVATION_STORE);
      for (const [grantId, row] of expectedByGrant) {
        if (!rows.some(existing => existing.grantId === grantId)) store.put(row);
      }
      transaction.objectStore(CURSOR_STORE).put({
        saveId: save.saveId,
        branchId: 'root',
        memoryMode: save.memoryMode,
        policyArtifactHash: save.memoryPolicy.policyArtifactHash,
        throughRevision: save.revision,
        manifestHash,
      } satisfies ProjectionCursor);
    };
    modeRequest.onsuccess = () => { modeRow = modeRequest.result as ModeRow | undefined; finishRequest(); };
    rowsRequest.onsuccess = () => { rows = rowsRequest.result as StoredObservation[]; finishRequest(); };
    cursorRequest.onsuccess = () => { cursor = cursorRequest.result as ProjectionCursor | undefined; finishRequest(); };
    modeRequest.onerror = rowsRequest.onerror = cursorRequest.onerror = () => abort('MEMORY_PROJECTION_READ_FAILED');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(failed ?? transaction.error ?? new Error('MEMORY_PROJECTION_WRITE_ABORTED'));
    transaction.onerror = () => { /* onabort reports the atomic outcome */ };
  });
}

function readProjection(database: IDBDatabase, save: SaveEnvelopeV3): Promise<CandidateMemoryProjectionSnapshot> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MODE_STORE, OBSERVATION_STORE, CURSOR_STORE], 'readonly');
    const modeRequest = transaction.objectStore(MODE_STORE).get('mode');
    const rowsRequest = transaction.objectStore(OBSERVATION_STORE).index('saveId').getAll(save.saveId);
    const cursorRequest = transaction.objectStore(CURSOR_STORE).get(save.saveId);
    let modeRow: ModeRow | undefined;
    let rows: StoredObservation[] = [];
    let cursor: ProjectionCursor | undefined;
    let waiting = 3;
    const done = async () => {
      waiting -= 1;
      if (waiting !== 0) return;
      try {
        if (!modeRow || modeRow.memoryMode !== save.memoryMode || modeRow.schemaVersion !== 1) throw new Error('MEMORY_MODE_DATABASE_MISMATCH');
        if (!cursor) throw new Error('MEMORY_PROJECTION_CURSOR_MISSING');
        if (cursor.saveId !== save.saveId || cursor.branchId !== save.branchId || cursor.memoryMode !== save.memoryMode
          || cursor.policyArtifactHash !== save.memoryPolicy.policyArtifactHash || cursor.throughRevision < save.revision
          || cursor.throughRevision > save.revision) {
          throw new Error('MEMORY_PROJECTION_STALE_OR_MIXED');
        }
        if (!Array.isArray(rows) || rows.length > MAX_PROJECTION_ROWS) throw new Error('MEMORY_PROJECTION_ROWS_INVALID');
        const grantIds = new Set<string>();
        const observations = rows.map(row => {
          if (!row || row.saveId !== save.saveId || row.branchId !== save.branchId || row.memoryMode !== save.memoryMode
            || row.policyArtifactHash !== save.memoryPolicy.policyArtifactHash || row.grantId !== row.observation?.grantId
            || grantIds.has(row.grantId)) throw new Error('MEMORY_PROJECTION_SCOPE_MISMATCH');
          assertAuthorizedObservationOutboxRecord(row.observation);
          if (row.observation.eventRevision > save.revision || !Array.isArray(row.supersessions)) throw new Error('MEMORY_PROJECTION_FUTURE_EVIDENCE');
          grantIds.add(row.grantId);
          return { ...structuredClone(row.observation), supersessions: structuredClone(row.supersessions) };
        }).sort((left, right) => compareGrantId(left, right));
        const manifestHash = await hashJson([...rows].sort(compareGrantId).map(row => ({
          grantId: row.grantId,
          observation: row.observation,
          supersessions: row.supersessions,
        })));
        if (manifestHash !== cursor.manifestHash) throw new Error('MEMORY_PROJECTION_MANIFEST_MISMATCH');
        resolve({ memoryMode: save.memoryMode, throughRevision: cursor.throughRevision, manifestHash: cursor.manifestHash, observations });
      } catch (error) { reject(error); }
    };
    modeRequest.onsuccess = () => { modeRow = modeRequest.result as ModeRow | undefined; done(); };
    rowsRequest.onsuccess = () => { rows = rowsRequest.result as StoredObservation[]; done(); };
    cursorRequest.onsuccess = () => { cursor = cursorRequest.result as ProjectionCursor | undefined; done(); };
    modeRequest.onerror = rowsRequest.onerror = cursorRequest.onerror = () => reject(new Error('MEMORY_PROJECTION_READ_FAILED'));
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('MEMORY_PROJECTION_READ_ABORTED'));
  });
}

function sameObservationRow(actual: StoredObservation, expected: StoredObservation): boolean {
  return actual.saveId === expected.saveId && actual.branchId === expected.branchId && actual.npcId === expected.npcId
    && actual.memoryMode === expected.memoryMode && actual.policyArtifactHash === expected.policyArtifactHash
    && actual.grantId === expected.grantId && canonicalJson(actual.observation) === canonicalJson(expected.observation)
    && canonicalJson(actual.supersessions) === canonicalJson(expected.supersessions);
}

function compareGrantId(left: { grantId: string }, right: { grantId: string }): number {
  return left.grantId < right.grantId ? -1 : left.grantId > right.grantId ? 1 : 0;
}

async function hashJson(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('MEMORY_PROJECTION_CRYPTO_UNAVAILABLE');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value))));
  return `sha256:${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
