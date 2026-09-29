import type { LocalSave } from './storage';

const DATABASE = 'jiuxiao-1';
const VERSION = 2;
const STORE = 'saves';
const META = 'meta';
const MIRROR_KEY = 'jiuxiao_1_local_saves_v2';

export type IndexedSaveSnapshot = { saves: LocalSave[]; revision: number; initialized: boolean };
export type SaveCommitResult =
  | { ok: true; saves: LocalSave[]; revision: number; warning?: 'compatibility-mirror-unavailable' }
  | { ok: false; reason: 'conflict'; saves: LocalSave[]; conflictIds: string[]; revision: number }
  | { ok: false; reason: 'unavailable'; saves: LocalSave[]; conflictIds: []; revision: number };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'saveId' });
      if (!request.result.objectStoreNames.contains(META)) request.result.createObjectStore(META, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const database = request.result;
      // Let a newer tab upgrade the schema instead of leaving this stale connection blocking it.
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

export async function readIndexedSaves(): Promise<LocalSave[]> {
  return (await readIndexedSnapshot()).saves;
}

export async function readIndexedSnapshot(): Promise<IndexedSaveSnapshot> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE, META], 'readonly');
      const savesRequest = transaction.objectStore(STORE).getAll();
      const revisionRequest = transaction.objectStore(META).get('revision');
      let saves: LocalSave[] = [];
      let revision = 0;
      let initialized = false;
      let pending = 2;
      const finish = () => { if (--pending === 0) resolve({ saves, revision, initialized }); };
      savesRequest.onsuccess = () => { saves = Array.isArray(savesRequest.result) ? savesRequest.result as LocalSave[] : []; finish(); };
      revisionRequest.onsuccess = () => {
        const row = revisionRequest.result;
        if (row !== undefined) {
          if (!Number.isSafeInteger(row.value) || row.value < 0) {
            reject(new Error('IndexedDB revision metadata is damaged'));
            return;
          }
          initialized = true;
          revision = row.value;
        }
        finish();
      };
      savesRequest.onerror = () => reject(savesRequest.error ?? new Error('IndexedDB read failed'));
      revisionRequest.onerror = () => reject(revisionRequest.error ?? new Error('IndexedDB revision read failed'));
    });
  } finally { database.close(); }
}

export async function replaceIndexedSaves(saves: LocalSave[]): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      store.clear();
      for (const save of saves) store.put(save);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
    });
  } finally { database.close(); }
}

/** One-time compatibility import. Once the metadata row exists, IndexedDB is authoritative. */
export async function initializeIndexedSaves(legacySaves: LocalSave[]): Promise<IndexedSaveSnapshot> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE, META], 'readwrite');
      const saveStore = transaction.objectStore(STORE);
      const metaStore = transaction.objectStore(META);
      const revisionRequest = metaStore.get('revision');
      let snapshot: IndexedSaveSnapshot | null = null;
      revisionRequest.onsuccess = () => {
        const row = revisionRequest.result;
        if (row) {
          if (Number.isSafeInteger(row.value) && row.value >= 0) return;
          try { transaction.abort(); } catch { /* already inactive */ }
          return;
        }
        saveStore.clear();
        for (const save of legacySaves) saveStore.put(save);
        metaStore.put({ key: 'revision', value: 0 });
        snapshot = { saves: legacySaves, revision: 0, initialized: true };
      };
      revisionRequest.onerror = () => { try { transaction.abort(); } catch { /* already inactive */ } };
      transaction.oncomplete = () => {
        if (snapshot) resolve(snapshot);
        else void readIndexedSnapshot().then(resolve, reject);
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB initialization failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB initialization aborted'));
    });
  } finally { database.close(); }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function byId(saves: LocalSave[]): Map<string, LocalSave> | null {
  const result = new Map<string, LocalSave>();
  for (const save of saves) {
    if (result.has(save.saveId)) return null;
    result.set(save.saveId, save);
  }
  return result;
}

function same(left: LocalSave | undefined, right: LocalSave | undefined): boolean {
  return left === undefined || right === undefined ? left === right : canonical(left) === canonical(right);
}

/**
 * Applies only this tab's changed save IDs. IndexedDB serializes read-write
 * transactions across tabs; same-save divergence is returned as a conflict.
 */
export async function commitIndexedSaves(expected: LocalSave[], proposed: LocalSave[]): Promise<SaveCommitResult> {
  const expectedMap = byId(expected);
  const proposedMap = byId(proposed);
  if (!expectedMap || !proposedMap) return { ok: false, reason: 'unavailable', saves: [], conflictIds: [], revision: 0 };
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE, META], 'readwrite');
      const saveStore = transaction.objectStore(STORE);
      const metaStore = transaction.objectStore(META);
      const allRequest = saveStore.getAll();
      const revisionRequest = metaStore.get('revision');
      let rows: LocalSave[] = [];
      let revision = 0;
      let waiting = 2;
      let outcome: SaveCommitResult | null = null;
      let finished = false;
      const evaluate = () => {
        if (--waiting !== 0 || finished) return;
        finished = true;
        const currentMap = byId(rows);
        if (!currentMap) { outcome = { ok: false, reason: 'unavailable', saves: [], conflictIds: [], revision }; transaction.abort(); return; }
        const changedIds = new Set([...expectedMap.keys(), ...proposedMap.keys()].filter(id => !same(expectedMap.get(id), proposedMap.get(id))));
        const conflicts = [...changedIds].filter(id => !same(expectedMap.get(id), currentMap.get(id)));
        if (conflicts.length) {
          outcome = { ok: false, reason: 'conflict', saves: rows, conflictIds: conflicts, revision };
          transaction.abort();
          return;
        }
        const merged = new Map(currentMap);
        for (const id of changedIds) {
          const next = proposedMap.get(id);
          if (next === undefined) { merged.delete(id); saveStore.delete(id); }
          else { merged.set(id, next); saveStore.put(next); }
        }
        revision += changedIds.size ? 1 : 0;
        metaStore.put({ key: 'revision', value: revision });
        outcome = { ok: true, saves: [...merged.values()], revision };
      };
      allRequest.onsuccess = () => { rows = Array.isArray(allRequest.result) ? allRequest.result as LocalSave[] : []; evaluate(); };
      revisionRequest.onsuccess = () => {
        const value = revisionRequest.result?.value;
        if (!Number.isSafeInteger(value) || value < 0) {
          outcome = { ok: false, reason: 'unavailable', saves: rows, conflictIds: [], revision };
          try { transaction.abort(); } catch { /* already inactive */ }
          return;
        }
        revision = value;
        evaluate();
      };
      allRequest.onerror = () => { outcome = { ok: false, reason: 'unavailable', saves: [], conflictIds: [], revision }; try { transaction.abort(); } catch { /* noop */ } };
      revisionRequest.onerror = () => { outcome = { ok: false, reason: 'unavailable', saves: [], conflictIds: [], revision }; try { transaction.abort(); } catch { /* noop */ } };
      transaction.oncomplete = () => {
        if (!outcome) { reject(new Error('IndexedDB transaction completed without a result')); return; }
        if (outcome.ok && !mirrorSaves(outcome.saves, outcome.revision)) {
          resolve({ ...outcome, warning: 'compatibility-mirror-unavailable' });
          return;
        }
        resolve(outcome);
      };
      transaction.onabort = () => {
        if (outcome && !outcome.ok) {
          if (outcome.reason === 'conflict') mirrorSaves(outcome.saves, outcome.revision);
          resolve(outcome);
        }
        else resolve({ ok: false, reason: 'unavailable', saves: rows, conflictIds: [], revision });
      };
      transaction.onerror = () => {
        if (!outcome || outcome.ok) outcome = { ok: false, reason: 'unavailable', saves: rows, conflictIds: [], revision };
      };
    });
  } finally { database.close(); }
}

function mirrorSaves(saves: LocalSave[], revision: number): boolean {
  try {
    let mirroredRevision = 0;
    try {
      const current = JSON.parse(localStorage.getItem(MIRROR_KEY) || 'null') as { revision?: unknown } | null;
      mirroredRevision = Number(current?.revision ?? 0);
    } catch { /* The damaged raw text is preserved by the storage boundary. */ }
    if (Number.isSafeInteger(mirroredRevision) && mirroredRevision > revision) return true;
    // Keep the version and payload in one atomic localStorage value. The
    // legacy array key remains a best-effort compatibility mirror only.
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ revision, saves }));
    localStorage.setItem('jiuxiao_1_local_saves', JSON.stringify(saves));
    localStorage.setItem('jiuxiao_1_local_saves_revision', String(revision));
    return true;
  } catch { return false; /* IndexedDB is durable; hydration can restore the compatibility mirror. */ }
}

export function restoreLocalMirror(saves: LocalSave[], revision: number): boolean {
  return mirrorSaves(saves, revision);
}
