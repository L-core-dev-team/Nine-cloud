import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { CloudArchiveLifecycle } from './cloud-archive-lifecycle.js';
import { CloudSaveService } from './cloud-save-service.js';
import { PostgresCloudSaveRepository } from './postgres-cloud-save-repository.js';
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
suite('PostgreSQL archive deletion and verified backup restoration', () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4, connectionTimeoutMillis: 3000 });
  const service = new CloudSaveService(new PostgresCloudSaveRepository(pool), true); const lifecycle = new CloudArchiveLifecycle(pool);
  const owner = randomUUID(), other = randomUUID(); const id = `trash-${randomUUID()}`, authoritativeId = `authority-${randomUUID()}`;
  const pinnedMemoryPolicy = {
    mode: 'continue' as const, policyVersion: 'continue-v1', schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1' as const,
    policyArtifactHash: `sha256:${'a'.repeat(64)}`, cueDictionaryHash: `sha256:${'b'.repeat(64)}`,
    normalizerVersion: 'unicode-nfc-v1', retrievalVersion: 'exact-recall-v1',
    visibilityPolicyVersion: 'npc-visibility-v1', visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
    createdAtRevision: 0,
  };
  const initial = { schemaVersion: 1 as const, saveId: id, canonVersion: 'test', ruleVersion: 'test', memoryPolicyVersion: 'test', revision: 0,
    state: { playerId: 'test-player', locationId: 'gate', elapsedMinutes: 0, facts: { archiveKind: 'local-untrusted-v1', localArchive: { name: '完整原档', messages: ['完整剧情'], core: '不简化' } } } };
  beforeAll(async()=>{for(const id of [owner,other])await pool.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,id+'@fixture.invalid']);});
  afterAll(async () => {
    const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");
      await client.query('DELETE FROM cloud_archive_trash WHERE save_id = ANY($1::text[]) AND owner_id = $2', [[id, authoritativeId], owner]);
      await client.query('DELETE FROM game_saves WHERE id = ANY($1::text[]) AND owner_id = $2', [[id, authoritativeId], owner]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await pool.end();
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
    await new CloudSaveService(new PostgresCloudSaveRepository(pool)).create(owner, {
      schemaVersion: 2, saveId: authoritativeId, canonVersion: 'test', ruleVersion: 'test',
      memoryPolicyVersion: pinnedMemoryPolicy.policyVersion, memoryMode: pinnedMemoryPolicy.mode, memoryPolicy: pinnedMemoryPolicy,
      revision: 0, state: { playerId: 'test-player', locationId: 'gate', elapsedMinutes: 0, facts: {} },
    });
    expect(await lifecycle.change(owner, authoritativeId, 0, 'delete')).toEqual({ kind: 'not_found' });
  });
});
