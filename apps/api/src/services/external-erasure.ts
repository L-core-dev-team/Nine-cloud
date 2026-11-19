import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export interface RemoteErasure {
  subjects(client: PoolClient, owner: string): Promise<string[]>;
  remove(subject: string): Promise<void>;
}

/** Stage before deleting the identity mapping. A rollback leaves no deliverable work. */
export async function stageExternalErasure(client: PoolClient, remote: RemoteErasure, owner: string, operation: string, policy: string) {
  for (const subject of (await remote.subjects(client, owner)).sort()) {
    const digest = createHash('sha256').update(subject).digest('hex');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [digest]);
    const shared = await client.query('SELECT 1 FROM public.auth_external_identities WHERE provider_subject=$1 AND owner_id<>$2', [subject,owner]);
    if (shared.rowCount) throw new Error('SUPABASE_IDENTITY_SHARED');
    await client.query(`INSERT INTO public.account_erasure_delivery(operation_id,subject_digest,pending_subject,state,policy_version)
      VALUES($1,$2,$3,'pending',$4)`, [operation,digest,subject,policy]);
  }
}

/** Called only after local commit. A lost acknowledgement is retried as DELETE (404 is success). */
export async function deliverExternalErasure(pool: Pool, remote: RemoteErasure, operation?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query(`SELECT subject_digest,pending_subject FROM public.account_erasure_delivery
      WHERE state<>'completed' AND ($1::text IS NULL OR operation_id=$1)
      ORDER BY attempts,subject_digest LIMIT 4 FOR UPDATE SKIP LOCKED`, [operation ?? null]);
    for (const row of rows.rows) {
      let state = 'completed';
      try { await remote.remove(row.pending_subject); }
      catch (error) { state = error instanceof Error && error.message === 'SUPABASE_DELETE_REJECTED' ? 'retry' : 'unknown'; }
      await client.query(`UPDATE public.account_erasure_delivery SET state=$2,attempts=attempts+1,
        pending_subject=CASE WHEN $2='completed' THEN NULL ELSE pending_subject END,
        completed_at=CASE WHEN $2='completed' THEN clock_timestamp() END WHERE subject_digest=$1`, [row.subject_digest,state]);
    }
    const remaining = await client.query("SELECT 1 FROM public.account_erasure_delivery WHERE state<>'completed' AND ($1::text IS NULL OR operation_id=$1) LIMIT 1", [operation ?? null]);
    await client.query('COMMIT');
    return remaining.rowCount ? 'pending' : 'completed';
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
