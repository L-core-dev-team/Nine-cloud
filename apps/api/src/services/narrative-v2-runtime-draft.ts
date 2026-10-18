import type { Pool } from 'pg';
import {createNarrativeV2Port,NARRATIVE_V2_BUDGET,requireWriterFence} from './narrative-ownership-v2.js';
import {NarrativePublicationRepository,finalBody,type BodyLimits} from './narrative-publication-repository.js';
import {NarrativeOutboxWorker,type DeterministicRenderer} from './narrative-outbox-worker.js';
import {createPostgresServerTurnRepository} from './postgres-server-turn.js';
import {ServerTurnService,type ServerTurnRules} from './server-turn.js';
import type {DataPolicy} from './data-policy.js';

/** Uninstalled assembly proposal. No environment flag enables this from index.ts.
 * An approval artifact plus an externally established DB fleet fence are both prerequisites.
 * All action/read endpoints must receive this service and this repository as a pair.
 */
export async function prepareNarrativeV2RuntimeDraft(input:{pool:Pool;rules:ServerTurnRules;
  rendererVersion:string;render:DeterministicRenderer;limits:BodyLimits;policy?:()=>DataPolicy|undefined}) {
  finalBody('x',input.limits);
  const c=await input.pool.connect();
  try {
    await c.query('BEGIN');
    const role=(await c.query(`SELECT r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolbypassrls,
      pg_has_role(session_user,'jiuxiao_narrative_operator','MEMBER') AS operator,
      pg_has_role(session_user,'jiuxiao_narrative_erasure','MEMBER') AS eraser,
      pg_has_role(session_user,'jiuxiao_narrative_schema_owner','MEMBER') AS schema_owner,
      (has_table_privilege(current_user,'public.narrative_writer_fence','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
        OR has_any_column_privilege(current_user,'public.narrative_writer_fence','INSERT,UPDATE')) AS fence_write
      FROM pg_roles r WHERE r.rolname=session_user`)).rows[0];
    if(!role || role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolbypassrls
      || role.operator || role.eraser || role.schema_owner || role.fence_write)
      throw Error('NARRATIVE_APPLICATION_ROLE_NOT_ISOLATED');
    await requireWriterFence(c,input.rendererVersion);await c.query('ROLLBACK');
  }
  catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;} finally{c.release();}
  const publication=new NarrativePublicationRepository(input.pool,input.limits,
    {maxAttempts:NARRATIVE_V2_BUDGET.maxAttempts,leaseMs:NARRATIVE_V2_BUDGET.leaseMs});
  const port=createNarrativeV2Port(input.pool,input.rendererVersion,publication);
  const turns=createPostgresServerTurnRepository(input.pool,true,input.policy,port);
  const service=new ServerTurnService(turns,input.rules,undefined,NARRATIVE_V2_BUDGET.httpWaitMs,undefined,port);
  const worker=new NarrativeOutboxWorker(publication,new Map([[input.rendererVersion,input.render]]),
    NARRATIVE_V2_BUDGET.workerExecutionMs);
  return {service,turns,publication,worker};
}
