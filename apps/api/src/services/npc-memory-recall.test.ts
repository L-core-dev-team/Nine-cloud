import { describe, expect, it, vi } from 'vitest';
import type { SaveEnvelope, TurnReceipt } from '@jiuxiao/contracts';
import { NPC_MEMORY_RECALL_POLICY, resolveNpcMemoryRecall } from './npc-memory-recall.js';

const saveId = 'recall-test-save';
const npcId = 'npc-lin-yue';
const eventId = '11111111-1111-4111-8111-111111111111';
const grantId = [saveId, 'root', eventId, npcId].map(part => `${part.length}:${part}`).join('');
const save: SaveEnvelope = {
  schemaVersion: 2, saveId, canonVersion: 'canon-test', ruleVersion: 'rules-test',
  memoryPolicyVersion: NPC_MEMORY_RECALL_POLICY.retrievalVersion,
  memoryMode: 'continue',
  memoryPolicy: {
    mode: 'continue', policyVersion: NPC_MEMORY_RECALL_POLICY.retrievalVersion, schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1',
    policyArtifactHash: NPC_MEMORY_RECALL_POLICY.policyArtifactHash,
    cueDictionaryHash: NPC_MEMORY_RECALL_POLICY.cueDictionaryHash,
    normalizerVersion: NPC_MEMORY_RECALL_POLICY.normalizerVersion,
    retrievalVersion: NPC_MEMORY_RECALL_POLICY.retrievalVersion,
    visibilityPolicyVersion: 'visibility-v1', visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
    createdAtRevision: 0,
  },
  revision: 2,
  state: { playerId: 'player', locationId: 'origin', elapsedMinutes: 30, facts: { gameMinute: 30 } },
};
const receipt = {
  idempotencyKey: '22222222-2222-4222-8222-222222222222', saveId,
  requestFingerprint: `sha256:v1:${'a'.repeat(64)}`, branchId: 'root', rulesVersion: 'rules-test',
  clockMinute: 30, rng: { seed: null, draws: 0 }, resultingRevision: 2,
  decision: { status: 'accepted', outcome: 'success', nextRevision: 2, events: [{
    id: '33333333-3333-4333-8333-333333333333', saveId, branchId: 'root', type: 'talk.completed',
    beforeRevision: 1, afterRevision: 2, occurredAt: '2026-10-01T00:00:00.000Z', source: 'RULES', ruleVersion: 'rules-test', payload: {},
  }] },
} as TurnReceipt;

function observation(memoryClass: 'historical-event' | 'current-state' | 'unclassified' = 'historical-event') {
  return {
    grantId, grantIdVersion: 1 as const, saveId, branchId: 'root' as const, npcId, eventId, eventRevision: 1, observedAtMinute: 18,
    channel: 'witnessed' as const, memoryClass, authorizationPolicyVersion: 'visibility-v1',
    authorizedFields: ['summary'], authorizedFacts: { summary: '林月曾在中州渡口救下旅人。' },
    summary: '林月曾在中州渡口救下旅人。', supersessions: [],
  };
}

const saveV3: SaveEnvelope = {
  ...save, schemaVersion: 3, canonArtifactHash: `sha256:${'b'.repeat(64)}`,
  branchId: 'root', parentBranchId: null, forkRevision: 0,
  createdPolicyVersion: NPC_MEMORY_RECALL_POLICY.retrievalVersion, sourceMigrationId: null,
};

describe('P4 authorized memory retrieval consumer', () => {
  it('reads through the committed pre-turn revision and only passes authorized historical evidence', async () => {
    const reader = vi.fn(async (_owner: string, _saveId: string, _npc: string, _cursor?: unknown, _limit?: number, _throughRevision?: number) => ({
      items: [observation()], nextCursor: null,
    }));
    const result = await resolveNpcMemoryRecall({ reader, ownerId: 'owner', save, receipt, npcId, utterance: '你还记得中州渡口吗？' });
    expect(result?.kind).toBe('evidence');
    if (result?.kind === 'evidence') expect(result.recall).toMatchObject({ status: 'complete', slot: 'historical-event', authorizedFacts: { summary: '林月曾在中州渡口救下旅人。' } });
    expect(reader).toHaveBeenCalledWith('owner', saveId, npcId, undefined, 100, 1);
  });

  it('accepts the same pinned policy on v3 lineage envelopes without loosening any other check', async () => {
    const reader = vi.fn(async () => ({ items: [observation()], nextCursor: null }));
    const result = await resolveNpcMemoryRecall({ reader, ownerId: 'owner', save: saveV3, receipt, npcId, utterance: '你还记得中州渡口吗？' });
    expect(result?.kind).toBe('evidence');
    expect(reader).toHaveBeenCalledWith('owner', saveId, npcId, undefined, 100, 1);
  });

  it('answers v2 forgetting saves through the decay gate and keeps v1 forgetting fail-closed', async () => {
    // The observation sits at minute 18 with the clock at 30: still accessible (2^-12/10080).
    const v2Reader = vi.fn(async () => ({ items: [observation()], nextCursor: null }));
    const v2Forgetting = await resolveNpcMemoryRecall({ reader: v2Reader, ownerId: 'owner',
      save: { ...save, memoryMode: 'forgetting', memoryPolicy: { ...save.memoryPolicy, mode: 'forgetting' } },
      receipt, npcId, utterance: '你还记得中州渡口吗？' });
    expect(v2Forgetting).toMatchObject({ kind: 'evidence', recall: { status: 'complete', slot: 'historical-event' } });
    expect(v2Reader).toHaveBeenCalledTimes(1);

    // A decayed observation (clock far ahead) answers with the deterministic template, never evidence.
    const decayed = await resolveNpcMemoryRecall({ reader: v2Reader, ownerId: 'owner',
      save: { ...save, memoryMode: 'forgetting', memoryPolicy: { ...save.memoryPolicy, mode: 'forgetting' } },
      receipt: { ...receipt, clockMinute: 20_000 }, npcId, utterance: '你还记得中州渡口吗？' });
    expect(decayed).toMatchObject({ kind: 'deterministic', reason: 'forgotten', text: '我不太记得了。' });

    // The v1 identity (option a, 2026-10-09) can never pass the v2 pin: fail-closed.
    const v1Reader = vi.fn(async () => ({ items: [observation()], nextCursor: null }));
    const v1Forgetting = await resolveNpcMemoryRecall({ reader: v1Reader, ownerId: 'owner',
      save: { ...saveV3, memoryMode: 'forgetting',
        memoryPolicy: { ...saveV3.memoryPolicy, mode: 'forgetting',
          retrievalVersion: 'authorized-cue-recall-v1', policyArtifactHash: 'sha256:a7e096c182da6e5e77f2f5d8ae6fafe84786e8c481ea2b033125aecb8529a70c' } },
      receipt, npcId, utterance: '你还记得中州渡口吗？' });
    expect(v1Forgetting).toMatchObject({ kind: 'deterministic', reason: 'policy-unavailable' });
    expect(v1Reader).not.toHaveBeenCalled();
  });

  it('does not report a historical current-state observation as a fact about now', async () => {
    const result = await resolveNpcMemoryRecall({ reader: async () => ({ items: [observation('current-state')], nextCursor: null }),
      ownerId: 'owner', save, receipt, npcId, utterance: '目前中州渡口如何？' });
    expect(result).toMatchObject({ kind: 'deterministic', reason: 'time-qualified-state' });
    if (result?.kind === 'deterministic') expect(result.text).toContain('不能据此断言眼下未变');
  });

  it('keeps legacy v1 and unclassified observations fail-closed', async () => {
    const legacySave: SaveEnvelope = { schemaVersion: 1, saveId, canonVersion: 'canon-test', ruleVersion: 'rules-test',
      memoryPolicyVersion: 'legacy', revision: 2, state: save.state };
    const legacy = await resolveNpcMemoryRecall({ reader: async () => ({ items: [], nextCursor: null }),
      ownerId: 'owner', save: legacySave, receipt, npcId, utterance: '你还记得中州吗？' });
    expect(legacy).toMatchObject({ kind: 'deterministic', reason: 'policy-unavailable' });
    const unclassified = await resolveNpcMemoryRecall({ reader: async () => ({ items: [observation('unclassified')], nextCursor: null }),
      ownerId: 'owner', save, receipt, npcId, utterance: '你还记得中州吗？' });
    expect(unclassified).toMatchObject({ kind: 'deterministic', reason: 'unclassified' });
  });

  it('stops on non-advancing cursors and does not return partial recall from incomplete scans', async () => {
    const reader = vi.fn(async () => ({ items: [observation()], nextCursor: { eventRevision: 1, grantId } }));
    const result = await resolveNpcMemoryRecall({ reader, ownerId: 'owner', save, receipt, npcId, utterance: '你还记得中州渡口吗？' });
    expect(result).toMatchObject({ kind: 'deterministic', reason: 'incomplete' });
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it('does not invoke storage for ordinary dialogue', async () => {
    const reader = vi.fn();
    expect(await resolveNpcMemoryRecall({ reader, ownerId: 'owner', save, receipt, npcId, utterance: '今夜风很大。' })).toBeNull();
    expect(reader).not.toHaveBeenCalled();
  });
});
