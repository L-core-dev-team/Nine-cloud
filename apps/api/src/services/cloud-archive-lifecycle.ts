import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { SaveEnvelopeSchema } from '@jiuxiao/contracts';

export function archiveDigest(value: unknown): string {
  const canonical = (entry: unknown): string => {
    if (Array.isArray(entry)) return `[${entry.map(canonical).join(',')}]`;
    if (entry !== null && typeof entry === 'object') return `{${Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
    const json = JSON.stringify(entry); if (json === undefined) throw new TypeError('Invalid backup'); return json;
  };
  return createHash('sha256').update(canonical(value)).digest('hex');
}
/** Soft deletion of client archives only; rule/event saves cannot enter this path. */
export class CloudArchiveLifecycle {
  constructor(private readonly pool: Pool) {}
  async list(owner: string, offset = 0) {
    const result = await this.pool.query(`SELECT save_id, deleted_revision, deleted_at, left(backup #>> '{state,facts,localArchive,name}', 200) AS name
      FROM cloud_archive_trash WHERE owner_id = $1 ORDER BY deleted_at DESC, save_id LIMIT 21 OFFSET $2`, [owner, offset]);
    return { saves: result.rows.slice(0, 20).map(row => ({ saveId: row.save_id as string, revision: row.deleted_revision as number, name: (row.name || '云端存档') as string, deletedAt: new Date(row.deleted_at).toISOString() })), hasMore: result.rows.length > 20 };
  }
  async change(owner: string, saveId: string, expectedRevision: number, operation: 'delete' | 'restore') {
    if (!owner || !saveId || saveId.length > 200 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= 2147483647) throw new TypeError('Invalid archive operation');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM game_saves WHERE id = $1 AND owner_id = $2 FOR UPDATE', [saveId, owner]);
      const row = result.rows[0];
      if (!row || row.snapshot?.facts?.archiveKind !== 'local-untrusted-v1') { await client.query('ROLLBACK'); return { kind: 'not_found' as const }; }
      const archived = (await client.query('SELECT * FROM cloud_archive_trash WHERE save_id = $1 AND owner_id = $2', [saveId, owner])).rows[0];
      if (operation === 'delete' && archived && expectedRevision === archived.deleted_revision - 1) {
        await client.query('ROLLBACK'); return { kind: 'deleted' as const, revision: archived.deleted_revision as number };
      }
      if (row.revision !== expectedRevision || (operation === 'delete' && archived)) { await client.query('ROLLBACK'); return { kind: 'conflict' as const }; }
      if (operation === 'restore' && !archived) { await client.query('ROLLBACK'); return { kind: 'not_found' as const }; }
      const nextRevision = expectedRevision + 1;
      if (operation === 'delete') {
        const backup = SaveEnvelopeSchema.parse({ schemaVersion: row.schema_version, saveId, canonVersion: row.canon_version,
          ruleVersion: row.rule_version, memoryPolicyVersion: row.memory_policy_version, revision: row.revision, state: row.snapshot });
        await client.query('INSERT INTO cloud_archive_trash (save_id, owner_id, deleted_revision, backup, digest) VALUES ($1, $2, $3, $4::jsonb, $5)', [saveId, owner, nextRevision, JSON.stringify(backup), archiveDigest(backup)]);
        await client.query('UPDATE game_saves SET revision = $3, updated_at = now() WHERE id = $1 AND owner_id = $2', [saveId, owner, nextRevision]);
      } else {
        const backup = SaveEnvelopeSchema.parse(archived.backup);
        if (backup.saveId !== saveId || backup.state.facts.archiveKind !== 'local-untrusted-v1' || archiveDigest(backup) !== archived.digest) throw new Error('BACKUP_INTEGRITY_FAILED');
        await client.query(`UPDATE game_saves SET revision = $3, schema_version = $4, canon_version = $5, rule_version = $6,
          memory_policy_version = $7, snapshot = $8::jsonb, updated_at = now() WHERE id = $1 AND owner_id = $2`,
          [saveId, owner, nextRevision, backup.schemaVersion, backup.canonVersion, backup.ruleVersion, backup.memoryPolicyVersion, JSON.stringify(backup.state)]);
        await client.query('DELETE FROM cloud_archive_trash WHERE save_id = $1 AND owner_id = $2', [saveId, owner]);
      }
      await client.query('COMMIT'); return { kind: operation === 'delete' ? 'deleted' as const : 'restored' as const, revision: nextRevision };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}
