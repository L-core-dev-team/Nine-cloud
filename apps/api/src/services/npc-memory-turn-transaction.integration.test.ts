import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { Pool } from 'pg';
import type { DomainEvent, SaveEnvelope, TurnReceipt } from '@jiuxiao/contracts';
import { createNpcMemoryJournal, prepareNpcMemoryTurn, type NpcMemoryJournal } from '@jiuxiao/domain';
import { PostgresNpcMemoryTurnRepository } from './npc-memory-turn-transaction.js';
import { AuthoritativeGameService } from './authoritative-game.js';
import { NPC_MEMORY_RECALL_POLICY } from './npc-memory-recall.js';
import { mountGames } from '../routes/games.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const memoryPolicy = {
  mode: 'continue' as const,
  policyVersion: 'continue-v1',
  schemaVersion: 1,
  clockBasis: 'game-minute+npc-grant-sequence-v1' as const,
  policyArtifactHash: `sha256:${'a'.repeat(64)}`,
  cueDictionaryHash: `sha256:${'b'.repeat(64)}`,
  normalizerVersion: 'unicode-nfc-v1',
  retrievalVersion: 'exact-recall-v1',
  visibilityPolicyVersion: 'npc-visibility-v1',
  visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
  createdAtRevision: 0,
};

suite('PostgresNpcMemoryTurnRepository (TEST_DATABASE_URL)', () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const repository = new PostgresNpcMemoryTurnRepository(pool);
  const ownerId = 's4-owner-' + randomUUID();
  const saveId = 's4-save-' + randomUUID();

  function makeTurn(previousJournal: NpcMemoryJournal, expectedRevision: number, supersedeGrantId?: string): {
    event: DomainEvent;
    save: SaveEnvelope;
    receipt: TurnReceipt;
    previousJournal: NpcMemoryJournal;
    nextJournal: NpcMemoryJournal;
    authorizedObservations: import('@jiuxiao/domain').AuthorizedObservationOutboxRecord[];
    authorizedSupersessions: import('@jiuxiao/domain').AuthorizedObservationSupersessionRecord[];
  } {
    const nextRevision = expectedRevision + 1;
    const event: DomainEvent = {
      id: randomUUID(),
      saveId,
      branchId: 'root',
      type: 'travel.completed',
      beforeRevision: expectedRevision,
      afterRevision: nextRevision,
      occurredAt: new Date().toISOString(),
      source: 'RULES',
      ruleVersion: 'rules-test-v1',
      payload: { destinationId: 'gate-' + nextRevision },
    };
    const prepared = prepareNpcMemoryTurn({
      journal: previousJournal,
      saveId,
      beforeRevision: expectedRevision,
      afterRevision: nextRevision,
      events: [event],
      observedAtMinute: nextRevision * 5,
      grantsForEvent: current => [{
        npcId: 'npc-s4-test',
        eventId: current.id,
        channel: 'reported',
        authorizationPolicyVersion: 'visibility-v1',
        authorizedFields: ['summary'],
        authorizedFacts: { summary: '旅人抵达山门。' },
        visibleSummary: '旅人抵达山门。',
        memoryClass: 'current-state',
      }],
      ...(supersedeGrantId ? { supersessionsForEvent: () => [{ npcId: 'npc-s4-test', observationGrantId: supersedeGrantId,
        kind: 'premise-revised' as const, reason: '规则事件确认当前状态已改变。', policyVersion: 'recall-v1' }] } : {}),
      policyForNpc: () => 'accessibility-v1',
    });
    if (prepared.status !== 'prepared') throw new Error('Expected a prepared NPC journal.');

    const save: SaveEnvelope = {
      schemaVersion: 2,
      saveId,
      canonVersion: 'canon-test-v1',
      ruleVersion: 'rules-test-v1',
      memoryPolicyVersion: memoryPolicy.policyVersion,
      memoryMode: memoryPolicy.mode,
      memoryPolicy,
      revision: nextRevision,
      state: {
        playerId: 'player-s4-test',
        locationId: 'gate-' + nextRevision,
        elapsedMinutes: nextRevision * 5,
        facts: {},
      },
    };
    const receipt: TurnReceipt = {
      idempotencyKey: randomUUID(),
      saveId,
      requestFingerprint: 'sha256:v1:' + 'a'.repeat(64),
      branchId: 'root',
      rulesVersion: 'rules-test-v1',
      clockMinute: nextRevision * 5,
      rng: { seed: null, draws: 0 },
      decision: { status: 'accepted', outcome: 'success', events: [event], nextRevision },
      resultingRevision: nextRevision,
    };
    return { event, save, receipt, previousJournal, nextJournal: prepared.journal,
      authorizedObservations: [...prepared.authorizedObservations], authorizedSupersessions: [...prepared.authorizedSupersessions] };
  }

  beforeAll(async()=>{for(const id of [ownerId])await pool.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,id+'@fixture.invalid']);});
  afterAll(async () => {
    await pool.query('DROP TRIGGER IF EXISTS jiuxiao_test_reject_memory_write ON npc_memory_journals').catch(() => undefined);
    await pool.query('DROP FUNCTION IF EXISTS jiuxiao_test_reject_memory_write()').catch(() => undefined);
    { const client = await pool.connect(); try { await client.query('BEGIN'); await client.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");
      await client.query('DELETE FROM turn_events WHERE save_id = $1', [saveId]).catch(() => undefined);
      await client.query('DELETE FROM turn_requests WHERE save_id = $1', [saveId]).catch(() => undefined);
      await client.query('DELETE FROM game_saves WHERE id = $1 AND owner_id = $2', [saveId, ownerId]).catch(() => undefined);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); } finally { client.release(); } }
    await pool.end();
  });

  it('round-trips JSONB journals, retries idempotently, and rolls back a failed projection', async () => {
    await pool.query(
      'INSERT INTO game_saves ' +
      '(id, owner_id, revision, schema_version, canon_version, rule_version, memory_policy_version, memory_mode, memory_policy, snapshot) ' +
      'VALUES ($1, $2, 0, 2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)',
      [saveId, ownerId, 'canon-test-v1', 'rules-test-v1', memoryPolicy.policyVersion, memoryPolicy.mode,
        JSON.stringify(memoryPolicy), JSON.stringify({ playerId: 'player-s4-test', locationId: 'origin', elapsedMinutes: 0, facts: {} })],
    );

    const firstInput = makeTurn(createNpcMemoryJournal(saveId, 0), 0);
    const firstResult = await repository.commitAcceptedTurn({
      ownerId, expectedRevision: 0, ...firstInput, events: [firstInput.event],
    });
    if (firstResult.kind !== 'committed') throw new Error('First database turn did not commit.');
    expect(firstResult.save.revision).toBe(1);
    expect(firstResult.save).toMatchObject({ schemaVersion: 2, memoryMode: 'continue', memoryPolicy });
    expect((await pool.query('SELECT branch_id FROM turn_events WHERE save_id=$1', [saveId])).rows).toEqual([{ branch_id: 'root' }]);
    await expect(pool.query(
      `INSERT INTO turn_events (id,save_id,idempotency_key,sequence,event_type,source,rule_version,before_revision,after_revision,payload,occurred_at,branch_id)
       SELECT $1,save_id,idempotency_key || '-invalid-branch',sequence+1,event_type,source,rule_version,before_revision,after_revision,payload,occurred_at,'branch-preview'
       FROM turn_events WHERE save_id=$2 LIMIT 1`,
      [`invalid-branch-${randomUUID()}`, saveId],
    )).rejects.toThrow('turn_events_branch_id_check');
    expect(await repository.getForOwner(ownerId, saveId)).toEqual(firstResult.journal);
    expect(await repository.getForOwner('another-owner', saveId)).toBeNull();
    const observations = await repository.getAuthorizedObservationPage(ownerId, saveId, 'npc-s4-test', undefined, 1);
    expect(observations.items).toMatchObject([{ grantIdVersion: 2, eventId: firstInput.event.id, memoryClass: 'current-state', authorizedFacts: { summary: '旅人抵达山门。' } }]);
    expect(observations.nextCursor).toBeNull();
    expect(await repository.getAuthorizedObservationPage('another-owner', saveId, 'npc-s4-test')).toMatchObject({ items: [], nextCursor: null });

    const outbox = observations.items[0];
    if (!outbox) throw new Error('Expected one durable authorized observation.');
    await expect(pool.query('UPDATE npc_authorized_observation_outbox SET summary=$2 WHERE grant_id=$1', [outbox.grantId, '篡改']))
      .rejects.toThrow('AUTHORIZED_OBSERVATION_IMMUTABLE');
    await expect(pool.query('DELETE FROM npc_authorized_observation_outbox WHERE grant_id=$1', [outbox.grantId]))
      .rejects.toThrow('AUTHORIZED_OBSERVATION_ERASURE_REQUIRED');
    const spoof = await pool.connect();
    try {
      await spoof.query('BEGIN');
      await spoof.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)", [randomUUID()]);
      await expect(spoof.query('DELETE FROM npc_authorized_observation_outbox WHERE grant_id=$1', [outbox.grantId]))
        .rejects.toThrow('AUTHORIZED_OBSERVATION_ERASURE_REQUIRED');
      await spoof.query('ROLLBACK');
    } catch (error) {
      await spoof.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { spoof.release(); }

    // Use the exact in-memory journal returned by the first commit. PostgreSQL jsonb
    // may reorder object keys when read back, so persisted equality must be structural.
    const secondInput = makeTurn(firstResult.journal, 1, firstInput.authorizedObservations[0]!.grantId);
    await pool.query(
      'CREATE FUNCTION jiuxiao_test_reject_memory_write() RETURNS trigger LANGUAGE plpgsql ' +
      'AS $$ BEGIN IF NEW.save_id = TG_ARGV[0] THEN RAISE EXCEPTION \'forced journal failure\'; END IF; RETURN NEW; END; $$',
    );
    await pool.query(
      'CREATE TRIGGER jiuxiao_test_reject_memory_write BEFORE INSERT OR UPDATE ON npc_memory_journals ' +
      // Only fail this fixture; parallel suites share the isolated test database.
      `FOR EACH ROW EXECUTE FUNCTION jiuxiao_test_reject_memory_write('${saveId}')`,
    );
    try {
      await expect(repository.commitAcceptedTurn({
        ownerId, expectedRevision: 1, ...secondInput, events: [secondInput.event],
      })).rejects.toThrow('forced journal failure');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS jiuxiao_test_reject_memory_write ON npc_memory_journals');
      await pool.query('DROP FUNCTION IF EXISTS jiuxiao_test_reject_memory_write()');
    }

    const [saveRows, eventRows, requestRows, journalRows, outboxRows] = await Promise.all([
      pool.query('SELECT revision FROM game_saves WHERE id = $1', [saveId]),
      pool.query('SELECT count(*)::integer AS count FROM turn_events WHERE save_id = $1', [saveId]),
      pool.query('SELECT count(*)::integer AS count FROM turn_requests WHERE save_id = $1', [saveId]),
      pool.query('SELECT revision FROM npc_memory_journals WHERE save_id = $1', [saveId]),
      pool.query('SELECT count(*)::integer AS count FROM npc_authorized_observation_outbox WHERE save_id = $1', [saveId]),
    ]);
    expect(saveRows.rows[0]?.revision).toBe(1);
    expect(eventRows.rows[0]?.count).toBe(1);
    expect(requestRows.rows[0]?.count).toBe(1);
    expect(journalRows.rows[0]?.revision).toBe(1);
    expect(outboxRows.rows[0]?.count).toBe(1);

    const secondResult = await repository.commitAcceptedTurn({
      ownerId, expectedRevision: 1, ...secondInput, events: [secondInput.event],
    });
    if (secondResult.kind !== 'committed') throw new Error('Second database turn did not commit.');
    expect(secondResult.save.revision).toBe(2);
    expect(await repository.getForOwner(ownerId, saveId)).toEqual(secondResult.journal);
    const secondPage = await repository.getAuthorizedObservationPage(ownerId, saveId, 'npc-s4-test', {
      eventRevision: 1, grantId: firstInput.authorizedObservations[0]!.grantId,
    });
    expect(secondPage.items.map(item => item.eventId)).toEqual([secondInput.event.id]);

    const firstRevisionPage = await repository.getAuthorizedObservationPage(ownerId, saveId, 'npc-s4-test', undefined, 10, 1);
    expect(firstRevisionPage.items).toMatchObject([{ eventId: firstInput.event.id, supersessions: [] }]);
    const secondRevisionPage = await repository.getAuthorizedObservationPage(ownerId, saveId, 'npc-s4-test', undefined, 10, 2);
    expect(secondRevisionPage.items).toMatchObject([
      { eventId: firstInput.event.id, supersessions: [{ supersededAtRevision: 2, supersededByEventId: secondInput.event.id }] },
      { eventId: secondInput.event.id, supersessions: [] },
    ]);

    const replay = await repository.commitAcceptedTurn({
      ownerId, expectedRevision: 1, ...secondInput, events: [secondInput.event],
    });
    expect(replay).toEqual({ kind: 'duplicate', receipt: secondInput.receipt });
  });

  it('recalls a committed authorized observation through the read-only endpoint', async () => {
    const recallOwnerId = 's4-owner-' + randomUUID();
    const recallSaveId = 's4-save-' + randomUUID();
    const recallEventId = randomUUID();
    const recallNpcId = 'npc-s4-recall';
    const grantId = [recallSaveId, 'root', recallEventId, recallNpcId].map(part => `${part.length}:${part}`).join('');
    const recallPolicy = {
      mode: 'continue', policyVersion: NPC_MEMORY_RECALL_POLICY.retrievalVersion, schemaVersion: 1,
      clockBasis: 'game-minute+npc-grant-sequence-v1' as const,
      policyArtifactHash: NPC_MEMORY_RECALL_POLICY.policyArtifactHash,
      cueDictionaryHash: NPC_MEMORY_RECALL_POLICY.cueDictionaryHash,
      normalizerVersion: NPC_MEMORY_RECALL_POLICY.normalizerVersion,
      retrievalVersion: NPC_MEMORY_RECALL_POLICY.retrievalVersion,
      visibilityPolicyVersion: 'visibility-v1', visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
      createdAtRevision: 0,
    };
    await pool.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING', [recallOwnerId, recallOwnerId + '@fixture.invalid']);
    await pool.query(
      'INSERT INTO game_saves ' +
      '(id, owner_id, revision, schema_version, canon_version, rule_version, memory_policy_version, memory_mode, memory_policy, snapshot) ' +
      'VALUES ($1, $2, 2, 2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)',
      [recallSaveId, recallOwnerId, 'canon-test-v1', 'rules-test-v1', recallPolicy.policyVersion, 'continue',
        JSON.stringify(recallPolicy),
        JSON.stringify({ playerId: 'player-s4-test', locationId: 'ferry', elapsedMinutes: 30, facts: { gameMinute: 30 } })],
    );
    await pool.query(
      'INSERT INTO turn_events ' +
      '(id,save_id,idempotency_key,sequence,event_type,source,rule_version,before_revision,after_revision,payload,occurred_at,branch_id) ' +
      'VALUES ($1,$2,$3,0,\'PLAYER_ARRIVED\',\'RULES\',\'rules-test-v1\',0,1,$4::jsonb,$5,\'root\')',
      [recallEventId, recallSaveId, 'fixture-' + recallEventId,
        JSON.stringify({ destinationId: 'ferry' }), '2026-10-05T12:00:00.000Z'],
    );
    await pool.query(
      'INSERT INTO npc_authorized_observation_outbox ' +
      '(grant_id,grant_id_version,save_id,branch_id,npc_id,event_id,event_revision,observed_at_minute,channel,memory_class,' +
      'authorization_policy_version,authorized_fields,authorized_facts,summary) ' +
      'VALUES ($1,1,$2,\'root\',$3,$4,1,18,\'witnessed\',\'historical-event\',\'visibility-v1\',$5::jsonb,$6::jsonb,$7)',
      [grantId, recallSaveId, recallNpcId, recallEventId, JSON.stringify(['summary']),
        JSON.stringify({ summary: '林月曾在中州渡口救下旅人。' }), '林月曾在中州渡口救下旅人。'],
    );
    const games = new AuthoritativeGameService({
      getForOwner: async (owner, id) => {
        const row = (await pool.query(
          'SELECT revision, schema_version, canon_version, rule_version, memory_policy_version, memory_mode, memory_policy, snapshot ' +
          'FROM game_saves WHERE id=$1 AND owner_id=$2', [id, owner])).rows[0];
        if (!row) return null;
        return {
          schemaVersion: Number(row.schema_version), saveId: id,
          canonVersion: row.canon_version, ruleVersion: row.rule_version,
          memoryPolicyVersion: row.memory_policy_version,
          memoryMode: row.memory_mode, memoryPolicy: row.memory_policy,
          revision: Number(row.revision), state: row.snapshot,
        } as SaveEnvelope;
      },
      createForOwner: async () => false,
    });
    const app = new Hono();
    mountGames(app, games, { resolveOwnerId: async () => recallOwnerId }, undefined, {
      reader: (owner, id, npc, cursor, limit, throughRevision) =>
        repository.getAuthorizedObservationPage(owner, id, npc, cursor, limit, throughRevision),
    });
    const recallUrl = `/api/games/${recallSaveId}/npcs/${recallNpcId}/memory-recall?utterance=${encodeURIComponent('你还记得中州渡口吗？')}`;
    const found = await app.request(recallUrl);
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({
      recall: { kind: 'evidence', recall: { status: 'complete', slot: 'historical-event', authorizedFacts: { summary: '林月曾在中州渡口救下旅人。' } } },
    });

    // A forgetting save refuses honestly at the route boundary instead of degrading.
    // Memory mode is pinned at creation for schema-2 saves, so the refusal save is
    // created in forgetting mode rather than toggling the pinned first save.
    const refusedSaveId = 's4-save-' + randomUUID();
    await pool.query(
      'INSERT INTO game_saves ' +
      '(id, owner_id, revision, schema_version, canon_version, rule_version, memory_policy_version, memory_mode, memory_policy, snapshot) ' +
      'VALUES ($1, $2, 2, 2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)',
      [refusedSaveId, recallOwnerId, 'canon-test-v1', 'rules-test-v1', recallPolicy.policyVersion, 'forgetting',
        JSON.stringify(recallPolicy),
        JSON.stringify({ playerId: 'player-s4-test', locationId: 'ferry', elapsedMinutes: 30, facts: { gameMinute: 30 } })],
    );
    const refusedUrl = `/api/games/${refusedSaveId}/npcs/${recallNpcId}/memory-recall?utterance=${encodeURIComponent('你还记得中州渡口吗？')}`;
    const refused = await app.request(refusedUrl);
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ code: 'RECALL_MODE_UNAVAILABLE' });

    const foreign = await app.request(recallUrl, { headers: { 'x-jiuxiao-account': 'other-owner' } });
    expect(foreign.status).toBe(401);

    { const cleanup = await pool.connect(); try {
      await cleanup.query('BEGIN');
      await cleanup.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");
      await cleanup.query('DELETE FROM npc_authorized_observation_outbox WHERE save_id=$1', [recallSaveId]);
      await cleanup.query('DELETE FROM game_saves WHERE id=$1 AND owner_id=$2', [recallSaveId, recallOwnerId]);
      await cleanup.query('DELETE FROM game_saves WHERE id=$1 AND owner_id=$2', [refusedSaveId, recallOwnerId]);
      await cleanup.query('COMMIT');
    } catch { await cleanup.query('ROLLBACK').catch(() => undefined); } finally { cleanup.release(); } }
  });
});
