import { describe, expect, it, vi } from 'vitest';
import { CloudHttpError, CloudSync, IndexedCloudQueue, archiveFromEnvelope, type CloudRecord, type CloudQueueStore } from './cloud-sync';
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
describe('cloud queue connections', () => {
  it('closes a late connection after reporting a blocked open, without starting a transaction', async () => {
    const close = vi.fn(); const transaction = vi.fn();
    const request = { result: { close, transaction }, onsuccess: null as (() => void) | null,
      onblocked: null as (() => void) | null };
    vi.stubGlobal('indexedDB', { open: () => request });
    try {
      const reading = new IndexedCloudQueue().list('a');
      request.onblocked!(); await expect(reading).rejects.toThrow('QUEUE_UNAVAILABLE');
      request.onsuccess!(); expect(close).toHaveBeenCalledOnce(); expect(transaction).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
describe('cloud archive queues and CAS decisions', () => {
  it('rejects a reviewed local choice after a newer local upload replaces it', async () => {
    const store = new Store(); const sync = new CloudSync(store);
    const first = await sync.enqueue('a', save);
    const reviewed = await store.update(first.key, current => ({ ...current!, conflict: { ...first.pending!, revision: 2 } }));
    await sync.enqueue('a', { ...save, name: '尚未核对的新编辑' });
    const latest = (await sync.list('a'))[0];
    await expect(sync.keepLocal(reviewed)).rejects.toThrow('STALE_CONFLICT');
    expect((await sync.list('a'))[0]).toEqual(latest);
  });
  it('a delayed acknowledgement cannot rewind a newer cloud revision or queued edit', async () => {
    const store = new Store(); let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; }); let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const slow = new CloudSync(store, async (_path, _method, body) => {
      entered(); await wait; return { save: (body as { save: SaveEnvelope }).save };
    });
    const fast = new CloudSync(store, async (_path, _method, body) => ({ save: (body as { save: SaveEnvelope }).save }));
    await slow.enqueue('a', save); const oldRequest = slow.flush('a'); await started;
    await fast.flush('a'); await fast.enqueue('a', { ...save, name: '已提交的新编辑' }); await fast.flush('a');
    await fast.enqueue('a', { ...save, name: '第三份待提交编辑' });
    const latest = (await fast.list('a'))[0]; release(); await oldRequest;
    expect((await fast.list('a'))[0]).toEqual(latest);
  });
  it('a delayed conflict does not block or replace the result of a newer successful upload', async () => {
    const store = new Store(); let release!: () => void; let entered!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; }); let remote: SaveEnvelope;
    const slow = new CloudSync(store, async (_path, method) => {
      if (method === 'GET') return { save: { ...remote, revision: 0, state: { ...remote.state, facts: { ...remote.state.facts, cloudMutationId: 'stale-other' } } } };
      entered(); await wait; throw new CloudHttpError(409);
    });
    const fast = new CloudSync(store, async (_path, _method, body) => { remote = (body as { save: SaveEnvelope }).save; return { save: remote }; });
    await slow.enqueue('a', save); const oldRequest = slow.flush('a'); await started;
    await fast.flush('a'); await fast.enqueue('a', { ...save, name: '新编辑' }); await fast.flush('a');
    const latest = (await fast.list('a'))[0]; release(); await oldRequest;
    expect((await fast.list('a'))[0]).toEqual(latest);
  });
  it('restored local copies remain bound to the reviewed cloud identity and revision', async () => {
    const store = new Store(); const sync = new CloudSync(store);
    const original = await sync.enqueue('a', save);
    await sync.trackRestored('a', 'restored-copy', { ...original.pending!, revision: 4 });
    const queued = await sync.enqueue('a', { ...save, saveId: 'restored-copy' });
    expect(queued.cloudSaveId).toBe(original.cloudSaveId); expect(queued.baseRevision).toBe(4); expect(queued.pending?.revision).toBe(5);
    await expect(sync.trackRestored('a', 'restored-copy', original.pending)).rejects.toThrow('LOCAL_UPLOAD_PENDING');
  });
  it('oversized archives are rejected before queue mutation and preserve the existing upload', async () => {
    const store = new Store(); const sync = new CloudSync(store); const queued = await sync.enqueue('a', save);
    await expect(sync.enqueue('a', { ...save, messages: ['字'.repeat(400000)] })).rejects.toThrow('ARCHIVE_TOO_LARGE');
    expect((await sync.list('a'))[0]).toEqual(queued);
  });
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
