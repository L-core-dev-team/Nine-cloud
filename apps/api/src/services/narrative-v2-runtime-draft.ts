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
  try {await c.query('BEGIN');await requireWriterFence(c,input.rendererVersion);await c.query('ROLLBACK');}
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
