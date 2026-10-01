import type { SaveEnvelope } from '@jiuxiao/contracts';
import { SaveEnvelopeSchema } from '@jiuxiao/contracts';
import type { Pool, QueryResultRow } from 'pg';
import type { CloudSaveRepository } from './cloud-save-service.js';

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

/** PostgreSQL implementation; every read/write is scoped by the session owner. */
export class PostgresCloudSaveRepository implements CloudSaveRepository {
  constructor(private readonly pool: Pool) {}

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
    const result = await this.pool.query(
      `INSERT INTO game_saves
        (id, owner_id, revision, schema_version, canon_version, rule_version, memory_policy_version, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [save.saveId, ownerId, save.revision, save.schemaVersion, save.canonVersion,
        save.ruleVersion, save.memoryPolicyVersion, JSON.stringify(save.state)],
    );
    return result.rowCount === 1;
  }

  async replaceForOwner(input: {
    ownerId: string;
    saveId: string;
    expectedRevision: number;
    next: SaveEnvelope;
  }): Promise<{ kind: 'updated' } | { kind: 'conflict'; currentRevision: number } | { kind: 'not_found' }> {
    const result = await this.pool.query(
      `UPDATE game_saves
         SET revision = $4, schema_version = $5, canon_version = $6, rule_version = $7,
             memory_policy_version = $8, snapshot = $9::jsonb, updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND revision = $3 AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = game_saves.id)`,
      [input.saveId, input.ownerId, input.expectedRevision, input.next.revision,
        input.next.schemaVersion, input.next.canonVersion, input.next.ruleVersion,
        input.next.memoryPolicyVersion, JSON.stringify(input.next.state)],
    );
    if (result.rowCount === 1) return { kind: 'updated' };

    // The owner filter makes another account's save indistinguishable from a missing save.
    const current = await this.pool.query<{ revision: number } & QueryResultRow>(
      'SELECT revision FROM game_saves WHERE id = $1 AND owner_id = $2 AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = game_saves.id) LIMIT 1',
      [input.saveId, input.ownerId],
    );
    if (!current.rows[0]) return { kind: 'not_found' };
    return { kind: 'conflict', currentRevision: current.rows[0].revision };
  }
}
