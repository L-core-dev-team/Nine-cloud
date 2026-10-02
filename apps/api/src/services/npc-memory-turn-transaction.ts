import {
  DomainEventSchema,
  SaveEnvelopeSchema,
  TurnReceiptSchema,
  type DomainEvent,
  type SaveEnvelope,
  type TurnReceipt,
} from '@jiuxiao/contracts';
import {
  createNpcMemoryJournal,
  parseNpcMemoryJournalJson,
  type NpcMemoryJournal,
} from '@jiuxiao/domain';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

type Database = Pick<Pool, 'connect' | 'query'>;

interface SaveRow extends QueryResultRow {
  id: string;
  revision: number;
}

interface ReceiptRow extends QueryResultRow {
  result: unknown;
}

interface JournalRow extends QueryResultRow {
  revision: number;
  payload: unknown;
}

interface SequenceRow extends QueryResultRow {
  next_sequence: number;
}

interface LoadedJournalRow extends QueryResultRow {
  save_revision: number;
  journal_revision: number | null;
  journal_payload: unknown | null;
}

export type AcceptedTurnCommitInput = {
  ownerId: string;
  expectedRevision: number;
  receipt: TurnReceipt;
  save: SaveEnvelope;
  events: readonly DomainEvent[];
  previousJournal: NpcMemoryJournal;
  nextJournal: NpcMemoryJournal;
};

export type AcceptedTurnCommitResult =
  | { kind: 'committed'; receipt: TurnReceipt; save: SaveEnvelope; journal: NpcMemoryJournal }
  | { kind: 'duplicate'; receipt: TurnReceipt }
  | { kind: 'conflict'; currentRevision: number }
  | { kind: 'memory_conflict'; currentRevision: number }
  | { kind: 'idempotency_conflict' }
  | { kind: 'not_found' };

type NormalizedCommit = Omit<AcceptedTurnCommitInput, 'ownerId' | 'receipt' | 'save' | 'events' | 'previousJournal' | 'nextJournal'> & {
  ownerId: string;
  receipt: TurnReceipt;
  save: SaveEnvelope;
  events: DomainEvent[];
  previousJournal: NpcMemoryJournal;
  nextJournal: NpcMemoryJournal;
};

/**
 * Persists one already-authorized RULES turn and its NPC-visible memory projection
 * in the same PostgreSQL transaction. The caller must prepare the receipt, events,
 * and journal on the server; this repository never decides gameplay or visibility.
 */
export class PostgresNpcMemoryTurnRepository {
  constructor(private readonly database: Database, private readonly requiresLiveAccount = false,private readonly guard?: (client:PoolClient,commit:AcceptedTurnCommitInput)=>Promise<void>) {}

  async getReceiptForOwner(ownerId: string, saveId: string, requestId: string): Promise<TurnReceipt | null> {
    const owner = normalizeOwnerId(ownerId);
    if (!isValidId(saveId) || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new TypeError('Invalid turn identity');
    const result = await this.database.query<ReceiptRow>(
      'SELECT r.result FROM turn_requests r JOIN game_saves s ON s.id = r.save_id ' +
      'WHERE r.save_id = $1 AND s.owner_id = $2 AND r.idempotency_key = $3 ' +
      'AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = s.id) LIMIT 1',
      [saveId, owner, requestId],
    );
    if (!result.rows[0]) return null;
    return TurnReceiptSchema.parse(result.rows[0].result);
  }
  async getForOwner(ownerId: string, saveId: string): Promise<NpcMemoryJournal | null> {
    const owner = normalizeOwnerId(ownerId);
    if (!isValidId(saveId)) throw new TypeError('Save ID is invalid.');

    const result = await this.database.query<LoadedJournalRow>(
      'SELECT s.revision AS save_revision, j.revision AS journal_revision, j.payload AS journal_payload ' +
      'FROM game_saves s LEFT JOIN npc_memory_journals j ON j.save_id = s.id ' +
      'WHERE s.id = $1 AND s.owner_id = $2 LIMIT 1',
      [saveId, owner],
    );
    const row = result.rows[0];
    if (!row) return null;

    const saveRevision = Number(row.save_revision);
    if (!Number.isSafeInteger(saveRevision) || saveRevision < 0) {
      throw new Error('Stored save revision is invalid.');
    }
    if (row.journal_payload === null || row.journal_payload === undefined) {
      return createNpcMemoryJournal(saveId, saveRevision);
    }

    const journal = parseJournal(row.journal_payload);
    if (Number(row.journal_revision) !== saveRevision || journal.revision !== saveRevision || journal.saveId !== saveId) {
      throw new Error('NPC memory journal is not aligned with the saved revision.');
    }
    return journal;
  }

  async commitAcceptedTurn(input: AcceptedTurnCommitInput): Promise<AcceptedTurnCommitResult> {
    const commit = normalizeCommit(input);
    const client = await this.database.connect();
    let inTransaction = false;

    try {
      await client.query('BEGIN');
      inTransaction = true;
      if (this.requiresLiveAccount && !(await client.query('SELECT id FROM auth_accounts WHERE id=$1 AND closed_at IS NULL '+(this.guard?'FOR UPDATE':'FOR KEY SHARE'), [commit.ownerId])).rowCount) {
        return await rollbackWith(client, () => { inTransaction = false; return { kind: 'not_found' }; });
      }

      const locked = await client.query<SaveRow>(
        'SELECT id, revision FROM game_saves WHERE id = $1 AND owner_id = $2 FOR UPDATE',
        [commit.save.saveId, commit.ownerId],
      );
      const current = locked.rows[0];
      if (!current) return await rollbackWith(client, () => { inTransaction = false; return { kind: 'not_found' }; });

      // Check a prior receipt before revision conflicts so a lost response can be retried safely.
      const priorResult = await client.query<ReceiptRow>(
        'SELECT result FROM turn_requests WHERE save_id = $1 AND idempotency_key = $2 LIMIT 1',
        [commit.save.saveId, commit.receipt.idempotencyKey],
      );
      const prior = priorResult.rows[0];
      if (prior) {
        if (prior.result === null || prior.result === undefined) {
          return await rollbackWith(client, () => { inTransaction = false; return { kind: 'idempotency_conflict' }; });
        }
        const parsedPrior = TurnReceiptSchema.safeParse(prior.result);
        if (!parsedPrior.success) throw new Error('Stored turn receipt is invalid.');
        if (parsedPrior.data.saveId !== commit.save.saveId ||
          parsedPrior.data.requestFingerprint !== commit.receipt.requestFingerprint) {
          return await rollbackWith(client, () => { inTransaction = false; return { kind: 'idempotency_conflict' }; });
        }
        return await rollbackWith(client, () => { inTransaction = false; return { kind: 'duplicate', receipt: parsedPrior.data }; });
      }

      const currentRevision = Number(current.revision);
      if (currentRevision !== commit.expectedRevision) {
        return await rollbackWith(client, () => {
          inTransaction = false;
          return { kind: 'conflict', currentRevision };
        });
      }

      await this.guard?.(client,commit);
      const journalResult = await client.query<JournalRow>(
        'SELECT revision, payload FROM npc_memory_journals WHERE save_id = $1 FOR UPDATE',
        [commit.save.saveId],
      );
      const storedJournal = journalResult.rows[0];
      if (storedJournal) {
        const parsedJournal = parseJournal(storedJournal.payload);
        if (Number(storedJournal.revision) !== commit.expectedRevision ||
          parsedJournal.revision !== commit.expectedRevision ||
          canonicalJson(parsedJournal) !== canonicalJson(commit.previousJournal)) {
          return await rollbackWith(client, () => {
            inTransaction = false;
            return { kind: 'memory_conflict', currentRevision };
          });
        }
      } else if (commit.previousJournal.memories.length > 0 || commit.previousJournal.lastTurn !== null) {
        return await rollbackWith(client, () => {
          inTransaction = false;
          return { kind: 'memory_conflict', currentRevision };
        });
      }

      const sequence = await client.query<SequenceRow>(
        'SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence FROM turn_events WHERE save_id = $1',
        [commit.save.saveId],
      );
      let nextSequence = Number(sequence.rows[0]?.next_sequence);
      if (!Number.isSafeInteger(nextSequence) || nextSequence < 0) {
        throw new Error('Stored event sequence is invalid.');
      }

      await client.query(
        'INSERT INTO turn_requests (save_id, idempotency_key, expected_revision, result) VALUES ($1, $2, $3, $4::jsonb)',
        [commit.save.saveId, commit.receipt.idempotencyKey, commit.expectedRevision, JSON.stringify(commit.receipt)],
      );

      for (const event of commit.events) {
        await client.query(
          'INSERT INTO turn_events ' +
          '(id, save_id, idempotency_key, sequence, event_type, source, rule_version, before_revision, after_revision, payload, occurred_at) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)',
          [event.id, event.saveId, commit.receipt.idempotencyKey, nextSequence, event.type, event.source,
            event.ruleVersion, event.beforeRevision, event.afterRevision, JSON.stringify(event.payload), event.occurredAt],
        );
        nextSequence += 1;
      }

      const updated = await client.query(
        'UPDATE game_saves SET revision = $4, schema_version = $5, canon_version = $6, rule_version = $7, ' +
        'memory_policy_version = $8, snapshot = $9::jsonb, updated_at = now() ' +
        'WHERE id = $1 AND owner_id = $2 AND revision = $3',
        [commit.save.saveId, commit.ownerId, commit.expectedRevision, commit.save.revision,
          commit.save.schemaVersion, commit.save.canonVersion, commit.save.ruleVersion,
          commit.save.memoryPolicyVersion, JSON.stringify(commit.save.state)],
      );
      if (updated.rowCount !== 1) throw new Error('Save changed while its accepted turn was being committed.');

      await client.query(
        'INSERT INTO npc_memory_journals (save_id, schema_version, revision, payload, updated_at) ' +
        'VALUES ($1, 1, $2, $3::jsonb, now()) ' +
        'ON CONFLICT (save_id) DO UPDATE SET schema_version = EXCLUDED.schema_version, ' +
        'revision = EXCLUDED.revision, payload = EXCLUDED.payload, updated_at = now()',
        [commit.save.saveId, commit.nextJournal.revision, JSON.stringify(commit.nextJournal)],
      );

      await client.query('COMMIT');
      inTransaction = false;
      return { kind: 'committed', receipt: commit.receipt, save: commit.save, journal: commit.nextJournal };
    } catch (error) {
      if (inTransaction) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original failure; PostgreSQL will discard an open transaction on release.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

function normalizeCommit(input: AcceptedTurnCommitInput): NormalizedCommit {
  if (!input || typeof input !== 'object') throw new TypeError('Turn commit input is required.');
  const ownerId = normalizeOwnerId(input.ownerId);
  const save = SaveEnvelopeSchema.parse(input.save);
  const receipt = TurnReceiptSchema.parse(input.receipt);
  const events = input.events.map(event => DomainEventSchema.parse(event));
  const previousJournal = parseJournal(input.previousJournal);
  const nextJournal = parseJournal(input.nextJournal);

  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
    save.revision !== input.expectedRevision + 1 ||
    receipt.saveId !== save.saveId ||
    receipt.resultingRevision !== save.revision ||
    receipt.decision.status !== 'accepted' ||
    receipt.decision.nextRevision !== save.revision ||
    previousJournal.saveId !== save.saveId ||
    previousJournal.revision !== input.expectedRevision ||
    nextJournal.saveId !== save.saveId ||
    nextJournal.revision !== save.revision ||
    events.length === 0 ||
    canonicalJson(events) !== canonicalJson(receipt.decision.events)) {
    throw new TypeError('Turn commit data does not describe one accepted save transition.');
  }

  const eventIds: string[] = [];
  for (const event of events) {
    if (event.saveId !== save.saveId || event.beforeRevision !== input.expectedRevision ||
      event.afterRevision !== save.revision || event.source !== 'RULES' || event.ruleVersion !== save.ruleVersion) {
      throw new TypeError('Turn events do not match the accepted rules revision.');
    }
    eventIds.push(event.id);
  }

  const marker = nextJournal.lastTurn;
  if (!marker || marker.fromRevision !== input.expectedRevision || marker.toRevision !== save.revision ||
    canonicalJson(marker.eventIds) !== canonicalJson(eventIds)) {
    throw new TypeError('NPC memory journal does not correspond to the accepted event batch.');
  }

  return { ...input, ownerId, save, receipt, events, previousJournal, nextJournal };
}

function parseJournal(value: unknown): NpcMemoryJournal {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof json !== 'string') throw new TypeError('NPC memory journal is not JSON data.');
  return parseNpcMemoryJournalJson(json);
}

function normalizeOwnerId(ownerId: string): string {
  if (typeof ownerId !== 'string' || !ownerId.trim() || ownerId.trim().length > 200) {
    throw new TypeError('Authenticated owner ID is required.');
  }
  return ownerId.trim();
}

function isValidId(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value === value.trim() && value.length <= 200;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return '{' + entries.map(([key, item]) => JSON.stringify(key) + ':' + canonicalJson(item)).join(',') + '}';
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('Value is not JSON serializable.');
  return encoded;
}

async function rollbackWith<T>(client: PoolClient, createResult: () => T): Promise<T> {
  await client.query('ROLLBACK');
  return createResult();
}
