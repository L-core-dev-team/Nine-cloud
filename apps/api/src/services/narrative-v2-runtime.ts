import type { Pool } from 'pg';
import { NarrativePublicationRepository, finalBody, type BodyLimits } from './narrative-publication-repository.js';
import { NarrativeOutboxWorker, type DeterministicRenderer } from './narrative-outbox-worker.js';
import { createNarrativeV2Port, NARRATIVE_V2_BUDGET, requireWriterFence } from './narrative-ownership-v2.js';

async function inspectLogin(pool: Pool, writer: 'runtime' | 'worker', renderer: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const role = 'jiuxiao_narrative_' + writer;
    const { rows: [identity] } = await client.query(`
      SELECT session_user AS login, current_database() AS db, inet_server_addr()::text AS addr,
        inet_server_port() AS port,pg_postmaster_start_time()::text AS boot,
        current_user=session_user AND pg_has_role(session_user,$1,'MEMBER') AND NOT EXISTS(
          SELECT 1 FROM pg_roles r WHERE pg_has_role(session_user,r.oid,'MEMBER')
          AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication
            OR r.rolname=ANY($2::text[]))) AND NOT EXISTS(
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p') AND pg_has_role(session_user,c.relowner,'MEMBER'))
        AND NOT has_schema_privilege(current_user,'public','CREATE')
        AND NOT has_any_column_privilege(current_user,'public.narrative_writer_fence','INSERT,UPDATE')
        AND NOT has_any_column_privilege(current_user,'public.narrative_0022_read_inventory','INSERT,UPDATE')
        AND NOT has_table_privilege(current_user,'public.narrative_writer_fence','DELETE,TRUNCATE,TRIGGER')
        AND NOT has_table_privilege(current_user,'public.narrative_0022_read_inventory','DELETE,TRUNCATE,TRIGGER')
        AND NOT has_any_column_privilege(current_user,'public.narrative_receipt_ownership','UPDATE') AS safe
    `, [role,['jiuxiao_narrative_operator','jiuxiao_narrative_schema_owner','jiuxiao_narrative_lock_owner',
      'jiuxiao_narrative_erasure',writer === 'runtime' ? 'jiuxiao_narrative_worker' : 'jiuxiao_narrative_runtime']]);
    if (!identity?.safe) throw Error('NARRATIVE_APPLICATION_ROLE_NOT_ISOLATED');
    await requireWriterFence(client,renderer);
    return identity;
  } finally {
    try { await client.query('ROLLBACK'); } finally { client.release(); }
  }
}

/** Explicit DB roles and verified rule renderer only. No new authority on GET or retry. */
export async function prepareNarrativeV2Runtime(input: {
  pool: Pool; workerPool: Pool; rendererVersion: string; render: DeterministicRenderer; limits: BodyLimits;
}) {
  finalBody('x',input.limits);
  const runtime = await inspectLogin(input.pool,'runtime',input.rendererVersion);
  const worker = await inspectLogin(input.workerPool,'worker',input.rendererVersion);
  if (runtime.login === worker.login || ['db','addr','port','boot'].some(k => runtime[k] !== worker[k])) {
    throw Error('NARRATIVE_DATABASE_IDENTITY_MISMATCH');
  }
  const budget = { maxAttempts: NARRATIVE_V2_BUDGET.maxAttempts, leaseMs: NARRATIVE_V2_BUDGET.leaseMs };
  const publication = new NarrativePublicationRepository(input.pool,input.limits,budget);
  const workerRepository = new NarrativePublicationRepository(input.workerPool,input.limits,budget);
  return { publication, port: createNarrativeV2Port(input.pool,input.rendererVersion,publication),
    worker: new NarrativeOutboxWorker(workerRepository,new Map([[input.rendererVersion,input.render]]),
      NARRATIVE_V2_BUDGET.workerExecutionMs) };
}

export { eraseNarrativeForOwner } from './narrative-publication-repository.js';
