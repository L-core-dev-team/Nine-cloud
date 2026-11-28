import { serve } from '@hono/node-server';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { ActionIntent } from '@jiuxiao/contracts';
import { ServerTurnService, type ServerTurnRules } from './server-turn.js';
import { createPostgresServerTurnRepository } from './postgres-server-turn.js';
import { createNarrativeV2Port } from './narrative-ownership-v2.js';
import { NarrativePublicationRepository, eraseNarrativeForOwner } from './narrative-publication-repository.js';
import { NarrativeOutboxWorker } from './narrative-outbox-worker.js';
import { prepareNarrativeV2Runtime } from './narrative-v2-runtime.js';
import { mountNarrativePublications } from '../routes/narrative-publications.js';
import { createP1SaveMemoryPolicy } from './p1-memory-policy.js';
import { AccountLifecycle } from './account-lifecycle.js';
import { sessionToken } from '../routes/auth.js';
import { EmailAuthService, hashToken } from './email-auth.js';
import { PostgresEmailAuthRepository } from './postgres-email-auth.js';

const adminUrl=process.env.T1_ADMIN_URL;
if(adminUrl && !/^\/jiuxiao_test_t1[a-f0-9]{16}$/.test(new URL(adminUrl).pathname)) throw Error('T1_ISOLATED_DB_REQUIRED');
// Dedicated runner supplies real login URLs only after migrations succeed in a new random database.
describe.skipIf(!adminUrl)('T1 pending protected patch on an isolated synthetic PG and actual cookie resolver',()=>{
  const opts=(name:string)=>({connectionString:process.env['T1_'+name+'_URL'],max:4});
  const admin=new Pool(opts('ADMIN')),runtime=new Pool(opts('RUNTIME')),worker=new Pool(opts('WORKER')),
    erasure=new Pool(opts('ERASURE')),operator=new Pool(opts('OPERATOR'));
  const pools=[admin,runtime,worker,erasure,operator], secret='synthetic-isolated-native-authority-proof'.repeat(2);
  const issuer=new EmailAuthService(new PostgresEmailAuthRepository(admin,secret),async()=>{},secret);
  const resolver=new EmailAuthService(new PostgresEmailAuthRepository(runtime,secret),async()=>{},secret);
  const renderer='t1-local-renderer', limits={maxUtf16:1000,maxUtf8:4000};
  const options={leaseMs:2000,maxAttempts:3};
  const reads=new NarrativePublicationRepository(runtime,limits,options);
  const writes=new NarrativePublicationRepository(worker,limits,options);
  const port=createNarrativeV2Port(runtime,renderer,reads);
  const actual=createPostgresServerTurnRepository(runtime,true,undefined,port);
  const rules:ServerTurnRules={
    ruleVersion:'synthetic',canonVersion:'synthetic',memoryPolicyVersion:'synthetic',
    decide:(action,save)=>({status:'accepted',nextRevision:save.revision+1,
      events:[{id:randomUUID(),saveId:action.saveId,type:'synthetic.travel',beforeRevision:save.revision,
        afterRevision:save.revision+1,source:'RULES',ruleVersion:save.ruleVersion,occurredAt:new Date().toISOString(),payload:{}}]}),
    reduce:state=>({...state,elapsedMinutes:state.elapsedMinutes+1}),grantsForEvent:()=>[],policyForNpc:()=>'exact-recall-v1'
  };
  const service=new ServerTurnService(actual,rules,undefined,20000,undefined,port);
  let guestNumber=0;
  async function fixture(mode?:'continue'|'forgetting'){
    const guest=await issuer.createGuest('127.0.0.'+String(++guestNumber));if(!guest)throw Error('FIXTURE_CREATION_FAILED');
    const saveId='save-'+randomUUID(),owner=guest.session.ownerId;
    await admin.query("INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot,memory_mode,memory_policy) VALUES($1,$2,0,$4,'synthetic','synthetic','synthetic',$3::jsonb,$5,$6)",
      [saveId,owner,JSON.stringify({playerId:'player',locationId:'somewhere',elapsedMinutes:0,facts:{gameMinute:0}}),
        mode?2:1,mode??null,mode?JSON.stringify(createP1SaveMemoryPolicy(mode,0,'synthetic')):null]);
    const intent=(revision=0):ActionIntent=>({kind:'move',actorId:'player',saveId,expectedRevision:revision,idempotencyKey:randomUUID(),payload:{destinationId:'gate'}});
    return {owner,saveId,intent,cookie:'jx_session='+guest.token,token:guest.token};
  }
  function app(){
    const http=new Hono();
    mountNarrativePublications(http,{resolveOwnerId:async req=>(await resolver.resolve(sessionToken(req)))?.ownerId??null},reads);
    return http;
  }
  async function readThroughNewHost(path:string,cookie:string,injectFailure=false){
    const server=serve({fetch:app().fetch,hostname:'127.0.0.1',port:0});
    let portNo=0;
    try {
      if(!server.listening)await once(server,'listening');
      const addr=server.address();
      if(!addr || typeof addr==='string')throw Error('T1_EXPECTED_HTTP_LISTENER');
      portNo=addr.port;
      if(injectFailure)throw Error('INJECT_HTTP_LISTENER_FAILURE');
      const response=await fetch('http://127.0.0.1:'+portNo+path,{headers:{cookie,connection:'close'}});
      expect(response.status).toBe(200);
      return await response.json();
    }finally{
      await new Promise<void>((ok,fail)=>server.close(error=>error?fail(error):ok()));
      if(portNo){
        const socket=createConnection(portNo,'127.0.0.1');
        try{await expect(once(socket,'connect')).rejects.toMatchObject({code:'ECONNREFUSED'});}
        finally{socket.destroy();}
      }
    }
  }
  async function heldTurn(f:Awaited<ReturnType<typeof fixture>>,intent=f.intent()){
    // Abort only the wait, after the same transaction's actual COMMIT has returned.
    const stop=new AbortController();
    const proxy={...actual,async commitAcceptedTurn(input:Parameters<typeof actual.commitAcceptedTurn>[0]){
      const result=await actual.commitAcceptedTurn(input);stop.abort();return result;
    }};
    const sender=new ServerTurnService(proxy,rules,undefined,20000,undefined,port);
    expect(await sender.execute(f.owner,intent,true,stop.signal)).toMatchObject({status:'accepted',narrative:{status:'pending',wait:'cancelled'}});
    return intent;
  }
  beforeAll(async()=>{
    // This fixture grants the existing native action/auth/lifecycle privileges separately.
    // The only publication permissions used are those installed by 0028.
    const r=new URL(process.env.T1_RUNTIME_URL!).username,e=new URL(process.env.T1_ERASURE_URL!).username;
    for(const n of [r,e]) if(!/^t1_(runtime|erasure)_[a-f0-9]{16}$/.test(n))throw Error('INVALID_FIXTURE_ROLE');
    await admin.query(`GRANT SELECT ON auth_accounts,auth_sessions,account_operations,game_saves,turn_requests,turn_events,
      cloud_archive_trash,npc_memory_journals,npc_authorized_observation_outbox,npc_memory_observation_supersessions,story_narratives TO ${r};
      GRANT UPDATE(last_seen_at) ON auth_accounts TO ${r};
      GRANT UPDATE(revision,schema_version,canon_version,canon_artifact_hash,rule_version,memory_policy_version,memory_mode,
        memory_policy,branch_id,parent_branch_id,fork_revision,created_policy_version,source_migration_id,snapshot,updated_at) ON game_saves TO ${r};
      GRANT INSERT ON turn_requests,turn_events,npc_memory_journals,npc_authorized_observation_outbox TO ${r};
      GRANT EXECUTE ON FUNCTION public.verify_turn_event_chain_incremental(text,integer) TO ${r};
      GRANT SELECT,INSERT,UPDATE(verified_sequence,verified_hash,incremental_checks,full_audit_at,updated_at)
        ON public.turn_event_chain_checkpoints TO ${r};
      GRANT UPDATE(narrative_updated_at) ON turn_requests TO ${r};
      GRANT UPDATE(schema_version,revision,payload,updated_at) ON npc_memory_journals TO ${r};
      GRANT SELECT,DELETE ON auth_accounts,auth_sessions,auth_challenges,cloud_archive_trash,game_saves,
        entitlement_ledger_entries,entitlement_balances,turn_events,turn_requests,npc_memory_journals,
        npc_authorized_observation_outbox,npc_memory_observation_supersessions TO ${e};
      GRANT SELECT,INSERT,UPDATE ON account_operations TO ${e};
      GRANT INSERT ON account_lifecycle_audit TO ${e};
      GRANT UPDATE(closed_at) ON auth_accounts TO ${e}; GRANT UPDATE(revision) ON game_saves TO ${e}`);
    const retired=process.env.T1_TEST_RETIRED;
    await operator.query(`INSERT INTO public.narrative_writer_fence(singleton,protocol_version,phase,fleet_manifest_sha,renderer_version,
      old_writer_drained,old_role_revoked,valid_until,retired_roles,drain_evidence_sha) VALUES
      (true,2,'managed',repeat('a',64),$1,true,true,now()+interval '1 hour',ARRAY[$2]::text[],repeat('b',64))`,[renderer,retired]);
    await prepareNarrativeV2Runtime({pool:runtime,workerPool:worker,rendererVersion:renderer,render:()=> 'fixture',limits});
  });
  afterAll(async()=>{await Promise.all(pools.map(pool=>pool.end()));});

  it('verifies the authoritative chain as the native runtime when composing narrative V2',async()=>{
    const f=await fixture();
    expect(await actual.loadSave(f.owner,f.saveId)).toMatchObject({revision:0});
    const checkpoint=async()=>(await admin.query(
      'SELECT verified_sequence,incremental_checks FROM public.turn_event_chain_checkpoints WHERE save_id=$1',[f.saveId]
    )).rows[0];
    expect(await checkpoint()).toEqual({verified_sequence:-1,incremental_checks:0});
    expect(await service.execute(f.owner,f.intent(),false)).toMatchObject({status:'accepted',narrative:{status:'not_requested'}});
    expect(await actual.loadSave(f.owner,f.saveId)).toMatchObject({revision:1});
    expect(await checkpoint()).toEqual({verified_sequence:0,incremental_checks:2});
    for(const pool of [worker,operator,erasure]){
      const access=await pool.query(`SELECT
        has_function_privilege(current_user,'public.verify_turn_event_chain_incremental(text,integer)','EXECUTE') AS verify,
        has_any_column_privilege(current_user,'public.turn_event_chain_checkpoints','UPDATE') AS write`);
      expect(access.rows[0]).toEqual({verify:false,write:false});
    }
  });

  it('rolls back authority events, grant journal, receipt, save revision and outbox on registration failure',async()=>{
    const f=await fixture(), intent=f.intent();
    const bad={...port,async register(...args:Parameters<typeof port.register>){
      await port.register(...args);throw Error('SYNTHETIC_POST_REGISTRATION_FAILURE');
    }};
    const failing=new ServerTurnService(createPostgresServerTurnRepository(runtime,true,undefined,bad),rules,undefined,20000,undefined,bad);
    await expect(failing.execute(f.owner,intent,true)).rejects.toThrow('SYNTHETIC_POST_REGISTRATION_FAILURE');
    expect((await actual.loadSave(f.owner,f.saveId))?.revision).toBe(0);
    for(const t of ['turn_requests','turn_events','npc_memory_journals','narrative_receipt_ownership','narrative_context_snapshots','narrative_generation_requests']){
      expect((await admin.query('SELECT 1 FROM '+t+' WHERE save_id=$1',[f.saveId])).rowCount,t).toBe(0);
    }
    expect(await writes.queued()).toEqual([]);
  });
  it.each(['continue','forgetting'] as const)('pins %s P5 memory from a real same-turn grant on the original transaction client',async mode=>{
    const f=await fixture(mode),policy=createP1SaveMemoryPolicy(mode,0,'synthetic');
    const talk:ServerTurnRules={...rules,
      decide:(_action,save)=>({status:'accepted',outcome:'success',nextRevision:save.revision+1,events:[{
        id:randomUUID(),saveId:f.saveId,type:'talk.occurred',branchId:'root',beforeRevision:save.revision,
        afterRevision:save.revision+1,occurredAt:new Date().toISOString(),source:'RULES',ruleVersion:'synthetic',
        payload:{npcId:'npc-speaker',topicTag:'topic_route',outcome:'on_topic'},
      }]}),
      grantsForEvent:event=>['npc-speaker','npc-other'].map(npcId=>{
        const summary='topic_route '+npcId+' turn '+event.afterRevision;
        return {npcId,eventId:event.id,channel:'witnessed',authorizationPolicyVersion:'visibility-v1',
          authorizedFields:['summary'],authorizedFacts:{summary},visibleSummary:summary};
      }),
      policyForNpc:()=>mode+'-v1',
    };
    const abort=new AbortController();
    const transact={...actual,async commitAcceptedTurn(input:Parameters<typeof actual.commitAcceptedTurn>[0]){
      const result=await actual.commitAcceptedTurn(input);abort.abort();return result;
    }};
    const sender=new ServerTurnService(transact,talk,undefined,20000,undefined,port),intent=f.intent();
    expect(await sender.execute(f.owner,intent,true,abort.signal)).toMatchObject({status:'accepted'});
    const snapshot=async()=>(await admin.query('SELECT context FROM public.narrative_context_snapshots WHERE save_id=$1 AND request_key=$2',
      [f.saveId,intent.idempotencyKey])).rows[0].context;
    const saved=await snapshot();
    expect(saved.hints.memoryPolicyIdentity).toMatchObject({mode,policy});
    expect(saved.hints.npcMemories).toMatchObject([{npcId:'npc-speaker',observations:[{summary:'topic_route npc-speaker turn 1'}]}]);
    expect(JSON.stringify(saved.hints.npcMemories)).not.toContain('npc-other');
    expect(await sender.execute(f.owner,f.intent(1),false)).toMatchObject({status:'accepted',narrative:{status:'not_requested'}});
    expect(await snapshot()).toEqual(saved);
    const lease=await writes.claim(f.owner,f.saveId,intent.idempotencyKey);
    expect(lease?.context).toEqual(saved);
    if(!lease)throw Error('EXPECTED_LEASE');
    await writes.publish(lease,'memory snapshot proof');
    const read=await reads.presentation(f.owner,f.saveId,intent.idempotencyKey);
    expect(JSON.stringify(read)).not.toContain('npcMemories');
  });
  it('durably publishes once, reads with two fresh hosts/cookies, rejects foreign session, paginates and preserves 0024',async()=>{
    const f=await fixture(),other=await fixture(),intent=await heldTurn(f);
    let renders=0;
    const runner=new NarrativeOutboxWorker(writes,new Map([[renderer,()=>{renders++;return 'source body 😀';}]]));
    expect(await runner.drain()).toEqual(['published']);
    const duplicate=await service.execute(f.owner,intent,true);
    expect(duplicate).toMatchObject({status:'accepted',duplicate:true,narrative:{status:'received'}});
    const path='/api/games/'+f.saveId+'/presentations';
    const first=await app().request(path,{headers:{cookie:f.cookie}});
    expect(first.status).toBe(200);
    const body=await first.json();
    const source=body.items[0].presentation.source;
    expect(source.text).toContain('source body 😀');
    expect(await readThroughNewHost(path,f.cookie)).toEqual(body);
    const nextSession=await issuer.refresh(f.token);expect(nextSession?.session.ownerId).toBe(f.owner);
    expect(await readThroughNewHost(path,'jx_session='+nextSession!.token)).toEqual(body);
    await expect(readThroughNewHost(path,f.cookie,true)).rejects.toThrow('INJECT_HTTP_LISTENER_FAILURE');
    expect((await app().request(path,{headers:{cookie:other.cookie}})).status).toBe(404);
    expect((await app().request(path)).status).toBe(401);
    expect((await app().request('/api/games/'+f.saveId+'/sources/'+source.sourceId,{headers:{cookie:'jx_session='+nextSession!.token}})).status).toBe(200);
    expect((await app().request('/api/games/'+f.saveId+'/sources/'+intent.idempotencyKey,{headers:{cookie:'jx_session='+nextSession!.token}})).status).toBe(404);
    for(let i=1;i<12;i++) expect(await service.execute(f.owner,f.intent(i),false)).toMatchObject({status:'accepted',narrative:{status:'not_requested'}});
    const latest=await reads.story(f.owner,f.saveId,12),older=await reads.story(f.owner,f.saveId,12,latest.nextBefore!);
    expect([...older.items,...latest.items].map(x=>x.receipt.resultingRevision)).toEqual(Array.from({length:12},(_,i)=>i+1));
    expect(older.items[0]?.text).toBe(source.text);
    expect(await runner.drain()).toEqual([]);expect(renders).toBe(1);
    // Pre-cutover action on an independent save. No T1 declaration may be invented.
    const old=await fixture(), oldIntent=old.intent();
    const pre=new ServerTurnService(createPostgresServerTurnRepository(runtime,true),rules);
    expect(await pre.execute(old.owner,oldIntent)).toMatchObject({status:'accepted'});
    expect((await reads.presentation(old.owner,old.saveId,oldIntent.idempotencyKey))?.publication).toBe('ownership_unknown');
    await admin.query("INSERT INTO story_narratives(save_id,idempotency_key,revision,narrative_text,source) VALUES($1,$2,1,'old text','model')",[old.saveId,oldIntent.idempotencyKey]);
    expect((await reads.story(old.owner,old.saveId,1)).items[0]).toMatchObject({text:'old text',source:'model'});
  });
  it('ignoring AbortSignal cannot publish after timeout, expiry, re-claim or account deletion',async()=>{
    const f=await fixture(),intent=await heldTurn(f);
    const short=new NarrativePublicationRepository(worker,limits,{leaseMs:60,maxAttempts:3});
    const lease=await short.claim(f.owner,f.saveId,intent.idempotencyKey);if(!lease)throw Error('EXPECTED_LEASE');
    await admin.query('SELECT pg_sleep(0.08)');
    const reclaimed=await writes.claim(f.owner,f.saveId,intent.idempotencyKey);if(!reclaimed)throw Error('EXPECTED_RECLAIM');
    await expect(writes.publish(lease,'stale')).rejects.toThrow('NARRATIVE_STALE_ATTEMPT');
    await writes.fail(reclaimed);
    await expect(writes.publish(reclaimed,'after failure')).rejects.toThrow('NARRATIVE_STALE_ATTEMPT');
    const i2=await heldTurn(f,f.intent(1));let release!:()=>void;
    const late=new Promise<void>(resolve=>{release=resolve;});
    const ignoring=new NarrativeOutboxWorker(writes,new Map([[renderer,async()=>{await late;return 'late';}]]),20);
    try{await expect(ignoring.run(f.owner,f.saveId,i2.idempotencyKey)).rejects.toThrow('NARRATIVE_EXECUTION_TIMEOUT');}
    finally{release();}
    const i3=await heldTurn(f,f.intent(2));const last=await writes.claim(f.owner,f.saveId,i3.idempotencyKey);if(!last)throw Error('EXPECTED_LEASE');
    const op=randomUUID(), hash=hashToken(f.token);
    await admin.query("INSERT INTO account_operations(id,owner_id,session_hash,operation,old_email,phase,expires_at) SELECT $1,id,$2,'delete',email,'ready',now()+interval '5 minutes' FROM auth_accounts WHERE id=$3",[op,hash,f.owner]);
    const snapshot=async()=>createHash('sha256').update(JSON.stringify((await admin.query(`SELECT to_jsonb(g) g,to_jsonb(o) o,to_jsonb(t) r,
       (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM narrative_attempts a WHERE a.generation_id=g.id) attempts
       FROM turn_requests t JOIN narrative_receipt_ownership o ON o.save_id=t.save_id AND o.request_key=t.idempotency_key
       JOIN narrative_generation_requests g ON g.id=o.generation_id WHERE o.owner_id=$1 ORDER BY g.id`,[f.owner])).rows)).digest('hex');
    const before=await snapshot(); let fail=true;
    const lifecycle=new AccountLifecycle(runtime,async()=>{},'synthetic-proof-'.repeat(3),'fixture-policy',true,()=>true,undefined,undefined,erasure,
      async(c,owner)=>{expect((await c.query("SELECT current_setting('jiuxiao.account_erasure_operation') op,session_user u")).rows[0]).toEqual({op,u:new URL(process.env.T1_ERASURE_URL!).username});
        await eraseNarrativeForOwner(c,owner);if(fail)throw Error('AFTER_PROOF_CLEANUP_FAILURE');});
    await expect(lifecycle.complete(f.owner,hash,op,'DELETE_ACCOUNT')).rejects.toThrow('AFTER_PROOF_CLEANUP_FAILURE');expect(await snapshot()).toBe(before);
    fail=false;
    await admin.query("CREATE FUNCTION t1_fault_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'AFTER_CLEANUP_AUDIT_FAILURE'; END$$; CREATE TRIGGER t1_fault BEFORE INSERT ON account_lifecycle_audit FOR EACH ROW EXECUTE FUNCTION t1_fault_audit()");
    try{await expect(lifecycle.complete(f.owner,hash,op,'DELETE_ACCOUNT')).rejects.toThrow('AFTER_CLEANUP_AUDIT_FAILURE');}
    finally{await admin.query('DROP TRIGGER t1_fault ON account_lifecycle_audit;DROP FUNCTION t1_fault_audit()');}
    expect(await snapshot()).toBe(before);
    let releaseDelete!:()=>void, acquired!:()=>void;
    const released=new Promise<void>(ok=>{releaseDelete=ok;});
    const reached=new Promise<void>(ok=>{acquired=ok;});
    const concurrent=new AccountLifecycle(runtime,async()=>{},'synthetic-proof-'.repeat(3),'fixture-policy',true,()=>true,undefined,undefined,erasure,
      async(c,owner)=>{await eraseNarrativeForOwner(c,owner);acquired();await released;});
    const deletion=concurrent.complete(f.owner,hash,op,'DELETE_ACCOUNT');
    await Promise.race([deletion.then(()=>{throw Error('ERASURE_BARRIER_NOT_REACHED');}),reached]);
    const workerName=new URL(process.env.T1_WORKER_URL!).username;
    const publishing=expect(writes.publish(last,'racing publication')).rejects.toThrow('NARRATIVE_NOT_FOUND');
    try{
      const until=Date.now()+3000;
      let waiting=false;
      while(Date.now()<until&&!waiting){
        waiting=Boolean((await admin.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",[workerName])).rowCount);
        if(!waiting)await new Promise(ok=>setTimeout(ok,10));
      }
      expect(waiting).toBe(true);
    }finally{releaseDelete();await Promise.all([deletion,publishing]);}
    await expect(writes.publish(last,'late after deletion')).rejects.toThrow('NARRATIVE_NOT_FOUND');
    expect(await reads.presentation(f.owner,f.saveId,i3.idempotencyKey)).toBeNull();
  });
  it('lost COMMIT acknowledgement uses the original key and a fresh connection; uncertainty never resubmits',async()=>{
    for(const committed of [true,false]){
      const f=await fixture(), intent=f.intent();let commits=0;
      // Only the transport acknowledgement is withheld; the actual transaction outcome is
      // committed/rolled back on PostgreSQL before the repository observes the injected failure.
      const pool=new Proxy(runtime,{get(target,key){
        if(key!=='connect')return typeof Reflect.get(target,key)==='function'?Reflect.get(target,key).bind(target):Reflect.get(target,key);
        return async()=>{
          const c=await runtime.connect();
          return new Proxy(c,{get(client,prop){
            if(prop!=='query')return typeof Reflect.get(client,prop)==='function'?Reflect.get(client,prop).bind(client):Reflect.get(client,prop);
            return async (sql:string,values?:unknown[])=>{
              if(sql==='COMMIT'){commits++;await client.query(committed?'COMMIT':'ROLLBACK');throw Error('SYNTHETIC_ACK_LOSS');}
              return client.query(sql,values);
            };
          }});
        };
      }});
      const sender=new ServerTurnService(createPostgresServerTurnRepository(pool,true,undefined,port),rules,undefined,20000,undefined,port);
      if(committed) expect(await sender.execute(f.owner,intent,false)).toMatchObject({status:'accepted',duplicate:true});
      else await expect(sender.execute(f.owner,intent,false)).rejects.toThrow('TURN_COMMIT_OUTCOME_UNKNOWN');
      expect(commits).toBe(1);expect((await actual.loadSave(f.owner,f.saveId))?.revision).toBe(committed?1:0);
      expect((await actual.getReceiptForOwner(f.owner,f.saveId,intent.idempotencyKey))?.resultingRevision).toBe(committed?1:undefined);
      expect((await admin.query('SELECT 1 FROM narrative_receipt_ownership WHERE save_id=$1',[f.saveId])).rowCount).toBe(committed?1:0);
    }
  });
  it('denies direct generation rebinding and prevents worker acting as owner/operator/eraser',async()=>{
    for(const p of [runtime,worker]) {
      await expect(p.query("UPDATE public.narrative_receipt_ownership SET generation_id=gen_random_uuid()")).rejects.toMatchObject({code:'42501'});
      for(const role of ['jiuxiao_narrative_operator','jiuxiao_narrative_erasure','jiuxiao_narrative_lock_owner']){
        await expect(p.query('SET ROLE '+role)).rejects.toMatchObject({code:'42501'});
      }
    }
  });
});
