import { describe, expect, it } from 'vitest';
import { ActionIntentSchema, DomainEventSchema, LegacySaveFileSchema, SaveEnvelopeSchema } from './index.js';

describe('shared wire contracts', () => {
  it('rejects a stale or malformed action before settlement', () => {
    const base = { saveId: 'save-1', actorId: 'player', kind: 'move',
      payload: { destinationId: 'gate' }, expectedRevision: 0,
      idempotencyKey: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5' };
    expect(ActionIntentSchema.safeParse(base).success).toBe(true);
    expect(ActionIntentSchema.safeParse({ ...base, expectedRevision: -1 }).success).toBe(false);
    expect(ActionIntentSchema.safeParse({ ...base, payload: { arbitrary: 'teleport' } }).success).toBe(false);
  });

  it('requires a versioned save and an event with monotone revision fields', () => {
    const save = { schemaVersion: 1, saveId: 'save-1', canonVersion: 'draft-0',
      ruleVersion: 'rules-0', memoryPolicyVersion: 'none-0', revision: 0,
      state: { playerId: 'player', locationId: 'gate', elapsedMinutes: 0, facts: {} } };
    expect(SaveEnvelopeSchema.safeParse(save).success).toBe(true);
    expect(SaveEnvelopeSchema.safeParse({ ...save, schemaVersion: 2 }).success).toBe(false);
    expect(DomainEventSchema.safeParse({ id: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5', saveId: 'save-1',
      type: 'PLAYER_MOVED', beforeRevision: 0, afterRevision: 1,
      occurredAt: '2026-09-23T00:00:00.000Z', source: 'RULES', ruleVersion: 'rules-0', payload: {} }).success).toBe(true);
    expect(DomainEventSchema.safeParse({ id: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5', saveId: 'save-1',
      type: 'PLAYER_MOVED', beforeRevision: 1, afterRevision: 1,
      occurredAt: '2026-09-23T00:00:00.000Z', source: 'RULES', ruleVersion: 'rules-0', payload: {} }).success).toBe(false);
  });

  it('accepts the two recorded legacy JSON shapes and rejects empty objects', () => {
    expect(LegacySaveFileSchema.safeParse({
      messages: [{ role: 'user', content: '走向山门' }], status: '姓名：测试修士',
    }).success).toBe(true);
    expect(LegacySaveFileSchema.safeParse({
      format: 'JIUXIAO_SAVE', version: 1, save: { id: 'legacy-1', player: { 姓名: '测试修士' }, turn: 0 },
    }).success).toBe(true);
    expect(LegacySaveFileSchema.safeParse({}).success).toBe(false);
    expect(LegacySaveFileSchema.safeParse({ arbitrary: 'not a save' }).success).toBe(false);
    expect(LegacySaveFileSchema.safeParse([]).success).toBe(false);
  });
});
