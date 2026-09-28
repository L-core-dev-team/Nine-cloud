import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@jiuxiao/contracts';
import {
  assertNpcMemoryJournal,
  createNpcMemoryJournal,
  parseNpcMemoryJournalJson,
  prepareNpcMemoryTurn,
  serializeNpcMemoryJournal,
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
    npcId: string; eventId: string; channel: 'witnessed' | 'reported'; visibleSummary: string;
  }[] = event => [{
    npcId: 'npc-1',
    eventId: event.id,
    channel: 'witnessed',
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
    expect(JSON.stringify(result.journal)).not.toContain('secret must not enter NPC memory');

    const restored = parseNpcMemoryJournalJson(serializeNpcMemoryJournal(result.journal));
    expect(restored).toEqual(result.journal);
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
    });
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
});
