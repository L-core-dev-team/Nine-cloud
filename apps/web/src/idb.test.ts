import { describe, expect, it } from 'vitest';
import { readIndexedSnapshot } from './idb';

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
});
