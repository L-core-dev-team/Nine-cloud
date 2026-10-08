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
    grantId, saveId, branchId: 'root' as const, npcId, eventId, eventRevision: 1, observedAtMinute: 18,
    channel: 'witnessed' as const, memoryClass, authorizationPolicyVersion: 'visibility-v1',
    authorizedFields: ['summary'], authorizedFacts: { summary: '林月曾在中州渡口救下旅人。' },
    summary: '林月曾在中州渡口救下旅人。', supersessions: [],
  };
}

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
