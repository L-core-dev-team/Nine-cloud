import { describe, expect, it, vi } from 'vitest';
import type { SaveEnvelopeV2, TurnReceipt } from '@jiuxiao/contracts';
import type { AuthorizedObservationOutboxRecord } from '@jiuxiao/domain';
import { createP1SaveMemoryPolicy } from './p1-memory-policy.js';
import { buildNarrativeMemoryContext } from './narrative-memory-context.js';

const save = (mode: 'continue' | 'forgetting'): SaveEnvelopeV2 => ({
  schemaVersion: 2,
  saveId: 'p1-memory-context',
  revision: 51,
  ruleVersion: 'prologue-v1-candidate-20261005',
  canonVersion: 'prologue-canon-candidate-20261005',
  memoryPolicyVersion: 'p1-memory-policy-v1',
  memoryMode: mode,
  memoryPolicy: createP1SaveMemoryPolicy(mode),
  state: { playerId: 'player', locationId: 'loc_luhuadu', elapsedMinutes: 0, facts: { gameMinute: 1500 } },
});

function receipt(topicTag = 'obstacle_rockslide'): TurnReceipt {
  const id = '00000000-0000-4000-8000-000000000051';
  const event = {
    id,
    saveId: 'p1-memory-context',
    type: 'talk.occurred',
    branchId: 'root',
    beforeRevision: 50,
    afterRevision: 51,
    occurredAt: '2026-10-05T00:00:00.000Z',
    source: 'RULES' as const,
    ruleVersion: 'prologue-v1-candidate-20261005',
    payload: { npcId: 'npc_cenjiu', topicTag, outcome: topicTag === 'obstacle_rockslide' ? 'refuse' : 'idle' },
  };
  return {
    saveId: 'p1-memory-context',
    idempotencyKey: '00000000-0000-4000-8000-000000000052',
    requestFingerprint: `sha256:v1:${'a'.repeat(64)}`,
    branchId: 'root',
    rulesVersion: 'prologue-v1-candidate-20261005',
    clockMinute: 1500,
    rng: { seed: null, draws: 0 },
    resultingRevision: 51,
    decision: { status: 'accepted', outcome: 'success', events: [event], nextRevision: 51 },
  };
}

function observation(index: number, topicTag: string, npcId = 'npc_cenjiu'): AuthorizedObservationOutboxRecord {
  const eventId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const summary = `topicTag=${topicTag};outcome=${topicTag === 'obstacle_rockslide' ? 'refuse' : 'idle'}`;
  return {
    grantId: `grant-${String(index).padStart(3, '0')}`,
    grantIdVersion: 1,
    saveId: 'p1-memory-context',
    branchId: 'root',
    npcId,
    eventId,
    eventRevision: index,
    observedAtMinute: 300 + (index - 1) * 24,
    channel: 'witnessed',
    authorizationPolicyVersion: 'p1-direct-npc-participant-v1',
    authorizedFields: ['summary', 'topicTag', 'outcome'],
    authorizedFacts: { summary, topicTag, outcome: topicTag === 'obstacle_rockslide' ? 'refuse' : 'idle' },
    summary,
  };
}

describe('authorized NPC recall context', () => {
  const rows = [
    observation(1, 'obstacle_rockslide'),
    ...Array.from({ length: 49 }, (_, index) => observation(index + 2, 'other_topic')),
    observation(51, 'obstacle_rockslide'),
    observation(52, 'obstacle_rockslide'),
    observation(1, 'obstacle_rockslide', 'npc_other'),
  ];
  const reader = vi.fn(async (_owner: string, _saveId: string, _npcId: string) => ({ items: rows, nextCursor: null }));

  it('rebuilds recall from authorized outbox, applies a cue floor, and excludes later events', async () => {
    const result = await buildNarrativeMemoryContext({ ownerId: 'owner', receipt: receipt(), save: save('forgetting'), readAuthorizedPage: reader });
    const memories = result.npcMemories.find(memory => memory.npcId === 'npc_cenjiu')?.observations ?? [];
    expect(memories).toContainEqual({ summary: 'topicTag=obstacle_rockslide;outcome=refuse', accessibility: 0.35 });
    expect(memories.some(memory => memory.summary.includes('other_topic'))).toBe(false);
    expect(reader).toHaveBeenCalledOnce();
    expect(await buildNarrativeMemoryContext({ ownerId: 'owner', receipt: receipt(), save: save('forgetting'), readAuthorizedPage: reader })).toEqual(result);
  });

  it('keeps Continue recall exact and does not use unrelated NPC memories', async () => {
    const result = await buildNarrativeMemoryContext({ ownerId: 'owner', receipt: receipt(), save: save('continue'), readAuthorizedPage: reader });
    expect(result.npcMemories[0]?.observations).toContainEqual({ summary: 'topicTag=obstacle_rockslide;outcome=refuse', accessibility: 1 });
  });

  it('does not let a cue floor revive a memory when the cue does not match', async () => {
    const result = await buildNarrativeMemoryContext({ ownerId: 'owner', receipt: receipt('unmatched'), save: save('forgetting'), readAuthorizedPage: reader });
    const memories = result.npcMemories.find(memory => memory.npcId === 'npc_cenjiu')?.observations ?? [];
    expect(memories.some(memory => memory.summary === 'topicTag=obstacle_rockslide;outcome=refuse' && memory.accessibility < 0.35)).toBe(false);
  });

  it('fails closed when the save policy is altered or the authorized reader is unavailable', async () => {
    const invalid = { ...save('forgetting'), memoryPolicy: { ...save('forgetting').memoryPolicy, cueAccessibilityFloor: 0.99 } } as unknown as SaveEnvelopeV2;
    await expect(buildNarrativeMemoryContext({ ownerId: 'owner', receipt: receipt(), save: invalid, readAuthorizedPage: reader }))
      .rejects.toThrow('P1_MEMORY_POLICY_MISMATCH');
    await expect(buildNarrativeMemoryContext({ ownerId: 'owner', receipt: receipt(), save: save('forgetting') }))
      .rejects.toThrow('AUTHORIZED_OBSERVATION_READER_UNAVAILABLE');
  });
});
