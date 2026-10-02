import { describe, expect, it, vi } from 'vitest';
import type { ActionIntent, TurnReceipt } from '@jiuxiao/contracts';
import { IndexedTurnStore, TurnClient, type PendingTurn, type TurnStore } from './turn-client';
class Store implements TurnStore {
  rows = new Map<string, PendingTurn>();
  async read(key: string) { return structuredClone(this.rows.get(key) ?? null); }
  async update(key: string, change: (current: PendingTurn | null) => PendingTurn) { const next = change(structuredClone(this.rows.get(key) ?? null)); this.rows.set(key, structuredClone(next)); return next; }
}
const intent: ActionIntent = { kind: 'free_text', saveId: 'test', actorId: 'player', expectedRevision: 0, idempotencyKey: 'f00a9b36-dff1-4a4d-b810-e28b5eb5d18a', payload: { text: '测试' } };
function sorted(value: unknown): string { if (Array.isArray(value)) return `[${value.map(sorted).join(',')}]`; if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${JSON.stringify(k)}:${sorted(v)}`).join(',')}}`; return JSON.stringify(value)!; }
async function receipt(): Promise<TurnReceipt> {
 const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sorted(intent)));
 return { saveId: intent.saveId, idempotencyKey: intent.idempotencyKey, requestFingerprint: `sha256:v1:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('')}`, resultingRevision: 1,
 decision: { status: 'accepted', nextRevision: 1, events: [{ id: '3719acb0-5296-48cd-b806-bc2966110ff7', saveId: 'test', type: 'fixture', beforeRevision: 0, afterRevision: 1, occurredAt: '2026-10-01T00:00:00.000Z', source: 'RULES', ruleVersion: 'fixture-only', payload: {} }] } };
}
describe('durable turn recovery', () => {
 it('closes a late blocked storage connection without reading a turn', async () => {
  const close = vi.fn(); const transaction = vi.fn();
  const req = { result: { close, transaction }, onsuccess: null as (() => void) | null, onblocked: null as (() => void) | null };
  vi.stubGlobal('indexedDB', { open: () => req });
  try {
   const reading = new IndexedTurnStore().read('owner\0test');
   req.onblocked!(); await expect(reading).rejects.toThrow('TURN_STORAGE_UNAVAILABLE');
   req.onsuccess!(); expect(close).toHaveBeenCalledOnce(); expect(transaction).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
 });
 it('does not rewind an acknowledgement confirmed between read and dispatch', async () => {
  const ack = await receipt(); const store = new Store(); const request = vi.fn(async () => ({ receipt: ack }));
  const client = new TurnClient(store, request); const prepared = await client.prepare('owner', intent);
  const confirmed: PendingTurn = { ...prepared, phase: 'confirmed', receipt: ack };
  const originalUpdate = store.update.bind(store);
  store.update = async (key, change) => { store.rows.set(key, confirmed); return originalUpdate(key, change); };
  expect(await client.submit(prepared)).toEqual(confirmed); expect(request).not.toHaveBeenCalled();
 });
 it.each(['accepted', 'rejected'] as const)('rejects a %s receipt at an unrelated revision despite its matching fingerprint', async status => {
  const ack = await receipt();
  const invalid: TurnReceipt = status === 'accepted' ? { ...ack, resultingRevision: 2, decision: { status, nextRevision: 2, events: ack.decision.status === 'accepted' ? ack.decision.events.map(event => ({ ...event, beforeRevision: 1, afterRevision: 2 })) : [] } }
   : { ...ack, resultingRevision: 7, decision: { status, revision: 7, code: 'REFUSED', message: 'synthetic' } };
  const client = new TurnClient(new Store(), async () => ({ receipt: invalid }));
  await expect(client.submit(await client.prepare('owner', intent))).rejects.toThrow('INVALID_TURN_RECEIPT');
  expect((await client.read('owner', 'test'))?.phase).toBe('unknown');
 });
 it('persists uncertainty before sending and recovers identical intent after a lost acknowledgement', async () => {
  const store = new Store(); let calls = 0; const ack = await receipt();
  const request = async (_path: string, _method?: string, body?: unknown) => { calls++; expect((await store.read('owner\0test'))?.phase).toBe('unknown'); expect((body as {intent:unknown}).intent).toEqual(intent); if (calls === 1) throw new Error('lost reply'); return {receipt: ack}; };
  const first = new TurnClient(store, request); const prepared = await first.prepare('owner', intent);
  await expect(first.submit(prepared)).rejects.toThrow('lost reply');
  await expect(first.prepare('owner', {...intent, idempotencyKey: crypto.randomUUID()})).rejects.toThrow('UNRESOLVED_TURN');
  const restarted = new TurnClient(store, request); const recovered = await restarted.submit((await restarted.read('owner','test'))!);
  expect(recovered.phase).toBe('confirmed'); await restarted.submit(recovered); expect(calls).toBe(2); expect(await restarted.read('other','test')).toBeNull();
 });
 it('rejects mismatched fingerprints without clearing the durable request', async () => {
  const store = new Store(); const ack = await receipt(); const client = new TurnClient(store, async () => ({receipt: {...ack, requestFingerprint: `sha256:v1:${'0'.repeat(64)}`}}));
  await expect(client.submit(await client.prepare('owner', intent))).rejects.toThrow('INVALID_TURN_RECEIPT'); expect((await client.read('owner','test'))?.phase).toBe('unknown');
 });
 it('accepts reordered JSONB receipts and isolates cancellation or failed narration from settlement', async () => {
  const store = new Store(); const ack = await receipt(); let narrative = false;
  const request = async (_p: string, _m?: string, body?: unknown, _o?: string, signal?: AbortSignal) => {
   if (!(body as {requestNarrative:boolean}).requestNarrative) return {receipt:ack};
   if (signal?.aborted) throw new Error('cancelled');
   return {receipt: JSON.parse(JSON.stringify({decision: ack.decision, resultingRevision:1, requestFingerprint:ack.requestFingerprint, saveId:'test', idempotencyKey:intent.idempotencyKey})), narrative: narrative ? {status:'received',text:'仅叙事'} : {status:'failed'}};
  };
  const client = new TurnClient(store, request); const record = await client.submit(await client.prepare('owner', intent));
  await expect(client.narrate(record)).rejects.toThrow('NARRATIVE_UNAVAILABLE');
  const abort = new AbortController(); abort.abort(); await expect(client.narrate(record, abort.signal)).rejects.toThrow('cancelled');
  narrative = true; expect(await client.narrate(record)).toBe('仅叙事'); expect(await client.read('owner','test')).toEqual(record);
 });
});
