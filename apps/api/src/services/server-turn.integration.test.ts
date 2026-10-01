import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { ActionIntent } from '@jiuxiao/contracts';
import { ServerTurnService, type ServerTurnRules } from './server-turn.js';
import { createPostgresServerTurnRepository } from './postgres-server-turn.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite('ServerTurnService on isolated PostgreSQL (synthetic rules only)', () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const repository = createPostgresServerTurnRepository(pool);
  const owner = 'turn-fixture-owner-' + randomUUID(); const saveId = 'turn-fixture-save-' + randomUUID();
  const intent: ActionIntent = { kind: 'move', saveId, actorId: 'fixture-player', expectedRevision: 0,
    idempotencyKey: randomUUID(), payload: { destinationId: 'fixture-gate' } };
  const rules: ServerTurnRules = {
    ruleVersion: 'fixture-only', canonVersion: 'fixture-only', memoryPolicyVersion: 'fixture-only',
    decide: (_, save) => ({ status: 'accepted', nextRevision: save.revision + 1,
      events: [{ id: randomUUID(), saveId, type: 'fixture.travel', beforeRevision: save.revision, afterRevision: save.revision + 1,
        source: 'RULES', ruleVersion: save.ruleVersion, occurredAt: new Date().toISOString(), payload: { destinationId: 'fixture-gate' } }] }),
    reduce: state => ({ ...state, locationId: 'fixture-gate', elapsedMinutes: state.elapsedMinutes + 1 }),
    grantsForEvent: event => [{ npcId: 'visible-fixture-npc', eventId: event.id, channel: 'witnessed', visibleSummary: 'Public fixture event.' }],
    policyForNpc: () => 'exact-recall-v1',
  };
  afterAll(async () => {
    await pool.query('DELETE FROM turn_events WHERE save_id = $1', [saveId]);
    await pool.query('DELETE FROM turn_requests WHERE save_id = $1', [saveId]);
    await pool.query('DELETE FROM game_saves WHERE id = $1 AND owner_id = $2', [saveId, owner]);
    await pool.end();
  });
  it('commits state, events, receipt and visible memory once, even when ten clients race and narration fails', async () => {
    await pool.query('INSERT INTO game_saves (id, owner_id, revision, schema_version, canon_version, rule_version, memory_policy_version, snapshot) VALUES ($1, $2, 0, 1, $3, $3, $3, $4::jsonb)',
      [saveId, owner, 'fixture-only', JSON.stringify({ playerId: 'fixture-player', locationId: 'origin', elapsedMinutes: 0, facts: { privateFixture: 'do-not-disclose' } })]);
    const service = new ServerTurnService(repository, rules, async () => { throw new Error('provider-private-detail'); });
    const results = await Promise.all(Array.from({ length: 10 }, () => service.execute(owner, intent, true)));
    expect(results.every(result => result.status === 'accepted')).toBe(true);
    expect(results.filter(result => result.status === 'accepted' && !result.duplicate)).toHaveLength(1);
    expect(JSON.stringify(results)).not.toContain('provider-private-detail');
    expect(await repository.loadSave(owner, saveId)).toMatchObject({ revision: 1, state: { elapsedMinutes: 1, locationId: 'fixture-gate' } });
    const journal = await repository.getForOwner(owner, saveId);
    expect(journal?.memories).toHaveLength(1); expect(journal?.memories[0]?.observations).toHaveLength(1);
    expect(JSON.stringify(journal)).not.toContain('do-not-disclose');
    const counts = await pool.query('SELECT (SELECT count(*)::int FROM turn_requests WHERE save_id = $1) AS requests, (SELECT count(*)::int FROM turn_events WHERE save_id = $1) AS events', [saveId]);
    expect(counts.rows[0]).toEqual({ requests: 1, events: 1 });
    expect(await repository.getReceiptForOwner('another-owner', saveId, intent.idempotencyKey)).toBeNull();
    expect(await service.execute('another-owner', intent)).toEqual({ status: 'not_found' });
    expect(await service.execute(owner, { ...intent, payload: { destinationId: 'changed' } })).toEqual({ status: 'idempotency_conflict' });
  });
  it('resumes from the persisted receipt after service restart, without advancing state again', async () => {
    const restarted = new ServerTurnService(createPostgresServerTurnRepository(pool), rules, async () => 'Presentation recovered.');
    expect(await restarted.execute(owner, intent, true)).toMatchObject({ status: 'accepted', duplicate: true, receipt: { resultingRevision: 1 }, narrative: { status: 'received' } });
    expect(await repository.loadSave(owner, saveId)).toMatchObject({ revision: 1 });
    expect(await new ServerTurnService(repository).execute(owner, { ...intent, expectedRevision: 1, idempotencyKey: randomUUID() })).toEqual({ status: 'rules_not_ready' });
    expect(await repository.loadSave(owner, saveId)).toMatchObject({ revision: 1 });
  });
});
