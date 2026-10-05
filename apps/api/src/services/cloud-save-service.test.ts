import {createHash,randomUUID} from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { SaveEnvelope } from '@jiuxiao/contracts';
import { CloudSaveService, type CloudSaveRepository } from './cloud-save-service.js';

function envelope(revision = 0, elapsedMinutes = 0): SaveEnvelope {
  return {
    schemaVersion: 1,
    saveId: 'save-one',
    canonVersion: 'canon-1',
    ruleVersion: 'rules-1',
    memoryPolicyVersion: 'memory-1',
    revision,
    state: { playerId: 'player-one', locationId: 'gate', elapsedMinutes, facts: {} },
  };
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
  return { ...envelope(), schemaVersion: 2 as const, memoryPolicyVersion: memoryPolicy.policyVersion,
    memoryMode: memoryPolicy.mode, memoryPolicy };
}

class MemoryCloudSaveRepository implements CloudSaveRepository {
  readonly records = new Map<string, { ownerId: string; save: SaveEnvelope }>();

  async listForOwner(ownerId: string) {
    return [...this.records.values()].filter(record => record.ownerId === ownerId).map(record => record.save);
  }

  async getForOwner(ownerId: string, saveId: string) {
    const record = this.records.get(saveId);
    return record?.ownerId === ownerId ? record.save : null;
  }

  async createForOwner(ownerId: string, save: SaveEnvelope) {
    if (this.records.has(save.saveId)) return false;
    this.records.set(save.saveId, { ownerId, save });
    return true;
  }

  async replaceForOwner(input: {
    ownerId: string;
    saveId: string;
    expectedRevision: number;
    next: SaveEnvelope;
  }) {
    const record = this.records.get(input.saveId);
    if (!record || record.ownerId !== input.ownerId) return { kind: 'not_found' as const };
    if (record.save.revision !== input.expectedRevision) {
      return { kind: 'conflict' as const, currentRevision: record.save.revision };
    }
    if (record.save.schemaVersion !== input.next.schemaVersion) return { kind: 'schema_version_conflict' as const };
    if (input.next.schemaVersion === 2 && (
      record.save.schemaVersion !== 2 || record.save.memoryMode !== input.next.memoryMode ||
      record.save.memoryPolicyVersion !== input.next.memoryPolicyVersion ||
      !isDeepStrictEqual(record.save.memoryPolicy, input.next.memoryPolicy)
    )) return { kind: 'memory_policy_pinned' as const };
    this.records.set(input.saveId, { ownerId: input.ownerId, save: input.next });
    return { kind: 'updated' as const };
  }
}

describe('CloudSaveService', () => {
  it('does not distinguish absent and occupied foreign archive IDs in production',async()=>{
    const repository=new MemoryCloudSaveRepository(),service=new CloudSaveService(repository,false,true);
    const candidate={...envelope(),saveId:'archive-'+createHash('sha256').update('other').digest('hex').slice(0,16)+'-'+randomUUID()};
    await expect(service.create('owner',candidate)).rejects.toThrow('Save ID is invalid.');
    repository.records.set(candidate.saveId,{ownerId:'other',save:candidate});
    await expect(service.create('owner',candidate)).rejects.toThrow('Save ID is invalid.');
    const owned={...candidate,saveId:'archive-'+createHash('sha256').update('owner').digest('hex').slice(0,16)+'-'+randomUUID()};
    expect((await service.create('owner',owned)).kind).toBe('created');
    expect((await service.create('owner',owned)).kind).toBe('conflict');
    repository.records.set('legacy-ack',{ownerId:'owner',save:{...candidate,saveId:'legacy-ack'}});
    expect((await service.create('owner',{...candidate,saveId:'legacy-ack'})).kind).toBe('conflict');
  });
  it('production client-archive mode cannot create or overwrite authoritative state', async () => {
    const repository = new MemoryCloudSaveRepository();
    await repository.createForOwner('a', envelope());
    const service = new CloudSaveService(repository, true);
    await expect(service.create('a', envelope())).rejects.toThrow('Client archive required');
    await expect(service.create('a', v2Envelope())).rejects.toThrow('Client archive must use the legacy v1 envelope.');
    expect(await service.replace('a', 'save-one', 0, { ...envelope(1), state: { ...envelope().state, facts: { archiveKind: 'local-untrusted-v1' } } })).toEqual({ kind: 'not_found' });
    expect(await repository.getForOwner('a', 'save-one')).toEqual(envelope());
  });
  it('requires a trusted owner scope and never accepts owner data from the save envelope', async () => {
    const service = new CloudSaveService(new MemoryCloudSaveRepository());
    await expect(service.create('  ', envelope())).rejects.toThrow('Authenticated owner ID is required');
    await expect(service.create('account-a', { ...envelope(), ownerId: 'account-b' }))
      .rejects.toThrow('supported save contract');
    await expect(service.create('account-a', { ...envelope(), saveId: ` ${'x'.repeat(201)} ` }))
      .rejects.toThrow('identity or version metadata');
    expect(await service.create('account-a', envelope())).toMatchObject({ kind: 'created' });
    expect(await service.list('account-b')).toEqual([]);
  });

  it('rejects malformed snapshots and nonzero first revisions before repository writes', async () => {
    const repository = new MemoryCloudSaveRepository();
    const service = new CloudSaveService(repository);
    await expect(service.create('account-a', { ...envelope(), revision: 1 })).rejects.toThrow('start at revision zero');
    await expect(service.create('account-a', { ...envelope(), state: { playerId: '', locationId: 'gate' } }))
      .rejects.toThrow('supported save contract');
    expect(repository.records.size).toBe(0);
  });

  it('creates and round-trips v2 saves with complete pinned memory metadata', async () => {
    const repository = new MemoryCloudSaveRepository();
    const service = new CloudSaveService(repository);
    const initial = v2Envelope();
    expect(await service.create('account-a', initial)).toMatchObject({ kind: 'created', save: initial });
    expect(await service.get('account-a', initial.saveId)).toEqual(initial);
    expect(await service.replace('account-a', initial.saveId, 0, { ...initial, revision: 1,
      state: { ...initial.state, elapsedMinutes: 1 } })).toMatchObject({ kind: 'updated' });
  });

  it('does not permit save schema changes or mutation of a pinned v2 policy', async () => {
    const repository = new MemoryCloudSaveRepository();
    const service = new CloudSaveService(repository);
    await service.create('account-a', envelope());
    expect(await service.replace('account-a', 'save-one', 0, { ...v2Envelope(), revision: 1 }))
      .toEqual({ kind: 'schema_version_conflict' });

    const initial = { ...v2Envelope(), saveId: 'save-two' };
    await service.create('account-a', initial);
    const changedPolicy = { ...initial, revision: 1,
      memoryPolicy: { ...initial.memoryPolicy, retrievalVersion: 'changed-retrieval-v2' } };
    expect(await service.replace('account-a', initial.saveId, 0, changedPolicy))
      .toEqual({ kind: 'memory_policy_pinned' });
    expect(await service.get('account-a', initial.saveId)).toEqual(initial);
  });

  it('keeps another account unable to read a save and returns no ownership side channel', async () => {
    const service = new CloudSaveService(new MemoryCloudSaveRepository());
    await service.create('account-a', envelope());
    expect(await service.get('account-b', 'save-one')).toBeNull();
    expect(await service.list('account-b')).toEqual([]);
    expect(await service.replace('account-b', 'save-one', 0, envelope(1, 5))).toEqual({ kind: 'not_found' });
  });

  it('requires the path identity and next revision to match the compare-and-swap request', async () => {
    const service = new CloudSaveService(new MemoryCloudSaveRepository());
    await service.create('account-a', envelope());
    await expect(service.replace('account-a', 'other-save', 0, envelope(1, 5))).rejects.toThrow('identity or next revision');
    await expect(service.replace('account-a', 'save-one', 0, envelope(2, 5))).rejects.toThrow('identity or next revision');
  });

  it('reports stale revisions without overwriting the winning update', async () => {
    const service = new CloudSaveService(new MemoryCloudSaveRepository());
    await service.create('account-a', envelope());
    expect(await service.create('account-a', envelope())).toEqual({ kind: 'conflict' });
    expect(await service.replace('account-a', 'save-one', 0, envelope(1, 5))).toMatchObject({ kind: 'updated' });
    expect(await service.replace('account-a', 'save-one', 0, envelope(1, 9))).toEqual({
      kind: 'conflict', currentRevision: 1,
    });
    expect(await service.get('account-a', 'save-one')).toEqual(envelope(1, 5));
  });
});
