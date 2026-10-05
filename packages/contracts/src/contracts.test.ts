import { describe, expect, it } from 'vitest';
import {
  ActionIntentSchema,
  DecisionSchema,
  DecisionV2Schema,
  DomainEventSchema,
  LegacySaveFileSchema,
  SAVE_SCHEMA_VERSION,
  SaveEnvelopeSchema,
  TurnReceiptSchema,
  TurnReceiptV2Schema,
} from './index.js';

const idempotencyKey = '2fa2ebad-1065-4ef4-9a9b-51407a998ad5';
const eventId = '11111111-1111-4111-8111-111111111111';

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: eventId,
    saveId: 'save-1',
    type: 'PLAYER_MOVED',
    beforeRevision: 0,
    afterRevision: 1,
    occurredAt: '2026-09-23T00:00:00.000Z',
    source: 'RULES',
    ruleVersion: 'rules-1',
    payload: {},
    ...overrides,
  };
}

const v1Save = {
  schemaVersion: 1,
  saveId: 'save-1',
  canonVersion: 'draft-0',
  ruleVersion: 'rules-0',
  memoryPolicyVersion: 'legacy-unknown',
  revision: 0,
  state: { playerId: 'player', locationId: 'gate', elapsedMinutes: 0, facts: {} },
};

const v2MemoryPolicy = {
  mode: 'continue',
  policyVersion: 'continue-v1',
  schemaVersion: 1,
  clockBasis: 'game-minute+npc-grant-sequence-v1',
  policyArtifactHash: `sha256:${'a'.repeat(64)}`,
  cueDictionaryHash: `sha256:${'b'.repeat(64)}`,
  normalizerVersion: 'unicode-nfc-v1',
  retrievalVersion: 'exact-recall-v1',
  visibilityPolicyVersion: 'npc-visibility-v1',
  visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
  createdAtRevision: 0,
};

describe('shared wire contracts', () => {
  it('normalizes root branch identity and accepts the observe action', () => {
    const base = {
      saveId: 'save-1', actorId: 'player', kind: 'move',
      payload: { destinationId: 'gate' }, expectedRevision: 0, idempotencyKey,
    };
    expect(ActionIntentSchema.parse(base).branchId).toBe('root');
    expect(ActionIntentSchema.safeParse({ ...base, expectedRevision: -1 }).success).toBe(false);
    expect(ActionIntentSchema.safeParse({ ...base, payload: { arbitrary: 'teleport' } }).success).toBe(false);
    expect(ActionIntentSchema.parse({ ...base, kind: 'observe', payload: { targetId: 'clue-1', method: 'scan' } }))
      .toMatchObject({ kind: 'observe', branchId: 'root' });
    expect(ActionIntentSchema.safeParse({ ...base, kind: 'observe', payload: { targetId: 'clue-1', method: 'guess' } }).success).toBe(false);
  });

  it('leaves the cultivation business limit to rules for its named rejection', () => {
    const base = { saveId: 'save-1', actorId: 'player', expectedRevision: 0, idempotencyKey,
      kind: 'cultivate', payload: { techniqueId: 'technique-1', minutes: 8 } };
    expect(ActionIntentSchema.safeParse(base).success).toBe(true);
    expect(ActionIntentSchema.safeParse({ ...base, payload: { ...base.payload, minutes: 9 } }).success).toBe(true);
    expect(ActionIntentSchema.safeParse({ ...base, payload: { ...base.payload, minutes: 0 } }).success).toBe(false);
    expect(ActionIntentSchema.safeParse({ ...base, payload: { ...base.payload, minutes: 1.5 } }).success).toBe(false);
  });

  it('keeps v1 saves readable and requires a consistent pinned policy for v2', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(2);
    expect(SaveEnvelopeSchema.parse(v1Save)).toMatchObject({ schemaVersion: 1, memoryPolicyVersion: 'legacy-unknown' });
    const v2Save = {
      ...v1Save,
      schemaVersion: 2,
      memoryPolicyVersion: 'continue-v1',
      memoryMode: 'continue',
      memoryPolicy: v2MemoryPolicy,
    };
    expect(SaveEnvelopeSchema.parse(v2Save)).toMatchObject({ schemaVersion: 2, memoryMode: 'continue' });
    expect(SaveEnvelopeSchema.safeParse({ ...v2Save, memoryMode: 'forgetting' }).success).toBe(false);
    expect(SaveEnvelopeSchema.safeParse({ ...v2Save, memoryPolicyVersion: 'old-version' }).success).toBe(false);
    expect(SaveEnvelopeSchema.safeParse({ ...v1Save, schemaVersion: 3 }).success).toBe(false);
  });

  it('defaults legacy events to root and validates monotone revisions and bounded payloads', () => {
    expect(DomainEventSchema.parse(event()).branchId).toBe('root');
    expect(DomainEventSchema.safeParse(event({ beforeRevision: 1, afterRevision: 1 })).success).toBe(false);
    let deep: unknown = 'leaf';
    for (let index = 0; index < 33; index += 1) deep = { child: deep };
    expect(DomainEventSchema.safeParse(event({ payload: { deep } })).success).toBe(false);
  });

  it('keeps legal failures committed while hard rejections remain event-free', () => {
    const legalFailure = {
      status: 'accepted',
      outcome: 'legal_failure',
      code: 'RULE_ROAD_BLOCKED',
      events: [event()],
      nextRevision: 1,
    };
    expect(DecisionSchema.safeParse(legalFailure).success).toBe(true);
    expect(DecisionSchema.safeParse({ ...legalFailure, code: 'INPUT_UNKNOWN_ACTION' }).success).toBe(false);
    expect(DecisionSchema.safeParse({
      status: 'rejected', code: 'INPUT_UNKNOWN_ACTION', message: '需要澄清。', revision: 0,
    }).success).toBe(true);
    expect(DecisionSchema.safeParse({
      status: 'rejected', code: 'RULE_ROAD_BLOCKED', message: '道路中断。', revision: 0,
    }).success).toBe(true); // Historical v1 receipt only.
    expect(DecisionV2Schema.safeParse({
      status: 'rejected', code: 'RULE_TARGET_MISMATCH', message: '目标不匹配。', revision: 0,
    }).success).toBe(true);
    expect(DecisionV2Schema.safeParse({
      status: 'rejected', code: 'RULE_ROAD_BLOCKED', message: '道路中断。', revision: 0,
    }).success).toBe(false);
  });

  it('validates bounded clarification candidates in their canonical action order', () => {
    const clarify = {
      status: 'clarify',
      question: '你想去哪里？',
      missingSlots: ['destinationId'],
      candidates: [
        { kind: 'move', label: '去渡口', slots: { destinationId: 'loc_luhuadu' } },
        { kind: 'observe', label: '观察渡口', slots: { targetId: 'loc_luhuadu', method: 'scan' } },
      ],
      interactionId: 'interaction-1',
      revision: 0,
    };
    expect(DecisionSchema.safeParse(clarify).success).toBe(true);
    expect(DecisionSchema.safeParse({ ...clarify, clarificationOf: 'prior-interaction' }).success).toBe(true);
    expect(DecisionSchema.safeParse({ ...clarify, clarificationOf: clarify.interactionId }).success).toBe(false);
    expect(DecisionSchema.safeParse({ ...clarify, candidates: [...clarify.candidates].reverse() }).success).toBe(false);
    expect(DecisionSchema.safeParse({ ...clarify, candidates: Array.from({ length: 5 }, () => clarify.candidates[0]) }).success).toBe(false);
    expect(DecisionSchema.safeParse({ status: 'clarify', question: '旧问题', revision: 0 }).success).toBe(true); // Historical v1 receipt only.
  });

  it('accepts an optional clarification link without changing legacy action parsing', () => {
    const action = {
      kind: 'move' as const,
      saveId: 'save-1',
      actorId: 'player-1',
      branchId: 'root' as const,
      expectedRevision: 0,
      idempotencyKey,
      payload: { destinationId: 'loc-a' },
    };
    expect(ActionIntentSchema.parse(action).clarificationOf).toBeUndefined();
    expect(ActionIntentSchema.parse({ ...action, clarificationOf: 'clarify-previous-1' }).clarificationOf)
      .toBe('clarify-previous-1');
    expect(ActionIntentSchema.safeParse({ ...action, clarificationOf: 'x'.repeat(129) }).success).toBe(false);
  });

  it('validates current turn receipts and still reads legacy receipts', () => {
    const currentReceipt = {
      idempotencyKey,
      saveId: 'save-1',
      requestFingerprint: `sha256:v1:${'a'.repeat(64)}`,
      branchId: 'root',
      rulesVersion: 'rules-1',
      clockMinute: 315,
      rng: { seed: null, draws: 0 },
      decision: { status: 'accepted', outcome: 'success', events: [event()], nextRevision: 1 },
      resultingRevision: 1,
    };
    expect(TurnReceiptV2Schema.safeParse(currentReceipt).success).toBe(true);
    expect(TurnReceiptV2Schema.safeParse({ ...currentReceipt, clarificationOf: 'previous-interaction' }).success).toBe(true);
    expect(TurnReceiptV2Schema.safeParse({ ...currentReceipt, clarificationOf: idempotencyKey }).success).toBe(false);
    expect(TurnReceiptV2Schema.safeParse({ ...currentReceipt, rng: { seed: null, draws: 1 } }).success).toBe(false);
    expect(TurnReceiptV2Schema.safeParse({ ...currentReceipt, branchId: 'branch-2' }).success).toBe(false);

    const legacyReceipt = {
      idempotencyKey,
      saveId: 'save-1',
      requestFingerprint: `sha256:v1:${'a'.repeat(64)}`,
      decision: { status: 'accepted', events: [event()], nextRevision: 1 },
      resultingRevision: 1,
    };
    expect(TurnReceiptSchema.parse(legacyReceipt)).toEqual(legacyReceipt);
    expect(TurnReceiptSchema.safeParse({ ...currentReceipt, rawInput: 'private text' }).success).toBe(false);
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
