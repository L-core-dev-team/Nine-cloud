import { describe, expect, it } from 'vitest';
import { commitIndexedSaves, readIndexedSnapshot } from './idb';
import type { LocalSave } from './storage';

type FakeRequest = {
  result: unknown;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

function requestWithResult(result: unknown): FakeRequest {
  const request: FakeRequest = { result, onsuccess: null, onerror: null };
  queueMicrotask(() => request.onsuccess?.(new Event('success')));
  return request;
}

function fakeSave(name: string): LocalSave {
  return {
    schemaVersion: 1,
    saveId: 'save-quota-test',
    name,
    createdAt: '2026-09-29T00:00:00.000Z',
    updatedAt: '2026-09-29T00:00:00.000Z',
    revision: 0,
    canonVersion: 'legacy-unverified',
    ruleVersion: 'rules-not-signed',
    memoryPolicyVersion: 'legacy-unknown',
    character: {},
    location: '中州天枢域',
    status: 'pending_rules',
    messages: [],
  };
}

function fakeDatabase(initial: LocalSave[], revision: number) {
  const saves = new Map(initial.map(save => [save.saveId, save]));
  const metadata = new Map<string, { key: string; value: number }>([['revision', { key: 'revision', value: revision }]]);
  const database: Record<string, any> = {
    close: () => undefined,
    transaction: () => {
      const writes: Array<() => void> = [];
      const transaction: Record<string, any> = {
        oncomplete: null,
        onabort: null,
        onerror: null,
        aborted: false,
        abort() {
          if (transaction.aborted) return;
          transaction.aborted = true;
          queueMicrotask(() => transaction.onabort?.(new Event('abort')));
        },
        objectStore(name: string) {
          const store = name === 'saves' ? saves : metadata;
          return {
            getAll: () => requestWithResult([...store.values()]),
            get: (key: string) => requestWithResult(store.get(key)),
            put(value: Record<string, unknown>) {
              writes.push(() => store.set(String(name === 'saves' ? value.saveId : value.key), value as never));
            },
            delete(key: string) { writes.push(() => { store.delete(key); }); },
            clear() { writes.push(() => { store.clear(); }); },
          };
        },
      };
      setTimeout(() => {
        if (transaction.aborted) return;
        for (const write of writes) write();
        transaction.oncomplete?.(new Event('complete'));
      }, 0);
      return transaction;
    },
  };
  return { database, saves, metadata };
}

describe('IndexedDB connection lifecycle', () => {
  it('closes a stale connection when another tab requests a schema upgrade', async () => {
    let closeCount = 0;
    let closeCountAtVersionChange = 0;
    let database: Record<string, any>;
    const openRequest: FakeRequest = { result: undefined, onsuccess: null, onerror: null };

    database = {
      close: () => { closeCount += 1; },
      transaction: () => {
        // A versionchange event can arrive while a read transaction is active.
        queueMicrotask(() => {
          database.onversionchange?.call(database, new Event('versionchange'));
          closeCountAtVersionChange = closeCount;
        });
        return {
          objectStore: (name: string) => name === 'saves'
            ? { getAll: () => requestWithResult([]) }
            : { get: () => requestWithResult(undefined) },
        };
      },
    };

    const fakeIndexedDb = {
      open: () => {
        queueMicrotask(() => {
          openRequest.result = database;
          openRequest.onsuccess?.(new Event('success'));
        });
        return openRequest;
      },
    };
    const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: fakeIndexedDb as unknown as IDBFactory,
    });

    try {
      const snapshot = await readIndexedSnapshot();

      expect(snapshot).toEqual({ saves: [], revision: 0, initialized: false });
      expect(closeCountAtVersionChange).toBe(1);
    } finally {
      if (original) Object.defineProperty(globalThis, 'indexedDB', original);
      else Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });

  it('reports a compatibility-mirror warning after the IndexedDB commit is durable', async () => {
    const existing = fakeSave('旧名');
    const updated = { ...existing, name: '新名' };
    const state = fakeDatabase([existing], 6);
    const openRequest: FakeRequest = { result: undefined, onsuccess: null, onerror: null };
    const fakeIndexedDb = {
      open: () => {
        queueMicrotask(() => {
          openRequest.result = state.database;
          openRequest.onsuccess?.(new Event('success'));
        });
        return openRequest;
      },
    };
    const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fakeIndexedDb as unknown as IDBFactory });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => { throw Object.assign(new Error('Storage quota exceeded'), { name: 'QuotaExceededError' }); },
      } as unknown as Storage,
    });

    try {
      const result = await commitIndexedSaves([existing], [updated]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.warning).toBe('compatibility-mirror-unavailable');
        expect(result.saves).toEqual([updated]);
        expect(result.revision).toBe(7);
      }
      expect(state.saves.get(existing.saveId)).toEqual(updated);
      expect(state.metadata.get('revision')).toEqual({ key: 'revision', value: 7 });
    } finally {
      if (originalIndexedDb) Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
      else Reflect.deleteProperty(globalThis, 'indexedDB');
      if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
