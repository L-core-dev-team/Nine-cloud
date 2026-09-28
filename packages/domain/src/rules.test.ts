import { describe, expect, it } from 'vitest';
import { evaluate } from './rules.js';
import type { ActionIntent, SaveEnvelope } from '@jiuxiao/contracts';

describe('unapproved rule boundary', () => {
  it('cannot produce a world event before rule signoff', () => {
    const save: SaveEnvelope = { schemaVersion: 1, saveId: 's', canonVersion: 'draft-0',
      ruleVersion: 'rules-0', memoryPolicyVersion: 'none-0', revision: 0,
      state: { playerId: 'p', locationId: 'gate', elapsedMinutes: 0, facts: {} } };
    const intent: ActionIntent = { saveId: 's', actorId: 'p', expectedRevision: 0,
      idempotencyKey: '2fa2ebad-1065-4ef4-9a9b-51407a998ad5',
      kind: 'move', payload: { destinationId: 'town' } };
    expect(evaluate(intent, save)).toMatchObject({ status: 'rejected',
      code: 'RULES_NOT_READY', revision: 0 });
  });
});
