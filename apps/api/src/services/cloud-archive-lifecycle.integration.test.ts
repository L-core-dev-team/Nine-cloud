import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { CloudArchiveLifecycle } from './cloud-archive-lifecycle.js';
import { CloudSaveService } from './cloud-save-service.js';
import { PostgresCloudSaveRepository } from './postgres-cloud-save-repository.js';
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
suite('PostgreSQL archive deletion and verified backup restoration', () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4, connectionTimeoutMillis: 3000 });
  const service = new CloudSaveService(new PostgresCloudSaveRepository(pool), true); const lifecycle = new CloudArchiveLifecycle(pool);
  const owner = randomUUID(), other = randomUUID(); const id = `trash-${randomUUID()}`, authoritativeId = `authority-${randomUUID()}`;
  const initial = { schemaVersion: 1 as const, saveId: id, canonVersion: 'test', ruleVersion: 'test', memoryPolicyVersion: 'test', revision: 0,
    state: { playerId: 'test-player', locationId: 'gate', elapsedMinutes: 0, facts: { archiveKind: 'local-untrusted-v1', localArchive: { name: '完整原档', messages: ['完整剧情'], core: '不简化' } } } };
  afterAll(async () => {
    await pool.query('DELETE FROM cloud_archive_trash WHERE save_id = ANY($1::text[]) AND owner_id = $2', [[id, authoritativeId], owner]);
    await pool.query('DELETE FROM game_saves WHERE id = ANY($1::text[]) AND owner_id = $2', [[id, authoritativeId], owner]); await pool.end();
  });
  it('owner isolation, soft deletion, stale update refusal and one-winner backup restoration', async () => {
    await service.create(owner, initial);
    expect(await lifecycle.change(other, id, 0, 'delete')).toEqual({ kind: 'not_found' });
    expect(await lifecycle.change(owner, id, 1, 'delete')).toEqual({ kind: 'conflict' });
    expect(await lifecycle.change(owner, id, 0, 'delete')).toEqual({ kind: 'deleted', revision: 1 });
    expect(await lifecycle.change(owner, id, 0, 'delete')).toEqual({ kind: 'deleted', revision: 1 });
    expect(await service.get(owner, id)).toBeNull(); expect(await service.list(owner)).toEqual([]);
    expect(await service.replace(owner, id, 0, { ...initial, revision: 1 })).toEqual({ kind: 'not_found' });
    expect(await lifecycle.list(other)).toEqual({ saves: [], hasMore: false });
    expect((await lifecycle.list(owner)).saves).toHaveLength(1);
    const restored = await Promise.all([lifecycle.change(owner, id, 1, 'restore'), lifecycle.change(owner, id, 1, 'restore')]);
    expect(restored.filter(r => r.kind === 'restored')).toHaveLength(1);
    expect(await service.get(owner, id)).toEqual({ ...initial, revision: 2 });
    expect((await lifecycle.list(owner)).saves).toHaveLength(0);
  });
  it('corrupted backup rolls back; rule/event state cannot be deleted by an archive request', async () => {
    await lifecycle.change(owner, id, 2, 'delete');
    await pool.query("UPDATE cloud_archive_trash SET backup = jsonb_set(backup, '{state,facts,localArchive,core}', '\"tampered\"'::jsonb) WHERE save_id = $1", [id]);
    await expect(lifecycle.change(owner, id, 3, 'restore')).rejects.toThrow('BACKUP_INTEGRITY_FAILED');
    expect(await service.get(owner, id)).toBeNull(); expect((await lifecycle.list(owner)).saves).toHaveLength(1);
    await new CloudSaveService(new PostgresCloudSaveRepository(pool)).create(owner, { ...initial, saveId: authoritativeId, state: { ...initial.state, facts: {} } });
    expect(await lifecycle.change(owner, authoritativeId, 0, 'delete')).toEqual({ kind: 'not_found' });
  });
});
