import { describe, expect, it } from 'vitest';
import type { SaveEnvelope } from '@jiuxiao/contracts';
import { createApp } from '../app.js';
import { CloudSaveService, type CloudSaveRepository } from '../services/cloud-save-service.js';

function envelope(revision = 0): SaveEnvelope {
  return { schemaVersion: 1, saveId: 'route-save', canonVersion: 'canon-1', ruleVersion: 'rules-1',
    memoryPolicyVersion: 'memory-1', revision,
    state: { playerId: 'player-1', locationId: 'gate', elapsedMinutes: revision, facts: {} } };
}

function v2Envelope() {
  const memoryPolicy = {
    mode: 'continue', policyVersion: 'continue-v1', schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1',
    policyArtifactHash: `sha256:${'a'.repeat(64)}`, cueDictionaryHash: `sha256:${'b'.repeat(64)}`,
    normalizerVersion: 'unicode-nfc-v1', retrievalVersion: 'exact-recall-v1',
    visibilityPolicyVersion: 'npc-visibility-v1', visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
    createdAtRevision: 0,
  } as const;
  return { ...envelope(), schemaVersion: 2, memoryPolicyVersion: memoryPolicy.policyVersion,
    memoryMode: memoryPolicy.mode, memoryPolicy };
}

class MemoryRepository implements CloudSaveRepository {
  private records = new Map<string, { owner: string; save: SaveEnvelope }>();
  async listForOwner(owner: string) { return [...this.records.values()].filter(row => row.owner === owner).map(row => row.save); }
  async getForOwner(owner: string, id: string) { const row = this.records.get(id); return row?.owner === owner ? row.save : null; }
  async createForOwner(owner: string, save: SaveEnvelope) {
    if (this.records.has(save.saveId)) return false;
    this.records.set(save.saveId, { owner, save }); return true;
  }
  async replaceForOwner(input: { ownerId: string; saveId: string; expectedRevision: number; next: SaveEnvelope }) {
    const row = this.records.get(input.saveId);
    if (!row || row.owner !== input.ownerId) return { kind: 'not_found' as const };
    if (row.save.revision !== input.expectedRevision) return { kind: 'conflict' as const, currentRevision: row.save.revision };
    this.records.set(input.saveId, { owner: input.ownerId, save: input.next }); return { kind: 'updated' as const };
  }
}

describe('authenticated cloud save routes', () => {
  function setup(owner: string | null = 'owner-a') {
    const service = new CloudSaveService(new MemoryRepository());
    const app = createApp(undefined, { service, auth: { resolveOwnerId: async () => owner } });
    return { app, service };
  }

  it('keeps routes closed without a verified owner and ignores caller-supplied owner identifiers', async () => {
    const closed = createApp();
    expect((await closed.request('/api/saves')).status).toBe(404);
    const { app } = setup();
    const response = await app.request('/api/saves', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: 'attacker', save: envelope() }) });
    expect(response.status).toBe(201);
    expect((await app.request('/api/saves/route-save')).status).toBe(200);
    expect((await app.request('/api/saves/route-save', { headers: { 'x-owner-id': 'attacker' } })).status).toBe(200);
    const unauthenticated = setup(null);
    expect((await unauthenticated.app.request('/api/saves')).status).toBe(401);
    expect((await unauthenticated.app.request('/api/saves', { method: 'POST', body: JSON.stringify({ save: envelope() }) })).status).toBe(401);
  });

  it('bounds request size, validates the save contract, and returns revision conflicts without overwriting', async () => {
    const { app } = setup();
    expect((await app.request('/api/saves', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status).toBe(400);
    expect((await app.request('/api/saves', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ save: { ...envelope(), extra: 'field' } }) })).status).toBe(400);
    const tooLarge = await app.request('/api/saves', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1000001' }, body: '{}' });
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toMatchObject({ code: 'REQUEST_TOO_LARGE' });
    const streamedTooLarge = new Request('http://localhost/api/saves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(700_000));
          controller.enqueue(new Uint8Array(400_001));
          controller.close();
        },
      }),
      duplex: 'half',
    });
    const streamedResponse = await app.fetch(streamedTooLarge);
    expect(streamedResponse.status).toBe(413);
    expect(await streamedResponse.json()).toMatchObject({ code: 'REQUEST_TOO_LARGE' });
    expect((await app.request('/api/saves', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ save: envelope() }) })).status).toBe(201);
    const update = (revision: number) => app.request('/api/saves/route-save', { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, save: envelope(revision) }) });
    expect((await update(1)).status).toBe(200);
    expect((await update(1)).status).toBe(409);
    expect((await app.request('/api/saves', { method: 'GET' })).status).toBe(200);
  });

  it('returns an explicit not-ready response instead of accepting a lossy v2 save', async () => {
    const { app } = setup();
    const response = await app.request('/api/saves', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ save: v2Envelope() }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'SAVE_SCHEMA_NOT_READY' });
  });
});
