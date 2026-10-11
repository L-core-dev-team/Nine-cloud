import { TurnReceiptSchema, type TurnReceipt } from '@jiuxiao/contracts';

/** Display-only data. Never used to reconstruct authoritative state or NPC memory. */
export type GameCacheScope = { apiBase: string; ownerId: string; saveId: string };
export type PendingGameAction = {
  text: string; expectedRevision: number; idempotencyKey: string;
  requestNarrative: boolean; clarificationOf?: string;
  draftVersion: number;
};
export type ReadingTurn = { id: string; revision: number; text: string; receipt: TurnReceipt };
export type GameCache = {
  key: string; account: string; epoch: number; version: 1;
  draft: string; draftVersion: number; pending: PendingGameAction | null; history: ReadingTurn[];
};
export interface GameCacheStore {
  read(scope: GameCacheScope): Promise<GameCache>;
  change(scope: GameCacheScope, epoch: number, update: (value: GameCache) => GameCache): Promise<GameCache>;
  clearAccount(scope: GameCacheScope): Promise<void>;
}
export function cacheIdentity(scope: GameCacheScope) {
  const url = new URL(scope.apiBase);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || !scope.ownerId || !scope.saveId) throw new Error('INVALID_CACHE_SCOPE');
  const endpoint = url.href.replace(/\/+$/, '');
  const account = JSON.stringify([endpoint, scope.ownerId]);
  return { account, key: JSON.stringify([endpoint, scope.ownerId, scope.saveId]) };
}
export function emptyGameCache(scope: GameCacheScope, epoch: number): GameCache {
  return { ...cacheIdentity(scope), epoch, version: 1, draft: '', draftVersion: 0, pending: null, history: [] };
}
function checkSize(value: GameCache) {
  if (value.draft.length > 8000 || value.history.length > 1000
    || new TextEncoder().encode(JSON.stringify(value)).length > 4_000_000) throw new Error('GAME_CACHE_FULL');
}
export class IndexedGameCache implements GameCacheStore {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('jiuxiao_cloud_game_ui_v1', 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore('scopes', { keyPath: 'key' });
        request.result.createObjectStore('epochs');
      };
      request.onblocked = () => { blocked = true; reject(new Error('GAME_CACHE_BLOCKED')); };
      request.onerror = () => reject(new Error('GAME_CACHE_UNAVAILABLE'));
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }
  private async transact(scope: GameCacheScope, epoch?: number, update?: (value: GameCache) => GameCache) {
    const db = await this.open();
    try { return await new Promise<GameCache>((resolve, reject) => {
      const tx = db.transaction(['scopes', 'epochs'], update ? 'readwrite' : 'readonly');
      const identity = cacheIdentity(scope); let output: GameCache; let failure: unknown;
      const e = tx.objectStore('epochs').get(identity.account);
      e.onsuccess = () => {
        const currentEpoch = (e.result as number | undefined) ?? 0;
        const request = tx.objectStore('scopes').get(identity.key);
        request.onsuccess = () => { try {
          if (epoch !== undefined && epoch !== currentEpoch) throw new Error('GAME_CACHE_SESSION_EXPIRED');
          const value = (request.result as GameCache | undefined) ?? emptyGameCache(scope, currentEpoch);
          if (value.version !== 1 || value.key !== identity.key || value.account !== identity.account || value.epoch !== currentEpoch)
            throw new Error('GAME_CACHE_INVALID');
          output = update ? update(structuredClone(value)) : value;
          if (output.key !== identity.key || output.account !== identity.account || output.epoch !== currentEpoch)
            throw new Error('GAME_CACHE_INVALID');
          checkSize(output);
          if (update) tx.objectStore('scopes').put(output);
        } catch (error) { failure = error; tx.abort(); } };
      };
      tx.oncomplete = () => resolve(output!);
      tx.onabort = tx.onerror = () => reject(failure ?? new Error('GAME_CACHE_UNAVAILABLE'));
    }); } finally { db.close(); }
  }
  read(scope: GameCacheScope) { return this.transact(scope); }
  change(scope: GameCacheScope, epoch: number, update: (value: GameCache) => GameCache) { return this.transact(scope, epoch, update); }
  async clearAccount(scope: GameCacheScope) {
    const db = await this.open(); const { account } = cacheIdentity(scope);
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['scopes', 'epochs'], 'readwrite');
      const epochs = tx.objectStore('epochs'); const e = epochs.get(account);
      e.onsuccess = () => epochs.put(((e.result as number | undefined) ?? 0) + 1, account);
      const cursor = tx.objectStore('scopes').openCursor();
      cursor.onsuccess = () => { const row = cursor.result; if (!row) return;
        if ((row.value as GameCache).account === account) row.delete(); row.continue(); };
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new Error('GAME_CACHE_UNAVAILABLE'));
    }); } finally { db.close(); }
  }
}

/** Compare-and-set prevents a stale tab from overwriting another tab's draft. */
export function editGameDraft(value: GameCache, text: string, expectedVersion: number): GameCache {
  if (text.length > 8000) throw new Error('GAME_DRAFT_TOO_LONG');
  if (value.draftVersion !== expectedVersion) throw new Error('GAME_DRAFT_CONFLICT');
  return { ...value, draft: text, draftVersion: value.draftVersion + 1 };
}
export function beginGameAction(value: GameCache, action: PendingGameAction): GameCache {
  if (value.pending) throw new Error('GAME_ACTION_PENDING');
  if (!action.text.trim() || action.text.length > 8000 || !Number.isSafeInteger(action.expectedRevision)
    || action.expectedRevision < 0 || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(action.idempotencyKey)
    || action.draftVersion !== value.draftVersion || action.text !== value.draft.trim()) throw new Error('INVALID_PENDING_ACTION');
  return { ...value, pending: structuredClone(action) };
}
export function finishGameAction(value: GameCache, scope: GameCacheScope, key: string, rawReceipt: unknown, text: string): GameCache {
  const receipt = TurnReceiptSchema.parse(rawReceipt);
  if (receipt.saveId !== scope.saveId || receipt.idempotencyKey !== key) throw new Error('INVALID_GAME_RECEIPT');
  const pending = value.pending;
  if (value.history.some(item => item.id === key && item.receipt.requestFingerprint === receipt.requestFingerprint)) return value;
  if (!pending || pending.idempotencyKey !== key) throw new Error('GAME_ACTION_CHANGED');
  const expectedResult = pending.expectedRevision + (receipt.decision.status === 'accepted' ? 1 : 0);
  if (receipt.resultingRevision !== expectedResult) throw new Error('INVALID_GAME_RECEIPT');
  const history = [...value.history.filter(item => item.id !== key), { id: key, revision: receipt.resultingRevision, text, receipt }];
  history.sort((a, b) => a.revision - b.revision); // stable order for rejected/clarifying turns at the same revision
  const clearDraft = receipt.decision.status === 'accepted' && value.draftVersion === pending.draftVersion;
  return { ...value, history, pending: null, ...(clearDraft ? { draft: '', draftVersion: value.draftVersion + 1 } : {}) };
}

/** Persist before POST. A lost response/refresh retains exactly the same request, never a new ID. */
export async function recoverGameAction(store: GameCacheStore, scope: GameCacheScope, epoch: number,
  send: (body: Omit<PendingGameAction, 'draftVersion'>) => Promise<{ receipt: unknown; text: string }>) {
  const cached = await store.read(scope);
  if (cached.epoch !== epoch) throw new Error('GAME_CACHE_SESSION_EXPIRED');
  if (!cached.pending) return cached;
  const { draftVersion: _draftVersion, ...body } = cached.pending;
  const result = await send(body);
  return store.change(scope, epoch, current => finishGameAction(current, scope, body.idempotencyKey, result.receipt, result.text));
}
