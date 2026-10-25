import { describe, expect, it } from 'vitest';
import { beginGameAction, cacheIdentity, editGameDraft, emptyGameCache, finishGameAction, recoverGameAction, type GameCache, type GameCacheStore } from './cloud-game-cache';

const scope = { apiBase: 'https://example.invalid/api', ownerId: 'owner-a', saveId: 'save-a' };
const key = '11111111-1111-4111-8111-111111111111';
function prepared() {
  const value = editGameDraft(emptyGameCache(scope, 0), '观察', 0);
  return beginGameAction(value, { text: '观察', expectedRevision: 3, idempotencyKey: key, requestNarrative: true, draftVersion: 1 });
}
function receipt(saveId = scope.saveId, revision = 3) {
  return { saveId, idempotencyKey: key, requestFingerprint: 'sha256:v1:' + 'a'.repeat(64), resultingRevision: revision,
    decision: { status: 'clarify', question: '观察哪里？', revision } };
}
describe('cloud display cache recovery contract', () => {
  it('clears only an accepted submitted draft, protects later edits, and deduplicates recovery', () => {
    const accepted = { ...receipt(), resultingRevision: 4, decision: { status: 'accepted', nextRevision: 4,
      events: [{ id: crypto.randomUUID(), saveId: scope.saveId, type: 'fixture', beforeRevision: 3, afterRevision: 4,
        occurredAt: '2026-10-11T00:00:00.000Z', source: 'RULES', ruleVersion: 'test', payload: {} }] } };
    const done = finishGameAction(prepared(), scope, key, accepted, '测试叙事');
    expect(done.draft).toBe('');
    expect(finishGameAction(done, scope, key, accepted, '测试叙事').history).toHaveLength(1);
    const edited = editGameDraft(prepared(), '后来输入', 1);
    expect(finishGameAction(edited, scope, key, accepted, '测试叙事').draft).toBe('后来输入');
  });
  it('isolates API path, account and save, without ambiguous separator keys', () => {
    const base = cacheIdentity(scope).key;
    for (const change of [{ apiBase: 'https://example.invalid/other' }, { ownerId: 'b' }, { saveId: 'b' }])
      expect(cacheIdentity({ ...scope, ...change }).key).not.toBe(base);
    expect(() => cacheIdentity({ ...scope, apiBase: 'https://secret@example.invalid' })).toThrow();
  });
  it('preserves all 8000 characters, rejects oversize without truncating, detects stale edits', () => {
    const value = editGameDraft(emptyGameCache(scope, 0), '甲'.repeat(8000), 0);
    expect(value.draft.length).toBe(8000);
    expect(() => editGameDraft(value, '甲'.repeat(8001), 1)).toThrow('GAME_DRAFT_TOO_LONG');
    expect(() => editGameDraft(value, 'stale', 0)).toThrow('GAME_DRAFT_CONFLICT');
  });
  it('does not replace a pending request with a new click or changed text', () => {
    const value = prepared();
    expect(() => beginGameAction(value, { ...value.pending!, idempotencyKey: crypto.randomUUID() })).toThrow('GAME_ACTION_PENDING');
  });
  it('preserves clarification input and rejects wrong save/revision receipts', () => {
    expect(finishGameAction(prepared(), scope, key, receipt(), '观察哪里？').draft).toBe('观察');
    expect(() => finishGameAction(prepared(), scope, key, receipt('other'), '')).toThrow('INVALID_GAME_RECEIPT');
    expect(() => finishGameAction(prepared(), scope, key, receipt(scope.saveId, 9), '')).toThrow('INVALID_GAME_RECEIPT');
  });
  it('lost response survives a new controller and uses the same request exactly', async () => {
    let value = prepared(); const bodies: unknown[] = [];
    const store: GameCacheStore = {
      read: async () => structuredClone(value),
      change: async (_scope, epoch, update) => { if (epoch !== value.epoch) throw Error('GAME_CACHE_SESSION_EXPIRED'); value = update(value); return value; },
      clearAccount: async () => { value = emptyGameCache(scope, value.epoch + 1); },
    };
    await expect(recoverGameAction(store, scope, 0, async body => { bodies.push(body); throw Error('lost response'); })).rejects.toThrow();
    expect(value.pending?.idempotencyKey).toBe(key);
    await recoverGameAction(store, scope, 0, async body => { bodies.push(body); return { receipt: receipt(), text: '观察哪里？' }; });
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).not.toHaveProperty('draftVersion');
    expect(value.pending).toBeNull(); expect(value.history).toHaveLength(1);
  });
  it('logout invalidates late requests instead of repopulating sensitive data', async () => {
    let value: GameCache = prepared();
    const store: GameCacheStore = {
      read: async () => structuredClone(value),
      change: async (_s, epoch, update) => { if (epoch !== value.epoch) throw Error('GAME_CACHE_SESSION_EXPIRED'); value = update(value); return value; },
      clearAccount: async () => { value = emptyGameCache(scope, value.epoch + 1); },
    };
    await expect(recoverGameAction(store, scope, 0, async () => { await store.clearAccount(scope); return { receipt: receipt(), text: 'private' }; })).rejects.toThrow('GAME_CACHE_SESSION_EXPIRED');
    expect(value.history).toEqual([]); expect(value.draft).toBe('');
  });
});
