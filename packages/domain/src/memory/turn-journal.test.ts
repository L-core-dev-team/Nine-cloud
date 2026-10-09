import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@jiuxiao/contracts';
import {
  assertNpcMemoryJournal,
  assertAuthorizedObservationOutboxRecord,
  createNpcMemoryJournal,
  parseNpcMemoryJournalJson,
  prepareNpcMemoryTurn,
  serializeNpcMemoryJournal,
  stableGrantIdV2,
} from './turn-journal.js';

const EVENT_1 = '11111111-1111-4111-8111-111111111111';
const EVENT_2 = '22222222-2222-4222-8222-222222222222';

function makeEvent(id = EVENT_1, overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id,
    saveId: 'save-1',
    type: 'fixture.observed',
    beforeRevision: 0,
    afterRevision: 1,
    occurredAt: '2026-09-28T00:00:00.000Z',
    source: 'RULES',
    ruleVersion: 'rules-v1',
    payload: { privateText: 'secret must not enter NPC memory' },
    ...overrides,
  };
}

function prepare(
  journal = createNpcMemoryJournal('save-1', 0),
  events: readonly DomainEvent[] = [makeEvent()],
  grantsForEvent: (event: DomainEvent) => readonly {
    npcId: string; eventId: string; channel: 'witnessed' | 'reported'; authorizationPolicyVersion: string;
    authorizedFields: readonly string[]; authorizedFacts: Readonly<Record<string, unknown>>; visibleSummary: string;
  }[] = event => [{
    npcId: 'npc-1',
    eventId: event.id,
    channel: 'witnessed',
    authorizationPolicyVersion: 'visibility-v1',
    authorizedFields: ['summary'],
    authorizedFacts: { summary: '只看到门外来客' },
    visibleSummary: '只看到门外来客',
  }],
) {
  return prepareNpcMemoryTurn({
    journal,
    saveId: 'save-1',
    beforeRevision: 0,
    afterRevision: 1,
    events,
    observedAtMinute: 10,
    grantsForEvent,
    policyForNpc: () => 'accessibility-v1',
  });
}

describe('NPC memory turn journal', () => {
  it('records only explicitly granted, NPC-visible summaries and round-trips persisted JSON', () => {
    const result = prepare();
    expect(result.status).toBe('prepared');
    if (result.status !== 'prepared') throw new Error('Expected prepared memory journal');

    expect(result.recordedObservations).toBe(1);
    expect(result.journal.revision).toBe(1);
    expect(result.journal.memories).toHaveLength(1);
    expect(result.journal.memories[0]?.observations[0]?.summary).toBe('只看到门外来客');
    expect(result.authorizedObservations).toHaveLength(1);
    expect(result.authorizedObservations[0]).toMatchObject({
      grantId: stableGrantIdV2('save-1', 'root', 'npc-1', EVENT_1, 'visibility-v1'), grantIdVersion: 2, branchId: 'root',
      authorizedFields: ['summary'], authorizedFacts: { summary: '只看到门外来客' },
    });
    expect(JSON.stringify(result.journal)).not.toContain('secret must not enter NPC memory');
    expect(JSON.stringify(result.journal)).not.toContain('authorizationPolicyVersion');

    const restored = parseNpcMemoryJournalJson(serializeNpcMemoryJournal(result.journal));
    expect(restored).toEqual(result.journal);
  });

  it('uses portable UTF-8 byte lengths and binds grant identity to policy version', () => {
    const first = stableGrantIdV2('存档', 'root', '岑九', EVENT_1, 'visibility-v1');
    const policyChanged = stableGrantIdV2('存档', 'root', '岑九', EVENT_1, 'visibility-v2');
    expect(first).toContain('6:存档');
    expect(first).not.toBe(policyChanged);
  });

  it('keeps persisted v1 grant IDs readable during the append-only migration', () => {
    const legacy = {
      grantId: ['save-1', 'root', EVENT_1, 'npc-1'].map(part => `${part.length}:${part}`).join(''),
      grantIdVersion: 1,
      saveId: 'save-1', branchId: 'root', npcId: 'npc-1', eventId: EVENT_1,
      eventRevision: 1, observedAtMinute: 10, channel: 'witnessed', memoryClass: 'unclassified',
      authorizationPolicyVersion: 'visibility-v1', authorizedFields: ['summary'],
      authorizedFacts: { summary: '旧 grant 身份继续有效' }, summary: '旧 grant 身份继续有效',
    };
    expect(() => assertAuthorizedObservationOutboxRecord(legacy)).not.toThrow();
  });

  it('continues to parse and serialize the original schema-1 journal shape', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      saveId: 'save-1',
      revision: 1,
      memories: [{
        npcId: 'npc-1',
        policyVersion: 'accessibility-v1',
        observations: [{
          npcId: 'npc-1', eventId: EVENT_1, eventRevision: 1, observedAtMinute: 10,
          channel: 'witnessed', summary: '旧版中已获准记下的见闻',
        }],
      }],
      lastTurn: { fromRevision: 0, toRevision: 1, eventIds: [EVENT_1] },
    });
    const parsed = parseNpcMemoryJournalJson(legacyJson);
    expect(parsed.memories[0]?.observations[0]?.summary).toBe('旧版中已获准记下的见闻');
    expect(parseNpcMemoryJournalJson(serializeNpcMemoryJournal(parsed))).toEqual(parsed);
  });

  it('advances the journal for an event no NPC was authorized to observe', () => {
    const result = prepare(createNpcMemoryJournal('save-1', 0), [makeEvent()], () => []);
    expect(result.status).toBe('prepared');
    expect(result.journal.revision).toBe(1);
    expect(result.journal.memories).toEqual([]);
    expect(result.recordedObservations).toBe(0);
  });

  it('makes an exact replay idempotent without invoking visibility policy again', () => {
    const first = prepare();
    if (first.status !== 'prepared') throw new Error('Expected prepared memory journal');

    const replay = prepare(first.journal, [makeEvent()], () => {
      throw new Error('A duplicate turn must not re-run NPC visibility policy');
    });
    expect(replay).toEqual({
      status: 'duplicate',
      journal: first.journal,
      recordedObservations: 0,
      authorizedObservations: [],
      authorizedSupersessions: [],
    });
  });

  it('keeps legacy grants unclassified and accepts only rules-authored current-state supersession metadata', () => {
    const firstEvent = makeEvent();
    const first = prepareNpcMemoryTurn({ journal: createNpcMemoryJournal('save-1', 0), saveId: 'save-1',
      beforeRevision: 0, afterRevision: 1, events: [firstEvent], observedAtMinute: 10,
      grantsForEvent: event => [{ npcId: 'npc-1', eventId: event.id, channel: 'witnessed',
        authorizationPolicyVersion: 'visibility-v1', authorizedFields: ['summary'],
        authorizedFacts: { summary: '林月住在中州。' }, visibleSummary: '林月住在中州。', memoryClass: 'current-state' }],
      policyForNpc: () => 'accessibility-v1' });
    if (first.status !== 'prepared') throw new Error('Expected prepared current-state observation');
    expect(first.authorizedObservations[0]?.memoryClass).toBe('current-state');

    const nextEvent = makeEvent(EVENT_2, { beforeRevision: 1, afterRevision: 2 });
    const supersession = prepareNpcMemoryTurn({ journal: first.journal, saveId: 'save-1', beforeRevision: 1,
      afterRevision: 2, events: [nextEvent], observedAtMinute: 20,
      grantsForEvent: event => [{ npcId: 'npc-1', eventId: event.id, channel: 'witnessed',
        authorizationPolicyVersion: 'visibility-v1', authorizedFields: ['summary'],
        authorizedFacts: { summary: '林月已迁离中州。' }, visibleSummary: '林月已迁离中州。', memoryClass: 'current-state' }],
      supersessionsForEvent: () => [{ npcId: 'npc-1', observationGrantId: first.authorizedObservations[0]!.grantId,
        kind: 'premise-revised', reason: '规则事件确认住处已变化。', policyVersion: 'recall-v1' }],
      policyForNpc: () => 'accessibility-v1' });
    expect(supersession.status).toBe('prepared');
    if (supersession.status !== 'prepared') throw new Error('Expected prepared supersession');
    expect(supersession.authorizedSupersessions).toMatchObject([{ observationGrantId: first.authorizedObservations[0]?.grantId,
      supersededByEventId: EVENT_2, supersededAtRevision: 2 }]);
    expect(() => prepareNpcMemoryTurn({ journal: first.journal, saveId: 'save-1', beforeRevision: 1,
      afterRevision: 2, events: [nextEvent], observedAtMinute: 20,
      grantsForEvent: event => [{ npcId: 'npc-1', eventId: event.id, channel: 'witnessed',
        authorizationPolicyVersion: 'visibility-v1', authorizedFields: ['summary'],
        authorizedFacts: { summary: '林月已迁离中州。' }, visibleSummary: '林月已迁离中州.' }],
      supersessionsForEvent: () => [{ npcId: 'npc-1', observationGrantId: first.authorizedObservations[0]!.grantId,
        kind: 'premise-revised', reason: '规则事件确认住处已变化。', policyVersion: 'recall-v1' }],
      policyForNpc: () => 'accessibility-v1' })).toThrow();
  });

  it('rejects stale, cross-save, migration, mixed-revision, and duplicate-event batches', () => {
    const journal = createNpcMemoryJournal('save-1', 0);
    const wrongSave = makeEvent(EVENT_1, { saveId: 'save-2' });
    expect(() => prepare(journal, [wrongSave])).toThrow('do not match');

    const migration = makeEvent(EVENT_1, { source: 'MIGRATION' });
    expect(() => prepare(journal, [migration])).toThrow('do not match');

    const mixedRevision = makeEvent(EVENT_2, { beforeRevision: 1, afterRevision: 2 });
    expect(() => prepare(journal, [makeEvent(), mixedRevision])).toThrow('do not match');

    expect(() => prepare(journal, [makeEvent(), makeEvent()])).toThrow('Duplicate event ID');

    const prepared = prepare();
    if (prepared.status !== 'prepared') throw new Error('Expected prepared memory journal');
    expect(() => prepare(prepared.journal, [makeEvent(EVENT_2)])).toThrow('revision mismatch');
  });

  it('does not partially change the source journal when a grant or policy fails', () => {
    const source = createNpcMemoryJournal('save-1', 0);
    expect(() => prepare(source, [makeEvent()], () => [{
      npcId: 'npc-1', eventId: EVENT_2, channel: 'witnessed', visibleSummary: '错误事件',
      authorizationPolicyVersion: 'visibility-v1', authorizedFields: ['summary'], authorizedFacts: { summary: '错误事件' },
    }])).toThrow('grant does not match');
    expect(source).toEqual(createNpcMemoryJournal('save-1', 0));

    const first = prepare();
    if (first.status !== 'prepared') throw new Error('Expected prepared memory journal');
    const nextEvent = makeEvent(EVENT_2, { beforeRevision: 1, afterRevision: 2 });
    expect(() => prepareNpcMemoryTurn({
      journal: first.journal,
      saveId: 'save-1',
      beforeRevision: 1,
      afterRevision: 2,
      events: [nextEvent],
      observedAtMinute: 20,
      grantsForEvent: event => [{
        npcId: 'npc-1', eventId: event.id, channel: 'witnessed', visibleSummary: '第二条观察',
        authorizationPolicyVersion: 'visibility-v1', authorizedFields: ['summary'], authorizedFacts: { summary: '第二条观察' },
      }],
      policyForNpc: () => 'exact-recall-v1',
    })).toThrow('policy change requires an explicit migration');
    expect(first.journal.revision).toBe(1);
    expect(first.journal.memories[0]?.observations).toHaveLength(1);
  });

  it('rejects invalid JSON, unknown fields, duplicate owners, and malformed markers', () => {
    expect(() => parseNpcMemoryJournalJson('{broken')).toThrow('Invalid NPC memory journal JSON');

    const base = createNpcMemoryJournal('save-1', 0);
    expect(() => assertNpcMemoryJournal({ ...base, unexpected: true })).toThrow('Invalid NPC memory journal');

    const memory = {
      npcId: 'npc-1',
      policyVersion: 'exact-recall-v1',
      observations: [],
    };
    expect(() => assertNpcMemoryJournal({ ...base, memories: [memory, memory] })).toThrow('Duplicate NPC memory owner');
    expect(() => assertNpcMemoryJournal({
      ...base,
      revision: 1,
      lastTurn: { fromRevision: 0, toRevision: 1, eventIds: [EVENT_1, EVENT_1] },
    })).toThrow('Invalid NPC memory turn marker event IDs');
  });
  it('retires the oldest observations when a long journal crosses its storage budget', () => {
    const observations = Array.from({ length: 30 }, (_, index) => ({
      npcId: 'npc-1', eventId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      eventRevision: 1, observedAtMinute: index + 1, channel: 'witnessed' as const,
      summary: `第 ${index} 条${'记'.repeat(3000)}`,
    }));
    const old = { ...createNpcMemoryJournal('save-1', 1), memories: [{ npcId: 'npc-1', policyVersion: 'exact-recall-v1' as const, observations }] };
    const next = prepareNpcMemoryTurn({ journal: old, saveId: 'save-1', beforeRevision: 1, afterRevision: 2,
      events: [makeEvent(EVENT_2, { beforeRevision: 1, afterRevision: 2 })], observedAtMinute: 40,
      grantsForEvent: event => [{ npcId: 'npc-1', eventId: event.id, channel: 'witnessed',
        authorizationPolicyVersion: 'visibility-v1', authorizedFields: ['summary'], authorizedFacts: { summary: '新观察' }, visibleSummary: '新观察' }],
      policyForNpc: () => 'exact-recall-v1' });
    expect(next.status).toBe('prepared');
    expect(new TextEncoder().encode(serializeNpcMemoryJournal(next.journal)).byteLength).toBeLessThanOrEqual(64_000);
    expect(next.journal.memories[0]?.observations.at(-1)?.summary).toBe('新观察');
    expect(old.memories[0]?.observations).toHaveLength(30);
  });
});
