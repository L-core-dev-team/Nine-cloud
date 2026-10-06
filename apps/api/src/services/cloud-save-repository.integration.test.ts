import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { CloudCapacityError, CloudSaveService } from './cloud-save-service.js';
import { PostgresCloudSaveRepository } from './postgres-cloud-save-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('PostgresCloudSaveRepository (TEST_DATABASE_URL)', () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3_000 });
  const service = new CloudSaveService(new PostgresCloudSaveRepository(pool));
  const ownerA = `s6-a-${randomUUID()}`;
  const ownerB = `s6-b-${randomUUID()}`;
  const saveId = `s6-${randomUUID()}`;
  const v2SaveId = `s6-v2-${randomUUID()}`;
  const v3SaveId = `s6-v3-${randomUUID()}`;
  const quotaOwner = `s6-quota-${randomUUID()}`;

  beforeAll(async()=>{for(const id of [ownerA,ownerB,quotaOwner])await pool.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,id+'@fixture.invalid']);});
  afterAll(async () => {
    { const client = await pool.connect(); try { await client.query('BEGIN'); await client.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)"); await client.query('DELETE FROM game_saves WHERE owner_id = ANY($1::text[])', [[ownerA, quotaOwner]]); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
    await pool.end();
  });

  it('enforces owner scoping and one-winner revision compare-and-swap in PostgreSQL', async () => {
    const initial = {
      schemaVersion: 1 as const,
      saveId,
      canonVersion: 'canon-test',
      ruleVersion: 'rules-test',
      memoryPolicyVersion: 'memory-test',
      revision: 0,
      state: { playerId: 'player-test', locationId: 'gate', elapsedMinutes: 0, facts: {} },
    };
    expect(await service.create(ownerA, initial)).toMatchObject({ kind: 'created' });
    expect((await pool.query('SELECT memory_mode,memory_policy FROM game_saves WHERE id=$1', [saveId])).rows)
      .toEqual([{ memory_mode: null, memory_policy: null }]);
    expect(await service.get(ownerB, saveId)).toBeNull();
    expect(await service.list(ownerB)).toEqual([]);

    const competitors = await Promise.all([
      service.replace(ownerA, saveId, 0, { ...initial, revision: 1, state: { ...initial.state, elapsedMinutes: 1 } }),
      service.replace(ownerA, saveId, 0, { ...initial, revision: 1, state: { ...initial.state, elapsedMinutes: 2 } }),
    ]);
    expect(competitors.filter(result => result.kind === 'updated')).toHaveLength(1);
    expect(competitors.filter(result => result.kind === 'conflict')).toHaveLength(1);
    expect(await service.get(ownerA, saveId)).toMatchObject({ revision: 1 });
    expect(await service.replace(ownerB, saveId, 1, { ...initial, revision: 2 })).toEqual({ kind: 'not_found' });
  });

  it('serializes concurrent account creates and rejects the twenty-first archive without deleting existing saves', async () => {
    const results = await Promise.allSettled(Array.from({ length: 21 }, (_, index) => service.create(quotaOwner, {
      schemaVersion: 1, saveId: `quota-${index}-${randomUUID()}`, canonVersion: 'canon-test',
      ruleVersion: 'rules-test', memoryPolicyVersion: 'memory-test', revision: 0,
      state: { playerId: 'player-test', locationId: 'gate', elapsedMinutes: 0, facts: {} },
    })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(20);
    expect(results.filter(result => result.status === 'rejected' && result.reason instanceof CloudCapacityError)).toHaveLength(1);
    expect(await service.list(quotaOwner)).toHaveLength(20);
  });

  it('round-trips a v2 memory policy and refuses schema downgrade or policy mutation', async () => {
    const memoryPolicy = {
      mode: 'forgetting' as const,
      policyVersion: 'forgetting-v1',
      schemaVersion: 1,
      clockBasis: 'game-minute+npc-grant-sequence-v1' as const,
      policyArtifactHash: `sha256:${'a'.repeat(64)}`,
      cueDictionaryHash: `sha256:${'b'.repeat(64)}`,
      normalizerVersion: 'unicode-nfc-v1',
      retrievalVersion: 'recall-decay-v1',
      visibilityPolicyVersion: 'npc-visibility-v1',
      visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
      createdAtRevision: 0,
    };
    const initial = {
      schemaVersion: 2 as const, saveId: v2SaveId, canonVersion: 'canon-test', ruleVersion: 'rules-test',
      memoryPolicyVersion: memoryPolicy.policyVersion, memoryMode: memoryPolicy.mode, memoryPolicy,
      revision: 0, state: { playerId: 'player-test', locationId: 'gate', elapsedMinutes: 0, facts: {} },
    };
    expect(await service.create(ownerA, initial)).toMatchObject({ kind: 'created', save: initial });
    expect(await service.get(ownerA, v2SaveId)).toEqual(initial);
    const storedColumns = await pool.query('SELECT schema_version,memory_mode,memory_policy,memory_policy_version,branch_id,parent_branch_id,fork_revision,created_policy_version,source_migration_id FROM game_saves WHERE id=$1', [v2SaveId]);
    expect(storedColumns.rows[0]).toMatchObject({ schema_version: 2, memory_mode: 'forgetting', memory_policy: { policyVersion: 'forgetting-v1' }, memory_policy_version: 'forgetting-v1', branch_id: null, parent_branch_id: null, fork_revision: null, created_policy_version: null, source_migration_id: null });
    const incompletePolicyId = `s6-v2-incomplete-${randomUUID()}`;
    await expect(pool.query(
      `INSERT INTO game_saves (id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,memory_mode,memory_policy,snapshot)
       VALUES ($1,$2,0,2,'canon-test','rules-test','forgetting-v1','forgetting',NULL,'{}'::jsonb)`,
      [incompletePolicyId, ownerA],
    )).rejects.toThrow('game_saves_memory_policy_check');
    const nullPolicyFieldId = `s6-v2-null-field-${randomUUID()}`;
    await expect(pool.query(
      `INSERT INTO game_saves (id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,memory_mode,memory_policy,snapshot)
       VALUES ($1,$2,0,2,'canon-test','rules-test','forgetting-v1','forgetting',$3::jsonb,'{}'::jsonb)`,
      [nullPolicyFieldId, ownerA, JSON.stringify({ ...memoryPolicy, retrievalVersion: null })],
    )).rejects.toThrow('game_saves_memory_policy_check');
    await expect(pool.query("UPDATE game_saves SET memory_mode='continue' WHERE id=$1", [v2SaveId]))
      .rejects.toThrow('SAVE_MEMORY_POLICY_PINNED');
    await expect(pool.query("UPDATE game_saves SET memory_policy = jsonb_set(memory_policy, '{retrievalVersion}', '\"recall-decay-v2\"') WHERE id=$1", [v2SaveId]))
      .rejects.toThrow('SAVE_MEMORY_POLICY_PINNED');
    await expect(pool.query("UPDATE game_saves SET schema_version=1 WHERE id=$1", [v2SaveId]))
      .rejects.toThrow('SAVE_SCHEMA_VERSION_IMMUTABLE');

    const downgrade = { schemaVersion: 1 as const, saveId: v2SaveId, canonVersion: 'canon-test', ruleVersion: 'rules-test',
      memoryPolicyVersion: 'legacy-unknown', revision: 1, state: initial.state };
    expect(await service.replace(ownerA, v2SaveId, 0, downgrade)).toEqual({ kind: 'schema_version_conflict' });
    const altered = { ...initial, revision: 1,
      memoryPolicy: { ...memoryPolicy, retrievalVersion: 'recall-decay-v2' } };
    expect(await service.replace(ownerA, v2SaveId, 0, altered)).toEqual({ kind: 'memory_policy_pinned' });
    const updated = await service.replace(ownerA, v2SaveId, 0, { ...initial, revision: 1,
      state: { ...initial.state, elapsedMinutes: 15 } });
    expect(updated.kind).toBe('updated');
    expect(await service.get(ownerA, v2SaveId)).toMatchObject({ schemaVersion: 2, memoryMode: 'forgetting', memoryPolicy });
  });

  it('round-trips v3 root lineage and pins it without inferring lineage onto v2 saves', async () => {
    const memoryPolicy = {
      mode: 'continue' as const, policyVersion: 'continue-v1', schemaVersion: 1,
      clockBasis: 'game-minute+npc-grant-sequence-v1' as const,
      policyArtifactHash: `sha256:${'a'.repeat(64)}`, cueDictionaryHash: `sha256:${'b'.repeat(64)}`,
      normalizerVersion: 'unicode-nfc-v1', retrievalVersion: 'exact-recall-v1',
      visibilityPolicyVersion: 'npc-visibility-v1', visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
      createdAtRevision: 0,
    };
    const initial = {
      schemaVersion: 3 as const, saveId: v3SaveId, canonVersion: 'canon-test', ruleVersion: 'rules-test',
      canonArtifactHash: `sha256:${'d'.repeat(64)}`,
      memoryPolicyVersion: memoryPolicy.policyVersion, memoryMode: memoryPolicy.mode, memoryPolicy,
      branchId: 'root', parentBranchId: null, forkRevision: 0,
      createdPolicyVersion: memoryPolicy.policyVersion, sourceMigrationId: null,
      revision: 0, state: { playerId: 'player-test', locationId: 'gate', elapsedMinutes: 0, facts: {} },
    };
    expect(await service.create(ownerA, initial)).toMatchObject({ kind: 'created', save: initial });
    expect(await service.get(ownerA, v3SaveId)).toEqual(initial);
    expect((await pool.query('SELECT schema_version,canon_artifact_hash,branch_id,parent_branch_id,fork_revision,created_policy_version,source_migration_id FROM game_saves WHERE id=$1', [v3SaveId])).rows[0])
      .toEqual({ schema_version: 3, canon_artifact_hash: `sha256:${'d'.repeat(64)}`, branch_id: 'root', parent_branch_id: null, fork_revision: 0, created_policy_version: 'continue-v1', source_migration_id: null });
    await expect(pool.query("UPDATE game_saves SET created_policy_version='changed' WHERE id=$1", [v3SaveId]))
      .rejects.toThrow('SAVE_LINEAGE_IMMUTABLE');
    await expect(pool.query("UPDATE game_saves SET canon_artifact_hash=$2 WHERE id=$1", [v3SaveId, `sha256:${'e'.repeat(64)}`]))
      .rejects.toThrow('SAVE_CANON_ARTIFACT_PINNED');
    expect(await service.replace(ownerA, v3SaveId, 0, { ...initial, revision: 1,
      branchId: 'branch-child', parentBranchId: 'root' })).toEqual({ kind: 'lineage_pinned' });
  });
});
