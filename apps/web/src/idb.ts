import type { LocalSave } from './storage';

const DATABASE = 'jiuxiao-1';
const VERSION = 1;
const STORE = 'saves';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'saveId' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

export async function readIndexedSaves(): Promise<LocalSave[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as LocalSave[] : []);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
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
