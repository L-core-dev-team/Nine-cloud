import { describe, expect, it } from 'vitest';
import { CloudHttpError, CloudSync, archiveFromEnvelope, type CloudRecord, type CloudQueueStore } from './cloud-sync';
import type { LocalSave } from './storage';
import type { SaveEnvelope } from '@jiuxiao/contracts';

const save: LocalSave = { schemaVersion: 1, saveId: 'local-1', name: '测试', createdAt: '2026-10-01', updatedAt: '2026-10-01', revision: 7,
  canonVersion: 'unverified', ruleVersion: 'not-signed', memoryPolicyVersion: 'test', character: { apiKey: 'private-key', name: '保留角色' },
  location: 'gate', status: 'pending_rules', messages: ['保留剧情'], legacyArchive: { sourceFormat: 'test', sourceVersion: null, payload: { core: '完整设定' } } };
class Store implements CloudQueueStore {
  rows = new Map<string, CloudRecord>();
  async list(owner: string) { return [...this.rows.values()].filter(r => r.ownerId === owner).map(r => structuredClone(r)); }
  async update(key: string, change: (r: CloudRecord | undefined) => CloudRecord) { const next = change(structuredClone(this.rows.get(key))); this.rows.set(key, structuredClone(next)); return next; }
}
describe('cloud archive queues and CAS decisions', () => {
  it('redacts credentials, preserves original content, partitions queues by account', async () => {
    const store = new Store(); const sync = new CloudSync(store);
    const a = await sync.enqueue('a', save); const b = await sync.enqueue('b', save);
    expect(a.cloudSaveId).not.toBe(b.cloudSaveId); expect(await sync.list('a')).toHaveLength(1);
    expect(JSON.stringify(a.pending)).not.toContain('private-key');
    expect(archiveFromEnvelope(a.pending)).toMatchObject({ revision: 7, messages: ['保留剧情'], legacyArchive: save.legacyArchive });
    expect(save.character.apiKey).toBe('private-key');
    expect(() => archiveFromEnvelope({ ...a.pending, state: { ...a.pending!.state, facts: {} } })).toThrow();
  });
  it('retains queued work on disconnect and acknowledges exact lost-response replay once', async () => {
    const store = new Store(); let remote: SaveEnvelope | null = null; let drop = true;
    const sync = new CloudSync(store, async (_path, method, body, owner) => {
      expect(owner).toBe('a');
      if (method === 'GET') return { save: remote };
      if (remote) throw new CloudHttpError(409);
      remote = (body as { save: SaveEnvelope }).save;
      if (drop) { drop = false; throw new Error('disconnected after commit'); }
      return { save: remote };
    });
    await sync.enqueue('a', save); await expect(sync.flush('a')).rejects.toThrow();
    expect((await sync.list('a'))[0]!.pending).not.toBeNull();
    await sync.flush('a'); expect((await sync.list('a'))[0]).toMatchObject({ baseRevision: 0, pending: null, conflict: null });
  });
  it('keeps both versions on conflict and requires explicit CAS against the reviewed version', async () => {
    const store = new Store(); let remote: SaveEnvelope;
    const sync = new CloudSync(store, async (_path, method, body) => {
      if (method === 'GET') return { save: remote };
      const input = body as { save: SaveEnvelope; expectedRevision?: number };
      if (!remote) { remote = input.save; return { save: remote }; }
      if (input.expectedRevision !== remote.revision) throw new CloudHttpError(409);
      remote = input.save; return { save: remote };
    });
    await sync.enqueue('a', save); await sync.flush('a');
    remote = { ...remote!, revision: 1, state: { ...remote!.state, facts: { ...remote!.state.facts, cloudMutationId: 'other-device' } } };
    await sync.enqueue('a', { ...save, name: '本地新版本' }); await sync.flush('a');
    const conflicted = (await sync.list('a'))[0]!;
    expect(archiveFromEnvelope(conflicted.pending).name).toBe('本地新版本'); expect(conflicted.conflict?.revision).toBe(1);
    await sync.keepLocal(conflicted); await sync.flush('a');
    expect(remote!.revision).toBe(2); expect((await sync.list('a'))[0]!.pending).toBeNull();
  });
  it('does not erase an edit queued during upload; stale discard cannot erase it either', async () => {
    const store = new Store(); let sync: CloudSync;
    sync = new CloudSync(store, async (_path, _method, body) => {
      await sync.enqueue('a', { ...save, name: '上传过程中新增修改' }); return { save: (body as { save: SaveEnvelope }).save };
    });
    const old = await sync.enqueue('a', save); await sync.flush('a');
    const next = (await sync.list('a'))[0]!;
    expect(next.baseRevision).toBe(0); expect(next.pending?.revision).toBe(1); expect(archiveFromEnvelope(next.pending).name).toBe('上传过程中新增修改');
    await expect(sync.discardUpload(old)).rejects.toThrow(); expect((await sync.list('a'))[0]!.pending).not.toBeNull();
  });
});
