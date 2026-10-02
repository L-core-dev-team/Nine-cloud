import { ActionIntentSchema, TurnReceiptSchema, type ActionIntent, type TurnReceipt } from '@jiuxiao/contracts';
import { cloudRequest } from './cloud-sync';

export type PendingTurn = { key: string; ownerId: string; intent: ActionIntent; phase: 'prepared' | 'unknown' | 'confirmed'; receipt: TurnReceipt | null };
export interface TurnStore {
  read(key: string): Promise<PendingTurn | null>;
  update(key: string, change: (current: PendingTurn | null) => PendingTurn): Promise<PendingTurn>;
}
/** Separate store: never converts or overwrites legacy/local saves. */
export class IndexedTurnStore implements TurnStore {
  private open(): Promise<IDBDatabase> { return new Promise((resolve, reject) => {
    const req = indexedDB.open('jiuxiao-turns-1', 1);
    let blocked = false;
    req.onupgradeneeded = () => req.result.createObjectStore('turns', { keyPath: 'key' });
    req.onsuccess = () => {
      const db = req.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(new Error('TURN_STORAGE_UNAVAILABLE'));
    req.onblocked = () => { blocked = true; reject(new Error('TURN_STORAGE_UNAVAILABLE')); };
  }); }
  async read(key: string) { const db = await this.open(); try { return await new Promise<PendingTurn | null>((resolve, reject) => {
    const tx = db.transaction('turns', 'readonly'); const request = tx.objectStore('turns').get(key);
    tx.oncomplete = () => resolve(request.result ?? null); tx.onabort = tx.onerror = () => reject(new Error('TURN_STORAGE_UNAVAILABLE'));
  }); } finally { db.close(); } }
  async update(key: string, change: (current: PendingTurn | null) => PendingTurn) { const db = await this.open(); try { return await new Promise<PendingTurn>((resolve, reject) => {
    const tx = db.transaction('turns', 'readwrite'); const store = tx.objectStore('turns'); const req = store.get(key); let value: PendingTurn;
    req.onsuccess = () => { try { value = change(req.result ?? null); store.put(value); } catch { tx.abort(); } };
    tx.oncomplete = () => resolve(value!); tx.onerror = tx.onabort = () => reject(new Error('TURN_STORAGE_UNAVAILABLE'));
  }); } finally { db.close(); } }
}
export class TurnClient {
  constructor(private readonly store: TurnStore, private readonly request = cloudRequest) {}
  read(owner: string, saveId: string) { return this.store.read(`${owner}\0${saveId}`); }
  async prepare(owner: string, raw: unknown) {
    if (!owner.trim() || owner.includes('\0')) throw new Error('INVALID_OWNER');
    const intent = ActionIntentSchema.parse(raw); const key = `${owner}\0${intent.saveId}`;
    return this.store.update(key, current => {
      if (current && current.phase !== 'confirmed') throw new Error('UNRESOLVED_TURN');
      return { key, ownerId: owner, intent, phase: 'prepared', receipt: null };
    });
  }
  async submit(record: PendingTurn) {
    const live = await this.store.read(record.key);
    if (!live || live.intent.idempotencyKey !== record.intent.idempotencyKey || live.ownerId !== record.ownerId) throw new Error('STALE_TURN');
    if (live.phase === 'confirmed') return live;
    // Persist uncertainty before dispatch: a lost reply or page close must retry the exact intent.
    const dispatch = await this.store.update(record.key, current => {
      if (!current || current.intent.idempotencyKey !== record.intent.idempotencyKey) throw new Error('STALE_TURN');
      if (current.phase === 'confirmed') return current;
      return { ...current, phase: 'unknown' };
    });
    if (dispatch.phase === 'confirmed') return dispatch;
    const result = await this.request('/api/turns', 'POST', { intent: live.intent, requestNarrative: false }, live.ownerId);
    const receipt = TurnReceiptSchema.parse(result.receipt);
    await validateReceipt(live.intent, receipt);
    return this.store.update(record.key, current => {
      if (!current || current.intent.idempotencyKey !== live.intent.idempotencyKey) throw new Error('STALE_TURN');
      return { ...current, phase: 'confirmed', receipt };
    });
  }
  async narrate(record: PendingTurn, cancellation?: AbortSignal) {
    const live = await this.store.read(record.key);
    if (!live || live.phase !== 'confirmed' || live.intent.idempotencyKey !== record.intent.idempotencyKey || live.receipt?.decision.status !== 'accepted') throw new Error('TURN_NOT_COMMITTED');
    const result = await this.request('/api/turns', 'POST', { intent: live.intent, requestNarrative: true }, live.ownerId, cancellation);
    const receipt = TurnReceiptSchema.parse(result.receipt);
    if (canonical(receipt) !== canonical(live.receipt)) throw new Error('INVALID_TURN_RECEIPT');
    const narrative = result.narrative as Record<string, unknown> | undefined;
    if (narrative?.status !== 'received' || typeof narrative.text !== 'string' || narrative.text.length > 100_000) throw new Error('NARRATIVE_UNAVAILABLE');
    return narrative.text; // Presentation only, not a state update or a persisted call log.
  }
}
// Mirrors the versioned domain fingerprint; sorted keys also tolerate PostgreSQL JSONB ordering.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  const encoded = JSON.stringify(value); if (encoded === undefined) throw new Error('INVALID_JSON'); return encoded;
}
async function validateReceipt(intent: ActionIntent, receipt: TurnReceipt) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(intent)));
  const fingerprint = `sha256:v1:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  const expectedResult = intent.expectedRevision + (receipt.decision.status === 'accepted' ? 1 : 0);
  if (receipt.saveId !== intent.saveId || receipt.idempotencyKey !== intent.idempotencyKey || receipt.requestFingerprint !== fingerprint ||
      receipt.resultingRevision !== expectedResult) throw new Error('INVALID_TURN_RECEIPT');
}
