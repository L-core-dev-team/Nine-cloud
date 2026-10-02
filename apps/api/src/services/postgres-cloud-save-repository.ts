import type { SaveEnvelope } from '@jiuxiao/contracts';
import { SaveEnvelopeSchema } from '@jiuxiao/contracts';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { CloudCapacityError, type CloudSaveRepository } from './cloud-save-service.js';

interface SaveRow extends QueryResultRow {
  id: string;
  revision: number;
  schema_version: number;
  canon_version: string;
  rule_version: string;
  memory_policy_version: string;
  snapshot: unknown;
}

function rowToEnvelope(row: SaveRow): SaveEnvelope {
  return SaveEnvelopeSchema.parse({
    schemaVersion: row.schema_version,
    saveId: row.id,
    canonVersion: row.canon_version,
    ruleVersion: row.rule_version,
    memoryPolicyVersion: row.memory_policy_version,
    revision: row.revision,
    state: row.snapshot,
  });
}

const SELECT_FIELDS = `id, revision, schema_version, canon_version, rule_version,
  memory_policy_version, snapshot`;
const MAX_ACCOUNT_SAVES = 20;
const MAX_SAVE_BYTES = 1_000_000;
const MAX_ACCOUNT_BYTES = 10_000_000;

/** PostgreSQL implementation; every read/write is scoped by the session owner. */
export class PostgresCloudSaveRepository implements CloudSaveRepository {
  constructor(private readonly pool: Pool, private readonly requiresLiveAccount = false) {}

  private async capacityTransaction<T>(ownerId: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serializes create/replace across API instances for this account.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 874312))', [ownerId]);
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async accountUsage(client: PoolClient, ownerId: string) {
    const result = await client.query<{ count: number; bytes: string }>(
      'SELECT count(*)::int AS count, coalesce(sum(octet_length(snapshot::text)), 0)::bigint AS bytes FROM game_saves WHERE owner_id=$1',
      [ownerId],
    );
    return { count: result.rows[0]!.count, bytes: Number(result.rows[0]!.bytes) };
  }

  private async snapshotBytes(client: PoolClient, state: SaveEnvelope['state']): Promise<number> {
    const result = await client.query<{ bytes: number }>('SELECT octet_length($1::jsonb::text)::int AS bytes', [JSON.stringify(state)]);
    return result.rows[0]!.bytes;
  }

  async archiveIndexForOwner(ownerId: string, offset: number, limit: number) {
    const result = await this.pool.query<{ id: string; name: string; revision: number }>(
      `SELECT id, revision, left(snapshot #>> '{facts,localArchive,name}', 200) AS name FROM game_saves
       WHERE owner_id = $1 AND snapshot #>> '{facts,archiveKind}' = 'local-untrusted-v1'
       AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = game_saves.id)
       ORDER BY id ASC LIMIT $2 OFFSET $3`, [ownerId, limit, offset]);
    return result.rows.map(row => ({ saveId: row.id, name: row.name || '云端存档', revision: row.revision }));
  }

  async listForOwner(ownerId: string): Promise<SaveEnvelope[]> {
    const result = await this.pool.query<SaveRow>(
      `SELECT ${SELECT_FIELDS} FROM game_saves WHERE owner_id = $1 AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = game_saves.id) ORDER BY updated_at DESC, id ASC`,
      [ownerId],
    );
    return result.rows.map(rowToEnvelope);
  }

  async getForOwner(ownerId: string, saveId: string): Promise<SaveEnvelope | null> {
    const result = await this.pool.query<SaveRow>(
      `SELECT ${SELECT_FIELDS} FROM game_saves WHERE owner_id = $1 AND id = $2 AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = game_saves.id) LIMIT 1`,
      [ownerId, saveId],
    );
    return result.rows[0] ? rowToEnvelope(result.rows[0]) : null;
  }

  async createForOwner(ownerId: string, save: SaveEnvelope): Promise<boolean> {
    if (Buffer.byteLength(JSON.stringify(save), 'utf8') > MAX_SAVE_BYTES) throw new CloudCapacityError();
    return this.capacityTransaction(ownerId, async client => {
      const usage = await this.accountUsage(client, ownerId);
      const bytes = await this.snapshotBytes(client, save.state);
      if (usage.count >= MAX_ACCOUNT_SAVES || usage.bytes + bytes > MAX_ACCOUNT_BYTES) throw new CloudCapacityError();
      const result = await client.query(
      `${this.requiresLiveAccount ? 'WITH live_account AS (SELECT id FROM auth_accounts WHERE id=$2 AND closed_at IS NULL FOR KEY SHARE) ' : ''}INSERT INTO game_saves
        (id, owner_id, revision, schema_version, canon_version, rule_version, memory_policy_version, snapshot)
       ${this.requiresLiveAccount ? 'SELECT $1,$2,$3,$4,$5,$6,$7,$8::jsonb FROM live_account' : 'VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)'}
       ON CONFLICT (id) DO NOTHING`,
      [save.saveId, ownerId, save.revision, save.schemaVersion, save.canonVersion,
        save.ruleVersion, save.memoryPolicyVersion, JSON.stringify(save.state)],
    );
      return result.rowCount === 1;
    });
  }

  async replaceForOwner(input: {
    ownerId: string;
    saveId: string;
    expectedRevision: number;
    next: SaveEnvelope;
  }): Promise<{ kind: 'updated' } | { kind: 'conflict'; currentRevision: number } | { kind: 'not_found' }> {
    if (Buffer.byteLength(JSON.stringify(input.next), 'utf8') > MAX_SAVE_BYTES) throw new CloudCapacityError();
    return this.capacityTransaction(input.ownerId, async client => {
    const current = await client.query<{ revision: number; bytes: number }>(
      `SELECT revision, octet_length(snapshot::text)::int AS bytes FROM game_saves WHERE id=$1 AND owner_id=$2
       AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id=game_saves.id) FOR UPDATE`,
      [input.saveId, input.ownerId],
    );
    if (!current.rows[0]) return { kind: 'not_found' };
    if (current.rows[0].revision !== input.expectedRevision) return { kind: 'conflict', currentRevision: current.rows[0].revision };
    const usage = await this.accountUsage(client, input.ownerId);
    const bytes = await this.snapshotBytes(client, input.next.state);
    if (usage.bytes - current.rows[0].bytes + bytes > MAX_ACCOUNT_BYTES) throw new CloudCapacityError();
    const result = await client.query(
      `${this.requiresLiveAccount ? 'WITH live_account AS (SELECT id FROM auth_accounts WHERE id=$2 AND closed_at IS NULL FOR KEY SHARE) ' : ''}UPDATE game_saves
         SET revision = $4, schema_version = $5, canon_version = $6, rule_version = $7,
             memory_policy_version = $8, snapshot = $9::jsonb, updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND revision = $3 ${this.requiresLiveAccount ? 'AND EXISTS (SELECT 1 FROM live_account)' : ''} AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = game_saves.id)`,
      [input.saveId, input.ownerId, input.expectedRevision, input.next.revision,
        input.next.schemaVersion, input.next.canonVersion, input.next.ruleVersion,
        input.next.memoryPolicyVersion, JSON.stringify(input.next.state)],
    );
    if (result.rowCount === 1) return { kind: 'updated' };

    // The owner filter makes another account's save indistinguishable from a missing save.
    const latest = await client.query<{ revision: number } & QueryResultRow>(
      'SELECT revision FROM game_saves WHERE id = $1 AND owner_id = $2 AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = game_saves.id) LIMIT 1',
      [input.saveId, input.ownerId],
    );
    if (!latest.rows[0]) return { kind: 'not_found' };
    return { kind: 'conflict', currentRevision: latest.rows[0].revision };
    });
  }
}
