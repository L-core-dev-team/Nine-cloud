import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent, SaveEnvelope, SaveEnvelopeV2, TurnReceipt } from '@jiuxiao/contracts';
import { createNpcMemoryJournal } from '@jiuxiao/domain';
import { RuleResolver } from './rule-resolver.js';
import { ServerTurnService, type ServerTurnRepository, type ServerTurnRules } from './server-turn.js';
import type { NarrativeContext } from './narrative-scheduler.js';
import { createP1SaveMemoryPolicy } from './p1-memory-policy.js';
import type { AuthorizedObservationOutboxRecord } from '@jiuxiao/domain';

function fixture(initialSave?: SaveEnvelope) {
  let save: SaveEnvelope = initialSave ?? { schemaVersion: 1, saveId: 'test-turn', revision: 0,
    ruleVersion: 'fixture-only', canonVersion: 'fixture-only', memoryPolicyVersion: 'fixture-only',
    state: { playerId: 'player', locationId: 'origin', elapsedMinutes: 900, facts: { gameMinute: 30 } } };
  let journal = createNpcMemoryJournal(save.saveId, 0);
  const receipts = new Map<string, TurnReceipt>();
  const decide = vi.fn<ServerTurnRules['decide']>((intent, current) => ({ status: 'accepted', nextRevision: current.revision + 1,
    events: [{ id: randomUUID(), saveId: current.saveId, type: 'fixture.travel', beforeRevision: current.revision,
      afterRevision: current.revision + 1, occurredAt: new Date().toISOString(), source: 'RULES', ruleVersion: current.ruleVersion,
      payload: { destinationId: intent.kind === 'move' ? intent.payload.destinationId : 'fixture' } }] }));
  const rules: ServerTurnRules = { ruleVersion: 'fixture-only', canonVersion: 'fixture-only', memoryPolicyVersion: 'fixture-only',
    decide, reduce: (state, event) => ({ ...state, locationId: String(event.payload.destinationId), elapsedMinutes: state.elapsedMinutes + 1,
      facts: { ...state.facts, gameMinute: Number(state.facts.gameMinute) + 15 } }),
    grantsForEvent: event => [{ npcId: 'visible-npc', eventId: event.id, channel: 'witnessed', authorizationPolicyVersion: 'visibility-v1',
      authorizedFields: ['summary'], authorizedFacts: { summary: 'Visible test event.' }, visibleSummary: 'Visible test event.' }],
    policyForNpc: () => 'exact-recall-v1' };
  const repository: ServerTurnRepository = {
    loadSave: vi.fn(async owner => owner === 'owner' ? structuredClone(save) : null),
    getReceiptForOwner: async (_, __, id) => structuredClone(receipts.get(id) ?? null),
    getForOwner: async () => structuredClone(journal),
    recordNonAcceptedDecision: vi.fn(async input => {
      const prior = receipts.get(input.receipt.idempotencyKey);
      if (prior) return prior.requestFingerprint === input.receipt.requestFingerprint
        ? { kind: 'duplicate' as const, receipt: structuredClone(prior) }
        : { kind: 'idempotency_conflict' as const };
      if (input.expectedRevision !== save.revision) return { kind: 'conflict' as const, currentRevision: save.revision };
      receipts.set(input.receipt.idempotencyKey, structuredClone(input.receipt));
      return { kind: 'recorded' as const, receipt: structuredClone(input.receipt) };
    }),
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
  return { repository, rules, decide, intent, snapshot: () => ({ save, journal }),
    addReceipt: (receipt: TurnReceipt) => { receipts.set(receipt.idempotencyKey, structuredClone(receipt)); },
    setArchive: () => { save.state.facts.archiveKind = 'local-untrusted-v1'; } };
}

describe('server turn orchestration (synthetic rules, never production gameplay)', () => {
  it('preserves class-based resolver context during settlement and duplicate recovery', async () => {
    const f=fixture();const rules=new RuleResolver({version:{ruleVersion:'fixture-only',ActionRulesVersion:'fixture-action',CombatRulesVersion:'fixture-combat',canonVersion:'fixture-only',memoryPolicyVersion:'fixture-only'},resolve:()=>({status:'accepted',outcome:'success',delta:{timeChange:1,locationChange:{before:'origin',after:'gate'},factChanges:[{key:'gameMinute',before:{present:true,value:30},after:{present:true,value:31}}]}})},()=>[],()=>'exact-recall-v1');
    const service=new ServerTurnService(f.repository,rules);
    expect(await service.execute('owner',f.intent)).toMatchObject({status:'accepted',duplicate:false});
    expect(await service.execute('owner',f.intent)).toMatchObject({status:'accepted',duplicate:true});
    expect(f.snapshot().save).toMatchObject({revision:1,state:{locationId:'gate',elapsedMinutes:901}});
  });
  it('records presentation status after commit without letting log failure undo settlement', async () => {
    const f=fixture();const log=vi.fn<NonNullable<ServerTurnRepository['recordNarrativeStatus']>>(async()=>{expect(f.snapshot().save.revision).toBe(1);});f.repository.recordNarrativeStatus=log;
    expect(await new ServerTurnService(f.repository,f.rules,async()=>'text').execute('owner',f.intent,true)).toMatchObject({status:'accepted',narrative:{status:'received'}});
    expect(log.mock.calls.map(call=>call[4])).toEqual(['generating','received']);
    log.mockImplementation(async()=>{throw new Error('fixture log failure');});
    expect(await new ServerTurnService(f.repository,f.rules).execute('owner',f.intent,true)).toMatchObject({status:'accepted',duplicate:true,narrative:{code:'NARRATIVE_UNAVAILABLE'}});
    expect(f.snapshot().save.revision).toBe(1);
  });
  it('fails closed before reading saves when rules are not ready', async () => {
    const f = fixture(); const service = new ServerTurnService(f.repository);
    expect(await service.execute('owner', f.intent)).toEqual({ status: 'rules_not_ready' });
    expect(f.repository.loadSave).not.toHaveBeenCalled();
    expect(f.repository.commitAcceptedTurn).not.toHaveBeenCalled();
  });
  it('still rejects foreign owners and client backups once an authorized rule set is supplied', async () => {
    const f = fixture();
    expect(await new ServerTurnService(f.repository,f.rules).execute('other', f.intent)).toEqual({ status: 'not_found' });
    f.setArchive(); expect(await new ServerTurnService(f.repository,f.rules).execute('owner', f.intent)).toEqual({ status: 'client_archive' });
    expect(f.repository.commitAcceptedTurn).not.toHaveBeenCalled();
  });
  it('does not fall back to elapsedMinutes for NPC observation time', async () => {
    const f = fixture();
    f.snapshot().save.state.facts = {};
    const legacyRules = { ...f.rules, reduce: (state: Parameters<ServerTurnRules['reduce']>[0], event: Parameters<ServerTurnRules['reduce']>[1]) =>
      ({ ...state, locationId: String(event.payload.destinationId), elapsedMinutes: state.elapsedMinutes + 1 }) };
    await expect(new ServerTurnService(f.repository, legacyRules).execute('owner', f.intent))
      .rejects.toMatchObject({ code: 'GAME_MINUTE_NOT_READY' });
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
    expect(f.snapshot().journal.memories[0]?.observations[0]?.observedAtMinute).toBe(45);
    expect(f.snapshot().journal.memories[0]?.observations[0]?.observedAtMinute).not.toBe(f.snapshot().save.state.elapsedMinutes);
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
    expect(JSON.stringify(failed)).not.toContain('private-provider');
    const committedState = structuredClone(f.snapshot());
    succeed = true;
    const retried = await service.execute('owner', f.intent, true);
    expect(retried).toMatchObject({ status: 'accepted', duplicate: true, narrative: { status: 'received' } });
    if (retried.status === 'accepted' && failed.status === 'accepted') expect(retried.receipt).toEqual(failed.receipt);
    expect(f.snapshot()).toEqual(committedState);
    expect(f.snapshot().save.state.facts.gameMinute).toBe(45);
    expect(f.snapshot().journal.memories).toHaveLength(1);
    expect(f.snapshot().journal.memories[0]?.observations).toHaveLength(1);
    expect(f.decide).toHaveBeenCalledTimes(1);
  });
  it('uses deterministic presentation after a model failure without re-running rules', async () => {
    const f = fixture();
    const fallback = vi.fn(() => 'Committed event fallback.');
    const service = new ServerTurnService(f.repository, f.rules, async () => { throw new Error('provider unavailable'); }, 20, fallback);
    const result = await service.execute('owner', f.intent, true);
    expect(result).toMatchObject({ status: 'accepted', duplicate: false, narrative: { status: 'received', source: 'deterministic', text: 'Committed event fallback.' } });
    expect(fallback).toHaveBeenCalledOnce();
    expect(f.decide).toHaveBeenCalledOnce();
    expect(f.snapshot().save.revision).toBe(1);
    expect(await service.execute('owner', f.intent, true)).toMatchObject({ status: 'accepted', duplicate: true, narrative: { source: 'deterministic' } });
    expect(f.decide).toHaveBeenCalledOnce();
    expect(f.snapshot().save.revision).toBe(1);
  });
  it('passes only authorized, policy-filtered NPC recall into narration after commit', async () => {
    const base = fixture();
    const v1 = base.snapshot().save;
    const save: SaveEnvelopeV2 = {
      ...v1,
      schemaVersion: 2,
      memoryMode: 'continue',
      memoryPolicy: createP1SaveMemoryPolicy('continue', 0, 'fixture-only'),
    };
    const f = fixture(save);
    const eventId = randomUUID();
    const event: DomainEvent = {
      id: eventId, saveId: save.saveId, type: 'talk.occurred', branchId: 'root',
      beforeRevision: 0, afterRevision: 1, occurredAt: '2026-10-05T00:00:00.000Z',
      source: 'RULES', ruleVersion: save.ruleVersion,
      payload: { npcId: 'visible-npc', topicTag: 'topic_route', outcome: 'on_topic' },
    };
    const rules: ServerTurnRules = {
      ...f.rules,
      decide: (_intent, current) => ({ status: 'accepted', outcome: 'success', nextRevision: current.revision + 1, events: [event] }),
      grantsForEvent: current => current.type === 'talk.occurred' ? [{
        npcId: 'visible-npc', eventId: current.id, channel: 'witnessed',
        authorizationPolicyVersion: 'visibility-v1', authorizedFields: ['summary', 'topicTag', 'outcome'],
        authorizedFacts: { summary: 'topicTag=topic_route;outcome=on_topic', topicTag: 'topic_route', outcome: 'on_topic' },
        visibleSummary: 'topicTag=topic_route;outcome=on_topic',
      }] : [],
      policyForNpc: () => 'continue-v1',
    };
    const row = (npcId: string): AuthorizedObservationOutboxRecord => ({
      grantId: `grant-${npcId}`, grantIdVersion: 1, saveId: save.saveId, branchId: 'root', npcId, eventId,
      eventRevision: 1, observedAtMinute: 45, channel: 'witnessed',
      authorizationPolicyVersion: 'visibility-v1', authorizedFields: ['summary', 'topicTag', 'outcome'],
      authorizedFacts: { summary: 'topicTag=topic_route;outcome=on_topic', topicTag: 'topic_route', outcome: 'on_topic' },
      summary: 'topicTag=topic_route;outcome=on_topic',
    });
    const reader = vi.fn(async (_owner: string, _saveId: string, _npcId: string) => ({
      items: [row('visible-npc'), row('other-npc')], nextCursor: null,
    }));
    f.repository.getAuthorizedObservationPage = reader;
    const received: NarrativeContext[] = [];
    const narrate = async (_receipt: TurnReceipt, _signal: AbortSignal, context?: NarrativeContext) => {
      received.push(context ?? { npcMemories: [] });
      return 'Narrative from committed facts.';
    };

    const result = await new ServerTurnService(f.repository, rules, narrate).execute('owner', f.intent, true);

    expect(result).toMatchObject({ status: 'accepted', narrative: { status: 'received', source: 'model' } });
    expect(reader).toHaveBeenCalledOnce();
    expect(received).toEqual([{
      playerConditionLines: [],
      npcUtterances: [],
      npcMemories: [{ npcId: 'visible-npc', observations: [{
        summary: 'topicTag=topic_route;outcome=on_topic', accessibility: 1,
      }] }],
    }]);
    expect(f.snapshot().save.revision).toBe(1);
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
    const before = structuredClone(f.snapshot());
    const result = await new ServerTurnService(f.repository, denied, narrate).execute('owner', f.intent, true);
    expect(result).toMatchObject({ status: 'decision', receipt: { decision: { status: 'rejected' } } });
    expect(f.repository.recordNonAcceptedDecision).toHaveBeenCalledTimes(1);
    expect(f.repository.commitAcceptedTurn).not.toHaveBeenCalled(); expect(narrate).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(before);
    expect(await new ServerTurnService(f.repository, denied).execute('owner', f.intent)).toEqual(result);
    expect(f.repository.recordNonAcceptedDecision).toHaveBeenCalledTimes(1);
    expect(await new ServerTurnService(f.repository, denied).execute('owner', { ...f.intent, payload: { destinationId: 'changed' } }))
      .toEqual({ status: 'idempotency_conflict' });
    expect(f.snapshot()).toEqual(before);
  });
  it('records over-limit cultivation as the named zero-effect rules rejection', async () => {
    const f = fixture();
    const intent = {
      ...f.intent,
      kind: 'cultivate' as const,
      payload: { techniqueId: 'tech-fixture', minutes: 9 },
    };
    const overLimitRules: ServerTurnRules = {
      ...f.rules,
      decide: (_action, save) => ({
        status: 'rejected',
        code: 'INPUT_CULTIVATION_LIMIT',
        message: '每次修炼最多八刻。',
        revision: save.revision,
      }),
    };
    const before = structuredClone(f.snapshot());
    const result = await new ServerTurnService(f.repository, overLimitRules).execute('owner', intent);
    expect(result).toMatchObject({
      status: 'decision',
      receipt: {
        decision: { status: 'rejected', code: 'INPUT_CULTIVATION_LIMIT', revision: 0 },
        resultingRevision: 0,
        clockMinute: 30,
      },
    });
    expect(f.repository.recordNonAcceptedDecision).toHaveBeenCalledTimes(1);
    expect(f.repository.commitAcceptedTurn).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(before);
  });
  it('requires clarificationOf to reference the same save, current revision and a persisted clarification', async () => {
    const f = fixture(); const service = new ServerTurnService(f.repository, f.rules);
    const missing = { ...f.intent, idempotencyKey: randomUUID(), clarificationOf: randomUUID() };
    expect(await service.execute('owner', missing)).toEqual({ status: 'clarification_conflict' });
    expect(f.decide).not.toHaveBeenCalled();
    expect(f.repository.commitAcceptedTurn).not.toHaveBeenCalled();

    const interactionId = randomUUID();
    f.addReceipt({
      idempotencyKey: interactionId,
      saveId: f.intent.saveId,
      requestFingerprint: `sha256:v1:${'a'.repeat(64)}`,
      branchId: 'root',
      rulesVersion: 'fixture-only',
      clockMinute: 30,
      rng: { seed: null, draws: 0 },
      decision: { status: 'clarify', question: '你要去哪里？', missingSlots: ['destinationId'], candidates: [], interactionId, revision: 0 },
      resultingRevision: 0,
    });
    const followUp = { ...f.intent, idempotencyKey: randomUUID(), clarificationOf: interactionId };
    expect(await service.execute('owner', followUp)).toMatchObject({
      status: 'accepted', receipt: { clarificationOf: interactionId },
    });
    expect(await service.execute('owner', followUp)).toMatchObject({ status: 'accepted', duplicate: true });
  });
  it('rejects a clarification pointer after another turn has advanced the save', async () => {
    const f = fixture(); const interactionId = randomUUID();
    f.addReceipt({
      idempotencyKey: interactionId,
      saveId: f.intent.saveId,
      requestFingerprint: `sha256:v1:${'b'.repeat(64)}`,
      branchId: 'root',
      rulesVersion: 'fixture-only',
      clockMinute: 30,
      rng: { seed: null, draws: 0 },
      decision: { status: 'clarify', question: '你要去哪里？', missingSlots: ['destinationId'], candidates: [], interactionId, revision: 1 },
      resultingRevision: 1,
    });
    expect(await new ServerTurnService(f.repository, f.rules).execute('owner', {
      ...f.intent, idempotencyKey: randomUUID(), clarificationOf: interactionId,
    })).toEqual({ status: 'clarification_conflict' });
    expect(f.decide).not.toHaveBeenCalled();
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
