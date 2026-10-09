import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ActionIntent, type Decision, type DomainEvent, type SaveEnvelopeV3 } from '@jiuxiao/contracts';
import { stableGrantIdV2, type EventReducer, type RuleInvocationContext } from '@jiuxiao/domain';
import {
  commitLocalAuthoritativeTurn,
  createLocalAuthoritativeSave,
  exportLocalAuthorityArchive,
  readLocalAuthoritativeSave,
  readLocalTurnReceipt,
  restoreLocalAuthorityArchive,
  verifyLocalReplay,
  verifyLocalEventChain,
} from './authoritative-turn-store';

type TestRequest = {
  result: unknown;
  error: Error | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

function fakeIndexedDb(failStore: { name: string | null }) {
  const keyPaths: Record<string, string> = {
    saves: 'saveId', meta: 'key', authoritativeSaves: 'saveId', turnEvents: 'recordKey',
    turnReceipts: 'recordKey', authorizedObservationOutbox: 'grantId', turnIntegrity: 'saveId', turnCheckpoints: 'recordKey',
  };
  const stores = new Map(Object.keys(keyPaths).map(name => [name, new Map<string, Record<string, unknown>>() ]));
  const database: Record<string, any> = {
    close: () => undefined,
    transaction(names: string | string[]) {
      const storeNames = Array.isArray(names) ? names : [names];
      const writes: Array<{ name: string; type: 'add' | 'put' | 'delete'; key: string; value?: Record<string, unknown> }> = [];
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
          if (!storeNames.includes(name)) throw new Error(`STORE_OUTSIDE_TRANSACTION:${name}`);
          const rows = stores.get(name)!;
          const keyFor = (value: Record<string, unknown>) => String(value[keyPaths[name]!]);
          const request = (read: () => unknown): TestRequest => {
            const result: TestRequest = { result: undefined, error: null, onsuccess: null, onerror: null };
            queueMicrotask(() => {
              if (transaction.aborted) return;
              try {
                result.result = read();
                result.onsuccess?.(new Event('success'));
              } catch (error) {
                result.error = error instanceof Error ? error : new Error(String(error));
                result.onerror?.(new Event('error'));
                transaction.abort();
              }
            });
            return result;
          };
          return {
            get: (key: string) => request(() => rows.get(String(key))),
            getAll: () => request(() => [...rows.values()]),
            index: (indexName: string) => {
              if (indexName !== 'saveId') throw new Error(`UNKNOWN_INDEX:${indexName}`);
              return { getAll: (saveId: string) => request(() => [...rows.values()].filter(row => row.saveId === saveId)) };
            },
            add: (value: Record<string, unknown>) => {
              writes.push({ name, type: 'add', key: keyFor(value), value });
              return {};
            },
            put: (value: Record<string, unknown>) => {
              writes.push({ name, type: 'put', key: keyFor(value), value });
              return {};
            },
            delete: (key: string) => { writes.push({ name, type: 'delete', key: String(key) }); },
            clear: () => { writes.push({ name, type: 'delete', key: '*' }); },
          };
        },
      };
      setTimeout(() => {
        if (transaction.aborted) return;
        const next = new Map([...stores].map(([name, rows]) => [name, new Map(rows)]));
        try {
          for (const write of writes) {
            if (failStore.name === write.name) throw new Error(`WRITE_FAILURE:${write.name}`);
            const target = next.get(write.name)!;
            if (write.type === 'delete' && write.key === '*') target.clear();
            else if (write.type === 'delete') target.delete(write.key);
            else if (write.type === 'add') {
              if (target.has(write.key)) throw new Error(`CONSTRAINT_ERROR:${write.name}`);
              target.set(write.key, write.value!);
            } else target.set(write.key, write.value!);
          }
          for (const [name, rows] of next) stores.set(name, rows);
          transaction.oncomplete?.(new Event('complete'));
        } catch {
          transaction.abort();
        }
      }, 0);
      return transaction;
    },
  };
  const factory = {
    open() {
      const request: TestRequest & { onupgradeneeded?: ((event: Event) => void) | null } = {
        result: database, error: null, onsuccess: null, onerror: null, onupgradeneeded: null,
      };
      queueMicrotask(() => request.onsuccess?.(new Event('success')));
      return request;
    },
  };
  return { factory, stores };
}

function makeSave(): SaveEnvelopeV3 {
  return {
    schemaVersion: 3,
    saveId: 'local-save-1',
    canonVersion: 'canon-test',
    canonArtifactHash: `sha256:${'d'.repeat(64)}`,
    ruleVersion: 'rules-test',
    memoryPolicyVersion: 'continue-v1',
    memoryMode: 'continue',
    memoryPolicy: {
      mode: 'continue', policyVersion: 'continue-v1', schemaVersion: 1,
      clockBasis: 'game-minute+npc-grant-sequence-v1',
      policyArtifactHash: `sha256:${'a'.repeat(64)}`,
      cueDictionaryHash: `sha256:${'b'.repeat(64)}`,
      normalizerVersion: 'unicode-nfc-v1', retrievalVersion: 'continue-v1',
      visibilityPolicyVersion: 'visibility-v1', visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
      createdAtRevision: 0,
    },
    branchId: 'root', parentBranchId: null, forkRevision: 0,
    createdPolicyVersion: 'continue-v1', sourceMigrationId: null,
    revision: 0,
    state: { playerId: 'player-1', locationId: 'gate-a', elapsedMinutes: 0, facts: { gameMinute: 0 } },
  };
}

const eventId = '11111111-1111-4111-8111-111111111111';
const turnKey = '22222222-2222-4222-8222-222222222222';
const clarifyKey = '33333333-3333-4333-8333-333333333333';
const staleKey = '44444444-4444-4444-8444-444444444444';
const reduce: EventReducer = (state, event) => ({
  ...state,
  locationId: String(event.payload.destinationId),
  elapsedMinutes: 15,
  facts: { ...state.facts, gameMinute: 15 },
});

function intent(idempotencyKey = turnKey, destinationId = 'gate-b'): ActionIntent {
  return {
    saveId: 'local-save-1', actorId: 'player-1', branchId: 'root', expectedRevision: 0,
    idempotencyKey, kind: 'move', payload: { destinationId },
  };
}

function decide(_action: ActionIntent, save: { saveId: string; revision: number; ruleVersion: string }): Decision {
  const event: DomainEvent = {
    id: eventId, saveId: save.saveId, branchId: 'root', type: 'PLAYER_MOVED',
    beforeRevision: save.revision, afterRevision: save.revision + 1,
    occurredAt: '2026-10-05T12:00:00.000Z', source: 'RULES', ruleVersion: save.ruleVersion,
    payload: { destinationId: 'gate-b' },
  };
  return { status: 'accepted', outcome: 'success', events: [event], nextRevision: save.revision + 1 };
}

function authorized(event: DomainEvent) {
  const summary = '旅人抵达门前。';
  return [{
    grantId: stableGrantIdV2('local-save-1', 'root', 'npc-1', event.id, 'visibility-v1'),
    grantIdVersion: 2 as const,
    saveId: 'local-save-1', branchId: 'root' as const, npcId: 'npc-1', eventId: event.id,
    eventRevision: event.afterRevision, observedAtMinute: 15, channel: 'witnessed' as const,
    memoryClass: 'unclassified' as const,
    authorizationPolicyVersion: 'visibility-v1', authorizedFields: ['summary'],
    authorizedFacts: { summary }, summary,
  }];
}

describe('browser authoritative turn persistence', () => {
  const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

  afterEach(() => {
    if (originalIndexedDb) Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
    vi.restoreAllMocks();
  });

  it('rejects a nonzero revision as a new root save', async () => {
    const initial = makeSave();
    initial.revision = 1;
    await expect(createLocalAuthoritativeSave(initial)).rejects.toThrow('SAVE_INITIAL_REVISION_MUST_BE_ZERO');

    const policyAhead = makeSave();
    policyAhead.memoryPolicy.createdAtRevision = 1;
    await expect(createLocalAuthoritativeSave(policyAhead)).rejects.toThrow('SAVE_INITIAL_REVISION_MUST_BE_ZERO');
  });

  it('atomically persists the snapshot, receipt, event chain and authorized outbox; retries are idempotent', async () => {
    const state = fakeIndexedDb({ name: null });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: state.factory as unknown as IDBFactory });
    const initial = makeSave();
    expect(await createLocalAuthoritativeSave(initial)).toMatchObject({ status: 'created' });

    const committed = await commitLocalAuthoritativeTurn({
      intent: intent(), decide, reduce, authorizeEvents: events => authorized(events[0]!),
    });
    expect(committed).toMatchObject({ status: 'committed', save: { revision: 1, state: { locationId: 'gate-b' } } });
    expect((await readLocalAuthoritativeSave(initial.saveId))?.revision).toBe(1);
    expect(await readLocalTurnReceipt(initial.saveId, turnKey)).toMatchObject({ resultingRevision: 1 });
    expect(await verifyLocalEventChain(initial.saveId)).toMatchObject({ valid: true, eventCount: 1 });
    expect(await verifyLocalReplay(initial.saveId, reduce)).toMatchObject({ valid: true, revision: 1, eventCount: 1 });
    expect(state.stores.get('turnEvents')?.size).toBe(1);
    expect(state.stores.get('authorizedObservationOutbox')?.size).toBe(1);

    expect(await commitLocalAuthoritativeTurn({ intent: intent(), decide, reduce })).toMatchObject({ status: 'duplicate' });
    expect(await commitLocalAuthoritativeTurn({ intent: intent(turnKey, 'gate-c'), decide, reduce }))
      .toMatchObject({ status: 'idempotency_conflict' });
    const staleDecide = vi.fn(decide);
    expect(await commitLocalAuthoritativeTurn({ intent: intent(staleKey), decide: staleDecide, reduce }))
      .toMatchObject({ status: 'revision_conflict', expectedRevision: 0, actualRevision: 1 });
    expect(staleDecide).not.toHaveBeenCalled();
    expect((await readLocalAuthoritativeSave(initial.saveId))?.revision).toBe(1);
    expect(state.stores.get('turnEvents')?.size).toBe(1);
  });

  it('exports and restores a verified complete authority archive without overwrite', async () => {
    const failStore = { name: null as string | null };
    const state = fakeIndexedDb(failStore);
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: state.factory as unknown as IDBFactory });
    const initial = makeSave();
    await createLocalAuthoritativeSave(initial);
    await commitLocalAuthoritativeTurn({
      intent: intent(), decide, reduce, authorizeEvents: events => authorized(events[0]!),
    });

    const archive = await exportLocalAuthorityArchive(initial.saveId, reduce);
    expect(archive).toMatchObject({
      format: 'jiuxiao-authoritative-save', schemaVersion: 1, saveId: initial.saveId,
      save: { revision: 1 }, integrity: { eventCount: 1 },
    });
    expect(archive?.events).toHaveLength(1);
    expect(archive?.receipts).toHaveLength(1);
    expect(archive?.checkpoints).toHaveLength(2);
    expect(archive?.observations).toHaveLength(1);

    const tampered = structuredClone(archive!);
    tampered.save.state.locationId = 'forged-location';
    await expect(restoreLocalAuthorityArchive(tampered, reduce)).rejects.toThrow('LOCAL_AUTHORITY_ARCHIVE_HASH_MISMATCH');

    for (const rows of state.stores.values()) {
      for (const [key, row] of rows) if (row.saveId === initial.saveId) rows.delete(key);
    }
    expect(await readLocalAuthoritativeSave(initial.saveId)).toBeNull();

    failStore.name = 'turnReceipts';
    expect(await restoreLocalAuthorityArchive(archive, reduce)).toMatchObject({ status: 'integrity_conflict' });
    expect([...state.stores.values()].flatMap(rows => [...rows.values()]).some(row => row.saveId === initial.saveId)).toBe(false);
    failStore.name = null;

    expect(await restoreLocalAuthorityArchive(archive, reduce)).toMatchObject({ status: 'restored', save: { revision: 1 } });
    expect(await restoreLocalAuthorityArchive(archive, reduce)).toMatchObject({ status: 'already_exists' });
    expect(await readLocalTurnReceipt(initial.saveId, turnKey)).toMatchObject({ resultingRevision: 1 });
    expect(await verifyLocalEventChain(initial.saveId)).toMatchObject({ valid: true, eventCount: 1 });
    expect(await verifyLocalReplay(initial.saveId, reduce)).toMatchObject({ valid: true, revision: 1, eventCount: 1 });
    expect(state.stores.get('authorizedObservationOutbox')?.size).toBe(1);
  });

  it('detects an event changed after its checkpoint and refuses the next turn', async () => {
    const state = fakeIndexedDb({ name: null });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: state.factory as unknown as IDBFactory });
    const initial = makeSave();
    await createLocalAuthoritativeSave(initial);
    await commitLocalAuthoritativeTurn({ intent: intent(), decide, reduce });
    const [key, stored] = [...state.stores.get('turnEvents')!.entries()][0]!;
    state.stores.get('turnEvents')!.set(key, { ...stored, eventHash: '0'.repeat(64) });

    expect(await verifyLocalReplay(initial.saveId, reduce)).toMatchObject({ valid: false, reason: 'event_chain_invalid' });
    expect(await commitLocalAuthoritativeTurn({ intent: intent(staleKey), decide, reduce }))
      .toMatchObject({ status: 'integrity_conflict' });
    expect((await readLocalAuthoritativeSave(initial.saveId))?.revision).toBe(1);
  });

  it('records clarification without advancing the world or writing an event', async () => {
    const state = fakeIndexedDb({ name: null });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: state.factory as unknown as IDBFactory });
    const initial = makeSave();
    await createLocalAuthoritativeSave(initial);
    const decideClarify = (_action: ActionIntent, save: { revision: number }): Decision => ({
      status: 'clarify', question: '你要前往哪一处？', missingSlots: ['destinationId'],
      candidates: [], interactionId: 'interaction-1', revision: save.revision,
    });

    const result = await commitLocalAuthoritativeTurn({
      intent: intent(clarifyKey), decide: decideClarify, reduce,
    });
    expect(result).toMatchObject({ status: 'recorded' });
    expect((await readLocalAuthoritativeSave(initial.saveId))?.revision).toBe(0);
    expect(state.stores.get('turnEvents')?.size).toBe(0);
    expect(await commitLocalAuthoritativeTurn({ intent: intent(clarifyKey), decide: decideClarify, reduce }))
      .toMatchObject({ status: 'duplicate' });
  });

  it('passes audit time and stable event IDs without letting wall time change gameplay state', async () => {
    const dateSpy = vi.spyOn(Date.prototype, 'toISOString');
    const contexts: RuleInvocationContext[] = [];
    const runAt = async (occurredAt: string) => {
      dateSpy.mockReturnValue(occurredAt);
      const state = fakeIndexedDb({ name: null });
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: state.factory as unknown as IDBFactory });
      const initial = makeSave();
      await createLocalAuthoritativeSave(initial);
      const result = await commitLocalAuthoritativeTurn({
        intent: intent(),
        decide: (_action, save, context) => {
          contexts.push(context);
          const event: DomainEvent = {
            id: context.eventIds[0]!, saveId: save.saveId, branchId: 'root', type: 'PLAYER_MOVED',
            beforeRevision: save.revision, afterRevision: save.revision + 1,
            occurredAt: context.occurredAt, source: 'RULES', ruleVersion: save.ruleVersion,
            payload: { destinationId: 'gate-b' },
          };
          return { status: 'accepted', outcome: 'success', events: [event], nextRevision: save.revision + 1 };
        },
        reduce,
      });
      expect(result.status).toBe('committed');
      if (result.status !== 'committed') throw new Error('EXPECTED_COMMIT');
      return result;
    };

    const first = await runAt('2026-10-06T01:00:00.000Z');
    const second = await runAt('2026-10-06T02:00:00.000Z');
    expect(contexts[0]?.eventIds).toEqual(contexts[1]?.eventIds);
    expect(contexts[0]?.occurredAt).toBe('2026-10-06T01:00:00.000Z');
    expect(contexts[1]?.occurredAt).toBe('2026-10-06T02:00:00.000Z');
    expect(first.save.state.facts.gameMinute).toBe(15);
    expect(second.save.state.facts.gameMinute).toBe(15);
    expect(first.receipt.decision.status === 'accepted' ? first.receipt.decision.events[0]?.payload : null)
      .toEqual(second.receipt.decision.status === 'accepted' ? second.receipt.decision.events[0]?.payload : null);
  });

  it('rolls back staged writes when an event-store write fails', async () => {
    const failStore = { name: null as string | null };
    const state = fakeIndexedDb(failStore);
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: state.factory as unknown as IDBFactory });
    const initial = makeSave();
    await createLocalAuthoritativeSave(initial);
    failStore.name = 'turnEvents';

    expect(await commitLocalAuthoritativeTurn({ intent: intent(), decide, reduce }))
      .toMatchObject({ status: 'unavailable' });
    expect((await readLocalAuthoritativeSave(initial.saveId))?.revision).toBe(0);
    expect(await readLocalTurnReceipt(initial.saveId, turnKey)).toBeNull();
    expect(state.stores.get('turnEvents')?.size).toBe(0);
  });
});
