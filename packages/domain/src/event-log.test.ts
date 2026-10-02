import { describe, expect, it, vi } from 'vitest';
import type { ActionIntent, Decision, DomainEvent, SaveEnvelope } from '@jiuxiao/contracts';
import { prepareTurn, replayEvents, TurnBoundaryError, type EventReducer } from './event-log.js';
import { evaluate } from './rules.js';

const initialSave = (): SaveEnvelope => ({
  schemaVersion: 1,
  saveId: 'fixture-save',
  canonVersion: 'fixture-canon',
  ruleVersion: 'unsigned-rules',
  memoryPolicyVersion: 'none-0',
  revision: 0,
  state: { playerId: 'fixture-player', locationId: 'fixture-location', elapsedMinutes: 0, facts: { counter: 0 } },
});

const intent = (destinationId = 'fixture-destination', expectedRevision = 0): ActionIntent => ({
  saveId: 'fixture-save',
  actorId: 'fixture-player',
  expectedRevision,
  idempotencyKey: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5',
  kind: 'move',
  payload: { destinationId },
});

const reducer: EventReducer = (state, event) => {
  const amount = event.payload.amount;
  if (event.type !== 'FIXTURE_INCREMENT' || typeof amount !== 'number') {
    throw new Error('Unexpected synthetic event in test reducer');
  }
  return { ...state, facts: { ...state.facts, counter: Number(state.facts.counter) + amount } };
};

const acceptedDecision = (save: SaveEnvelope, ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']): Decision => ({
  status: 'accepted',
  nextRevision: save.revision + 1,
  events: ids.map((id, index): DomainEvent => ({
    id,
    saveId: save.saveId,
    type: 'FIXTURE_INCREMENT',
    beforeRevision: save.revision,
    afterRevision: save.revision + 1,
    occurredAt: '2026-09-25T00:00:00.000Z',
    source: 'RULES',
    ruleVersion: save.ruleVersion,
    payload: { amount: index + 1 },
  })),
});

describe('S3 event log and turn boundary', () => {
  it('keeps production evaluation closed until gameplay rules are signed', () => {
    const save = initialSave();
    expect(evaluate(intent(), save)).toMatchObject({ status: 'rejected', code: 'RULES_NOT_READY' });
  });

  it('prepares a multi-event turn as one deterministic revision transition', async () => {
    const save = initialSave();
    const result = await prepareTurn({
      intent: intent(),
      save,
      decide: (_action, snapshot) => acceptedDecision(snapshot),
      reduce: reducer,
    });

    expect(result.status).toBe('prepared');
    if (result.status !== 'prepared') throw new Error('Expected fixture decision to prepare');
    expect(result.save.revision).toBe(1);
    expect(result.save.state.facts.counter).toBe(3);
    expect(save.revision).toBe(0);
    expect(save.state.facts.counter).toBe(0);

    const replayed = replayEvents(save, result.receipt.decision.status === 'accepted' ? result.receipt.decision.events : [], reducer);
    expect(replayed).toEqual(result.save);
  });

  it('returns the first receipt for a duplicate before checking the now-stale revision', async () => {
    const save = initialSave();
    const decision = vi.fn((_action: ActionIntent, snapshot: SaveEnvelope) => acceptedDecision(snapshot));
    const first = await prepareTurn({ intent: intent(), save, decide: decision, reduce: reducer });
    if (first.status !== 'prepared') throw new Error('Expected fixture decision to prepare');

    const duplicate = await prepareTurn({ intent: intent(), save: first.save, priorReceipt: first.receipt, decide: decision, reduce: reducer });
    expect(duplicate).toEqual({ status: 'duplicate', receipt: first.receipt });
    expect(decision).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate receipt when the supplied snapshot belongs to another save', async () => {
    const save = initialSave();
    const decide = vi.fn((_action: ActionIntent, snapshot: SaveEnvelope) => acceptedDecision(snapshot));
    const first = await prepareTurn({ intent: intent(), save, decide, reduce: reducer });
    if (first.status !== 'prepared') throw new Error('Expected fixture decision to prepare');

    const otherSave = { ...first.save, saveId: 'other-fixture-save' };
    await expect(prepareTurn({
      intent: intent(),
      save: otherSave,
      priorReceipt: first.receipt,
      decide,
      reduce: reducer,
    })).rejects.toMatchObject({ code: 'SAVE_ID_MISMATCH' });
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('rejects idempotency-key reuse with a different action and reports revision conflicts', async () => {
    const save = initialSave();
    const first = await prepareTurn({ intent: intent(), save, decide: (_action, snapshot) => acceptedDecision(snapshot), reduce: reducer });
    if (first.status !== 'prepared') throw new Error('Expected fixture decision to prepare');

    const changed = await prepareTurn({
      intent: intent('another-fixture-destination'),
      save,
      priorReceipt: first.receipt,
      decide: (_action, snapshot) => acceptedDecision(snapshot),
      reduce: reducer,
    });
    expect(changed.status).toBe('idempotency-conflict');

    const conflict = await prepareTurn({
      intent: intent('fixture-destination', 0),
      save: first.save,
      decide: vi.fn(() => ({ status: 'rejected', code: 'UNUSED', message: 'unused', revision: 1 })),
      reduce: reducer,
    });
    expect(conflict).toEqual({ status: 'revision-conflict', expectedRevision: 0, actualRevision: 1 });
  });

  it('rejects accepted decisions whose event batch does not match the save revision', async () => {
    const badDecision = (_action: ActionIntent, snapshot: SaveEnvelope): Decision => {
      const decision = acceptedDecision(snapshot);
      if (decision.status !== 'accepted') return decision;
      return { ...decision, events: decision.events.map((event, index) => index === 0 ? { ...event, afterRevision: 2 } : event) };
    };

    await expect(prepareTurn({ intent: intent(), save: initialSave(), decide: badDecision, reduce: reducer }))
      .rejects.toMatchObject({ code: 'EVENT_REVISION_MISMATCH' });
  });

  it('rejects event tails that skip, reorder, or duplicate a revision transition', () => {
    const save = initialSave();
    const first = acceptedDecision(save);
    if (first.status !== 'accepted') throw new Error('Expected fixture decision');
    const outOfOrder = [{ ...first.events[0], beforeRevision: 1, afterRevision: 2 }, first.events[1]];
    expect(() => replayEvents(save, outOfOrder, reducer)).toThrowError(TurnBoundaryError);
    expect(() => replayEvents(save, [first.events[0], first.events[0]], reducer)).toThrowError(/unique/);
  });

  it('rejects a replay from the wrong rule version and events that JSON storage would change', () => {
    const save = initialSave();
    const first = acceptedDecision(save);
    if (first.status !== 'accepted') throw new Error('Expected fixture decision');
    const event = first.events[0];
    if (!event) throw new Error('Missing fixture event');
    expect(() => replayEvents(save, [{ ...event, ruleVersion: 'another-ruleset' }], reducer))
      .toThrowError(/rule version/);
    expect(() => replayEvents(save, [{ ...event, payload: { amount: Number.NaN } }], reducer))
      .toThrowError(/JSON bounds|persisted as JSON/);
  });

  it('replays a 100-turn synthetic tail deterministically and resumes from a checkpoint', () => {
    // Synthetic infrastructure coverage only: this does not install or imply signed gameplay rules.
    const save = initialSave();
    const turnCount = 100;
    const eventTail: DomainEvent[] = [];

    for (let turn = 0; turn < turnCount; turn += 1) {
      for (let index = 0; index < 2; index += 1) {
        const sequence = turn * 2 + index + 1;
        eventTail.push({
          id: `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`,
          saveId: save.saveId,
          type: 'FIXTURE_INCREMENT',
          beforeRevision: turn,
          afterRevision: turn + 1,
          occurredAt: new Date(Date.UTC(2026, 8, 25, 0, sequence)).toISOString(),
          source: 'RULES',
          ruleVersion: save.ruleVersion,
          payload: { amount: index + 1 },
        });
      }
    }

    const complete = replayEvents(save, eventTail, reducer);
    const replayedAgain = replayEvents(save, eventTail, reducer);
    const checkpointEventCount = 50 * 2;
    const checkpoint = replayEvents(save, eventTail.slice(0, checkpointEventCount), reducer);
    const resumed = replayEvents(checkpoint, eventTail.slice(checkpointEventCount), reducer);

    expect(eventTail).toHaveLength(turnCount * 2);
    expect(new Set(eventTail.map(event => event.id)).size).toBe(eventTail.length);
    expect(checkpoint.revision).toBe(50);
    expect(checkpoint.state.facts.counter).toBe(150);
    expect(complete.revision).toBe(turnCount);
    expect(complete.state.facts.counter).toBe(turnCount * 3);
    expect(replayedAgain).toEqual(complete);
    expect(resumed).toEqual(complete);
    expect(save.revision).toBe(0);
    expect(save.state.facts.counter).toBe(0);
  });

});
