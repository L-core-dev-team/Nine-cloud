import type { DomainEvent, SaveEnvelope, TurnReceipt } from '@jiuxiao/contracts';
import { describe, expect, it } from 'vitest';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { createNpcMemoryJournal, prepareNpcMemoryTurn, type NpcMemoryJournal } from '@jiuxiao/domain';
import { PostgresNpcMemoryTurnRepository } from './npc-memory-turn-transaction.js';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

function fixture() {
  const event: DomainEvent = {
    id: EVENT_ID,
    saveId: 'save-1',
    type: 'travel.completed',
    beforeRevision: 0,
    afterRevision: 1,
    occurredAt: '2026-09-28T12:00:00.000Z',
    source: 'RULES',
    ruleVersion: 'rules-v1',
    payload: { destinationId: 'gate' },
  };
  const save: SaveEnvelope = {
    schemaVersion: 1,
    saveId: 'save-1',
    canonVersion: 'canon-v1',
    ruleVersion: 'rules-v1',
    memoryPolicyVersion: 'memory-v1',
    revision: 1,
    state: { playerId: 'player-1', locationId: 'gate', elapsedMinutes: 5, facts: {} },
  };
  const receipt: TurnReceipt = {
    idempotencyKey: '22222222-2222-4222-8222-222222222222',
    saveId: 'save-1',
    requestFingerprint: 'sha256:v1:' + 'a'.repeat(64),
    decision: { status: 'accepted', events: [event], nextRevision: 1 },
    resultingRevision: 1,
  };
  const previousJournal = createNpcMemoryJournal('save-1', 0);
  const prepared = prepareNpcMemoryTurn({
    journal: previousJournal,
    saveId: 'save-1',
    beforeRevision: 0,
    afterRevision: 1,
    events: [event],
    observedAtMinute: 5,
    grantsForEvent: current => [{
      npcId: 'npc-1',
      eventId: current.id,
      channel: 'reported',
      authorizationPolicyVersion: 'visibility-v1',
      authorizedFields: ['summary'],
      authorizedFacts: { summary: '旅人已抵达山门。' },
      visibleSummary: '旅人已抵达山门。',
    }],
    policyForNpc: () => 'accessibility-v1',
  });
  if (prepared.status !== 'prepared') throw new Error('Expected a prepared NPC journal.');
  return { event, save, receipt, previousJournal, nextJournal: prepared.journal, authorizedObservations: prepared.authorizedObservations };
}

class FakeTransactionClient {
  readonly statements: { sql: string; values: unknown[] }[] = [];
  revision = 0;
  schemaVersion = 1;
  memoryMode: string | null = null;
  memoryPolicyVersion = 'memory-v1';
  memoryPolicy: unknown | null = null;
  priorReceipt: unknown | null = null;
  storedJournal: unknown | null = null;
  failJournalWrite = false;
  failOutboxWrite = false;

  async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<QueryResult<Row>> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.statements.push({ sql: normalized, values });
    let rows: unknown[] = [];
    let rowCount: number | null = 0;

    if (normalized.startsWith('SELECT id, revision, schema_version')) {
      rows = [{ id: 'save-1', revision: this.revision, schema_version: this.schemaVersion,
        canon_artifact_hash: null,
        memory_mode: this.memoryMode, memory_policy_version: this.memoryPolicyVersion, memory_policy: this.memoryPolicy }];
    } else if (normalized.startsWith('SELECT result FROM turn_requests')) {
      rows = this.priorReceipt === null ? [] : [{ result: this.priorReceipt }];
    } else if (normalized.startsWith('SELECT revision, payload FROM npc_memory_journals')) {
      rows = this.storedJournal === null ? [] : [this.storedJournal];
    } else if (normalized.startsWith('SELECT COALESCE(MAX(sequence)')) {
      rows = [{ next_sequence: 0 }];
    } else if (normalized.startsWith('UPDATE game_saves')) {
      this.revision = Number(values[3]);
      rowCount = 1;
    } else if (normalized.startsWith('INSERT INTO npc_memory_journals')) {
      if (this.failJournalWrite) throw new Error('synthetic journal write failure');
      this.storedJournal = { revision: Number(values[1]), payload: JSON.parse(String(values[2])) };
      rowCount = 1;
    } else if (normalized.startsWith('INSERT INTO npc_authorized_observation_outbox')) {
      if (this.failOutboxWrite) throw new Error('synthetic outbox write failure');
      rowCount = 1;
    } else if (normalized.startsWith('INSERT INTO turn_requests') || normalized.startsWith('INSERT INTO turn_events')) {
      rowCount = 1;
    }
    return { rows, rowCount } as unknown as QueryResult<Row>;
  }

  release(): void {}
}

function repository(client: FakeTransactionClient): PostgresNpcMemoryTurnRepository {
  const pool = { connect: async () => client } as unknown as Pool;
  return new PostgresNpcMemoryTurnRepository(pool);
}

describe('PostgresNpcMemoryTurnRepository', () => {
  it('commits receipt, ordered events, save revision, and NPC journal in one transaction', async () => {
    const client = new FakeTransactionClient();
    const input = fixture();
    const result = await repository(client).commitAcceptedTurn({
      ownerId: 'owner-1',
      expectedRevision: 0,
      ...input,
      events: [input.event],
    });

    expect(result).toMatchObject({ kind: 'committed', save: { revision: 1 }, journal: { revision: 1 } });
    expect(client.statements[0]?.sql).toBe('BEGIN');
    expect(client.statements.at(-1)?.sql).toBe('COMMIT');
    expect(client.statements.some(statement => statement.sql.startsWith('INSERT INTO turn_requests'))).toBe(true);
    expect(client.statements.some(statement => statement.sql.startsWith('INSERT INTO turn_events'))).toBe(true);
    expect(client.statements.some(statement => statement.sql.startsWith('UPDATE game_saves'))).toBe(true);
    expect(client.statements.some(statement => statement.sql.startsWith('INSERT INTO npc_memory_journals'))).toBe(true);
    const outboxInsert = client.statements.find(statement => statement.sql.startsWith('INSERT INTO npc_authorized_observation_outbox'));
    expect(outboxInsert?.values[9]).toBe('unclassified');
    expect(outboxInsert?.values[11]).toBe('["summary"]');
    expect(outboxInsert?.values[12]).toBe('{"summary":"旅人已抵达山门。"}');
    expect(JSON.stringify(outboxInsert?.values)).not.toContain('destinationId');
    const eventInsert = client.statements.find(statement => statement.sql.startsWith('INSERT INTO turn_events'));
    expect(eventInsert?.sql).toContain('source, rule_version');
    expect(eventInsert?.values[5]).toBe('RULES');
    expect(eventInsert?.values[6]).toBe('rules-v1');
    expect(eventInsert?.values[11]).toBe('root');
  });

  it('returns an idempotent duplicate before comparing the now-advanced save revision', async () => {
    const client = new FakeTransactionClient();
    const input = fixture();
    client.revision = 1;
    client.priorReceipt = input.receipt;

    const result = await repository(client).commitAcceptedTurn({
      ownerId: 'owner-1',
      expectedRevision: 0,
      ...input,
      events: [input.event],
    });

    expect(result).toEqual({ kind: 'duplicate', receipt: input.receipt });
    expect(client.statements.some(statement => statement.sql.startsWith('INSERT INTO turn_events'))).toBe(false);
    expect(client.statements.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('does not partially persist if journal storage fails', async () => {
    const client = new FakeTransactionClient();
    client.failJournalWrite = true;
    const input = fixture();

    await expect(repository(client).commitAcceptedTurn({
      ownerId: 'owner-1',
      expectedRevision: 0,
      ...input,
      events: [input.event],
    })).rejects.toThrow('synthetic journal write failure');

    expect(client.statements.at(-1)?.sql).toBe('ROLLBACK');
    expect(client.statements.some(statement => statement.sql === 'COMMIT')).toBe(false);
  });

  it('fails the whole turn if the durable authorized-observation write fails', async () => {
    const client = new FakeTransactionClient();
    client.failOutboxWrite = true;
    const input = fixture();
    await expect(repository(client).commitAcceptedTurn({ ownerId: 'owner-1', expectedRevision: 0, ...input, events: [input.event] }))
      .rejects.toThrow('synthetic outbox write failure');
    expect(client.statements.at(-1)?.sql).toBe('ROLLBACK');
    expect(client.statements.some(statement => statement.sql === 'COMMIT')).toBe(false);
  });

  it('returns a revision conflict without writing events or memory', async () => {
    const client = new FakeTransactionClient();
    client.revision = 2;
    const input = fixture();

    const result = await repository(client).commitAcceptedTurn({
      ownerId: 'owner-1',
      expectedRevision: 0,
      ...input,
      events: [input.event],
    });

    expect(result).toEqual({ kind: 'conflict', currentRevision: 2 });
    expect(client.statements.some(statement => statement.sql.startsWith('INSERT INTO turn_events'))).toBe(false);
    expect(client.statements.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('rejects events and journals that do not match the accepted receipt before opening a transaction', async () => {
    const client = new FakeTransactionClient();
    const input = fixture();

    await expect(repository(client).commitAcceptedTurn({
      ownerId: 'owner-1',
      expectedRevision: 0,
      ...input,
      events: [],
    })).rejects.toThrow('Turn commit data');
    expect(client.statements).toEqual([]);

    const wrongJournal: NpcMemoryJournal = { ...input.nextJournal, revision: 2 };
    await expect(repository(client).commitAcceptedTurn({
      ownerId: 'owner-1',
      expectedRevision: 0,
      ...input,
      nextJournal: wrongJournal,
      events: [input.event],
    })).rejects.toThrow();
    expect(client.statements).toEqual([]);
  });

  it('persists a v2 envelope and its pinned policy in the same accepted-turn transaction', async () => {
    const client = new FakeTransactionClient();
    const input = fixture();
    const memoryPolicy = {
      mode: 'continue', policyVersion: 'continue-v1', schemaVersion: 1,
      clockBasis: 'game-minute+npc-grant-sequence-v1',
      policyArtifactHash: `sha256:${'a'.repeat(64)}`, cueDictionaryHash: `sha256:${'b'.repeat(64)}`,
      normalizerVersion: 'unicode-nfc-v1', retrievalVersion: 'exact-recall-v1',
      visibilityPolicyVersion: 'npc-visibility-v1', visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
      createdAtRevision: 0,
    } as const;
    const v2Save = { ...input.save, schemaVersion: 2 as const, memoryPolicyVersion: memoryPolicy.policyVersion,
      memoryMode: memoryPolicy.mode, memoryPolicy };
    client.schemaVersion = 2;
    client.memoryMode = memoryPolicy.mode;
    client.memoryPolicyVersion = memoryPolicy.policyVersion;
    client.memoryPolicy = memoryPolicy;

    const result = await repository(client).commitAcceptedTurn({
      ownerId: 'owner-1', expectedRevision: 0, ...input, save: v2Save, events: [input.event],
    });
    expect(result).toMatchObject({ kind: 'committed', save: { schemaVersion: 2, memoryMode: 'continue' } });
    const saveUpdate = client.statements.find(statement => statement.sql.startsWith('UPDATE game_saves'));
    expect(saveUpdate?.values[9]).toBe('continue');
    expect(saveUpdate?.values[10]).toBe(JSON.stringify(memoryPolicy));
  });

  it('fails closed before writes if a transaction tries to change a pinned policy', async () => {
    const client = new FakeTransactionClient();
    const input = fixture();
    const memoryPolicy = {
      mode: 'continue', policyVersion: 'continue-v1', schemaVersion: 1,
      clockBasis: 'game-minute+npc-grant-sequence-v1',
      policyArtifactHash: `sha256:${'a'.repeat(64)}`, cueDictionaryHash: `sha256:${'b'.repeat(64)}`,
      normalizerVersion: 'unicode-nfc-v1', retrievalVersion: 'exact-recall-v1',
      visibilityPolicyVersion: 'npc-visibility-v1', visibilityPolicyHash: `sha256:${'c'.repeat(64)}`,
      createdAtRevision: 0,
    } as const;
    client.schemaVersion = 2;
    client.memoryMode = memoryPolicy.mode;
    client.memoryPolicyVersion = memoryPolicy.policyVersion;
    client.memoryPolicy = memoryPolicy;
    const changedPolicy = { ...memoryPolicy, retrievalVersion: 'changed-retrieval-v2' };
    const v2Save = { ...input.save, schemaVersion: 2 as const, memoryPolicyVersion: memoryPolicy.policyVersion,
      memoryMode: memoryPolicy.mode, memoryPolicy: changedPolicy };

    await expect(repository(client).commitAcceptedTurn({
      ownerId: 'owner-1', expectedRevision: 0, ...input, save: v2Save, events: [input.event],
    })).rejects.toThrow('SAVE_MEMORY_POLICY_PINNED');
    expect(client.statements.some(statement => statement.sql.startsWith('INSERT INTO turn_events'))).toBe(false);
    expect(client.statements.at(-1)?.sql).toBe('ROLLBACK');
  });
});
