import type { SaveEnvelope } from '@jiuxiao/contracts';
import { SaveEnvelopeSchema } from '@jiuxiao/contracts';
import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { CloudCapacityError, type CloudSaveRepository } from './cloud-save-service.js';
import { requirePersistableSave, SaveSchemaNotReadyError } from './save-storage-contract.js';
import { assertDataPolicy, checkQuota, type DataPolicy } from './data-policy.js';

interface SaveRow extends QueryResultRow {
  id: string;
  revision: number;
  schema_version: number;
  canon_version: string;
  canon_artifact_hash: string | null;
  rule_version: string;
  memory_policy_version: string;
  memory_mode: string | null;
  memory_policy: unknown | null;
  branch_id: string | null;
  parent_branch_id: string | null;
  fork_revision: number | null;
  created_policy_version: string | null;
  source_migration_id: string | null;
  snapshot: unknown;
}

function rowToEnvelope(row: SaveRow): SaveEnvelope {
  if (row.schema_version === 1) {
    if (row.canon_artifact_hash !== null || row.memory_mode !== null || row.memory_policy !== null || row.branch_id !== null || row.parent_branch_id !== null
      || row.fork_revision !== null || row.created_policy_version !== null || row.source_migration_id !== null) {
      throw new Error('Legacy save contains unexpected policy or lineage metadata.');
    }
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
  if (row.schema_version === 2) {
    if (row.canon_artifact_hash !== null || row.memory_mode === null || row.memory_policy === null || row.branch_id !== null || row.parent_branch_id !== null
      || row.fork_revision !== null || row.created_policy_version !== null || row.source_migration_id !== null) throw new SaveSchemaNotReadyError();
    const save = SaveEnvelopeSchema.parse({
      schemaVersion: row.schema_version,
      saveId: row.id,
      canonVersion: row.canon_version,
      ruleVersion: row.rule_version,
      memoryPolicyVersion: row.memory_policy_version,
      memoryMode: row.memory_mode,
      memoryPolicy: row.memory_policy,
      revision: row.revision,
      state: row.snapshot,
    });
    requirePersistableSave(save);
    return save;
  }
  if (row.schema_version === 3) {
    if (row.canon_artifact_hash === null || row.memory_mode === null || row.memory_policy === null || row.branch_id === null
      || row.fork_revision === null || row.created_policy_version === null) throw new SaveSchemaNotReadyError();
    const save = SaveEnvelopeSchema.parse({
      schemaVersion: row.schema_version,
      saveId: row.id,
      canonVersion: row.canon_version,
      canonArtifactHash: row.canon_artifact_hash,
      ruleVersion: row.rule_version,
      memoryPolicyVersion: row.memory_policy_version,
      memoryMode: row.memory_mode,
      memoryPolicy: row.memory_policy,
      branchId: row.branch_id,
      parentBranchId: row.parent_branch_id,
      forkRevision: row.fork_revision,
      createdPolicyVersion: row.created_policy_version,
      sourceMigrationId: row.source_migration_id,
      revision: row.revision,
      state: row.snapshot,
    });
    requirePersistableSave(save);
    return save;
  }
  throw new SaveSchemaNotReadyError();
}

const SELECT_FIELDS = `id, revision, schema_version, canon_version, canon_artifact_hash, rule_version,
  memory_policy_version, memory_mode, memory_policy, branch_id, parent_branch_id,
  fork_revision, created_policy_version, source_migration_id, snapshot`;
const MAX_ACCOUNT_SAVES = 20;
const MAX_SAVE_BYTES = 1_000_000;
const MAX_ACCOUNT_BYTES = 10_000_000;

/** PostgreSQL implementation; every read/write is scoped by the session owner. */
export class PostgresCloudSaveRepository implements CloudSaveRepository {
  constructor(private readonly pool: Pool, private readonly requiresLiveAccount = false, protected readonly policy?: DataPolicy) {}

  private limits() {
    if (this.policy) assertDataPolicy(this.policy);
    return {
      maxSaves: this.policy?.maxSaves ?? MAX_ACCOUNT_SAVES,
      perSaveBytes: this.policy?.perSaveBytes ?? MAX_SAVE_BYTES,
      totalBytes: this.policy?.totalBytes ?? MAX_ACCOUNT_BYTES,
    };
  }

  private checkCapacity(usage: { count: number; bytes: number }, bytes: number, replacedBytes: number | null) {
    if (this.policy) {
      try { checkQuota(this.policy, usage, bytes, replacedBytes); }
      catch (error) {
        if (error instanceof Error && error.message === 'CLOUD_QUOTA_EXCEEDED') throw new CloudCapacityError();
        throw error;
      }
      return;
    }
    const limits = this.limits();
    if (bytes > limits.perSaveBytes || usage.bytes - (replacedBytes ?? 0) + bytes > limits.totalBytes ||
      (replacedBytes === null && usage.count >= limits.maxSaves)) throw new CloudCapacityError();
  }

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
      'SELECT count(*)::int AS count, coalesce(sum(octet_length(snapshot::text) + coalesce(octet_length(memory_policy::text), 0)), 0)::bigint AS bytes FROM game_saves WHERE owner_id=$1',
      [ownerId],
    );
    return { count: result.rows[0]!.count, bytes: Number(result.rows[0]!.bytes) };
  }

  private async persistedPayloadBytes(client: PoolClient, save: SaveEnvelope): Promise<number> {
    const policy = save.schemaVersion !== 1 ? JSON.stringify(save.memoryPolicy) : null;
    const result = await client.query<{ bytes: number }>(
      'SELECT (octet_length($1::jsonb::text) + coalesce(octet_length($2::jsonb::text), 0))::int AS bytes',
      [JSON.stringify(save.state), policy],
    );
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
    requirePersistableSave(save);
    if (Buffer.byteLength(JSON.stringify(save), 'utf8') > this.limits().perSaveBytes) throw new CloudCapacityError();
    return this.capacityTransaction(ownerId, async client => {
      const usage = await this.accountUsage(client, ownerId);
      const bytes = await this.persistedPayloadBytes(client, save);
      this.checkCapacity(usage, bytes, null);
      const result = await client.query(
      `${this.requiresLiveAccount ? 'WITH live_account AS (SELECT id FROM auth_accounts WHERE id=$2 AND closed_at IS NULL FOR KEY SHARE) ' : ''}INSERT INTO game_saves
        (id, owner_id, revision, schema_version, canon_version, canon_artifact_hash, rule_version, memory_policy_version, memory_mode, memory_policy,
          branch_id, parent_branch_id, fork_revision, created_policy_version, source_migration_id, snapshot)
       ${this.requiresLiveAccount ? 'SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16::jsonb FROM live_account' : 'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16::jsonb)'}
       ON CONFLICT (id) DO NOTHING`,
      [save.saveId, ownerId, save.revision, save.schemaVersion, save.canonVersion,
        save.schemaVersion === 3 ? save.canonArtifactHash : null,
        save.ruleVersion, save.memoryPolicyVersion, save.schemaVersion !== 1 ? save.memoryMode : null,
        save.schemaVersion !== 1 ? JSON.stringify(save.memoryPolicy) : null,
        save.schemaVersion === 3 ? save.branchId : null,
        save.schemaVersion === 3 ? save.parentBranchId : null,
        save.schemaVersion === 3 ? save.forkRevision : null,
        save.schemaVersion === 3 ? save.createdPolicyVersion : null,
        save.schemaVersion === 3 ? save.sourceMigrationId : null, JSON.stringify(save.state)],
    );
      return result.rowCount === 1;
    });
  }

  async replaceForOwner(input: {
    ownerId: string;
    saveId: string;
    expectedRevision: number;
    next: SaveEnvelope;
  }): Promise<{ kind: 'updated' } | { kind: 'conflict'; currentRevision: number } |
    { kind: 'schema_version_conflict' } | { kind: 'memory_policy_pinned' } | { kind: 'lineage_pinned' }
    | { kind: 'canon_artifact_pinned' } | { kind: 'not_found' }> {
    requirePersistableSave(input.next);
    if (Buffer.byteLength(JSON.stringify(input.next), 'utf8') > this.limits().perSaveBytes) throw new CloudCapacityError();
    return this.capacityTransaction(input.ownerId, async client => {
    const current = await client.query<{ revision: number; bytes: number; schema_version: number; canon_artifact_hash: string | null; memory_mode: string | null; memory_policy_version: string; memory_policy: unknown | null;
      branch_id: string | null; parent_branch_id: string | null; fork_revision: number | null; created_policy_version: string | null; source_migration_id: string | null }>(
      `SELECT revision, schema_version, canon_artifact_hash, memory_mode, memory_policy_version, memory_policy,
         branch_id, parent_branch_id, fork_revision, created_policy_version, source_migration_id,
         (octet_length(snapshot::text) + coalesce(octet_length(memory_policy::text), 0))::int AS bytes FROM game_saves WHERE id=$1 AND owner_id=$2
       AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id=game_saves.id) FOR UPDATE`,
      [input.saveId, input.ownerId],
    );
    if (!current.rows[0]) return { kind: 'not_found' };
    if (current.rows[0].revision !== input.expectedRevision) return { kind: 'conflict', currentRevision: current.rows[0].revision };
    if (current.rows[0].schema_version !== input.next.schemaVersion) return { kind: 'schema_version_conflict' };
    if (input.next.schemaVersion !== 1 && (
      current.rows[0].memory_mode !== input.next.memoryMode ||
      current.rows[0].memory_policy_version !== input.next.memoryPolicyVersion ||
      !isDeepStrictEqual(current.rows[0].memory_policy, input.next.memoryPolicy)
    )) return { kind: 'memory_policy_pinned' };
    if (input.next.schemaVersion === 3 && (
      current.rows[0].branch_id !== input.next.branchId ||
      current.rows[0].parent_branch_id !== input.next.parentBranchId ||
      current.rows[0].fork_revision !== input.next.forkRevision ||
      current.rows[0].created_policy_version !== input.next.createdPolicyVersion ||
      current.rows[0].source_migration_id !== input.next.sourceMigrationId
    )) return { kind: 'lineage_pinned' };
    if (input.next.schemaVersion === 3 && current.rows[0].canon_artifact_hash !== input.next.canonArtifactHash) {
      return { kind: 'canon_artifact_pinned' };
    }
    const usage = await this.accountUsage(client, input.ownerId);
    const bytes = await this.persistedPayloadBytes(client, input.next);
    this.checkCapacity(usage, bytes, current.rows[0].bytes);
    const result = await client.query(
      `${this.requiresLiveAccount ? 'WITH live_account AS (SELECT id FROM auth_accounts WHERE id=$2 AND closed_at IS NULL FOR KEY SHARE) ' : ''}UPDATE game_saves
       SET revision = $4, schema_version = $5, canon_version = $6, canon_artifact_hash = $7, rule_version = $8,
             memory_policy_version = $9, memory_mode = $10, memory_policy = $11::jsonb,
             branch_id = $12, parent_branch_id = $13, fork_revision = $14, created_policy_version = $15,
             source_migration_id = $16, snapshot = $17::jsonb, updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND revision = $3 ${this.requiresLiveAccount ? 'AND EXISTS (SELECT 1 FROM live_account)' : ''} AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = game_saves.id)`,
      [input.saveId, input.ownerId, input.expectedRevision, input.next.revision,
        input.next.schemaVersion, input.next.canonVersion,
        input.next.schemaVersion === 3 ? input.next.canonArtifactHash : null,
        input.next.ruleVersion, input.next.memoryPolicyVersion, input.next.schemaVersion !== 1 ? input.next.memoryMode : null,
        input.next.schemaVersion !== 1 ? JSON.stringify(input.next.memoryPolicy) : null,
        input.next.schemaVersion === 3 ? input.next.branchId : null,
        input.next.schemaVersion === 3 ? input.next.parentBranchId : null,
        input.next.schemaVersion === 3 ? input.next.forkRevision : null,
        input.next.schemaVersion === 3 ? input.next.createdPolicyVersion : null,
        input.next.schemaVersion === 3 ? input.next.sourceMigrationId : null, JSON.stringify(input.next.state)],
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
