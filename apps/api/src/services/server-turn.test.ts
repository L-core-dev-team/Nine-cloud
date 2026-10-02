import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SaveEnvelope, TurnReceipt } from '@jiuxiao/contracts';
import { createNpcMemoryJournal } from '@jiuxiao/domain';
import { ServerTurnService, type ServerTurnRepository, type ServerTurnRules } from './server-turn.js';

function fixture() {
  let save: SaveEnvelope = { schemaVersion: 1, saveId: 'test-turn', revision: 0,
    ruleVersion: 'fixture-only', canonVersion: 'fixture-only', memoryPolicyVersion: 'fixture-only',
    state: { playerId: 'player', locationId: 'origin', elapsedMinutes: 0, facts: {} } };
  let journal = createNpcMemoryJournal(save.saveId, 0);
  const receipts = new Map<string, TurnReceipt>();
  const decide = vi.fn<ServerTurnRules['decide']>((intent, current) => ({ status: 'accepted', nextRevision: current.revision + 1,
    events: [{ id: randomUUID(), saveId: current.saveId, type: 'fixture.travel', beforeRevision: current.revision,
      afterRevision: current.revision + 1, occurredAt: new Date().toISOString(), source: 'RULES', ruleVersion: current.ruleVersion,
      payload: { destinationId: intent.kind === 'move' ? intent.payload.destinationId : 'fixture' } }] }));
  const rules: ServerTurnRules = { ruleVersion: 'fixture-only', canonVersion: 'fixture-only', memoryPolicyVersion: 'fixture-only',
    decide, reduce: (state, event) => ({ ...state, locationId: String(event.payload.destinationId), elapsedMinutes: state.elapsedMinutes + 1 }),
    grantsForEvent: event => [{ npcId: 'visible-npc', eventId: event.id, channel: 'witnessed', visibleSummary: 'Visible test event.' }],
    policyForNpc: () => 'exact-recall-v1' };
  const repository: ServerTurnRepository = {
    loadSave: async owner => owner === 'owner' ? structuredClone(save) : null,
    getReceiptForOwner: async (_, __, id) => structuredClone(receipts.get(id) ?? null),
    getForOwner: async () => structuredClone(journal),
    commitAcceptedTurn: vi.fn(async input => {
      const prior = receipts.get(input.receipt.idempotencyKey);
      if (prior) return prior.requestFingerprint === input.receipt.requestFingerprint
        ? { kind: 'duplicate' as const, receipt: structuredClone(prior) } : { kind: 'idempotency_conflict' as const };
      if (input.expectedRevision !== save.revision) return { kind: 'conflict' as const, currentRevision: save.revision };
      save = structuredClone(input.save); journal = structuredClone(input.nextJournal);
      receipts.set(input.receipt.idempotencyKey, structuredClone(input.receipt));
      return { kind: 'committed' as const, receipt: structuredClone(input.receipt), save: structuredClone(save), journal: structuredClone(journal) };
    }),
  };
  const intent = { kind: 'move' as const, saveId: save.saveId, actorId: 'player', expectedRevision: 0, idempotencyKey: randomUUID(), payload: { destinationId: 'gate' } };
  return { repository, rules, decide, intent, snapshot: () => ({ save, journal }), setArchive: () => { save.state.facts.archiveKind = 'local-untrusted-v1'; } };
}

describe('server turn orchestration (synthetic rules, never production gameplay)', () => {
  it('records presentation status after commit without letting log failure undo settlement', async () => {
    const f=fixture();const log=vi.fn<NonNullable<ServerTurnRepository['recordNarrativeStatus']>>(async()=>{expect(f.snapshot().save.revision).toBe(1);});f.repository.recordNarrativeStatus=log;
    expect(await new ServerTurnService(f.repository,f.rules,async()=>'text').execute('owner',f.intent,true)).toMatchObject({status:'accepted',narrative:{status:'received'}});
    expect(log.mock.calls.map(call=>call[4])).toEqual(['generating','received']);
    log.mockImplementation(async()=>{throw new Error('fixture log failure');});
    expect(await new ServerTurnService(f.repository,f.rules).execute('owner',f.intent,true)).toMatchObject({status:'accepted',duplicate:true,narrative:{code:'NARRATIVE_UNAVAILABLE'}});
    expect(f.snapshot().save.revision).toBe(1);
  });
  it('fails closed without rules and refuses foreign owners or client backups without writes', async () => {
    const f = fixture(); const service = new ServerTurnService(f.repository);
    expect(await service.execute('owner', f.intent)).toEqual({ status: 'rules_not_ready' });
    expect(await service.execute('other', f.intent)).toEqual({ status: 'not_found' });
    f.setArchive(); expect(await service.execute('owner', f.intent)).toEqual({ status: 'client_archive' });
    expect(f.repository.commitAcceptedTurn).not.toHaveBeenCalled();
  });
  it('commits only once across ten sequential retries and rejects request ID reuse with altered content', async () => {
    const f = fixture(); const service = new ServerTurnService(f.repository, f.rules);
    for (let i = 0; i < 10; i++) {
      const result = await service.execute('owner', f.intent);
      expect(result.status).toBe('accepted'); if (result.status === 'accepted') expect(result.duplicate).toBe(i > 0);
    }
    expect(f.decide).toHaveBeenCalledTimes(1); expect(f.snapshot().save.revision).toBe(1);
    expect(f.snapshot().journal.memories).toHaveLength(1);
    expect(await service.execute('owner', { ...f.intent, payload: { destinationId: 'other' } })).toEqual({ status: 'idempotency_conflict' });
  });
  it('arbitrates concurrent identical requests through the atomic commit receipt', async () => {
    const f = fixture(); const service = new ServerTurnService(f.repository, f.rules);
    const results = await Promise.all(Array.from({ length: 10 }, () => service.execute('owner', f.intent)));
    expect(results.every(result => result.status === 'accepted')).toBe(true);
    expect(results.filter(result => result.status === 'accepted' && !result.duplicate)).toHaveLength(1);
    expect(f.snapshot().save.revision).toBe(1); expect(f.snapshot().journal.memories[0]?.observations).toHaveLength(1);
  });
  it('narration failure keeps committed state; explicit retry cannot repeat settlement or mutate its receipt', async () => {
    const f = fixture(); let succeed = false;
    const service = new ServerTurnService(f.repository, f.rules, async receipt => {
      expect(f.snapshot().save.revision).toBe(1);
      receipt.resultingRevision = 999;
      if (!succeed) throw new Error('private-provider-detail');
      return 'Narrative only.';
    });
    const failed = await service.execute('owner', f.intent, true);
    expect(failed).toMatchObject({ status: 'accepted', receipt: { resultingRevision: 1 }, narrative: { status: 'failed', code: 'NARRATIVE_UNAVAILABLE' } });
    expect(JSON.stringify(failed)).not.toContain('private-provider'); succeed = true;
    expect(await service.execute('owner', f.intent, true)).toMatchObject({ status: 'accepted', duplicate: true, narrative: { status: 'received' } });
    expect(f.decide).toHaveBeenCalledTimes(1); expect(f.snapshot().save.revision).toBe(1);
  });
  it('times out even when the provider ignores cancellation, without rolling back state', async () => {
    const f = fixture(); let signal: AbortSignal | undefined;
    const service = new ServerTurnService(f.repository, f.rules, async (_, value) => { signal = value; return new Promise(() => {}); }, 5);
    expect(await service.execute('owner', f.intent, true)).toMatchObject({ status: 'accepted', narrative: { status: 'failed', code: 'NARRATIVE_TIMEOUT' } });
    expect(signal?.aborted).toBe(true); expect(f.snapshot().save.revision).toBe(1);
  });
  it('refuses mismatched rules versions and revision conflicts without projecting memory', async () => {
    const f = fixture(); const service = new ServerTurnService(f.repository, { ...f.rules, ruleVersion: 'other' });
    expect(await service.execute('owner', f.intent)).toEqual({ status: 'version_mismatch' });
    expect(await new ServerTurnService(f.repository, f.rules).execute('owner', { ...f.intent, expectedRevision: 2 })).toEqual({ status: 'revision_conflict', currentRevision: 0 });
    expect(f.repository.commitAcceptedTurn).not.toHaveBeenCalled();
  });
  it('never requests narration when the state-memory transaction fails', async () => {
    const f = fixture(); const narrate = vi.fn(async () => 'Must not run');
    f.repository.commitAcceptedTurn = async () => { throw new Error('fixture transaction rollback'); };
    await expect(new ServerTurnService(f.repository, f.rules, narrate).execute('owner', f.intent, true)).rejects.toThrow('fixture transaction rollback');
    expect(narrate).not.toHaveBeenCalled(); expect(f.snapshot().save.revision).toBe(0);
    expect(f.snapshot().journal.memories).toHaveLength(0);
  });
  it('returns rules rejection or clarification without creating events or requesting narrative', async () => {
    const f = fixture(); const narrate = vi.fn(async () => 'Must not run');
    const denied: ServerTurnRules = { ...f.rules, decide: (_, save) => ({ status: 'rejected', code: 'FIXTURE_REJECTED', message: 'Synthetic refusal.', revision: save.revision }) };
    expect(await new ServerTurnService(f.repository, denied, narrate).execute('owner', f.intent, true)).toMatchObject({ status: 'decision', receipt: { decision: { status: 'rejected' } } });
    expect(f.repository.commitAcceptedTurn).not.toHaveBeenCalled(); expect(narrate).not.toHaveBeenCalled();
  });
  it('cancels only narration, preserving the committed receipt and aborting the provider', async () => {
    const f = fixture(); const cancel = new AbortController(); let providerSignal: AbortSignal | undefined;
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    const service = new ServerTurnService(f.repository, f.rules, async (_, signal) => { providerSignal = signal; entered(); return new Promise(() => {}); });
    const result = service.execute('owner', f.intent, true, cancel.signal);
    await started; cancel.abort();
    expect(await result).toMatchObject({ status: 'accepted', narrative: { status: 'failed', code: 'NARRATIVE_CANCELLED' } });
    expect(providerSignal?.aborted).toBe(true); expect(f.snapshot().save.revision).toBe(1);
    expect(await service.execute('owner', f.intent)).toMatchObject({ status: 'accepted', duplicate: true, narrative: { status: 'not_requested' } });
    expect(f.decide).toHaveBeenCalledTimes(1);
  });
});
