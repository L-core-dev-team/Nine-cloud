import { Hono } from 'hono';
import { it, expect, vi } from 'vitest';
import type { SaveEnvelope } from '@jiuxiao/contracts';
import { mountGames } from './games.js';
import type { AuthoritativeGameService } from '../services/authoritative-game.js';
import { NPC_MEMORY_RECALL_POLICY } from '../services/npc-memory-recall.js';

const saveId = 'recall-route-save';
const npcId = 'npc-lin-yue';
const eventId = '11111111-1111-4111-8111-111111111111';
const grantId = [saveId, 'root', eventId, npcId].map(part => `${part.length}:${part}`).join('');
const memoryPolicy = {
  mode: 'continue' as const, policyVersion: NPC_MEMORY_RECALL_POLICY.retrievalVersion, schemaVersion: 1,
  clockBasis: 'game-minute+npc-grant-sequence-v1' as const,
  policyArtifactHash: NPC_MEMORY_RECALL_POLICY.policyArtifactHash,
  cueDictionaryHash: NPC_MEMORY_RECALL_POLICY.cueDictionaryHash,
  normalizerVersion: NPC_MEMORY_RECALL_POLICY.normalizerVersion,
  retrievalVersion: NPC_MEMORY_RECALL_POLICY.retrievalVersion,
  visibilityPolicyVersion: 'visibility-v1', visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
  createdAtRevision: 0,
};
function saveEnvelope(memoryMode: 'continue' | 'forgetting'): SaveEnvelope {
  return {
    schemaVersion: 3, saveId, canonVersion: 'canon-test', ruleVersion: 'rules-test',
    canonArtifactHash: `sha256:${'b'.repeat(64)}`, memoryPolicyVersion: memoryPolicy.policyVersion,
    memoryMode, memoryPolicy: { ...memoryPolicy, mode: memoryMode },
    branchId: 'root', parentBranchId: null, forkRevision: 0,
    createdPolicyVersion: memoryPolicy.policyVersion, sourceMigrationId: null,
    revision: 2, state: { playerId: 'server-player', locationId: 'origin', elapsedMinutes: 30, facts: { gameMinute: 30 } },
  };
}
function observation() {
  return {
    grantId, grantIdVersion: 1 as const, saveId, branchId: 'root' as const, npcId, eventId, eventRevision: 1, observedAtMinute: 18,
    channel: 'witnessed' as const, memoryClass: 'historical-event' as const, authorizationPolicyVersion: 'visibility-v1',
    authorizedFields: ['summary'], authorizedFacts: { summary: '林月曾在中州渡口救下旅人。' },
    summary: '林月曾在中州渡口救下旅人。', supersessions: [],
  };
}
function appFor(save: SaveEnvelope | null, reader = vi.fn(async () => ({ items: [observation()], nextCursor: null })), owner = 'owner') {
  const service = {
    read: vi.fn(async (ownerId: string, id: string) => ownerId === owner && id === saveId && save
      ? { status: 'ready' as const, save }
      : { status: 'not_found' as const }),
  } as unknown as AuthoritativeGameService;
  const app = new Hono();
  mountGames(app, service, { resolveOwnerId: async () => owner }, undefined, { reader });
  return { app, reader, service };
}
const get = (app: Hono, query = `?utterance=${encodeURIComponent('你还记得中州渡口吗？')}`, extra: Record<string, string> = {}) =>
  app.request(`/api/games/${saveId}/npcs/${npcId}/memory-recall${query}`, { headers: extra });

it('rejects cross-account recall requests before touching storage', async () => {
  const { app, reader } = appFor(saveEnvelope('continue'));
  const response = await get(app, '?utterance=%E4%BD%A0%E5%A5%BD', { 'x-jiuxiao-account': 'someone-else' });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: 'UNAUTHENTICATED' });
  expect(reader).not.toHaveBeenCalled();
});

it('answers v2 forgetting saves through the decay gate at the route boundary', async () => {
  const { app, reader } = appFor(saveEnvelope('forgetting'));
  const response = await get(app);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.recall).toMatchObject({
    kind: 'evidence',
    recall: { status: 'complete', slot: 'historical-event', authorizedFacts: { summary: '林月曾在中州渡口救下旅人。' } },
  });
  expect(reader).toHaveBeenCalledWith('owner', saveId, npcId, undefined, 100, 1);
});

it('keeps refusing v1-artifact forgetting saves with the migration 503', async () => {
  const v1Policy = {
    ...memoryPolicy,
    retrievalVersion: 'authorized-cue-recall-v1',
    policyArtifactHash: 'sha256:a7e096c182da6e5e77f2f5d8ae6fafe84786e8c481ea2b033125aecb8529a70c',
  };
  const v1Save = { ...saveEnvelope('forgetting'), memoryPolicy: v1Policy, memoryPolicyVersion: v1Policy.policyVersion };
  const { app, reader } = appFor(v1Save);
  const response = await get(app);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: 'RECALL_MODE_UNAVAILABLE' });
  expect(reader).not.toHaveBeenCalled();
});

it('answers ordinary dialogue with a null recall and never reads observations', async () => {
  const { app, reader } = appFor(saveEnvelope('continue'));
  for (const query of ['', `?utterance=${encodeURIComponent('   ')}`, `?utterance=${encodeURIComponent('今夜风很大。')}`]) {
    const response = await get(app, query);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recall: null });
  }
  expect(reader).not.toHaveBeenCalled();
});

it('returns the authorized recall resolution bounded by the current revision', async () => {
  const { app, reader } = appFor(saveEnvelope('continue'));
  const response = await get(app);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.recall).toMatchObject({
    kind: 'evidence',
    recall: { status: 'complete', slot: 'historical-event', authorizedFacts: { summary: '林月曾在中州渡口救下旅人。' } },
  });
  expect(reader).toHaveBeenCalledWith('owner', saveId, npcId, undefined, 100, 1);
});

it('reports missing saves and throttles excessive recall traffic', async () => {
  const { app, reader } = appFor(null, undefined, 'quota-owner');
  expect((await get(app)).status).toBe(404);
  for (let i = 0; i < 59; i += 1) expect((await get(app)).status).toBe(404);
  const throttled = await get(app);
  expect(throttled.status).toBe(429);
  expect(await throttled.json()).toEqual({ code: 'RATE_LIMITED' });
  expect(reader).not.toHaveBeenCalled();
});
