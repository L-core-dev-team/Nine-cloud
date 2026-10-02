import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { DomainEvent, SaveEnvelope, TurnReceipt } from '@jiuxiao/contracts';
import { createNpcMemoryJournal, prepareNpcMemoryTurn, type NpcMemoryJournal } from '@jiuxiao/domain';
import { PostgresNpcMemoryTurnRepository } from './npc-memory-turn-transaction.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('PostgresNpcMemoryTurnRepository (TEST_DATABASE_URL)', () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const repository = new PostgresNpcMemoryTurnRepository(pool);
  const ownerId = 's4-owner-' + randomUUID();
  const saveId = 's4-save-' + randomUUID();

  function makeTurn(previousJournal: NpcMemoryJournal, expectedRevision: number): {
    event: DomainEvent;
    save: SaveEnvelope;
    receipt: TurnReceipt;
    previousJournal: NpcMemoryJournal;
    nextJournal: NpcMemoryJournal;
  } {
    const nextRevision = expectedRevision + 1;
    const event: DomainEvent = {
      id: randomUUID(),
      saveId,
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
        visibleSummary: '旅人抵达山门。',
      }],
      policyForNpc: () => 'accessibility-v1',
    });
    if (prepared.status !== 'prepared') throw new Error('Expected a prepared NPC journal.');

    const save: SaveEnvelope = {
      schemaVersion: 1,
      saveId,
      canonVersion: 'canon-test-v1',
      ruleVersion: 'rules-test-v1',
      memoryPolicyVersion: 'memory-test-v1',
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
      decision: { status: 'accepted', events: [event], nextRevision },
      resultingRevision: nextRevision,
    };
    return { event, save, receipt, previousJournal, nextJournal: prepared.journal };
  }

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
      '(id, owner_id, revision, schema_version, canon_version, rule_version, memory_policy_version, snapshot) ' +
      'VALUES ($1, $2, 0, 1, $3, $4, $5, $6::jsonb)',
      [saveId, ownerId, 'canon-test-v1', 'rules-test-v1', 'memory-test-v1',
        JSON.stringify({ playerId: 'player-s4-test', locationId: 'origin', elapsedMinutes: 0, facts: {} })],
    );

    const firstInput = makeTurn(createNpcMemoryJournal(saveId, 0), 0);
    const firstResult = await repository.commitAcceptedTurn({
      ownerId, expectedRevision: 0, ...firstInput, events: [firstInput.event],
    });
    if (firstResult.kind !== 'committed') throw new Error('First database turn did not commit.');
    expect(firstResult.save.revision).toBe(1);
    expect(await repository.getForOwner(ownerId, saveId)).toEqual(firstResult.journal);
    expect(await repository.getForOwner('another-owner', saveId)).toBeNull();

    // Use the exact in-memory journal returned by the first commit. PostgreSQL jsonb
    // may reorder object keys when read back, so persisted equality must be structural.
    const secondInput = makeTurn(firstResult.journal, 1);
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

    const [saveRows, eventRows, requestRows, journalRows] = await Promise.all([
      pool.query('SELECT revision FROM game_saves WHERE id = $1', [saveId]),
      pool.query('SELECT count(*)::integer AS count FROM turn_events WHERE save_id = $1', [saveId]),
      pool.query('SELECT count(*)::integer AS count FROM turn_requests WHERE save_id = $1', [saveId]),
      pool.query('SELECT revision FROM npc_memory_journals WHERE save_id = $1', [saveId]),
    ]);
    expect(saveRows.rows[0]?.revision).toBe(1);
    expect(eventRows.rows[0]?.count).toBe(1);
    expect(requestRows.rows[0]?.count).toBe(1);
    expect(journalRows.rows[0]?.revision).toBe(1);

    const secondResult = await repository.commitAcceptedTurn({
      ownerId, expectedRevision: 1, ...secondInput, events: [secondInput.event],
    });
    if (secondResult.kind !== 'committed') throw new Error('Second database turn did not commit.');
    expect(secondResult.save.revision).toBe(2);
    expect(await repository.getForOwner(ownerId, saveId)).toEqual(secondResult.journal);

    const replay = await repository.commitAcceptedTurn({
      ownerId, expectedRevision: 1, ...secondInput, events: [secondInput.event],
    });
    expect(replay).toEqual({ kind: 'duplicate', receipt: secondInput.receipt });
  });
});
