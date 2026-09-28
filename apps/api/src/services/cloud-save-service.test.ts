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
    this.records.set(input.saveId, { ownerId: input.ownerId, save: input.next });
    return { kind: 'updated' as const };
  }
}

describe('CloudSaveService', () => {
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
