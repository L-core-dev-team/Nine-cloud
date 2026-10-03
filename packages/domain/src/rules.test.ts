import { describe, expect, it } from 'vitest';
import { bindRuleEvents, evaluate, type RuleContext } from './rules.js';
import type { ActionIntent, SaveEnvelope } from '@jiuxiao/contracts';

describe('unapproved rule boundary', () => {
  it('binds event identity and revision metadata from the transaction context', () => {
    const save: SaveEnvelope = { schemaVersion: 1, saveId: 's', canonVersion: 'draft-0',
      ruleVersion: 'rules-0', memoryPolicyVersion: 'none-0', revision: 7,
      state: { playerId: 'p', locationId: 'gate', elapsedMinutes: 0, facts: {} } };
    const intent: ActionIntent = { saveId: 's', actorId: 'p', expectedRevision: 7,
      idempotencyKey: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5', kind: 'move',
      payload: { destinationId: 'town' } };
    const context = { occurredAt: '2026-10-03T10:00:00.000Z', eventIds: ['5945cd14-9568-4382-9736-280512bd5a43'] };
    const [event] = bindRuleEvents([{ type: 'move.arrived', payload: { to: 'town' } }], intent, save, context);

    expect(event).toMatchObject({ id: context.eventIds[0], saveId: save.saveId, branchId: 'root',
      beforeRevision: 7, afterRevision: 8, occurredAt: context.occurredAt, source: 'RULES', ruleVersion: 'rules-0' });
    expect(() => bindRuleEvents([
      { type: 'one', payload: {} }, { type: 'two', payload: {} },
    ], intent, save, context)).toThrow('RULE_EVENT_ID_CAPACITY');
  });

  it('rejects mutation attempts from a version-matched rules module', () => {
    const save: SaveEnvelope = { schemaVersion: 1, saveId: 's', canonVersion: 'draft-0',
      ruleVersion: 'rules-0', memoryPolicyVersion: 'none-0', revision: 0,
      state: { playerId: 'p', locationId: 'gate', elapsedMinutes: 0, facts: { counter: 0 } } };
    const intent: ActionIntent = { saveId: 's', actorId: 'p', expectedRevision: 0,
      idempotencyKey: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5', kind: 'move',
      payload: { destinationId: 'town' } };
    const context: RuleContext = {
      occurredAt: '2026-10-03T10:00:00.000Z',
      eventIds: ['5945cd14-9568-4382-9736-280512bd5a43'],
      module: {
        ruleVersion: 'rules-0',
        canonVersion: 'draft-0',
        decide: (_action, currentSave) => {
          currentSave.state.facts.counter = 1;
          return { status: 'rejected', code: 'ENV_RULES_NOT_READY', message: 'closed', revision: 0 };
        },
      },
    };

    expect(evaluate(intent, save, context)).toMatchObject({
      status: 'rejected', code: 'ENV_PAYLOAD_INVALID', revision: 0,
    });
    expect(save.state.facts.counter).toBe(0);
  });

  it('cannot produce a world event before rule signoff', () => {
    const save: SaveEnvelope = { schemaVersion: 1, saveId: 's', canonVersion: 'draft-0',
      ruleVersion: 'rules-0', memoryPolicyVersion: 'none-0', revision: 0,
      state: { playerId: 'p', locationId: 'gate', elapsedMinutes: 0, facts: {} } };
    const intent: ActionIntent = { saveId: 's', actorId: 'p', expectedRevision: 0,
      idempotencyKey: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5',
      kind: 'move', payload: { destinationId: 'town' } };
    expect(evaluate(intent, save)).toMatchObject({ status: 'rejected',
      code: 'ENV_RULES_NOT_READY', revision: 0 });
  });

  it('rejects an actor that does not own the player state before rule dispatch', () => {
    const save: SaveEnvelope = { schemaVersion: 1, saveId: 's', canonVersion: 'draft-0',
      ruleVersion: 'rules-0', memoryPolicyVersion: 'none-0', revision: 0,
      state: { playerId: 'p', locationId: 'gate', elapsedMinutes: 0, facts: {} } };
    const intent: ActionIntent = { saveId: 's', actorId: 'npc_cenjiu', expectedRevision: 0,
      idempotencyKey: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5', kind: 'move',
      payload: { destinationId: 'town' } };

    expect(evaluate(intent, save)).toMatchObject({
      status: 'rejected', code: 'AUTH_ACTOR_MISMATCH', revision: 0,
    });
  });

  it('dispatches only to the ruleset version pinned by the save', () => {
    const save: SaveEnvelope = { schemaVersion: 1, saveId: 's', canonVersion: 'draft-0',
      ruleVersion: 'rules-0', memoryPolicyVersion: 'none-0', revision: 0,
      state: { playerId: 'p', locationId: 'gate', elapsedMinutes: 0, facts: {} } };
    const intent: ActionIntent = { saveId: 's', actorId: 'p', expectedRevision: 0,
      idempotencyKey: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5',
      kind: 'move', payload: { destinationId: 'town' } };
    const eventId = '5945cd14-9568-4382-9736-280512bd5a43';
    const context: RuleContext = {
      occurredAt: '2026-10-03T10:00:00.000Z',
      eventIds: [eventId],
      module: {
        ruleVersion: 'rules-0',
        canonVersion: 'draft-0',
        decide: (_intent, currentSave, invocation) => ({ status: 'accepted', outcome: 'success', nextRevision: 1,
          events: [{ id: invocation.eventIds[0]!, saveId: currentSave.saveId, branchId: 'root', type: 'move.arrived',
            beforeRevision: 0, afterRevision: 1, occurredAt: invocation.occurredAt, source: 'RULES',
            ruleVersion: 'rules-0', payload: { from: 'gate', to: 'town', minutes: 15 } }] }),
      },
    };

    expect(evaluate(intent, save, context)).toMatchObject({ status: 'accepted', outcome: 'success', nextRevision: 1 });
    expect(evaluate(intent, save, { ...context, module: { ...context.module!, ruleVersion: 'other' } }))
      .toMatchObject({ status: 'rejected', code: 'ENV_RULES_NOT_READY', revision: 0 });
    expect(evaluate(intent, save, { ...context, module: { ...context.module!, canonVersion: 'other' } }))
      .toMatchObject({ status: 'rejected', code: 'ENV_RULES_NOT_READY', revision: 0 });
  });

  it('rejects rule output whose event identity was not allocated by the transaction boundary', () => {
    const save: SaveEnvelope = { schemaVersion: 1, saveId: 's', canonVersion: 'draft-0',
      ruleVersion: 'rules-0', memoryPolicyVersion: 'none-0', revision: 0,
      state: { playerId: 'p', locationId: 'gate', elapsedMinutes: 0, facts: {} } };
    const intent: ActionIntent = { saveId: 's', actorId: 'p', expectedRevision: 0,
      idempotencyKey: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5',
      kind: 'move', payload: { destinationId: 'town' } };
    const context: RuleContext = {
      occurredAt: '2026-10-03T10:00:00.000Z',
      eventIds: ['5945cd14-9568-4382-9736-280512bd5a43'],
      module: {
        ruleVersion: 'rules-0',
        canonVersion: 'draft-0',
        decide: (_intent, currentSave) => ({ status: 'accepted', outcome: 'success', nextRevision: 1,
          events: [{ id: '1445cd14-9568-4382-9736-280512bd5a43', saveId: currentSave.saveId, branchId: 'root', type: 'move.arrived',
            beforeRevision: 0, afterRevision: 1, occurredAt: '2026-10-03T10:00:00.000Z', source: 'RULES',
            ruleVersion: 'rules-0', payload: { from: 'gate', to: 'town', minutes: 15 } }] }),
      },
    };

    expect(evaluate(intent, save, context)).toMatchObject({ status: 'rejected', code: 'ENV_PAYLOAD_INVALID', revision: 0 });
  });
});
