import { describe, expect, it } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
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

function v3Envelope() {
  return { ...v2Envelope(), schemaVersion: 3 as const, canonArtifactHash: `sha256:${'d'.repeat(64)}`, branchId: 'root', parentBranchId: null,
    forkRevision: 0, createdPolicyVersion: 'continue-v1', sourceMigrationId: null };
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
    if (row.save.schemaVersion !== input.next.schemaVersion) return { kind: 'schema_version_conflict' as const };
    if ((row.save.schemaVersion === 2 || row.save.schemaVersion === 3) && (input.next.schemaVersion === 2 || input.next.schemaVersion === 3) && (
      row.save.memoryMode !== input.next.memoryMode || row.save.memoryPolicyVersion !== input.next.memoryPolicyVersion ||
      !isDeepStrictEqual(row.save.memoryPolicy, input.next.memoryPolicy)
    )) return { kind: 'memory_policy_pinned' as const };
    if (row.save.schemaVersion === 3 && input.next.schemaVersion === 3 && (
      row.save.branchId !== input.next.branchId || row.save.parentBranchId !== input.next.parentBranchId ||
      row.save.forkRevision !== input.next.forkRevision || row.save.createdPolicyVersion !== input.next.createdPolicyVersion ||
      row.save.sourceMigrationId !== input.next.sourceMigrationId
    )) return { kind: 'lineage_pinned' as const };
    if (row.save.schemaVersion === 3 && input.next.schemaVersion === 3
      && row.save.canonArtifactHash !== input.next.canonArtifactHash) return { kind: 'canon_artifact_pinned' as const };
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

  it('persists v2 save mode and rejects mutation of its pinned memory policy', async () => {
    const { app } = setup();
    const initial = v2Envelope();
    const response = await app.request('/api/saves', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ save: initial }) });
    expect(response.status).toBe(201);
    expect(await (await app.request('/api/saves/route-save')).json()).toMatchObject({ save: { memoryMode: 'continue', memoryPolicy: initial.memoryPolicy } });
    const changed = { ...initial, revision: 1,
      memoryPolicy: { ...initial.memoryPolicy, retrievalVersion: 'changed-retrieval-v2' } };
    const update = await app.request('/api/saves/route-save', { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, save: changed }) });
    expect(update.status).toBe(409);
    expect(await update.json()).toMatchObject({ code: 'SAVE_MEMORY_POLICY_PINNED' });
    const downgrade = { schemaVersion: 1 as const, saveId: initial.saveId, canonVersion: initial.canonVersion,
      ruleVersion: initial.ruleVersion, memoryPolicyVersion: 'legacy-unknown', revision: 1, state: initial.state };
    const downgradeResponse = await app.request('/api/saves/route-save', { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, save: downgrade }) });
    expect(downgradeResponse.status).toBe(409);
    expect(await downgradeResponse.json()).toMatchObject({ code: 'SAVE_SCHEMA_VERSION_IMMUTABLE' });
  });

  it('persists explicit v3 lineage and rejects lineage mutation', async () => {
    const { app } = setup();
    const initial = v3Envelope();
    const response = await app.request('/api/saves', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ save: initial }) });
    expect(response.status).toBe(201);
    expect(await (await app.request('/api/saves/route-save')).json()).toMatchObject({
      save: { schemaVersion: 3, branchId: 'root', parentBranchId: null, forkRevision: 0, sourceMigrationId: null },
    });
    const changed = { ...initial, revision: 1, branchId: 'branch-2', parentBranchId: 'root' };
    const update = await app.request('/api/saves/route-save', { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, save: changed }) });
    expect(update.status).toBe(409);
    expect(await update.json()).toMatchObject({ code: 'SAVE_LINEAGE_IMMUTABLE' });
    const changedArtifact = { ...initial, revision: 1, canonArtifactHash: `sha256:${'e'.repeat(64)}` };
    const artifactUpdate = await app.request('/api/saves/route-save', { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, save: changedArtifact }) });
    expect(artifactUpdate.status).toBe(409);
    expect(await artifactUpdate.json()).toMatchObject({ code: 'SAVE_CANON_ARTIFACT_PINNED' });
  });
});
