import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { CloudSaveService } from './cloud-save-service.js';
import { PostgresCloudSaveRepository } from './postgres-cloud-save-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('PostgresCloudSaveRepository (TEST_DATABASE_URL)', () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3_000 });
  const service = new CloudSaveService(new PostgresCloudSaveRepository(pool));
  const ownerA = `s6-a-${randomUUID()}`;
  const ownerB = `s6-b-${randomUUID()}`;
  const saveId = `s6-${randomUUID()}`;

  afterAll(async () => {
    await pool.query('DELETE FROM game_saves WHERE id = $1 AND owner_id = $2', [saveId, ownerA]);
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
});
