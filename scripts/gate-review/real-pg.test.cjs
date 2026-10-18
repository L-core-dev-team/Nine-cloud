'use strict';
// Real PostgreSQL component/fault tests with synthetic receipts. Never official gameplay T01-T16.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{randomUUID,createHash}=require('crypto');
const S=require('./support.cjs'),M=require('./migration.cjs');
const run=process.env.GATE_REVIEW_RUN;assert.match(run??'',/^[a-z0-9-]+$/);
let db,app,operator,eraser,lib,workerLib,folder,legacy,oldSnapshot;const observations=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function tx(p,fn,isolation=''){const c=await p.connect();try{await c.query('BEGIN '+isolation);await c.query("SET LOCAL lock_timeout='3s'");const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function rejected(fn,pattern){await assert.rejects(fn,pattern);}
async function counts(f){return (await db.query(`SELECT (SELECT count(*)::int FROM turn_requests WHERE save_id=$1) AS receipts,
 (SELECT count(*)::int FROM turn_events WHERE save_id=$1) AS events,(SELECT revision FROM game_saves WHERE id=$1) AS revision,
 (SELECT count(*)::int FROM narrative_generation_requests WHERE save_id=$1) AS generations,
 (SELECT count(*)::int FROM narrative_attempts WHERE generation_id IN(SELECT id FROM narrative_generation_requests WHERE save_id=$1)) AS attempts,
 (SELECT count(*)::int FROM narrative_publications WHERE save_id=$1) AS publications,
 (SELECT count(*)::int FROM narrative_sources WHERE generation_id IN(SELECT id FROM narrative_generation_requests WHERE save_id=$1)) AS sources`,[f.saveId])).rows[0];}
async function snapshot(){return (await db.query(`SELECT g.id,g.state,g.lease_epoch,c.context_sha,c.receipt_sha,p.source_id,s.body_sha
 FROM narrative_generation_requests g JOIN narrative_context_snapshots c ON c.id=g.context_id
 LEFT JOIN narrative_publications p ON p.generation_id=g.id LEFT JOIN narrative_sources s ON s.id=p.source_id
 WHERE g.id=$1`,[legacy.generation])).rows;}
async function suppressed(p=db){const f=await S.fixture(db,{seed:false});await tx(p,c=>S.recordOwner(c,f,'suppressed'));return f;}
async function beginManaged(c,f){await S.recordOwner(c,f);const g=await lib.seedNarrativeInTransaction(c,{ownerId:f.owner,receipt:f.receipt,save:f.save,rendererVersion:'handover-fixture-v1'});await c.query('UPDATE narrative_receipt_ownership SET generation_id=$1 WHERE save_id=$2 AND request_key=$3',[g,f.saveId,f.key]);return g;}
async function waitLock(pid){for(let i=0;i<100;i++){if((await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",[pid])).rowCount)return;await sleep(10);}throw Error('EXPECTED_DB_LOCK_WAIT');}
before(async()=>{
 db=await S.createDatabase('jiuxiao_test_gate-revised-'+run);await S.migrate(db);await M.prepareRoles(db);
 lib=await S.load('narrative-publication-repository');workerLib=await S.load('narrative-outbox-worker');
 legacy=await S.fixture(db);const r=new lib.NarrativePublicationRepository(db,lib.TEST_BODY_LIMITS);await r.publish(await r.claim(legacy.owner,legacy.saveId,legacy.key),'\ufeffold-0022-body😀\r\n');oldSnapshot=await snapshot();
 folder=M.buildCandidate(run);await M.migrateCandidate(db,folder);await M.migrateCandidate(db,folder);
 await M.grantApplication(db);const name='jiuxiao_test_gate-revised-'+run;
 app=await S.pool(name,'gr01_app');operator=await S.pool(name,'gr01_operator');eraser=await S.pool(name,'gr01_eraser');
});
after(async()=>{
 if(db){fs.writeFileSync(path.join(S.evidence,run+'-observations.json'),JSON.stringify({kind:'real-pg-component-fault-tests',formal:{pass:0,blocked:16},observations},null,2),{flag:'wx'});}
 await Promise.all([app?.end(),operator?.end(),eraser?.end(),db?.end()]);
});
test('development Drizzle upgrade and repeat retain existing 0022 source bytes and identity',async()=>{
 assert.deepEqual(await snapshot(),oldSnapshot);const versions=(await db.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n;assert.equal(versions,24);
 observations.push({case:'upgrade',versions,old0022SnapshotBefore:oldSnapshot,old0022SnapshotAfter:await snapshot()});
});
test('suppressed then context/G insert is rejected and leaves zero C/G/A/S',async()=>{
 const f=await suppressed(app);await rejected(()=>tx(app,c=>lib.seedNarrativeInTransaction(c,{ownerId:f.owner,receipt:f.receipt,save:f.save,rendererVersion:'handover-fixture-v1'})),/DECLARATION_REQUIRED/);
 assert.deepEqual(await counts(f),{receipts:1,events:1,revision:1,generations:0,attempts:0,publications:0,sources:0});
});
test('standalone G cannot hide behind a pre-existing 0022 context of a suppressed receipt',async()=>{
 // Legacy context was made before upgrade; its missing declaration cannot be treated as managed.
 await rejected(()=>db.query("INSERT INTO narrative_generation_requests(id,context_id,save_id,request_key,generation_key,publication_key) SELECT $1,context_id,save_id,request_key,'initial-v1','initial-v1' FROM narrative_generation_requests WHERE id=$2",[randomUUID(),legacy.generation]),/DECLARATION_REQUIRED/);
});
test('managed declaration without G fails at COMMIT, with complete rollback',async()=>{
 const f=await S.fixture(db,{seed:false});await rejected(()=>tx(app,c=>S.recordOwner(c,f)),/MANAGED_INTEGRITY_FAILURE/);
 assert.equal((await db.query('SELECT 1 FROM narrative_receipt_ownership WHERE save_id=$1',[f.saveId])).rowCount,0);
});
test('valid managed atomic registration succeeds; G/context identities remain protected by 0022',async()=>{
 const f=await S.seedManaged(db),other=await S.seedManaged(db);
 await rejected(()=>db.query('UPDATE narrative_generation_requests SET context_id=(SELECT context_id FROM narrative_generation_requests WHERE id=$1) WHERE id=$2',[other.generation,f.generation]),/IMMUTABLE|INTEGRITY/);
 await rejected(()=>db.query("UPDATE narrative_context_snapshots SET context=context || '{\"rendererVersion\":\"wrong\"}'::jsonb WHERE save_id=$1",[f.saveId]),/IMMUTABLE/);
 await rejected(()=>db.query('UPDATE narrative_receipt_ownership SET generation_id=$1 WHERE save_id=$2',[other.generation,f.saveId]),/IMMUTABLE/);
});
for(const kind of ['owner','save','receipt','renderer','branch'])test('registration rejects wrong '+kind,async()=>{
 const f=await S.fixture(db,{seed:false}),other=await S.fixture(db,{seed:false});
 await rejected(()=>tx(db,async c=>{
  if(kind==='owner')await S.recordOwner(c,{...f,owner:other.owner});
  else if(kind==='save')await S.recordOwner(c,{...f,saveId:other.saveId,key:other.key});
  else if(kind==='receipt')await c.query(`INSERT INTO narrative_receipt_ownership(owner_id,save_id,request_key,receipt_sha,protocol_version,ownership,request_narrative,renderer_version,context_version,branch_id)
   VALUES($1,$2,$3,$4,2,'suppressed',false,'handover-fixture-v1','authority-context-v1','root')`,[f.owner,f.saveId,f.key,'0'.repeat(64)]);
  else{await S.recordOwner(c,f);await lib.seedNarrativeInTransaction(c,{ownerId:f.owner,receipt:f.receipt,save:f.save,rendererVersion:kind==='renderer'?'wrong':'handover-fixture-v1'});
   if(kind==='branch')await c.query("UPDATE narrative_receipt_ownership SET branch_id='forged' WHERE save_id=$1",[f.saveId]);}
 }),/IDENTITY|INTEGRITY|check constraint|IMMUTABLE/);
});
test('owned receipt JSON is immutable while narrative status metadata may change',async()=>{
 const f=await S.seedManaged(db);await rejected(()=>db.query("UPDATE turn_requests SET result=jsonb_set(result,'{resultingRevision}','999'::jsonb) WHERE save_id=$1",[f.saveId]),/OWNED_RECEIPT_IMMUTABLE/);
 await db.query("UPDATE turn_requests SET narrative_status='generating' WHERE save_id=$1",[f.saveId]);
 assert.equal((await db.query('SELECT result FROM turn_requests WHERE save_id=$1',[f.saveId])).rows[0].result.resultingRevision,1);
});
for(const isolation of ['READ COMMITTED','REPEATABLE READ'])test('concurrent suppressed vs managed admission under '+isolation,async()=>{
 const f=await S.fixture(db,{seed:false}),a=await app.connect(),b=await app.connect();try{
  await a.query('BEGIN');await b.query('BEGIN ISOLATION LEVEL '+isolation);await b.query('SELECT count(*) FROM narrative_receipt_ownership');
  await S.recordOwner(a,f,'suppressed');
  const pid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const pending=beginManaged(b,f).then(()=>({ok:true}),e=>({ok:false,code:e.code,message:e.message}));await waitLock(pid);
  await a.query('COMMIT');const outcome=await pending;assert.equal(outcome.ok,false);await b.query('ROLLBACK');
  assert.equal((await counts(f)).generations,0);observations.push({case:'concurrent-admission',isolation,outcome});
 }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();}
});
for(const isolation of ['READ COMMITTED','REPEATABLE READ'])test('concurrent receipt mutation vs registration under '+isolation,async()=>{
 const f=await S.fixture(db,{seed:false}),a=await db.connect(),b=await db.connect();try{
  await a.query('BEGIN');await b.query('BEGIN ISOLATION LEVEL '+isolation);await b.query('SELECT result FROM turn_requests WHERE save_id=$1',[f.saveId]);
  await S.recordOwner(a,f,'suppressed');const pid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const pending=b.query("UPDATE turn_requests SET result=jsonb_set(result,'{resultingRevision}','999'::jsonb) WHERE save_id=$1",[f.saveId]).then(()=>({ok:true}),e=>({ok:false,code:e.code,message:e.message}));
  await waitLock(pid);await a.query('COMMIT');const outcome=await pending;assert.equal(outcome.ok,false);await b.query('ROLLBACK');
  assert.equal((await db.query('SELECT result FROM turn_requests WHERE save_id=$1',[f.saveId])).rows[0].result.resultingRevision,1);observations.push({case:'receipt-race',isolation,outcome});
 }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();}
});
test('app cannot forge operator, erasure membership, replication setting, trigger bypass or fence',async()=>{
 for(const q of ['SET ROLE jiuxiao_narrative_operator','SET ROLE jiuxiao_narrative_erasure',"SET SESSION AUTHORIZATION gate_review_admin","SET session_replication_role='replica'",'ALTER TABLE narrative_receipt_ownership DISABLE TRIGGER ALL','TRUNCATE narrative_receipt_ownership',"UPDATE narrative_writer_fence SET old_role_revoked=true"])
  await rejected(()=>app.query(q),/permission denied|must be|superuser|privilege/);
 await db.query('GRANT INSERT,UPDATE ON narrative_writer_fence TO gr01_app');
 try{await rejected(()=>app.query("INSERT INTO narrative_writer_fence(singleton,protocol_version,phase,fleet_manifest_sha,renderer_version,valid_until) VALUES(true,2,'fenced',$1,'handover-fixture-v1',now()+interval '10 minutes')",['a'.repeat(64)]),/OPERATOR_REQUIRED/);}finally{await db.query('REVOKE INSERT,UPDATE ON narrative_writer_fence FROM gr01_app');}
});
test('GUC selector alone cannot delete ownership, including former test-cleanup bypass',async()=>{
 const f=await suppressed(app);await db.query('GRANT DELETE ON narrative_receipt_ownership TO gr01_app');
 try{for(const selector of ['invented-proof','test-cleanup'])await rejected(()=>tx(app,async c=>{await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[selector]);await c.query('DELETE FROM narrative_receipt_ownership WHERE save_id=$1',[f.saveId]);}),/AUTHORIZED_ERASURE_REQUIRED/);}
 finally{await db.query('REVOKE DELETE ON narrative_receipt_ownership FROM gr01_app');}
});
test('operator needs drained sessions and effective old-role privilege revocation before managed fence',async()=>{
 await db.query('ALTER ROLE gr01_retired LOGIN');await db.query('GRANT INSERT ON narrative_sources TO gr01_retired');
 const insert=()=>operator.query(`INSERT INTO narrative_writer_fence(singleton,protocol_version,phase,fleet_manifest_sha,renderer_version,
  old_writer_drained,old_role_revoked,valid_until,retired_roles,drain_evidence_sha)
  VALUES(true,2,'managed',$1,'handover-fixture-v1',true,true,now()+interval '1 hour',ARRAY['gr01_retired'],$2)`,['a'.repeat(64),'b'.repeat(64)]);
 await rejected(insert,/OLD_ROLE_NOT_DRAINED/);const retired=await S.pool('jiuxiao_test_gate-revised-'+run,'gr01_retired');
 await db.query('ALTER ROLE gr01_retired NOLOGIN');await rejected(insert,/OLD_ROLE_NOT_DRAINED/);await retired.end();
 for(let i=0;i<100&&(await db.query("SELECT 1 FROM pg_stat_activity WHERE usename='gr01_retired'")).rowCount;i++)await sleep(10);
 await rejected(insert,/OLD_ROLE_STILL_PRIVILEGED/);await db.query('REVOKE INSERT ON narrative_sources FROM gr01_retired');await insert();
 const fence=(await db.query('SELECT * FROM narrative_writer_fence')).rows[0];assert.equal(fence.attested_by,'gr01_operator');observations.push({case:'operator-fence',fence,externalFleetEvidence:'synthetic test attestation only; no production fleet verified'});
});
test('timed-out renderer may continue computation but cannot publish or re-claim terminal failed G',async()=>{
 const f=await S.seedManaged(db),repo=new lib.NarrativePublicationRepository(app,lib.TEST_BODY_LIMITS,{maxAttempts:3,leaseMs:150000});let release,signal,lateComputations=0;
 const rendered=new Promise(r=>release=r),w=new workerLib.NarrativeOutboxWorker(repo,new Map([['handover-fixture-v1',async(_r,_c,s)=>{signal=s;await rendered;lateComputations++;return 'late timed-out body';}]]),25);
 const before=await counts(f);await rejected(()=>w.run(f.owner,f.saveId,f.key),/EXECUTION_TIMEOUT/);assert.equal(signal.aborted,true);
 release();await sleep(60);assert.equal(lateComputations,1);const after=await counts(f);
 assert.equal(after.sources,0);assert.equal(after.publications,0);assert.equal(after.receipts,before.receipts);assert.equal(after.events,before.events);assert.equal(after.revision,before.revision);
 await db.query('SELECT pg_sleep(0.03)');assert.equal(await repo.claim(f.owner,f.saveId,f.key),null);
 await rejected(()=>db.query("UPDATE narrative_generation_requests SET state='running',lease_epoch=lease_epoch+1 WHERE id=$1",[f.generation]),/FAILED_TERMINAL/);
 observations.push({case:'timeout',before,after,aborted:signal.aborted,lateComputations,failedAutomaticallyReclaimed:false,externalArbitraryClosureSideEffectsProvenAbsent:false});
});
test('expired epoch is fenced after a second worker takes over, old renderer result cannot publish',async()=>{
 const f=await S.seedManaged(db),repo=new lib.NarrativePublicationRepository(app,lib.TEST_BODY_LIMITS,{maxAttempts:3,leaseMs:50});let release,started;
 const held=new Promise(r=>started=r),old=new workerLib.NarrativeOutboxWorker(repo,new Map([['handover-fixture-v1',async()=>{started();return new Promise(r=>release=r);}]]),1000);
 const pending=old.run(f.owner,f.saveId,f.key).then(()=>({ok:true}),e=>({ok:false,message:e.message}));
 await Promise.race([held,pending.then(v=>{throw Error('OLD_WORKER_DID_NOT_START:'+JSON.stringify(v));}),sleep(3000).then(()=>{throw Error('OLD_WORKER_START_TIMEOUT');})]);await sleep(90);
 const next=await repo.claim(f.owner,f.saveId,f.key);assert.equal(next.leaseEpoch,2);const source=await repo.publish(next,'new epoch body');release('old epoch body');const outcome=await pending;assert.equal(outcome.ok,false);assert.match(outcome.message,/STALE_ATTEMPT/);
 const after=await counts(f);assert.equal(after.sources,1);assert.equal(after.publications,1);assert.equal((await repo.presentation(f.owner,f.saveId,f.key)).source.bodySha,source.bodySha);
 observations.push({case:'expired-epoch',outcome,after,winningEpoch:next.leaseEpoch,sourceSha:source.bodySha,testLeaseMs:50,productionLeaseUnchanged:150000});
});
test('valid live lease cannot be claimed concurrently by another database connection',async()=>{
 const f=await S.seedManaged(db),repo=new lib.NarrativePublicationRepository(app,lib.TEST_BODY_LIMITS,{maxAttempts:3,leaseMs:150000});const a=await repo.claim(f.owner,f.saveId,f.key);
 const claims=await Promise.all(Array.from({length:8},()=>repo.claim(f.owner,f.saveId,f.key)));assert.ok(claims.every(x=>x===null));assert.equal((await counts(f)).attempts,1);await repo.fail(a);
});
test('erasure role still requires matching owner, ready delete operation and unexpired proof',async()=>{
 const f=await S.seedManaged(db),other=await S.fixture(db,{seed:false}),ids=[];
 for(const [owner,operation,phase,expiry] of [[other.owner,'delete','ready',60],[f.owner,'close','ready',60],[f.owner,'delete','failed',60],[f.owner,'delete','ready',-1]]){
  const id=randomUUID();ids.push(id);await db.query("INSERT INTO account_operations(id,owner_id,session_hash,operation,phase,expires_at) VALUES($1,$2,'gate-fixture',$3,$4,now()+$5*interval '1 second')",[id,owner,operation,phase,expiry]);
  await rejected(()=>tx(eraser,async c=>{await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[id]);await c.query('DELETE FROM narrative_receipt_ownership WHERE owner_id=$1',[f.owner]);}),/AUTHORIZED_ERASURE_REQUIRED/);
 }
 // Even a genuine operation ID cannot give an application login erasure authority.
 const id=randomUUID();await db.query("INSERT INTO account_operations(id,owner_id,session_hash,operation,phase,expires_at) VALUES($1,$2,'gate-fixture','delete','ready',now()+interval '1 minute')",[id,f.owner]);
 await tx(app,async c=>{await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[id]);assert.equal((await c.query('SELECT narrative_erasure_allowed($1::jsonb) AS allowed',[JSON.stringify({owner_id:f.owner,save_id:f.saveId})])).rows[0].allowed,false);});
 await tx(eraser,async c=>{await c.query('SELECT id FROM auth_accounts WHERE id=$1 FOR UPDATE',[f.owner]);await c.query('SELECT id FROM game_saves WHERE owner_id=$1 FOR UPDATE',[f.owner]);await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[id]);await lib.eraseNarrativeForOwner(c,f.owner);});
 assert.equal((await db.query('SELECT 1 FROM narrative_receipt_ownership WHERE owner_id=$1',[f.owner])).rowCount,0);assert.equal((await counts(f)).generations,0);
});
test('existing lifecycle scheduled expiry works through separately authorized erasure connection',async()=>{
 const f=await S.seedManaged(db);await db.query("UPDATE auth_accounts SET last_seen_at=now()-interval '91 days' WHERE id=$1",[f.owner]);
 const {AccountLifecycle}=await S.load('account-lifecycle');const service=new AccountLifecycle(eraser,async()=>{},f.secret,'gate-review-only-policy',true);
 await service.expireClosed(true);assert.equal((await db.query('SELECT 1 FROM auth_accounts WHERE id=$1',[f.owner])).rowCount,0);
});
test('new Drizzle declarations match actual PostgreSQL columns, nullability, uniqueness and FK shape',async()=>{
 const {pathToFileURL}=require('url'),schema=await import(pathToFileURL(path.join(S.root,'packages/db/dist/narrative-v2-schema.js')).href),{getTableConfig}=S.req('drizzle-orm/pg-core');
 const evidence=[];
 for(const table of [schema.narrativeWriterFence,schema.narrativeReceiptOwnership]){
  const config=getTableConfig(table),columns=(await db.query('SELECT column_name,is_nullable,udt_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1 ORDER BY ordinal_position',[config.name])).rows;
  assert.deepEqual(config.columns.map(c=>c.name),columns.map(c=>c.column_name));
  for(const column of config.columns)assert.equal(column.notNull,columns.find(c=>c.column_name===column.name).is_nullable==='NO');
  const constraints=(await db.query('SELECT contype,condeferrable,condeferred,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY contype,conname',[config.name])).rows;
  assert.equal(constraints.filter(c=>c.contype==='c').length,config.checks.length);
  assert.equal(constraints.filter(c=>c.contype==='f').length,config.foreignKeys.length);
  for(const index of config.indexes.filter(i=>i.config.unique))assert.ok(constraints.some(c=>c.contype==='u'&&c.definition==='UNIQUE ('+index.config.columns.map(c=>c.name).join(', ')+')'));
  for(const pk of config.primaryKeys)assert.ok(constraints.some(c=>c.contype==='p'&&c.definition==='PRIMARY KEY ('+pk.columns.map(c=>c.name).join(', ')+')'));
  if(config.name==='narrative_receipt_ownership')assert.ok(constraints.some(c=>c.contype==='f'&&c.definition.startsWith('FOREIGN KEY (generation_id)')&&c.condeferrable&&c.condeferred));
  evidence.push({table:config.name,columns,constraints,drizzleUniqueIndexes:config.indexes.map(i=>i.config.columns.map(c=>c.name)),sqlOnlyFeatures:['deferred generation FK','constraint and authorization triggers','SQL role grants']});
 }
 observations.push({case:'schema-parity',evidence});
});

test('fence rejects remaining column-only write privileges of a retired role',async()=>{
 await db.query('GRANT UPDATE(state) ON narrative_generation_requests TO gr01_retired');
 try{await rejected(()=>operator.query("UPDATE narrative_writer_fence SET valid_until=now()+interval '1 hour'"),/OLD_ROLE_STILL_PRIVILEGED/);}
 finally{await db.query('REVOKE UPDATE(state) ON narrative_generation_requests FROM gr01_retired');}
});

test('read-only fence lock serializes operator changes until caller transaction ends',async()=>{
 const a=await app.connect(),b=await operator.connect();try{
  await a.query('BEGIN');assert.equal((await a.query("SELECT * FROM public.lock_narrative_writer_fence_v2('handover-fixture-v1')")).rowCount,1);
  const pid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const pending=b.query("UPDATE narrative_writer_fence SET valid_until=now()+interval '1 hour'");await waitLock(pid);await a.query('COMMIT');await pending;
  assert.equal((await app.query("SELECT has_table_privilege(current_user,'narrative_writer_fence','UPDATE') AS allowed")).rows[0].allowed,false);
 }finally{await a.query('ROLLBACK');a.release();b.release();}
});

test('authorized partial ownership erasure is rejected at COMMIT; G and receipt identities persist',async()=>{
 const f=await S.seedManaged(db),id=randomUUID();await db.query("INSERT INTO account_operations(id,owner_id,session_hash,operation,phase,expires_at) VALUES($1,$2,'gate-fixture','delete','ready',now()+interval '1 minute')",[id,f.owner]);
 await rejected(()=>tx(eraser,async c=>{await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[id]);await c.query('DELETE FROM narrative_receipt_ownership WHERE owner_id=$1',[f.owner]);}),/ERASURE_INCOMPLETE/);
 assert.equal((await db.query('SELECT 1 FROM narrative_receipt_ownership WHERE owner_id=$1',[f.owner])).rowCount,1);
 await db.query('GRANT DELETE ON narrative_generation_requests,narrative_context_snapshots TO gr01_app');
 try{for(const table of ['narrative_generation_requests','narrative_context_snapshots'])await rejected(()=>tx(app,async c=>{await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[id]);await c.query('DELETE FROM '+table+' WHERE save_id=$1',[f.saveId]);}),/IMMUTABLE/);}
 finally{await db.query('REVOKE DELETE ON narrative_generation_requests,narrative_context_snapshots FROM gr01_app');}
});

async function commitInput(){
 const f=await S.fixture(db,{seed:false}),{createRequire}=require('module'),{pathToFileURL}=require('url');
 const apiReq=createRequire(path.join(S.root,'apps/api/package.json')),domain=await import(pathToFileURL(apiReq.resolve('@jiuxiao/domain')).href);
 const event={...f.receipt.decision.events[0],id:randomUUID(),branchId:'root',beforeRevision:1,afterRevision:2};
 const previousJournal=domain.createNpcMemoryJournal(f.saveId,1),prepared=domain.prepareNpcMemoryTurn({journal:previousJournal,saveId:f.saveId,beforeRevision:1,afterRevision:2,events:[event],observedAtMinute:2,grantsForEvent:()=>[],policyForNpc:()=> 'accessibility-v1'});
 assert.equal(prepared.status,'prepared');
 return {f,input:{ownerId:f.owner,expectedRevision:1,save:{...f.save,revision:2},receipt:{...f.receipt,idempotencyKey:randomUUID(),branchId:'root',rulesVersion:'fixture',clockMinute:2,rng:{seed:null,draws:0},resultingRevision:2,decision:{status:'accepted',outcome:'success',nextRevision:2,events:[event]}},events:[event],previousJournal,nextJournal:prepared.journal,authorizedObservations:[],requestNarrative:false}};
}
function faultDatabase(mode,stats){return {
 async query(...args){stats.recoveryQueries++;if(mode==='query-unavailable')throw Error('INJECTED_RECOVERY_READ_FAILURE');return db.query(...args);},
 async connect(){const c=await db.connect();return {release(destroy){stats.destroyed=destroy===true;c.release(destroy);},async query(q,...args){
  if(q==='COMMIT'){stats.commitSends++;if(mode==='not-committed'){await c.query('ROLLBACK');throw Error('INJECTED_COMMIT_NOT_SENT');}
   await c.query(q,...args);throw Error('INJECTED_LOST_COMMIT_ACK');}
  return c.query(q,...args);
 }};}
};}
for(const mode of ['committed','not-committed','query-unavailable'])test('real transaction COMMIT recovery with '+mode,async()=>{
 const {PostgresNpcMemoryTurnRepository,TurnCommitOutcomeUnknown}=await S.load('npc-memory-turn-transaction'),{f,input}=await commitInput(),stats={commitSends:0,recoveryQueries:0};
 const repo=new PostgresNpcMemoryTurnRepository(faultDatabase(mode,stats),true,undefined,(c,commit)=>S.recordOwner(c,{...f,key:commit.receipt.idempotencyKey},'suppressed'));
 if(mode==='committed'){const result=await repo.commitAcceptedTurn(input);assert.equal(result.kind,'duplicate');assert.deepEqual(result.receipt,input.receipt);}
 else await assert.rejects(()=>repo.commitAcceptedTurn(input),e=>e instanceof TurnCommitOutcomeUnknown&&e.requestKey===input.receipt.idempotencyKey&&e.saveId===f.saveId);
 assert.equal(stats.commitSends,1);assert.equal(stats.destroyed,true);assert.equal(stats.recoveryQueries,1);
 const committed=mode!=='not-committed',after=await counts(f);assert.equal(after.revision,committed?2:1);assert.equal(after.receipts,committed?2:1);assert.equal(after.events,committed?2:1);
 if(committed){const retry=new PostgresNpcMemoryTurnRepository(app,true);assert.equal((await retry.commitAcceptedTurn(input)).kind,'duplicate');assert.deepEqual(await counts(f),after);}
 observations.push({case:'commit-recovery',mode,stats,after,fault:'real PG transaction; injected client COMMIT acknowledgement/read failure, not a production network fault'});
});

test('recovery rejects foreign owner/save/key and future receipt revision; changed fingerprint stays UNKNOWN',async()=>{
 const {PostgresNpcMemoryTurnRepository,TurnCommitOutcomeUnknown}=await S.load('npc-memory-turn-transaction'),{f,input}=await commitInput(),other=await S.fixture(db,{seed:false});
 const reader=new PostgresNpcMemoryTurnRepository(app,true);
 assert.equal(await reader.getReceiptForOwner(other.owner,f.saveId,f.key),null);assert.equal(await reader.getReceiptForOwner(f.owner,other.saveId,f.key),null);assert.equal(await reader.getReceiptForOwner(f.owner,f.saveId,randomUUID()),null);
 // Recovery's own reader must reject a tampered, otherwise schema-valid result ahead of save revision.
 const future={...f.receipt,resultingRevision:2,decision:{...f.receipt.decision,nextRevision:2,events:f.receipt.decision.events.map(e=>({...e,beforeRevision:1,afterRevision:2}))}};
 await db.query('UPDATE turn_requests SET result=$2::jsonb WHERE save_id=$1',[f.saveId,JSON.stringify(future)]);
 await rejected(()=>reader.getReceiptForOwner(f.owner,f.saveId,f.key),/IDENTITY_OR_REVISION/);
 // Fault only the recovery read after a real successful commit, preserving the database evidence.
 const stats={commitSends:0,recoveryQueries:0},database=faultDatabase('committed',stats),query=database.query;
 database.query=async(...args)=>{const r=await query(...args);return {...r,rows:r.rows.map(row=>({...row,result:{...row.result,requestFingerprint:'sha256:v1:'+'b'.repeat(64)}}))};};
 const repo=new PostgresNpcMemoryTurnRepository(database,true);
 await assert.rejects(()=>repo.commitAcceptedTurn(input),e=>e instanceof TurnCommitOutcomeUnknown);
 assert.equal(stats.commitSends,1);assert.equal((await counts(f)).revision,2);
});

test('real HTTP disconnect after commit recovers original key without another settlement',async()=>{
 const http=require('http'),{PostgresNpcMemoryTurnRepository}=await S.load('npc-memory-turn-transaction'),{f,input}=await commitInput(),repo=new PostgresNpcMemoryTurnRepository(app,true);
 let resolve;const served=new Promise(r=>resolve=r);const server=http.createServer(async(req,res)=>{try{await repo.commitAcceptedTurn(input);res.destroy();resolve();}catch(e){res.destroy(e);resolve(e);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
  await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/',method:'POST'},()=>reject(Error('EXPECTED_DISCONNECT')));req.on('error',e=>{assert.equal(e.code,'ECONNRESET');resolve();});req.end();});
  assert.equal(await served,undefined);const before=await counts(f),receipt=await repo.getReceiptForOwner(f.owner,f.saveId,input.receipt.idempotencyKey);assert.deepEqual(receipt,input.receipt);
  assert.equal((await repo.commitAcceptedTurn(input)).kind,'duplicate');assert.deepEqual(await counts(f),before);
  observations.push({case:'http-disconnect',realLoopbackSocket:true,productionRoute:false,after:before,requestKey:input.receipt.idempotencyKey});
 }finally{await new Promise(r=>server.close(r));}
});

test('closure blocks receipt reads and worker; export retains ownership and original source bytes',async()=>{
 const f=await S.seedManaged(db),{PostgresNpcMemoryTurnRepository}=await S.load('npc-memory-turn-transaction'),{AccountExport}=await S.load('account-export');
 const repository=new lib.NarrativePublicationRepository(app,lib.TEST_BODY_LIMITS,{maxAttempts:3,leaseMs:150000});await repository.publish(await repository.claim(f.owner,f.saveId,f.key),'export-test-body😀\r\n');
 const value=await new AccountExport(app).read(f.owner);assert.equal(value.data.narrativeOwnership.length,1);assert.equal(value.data.narrativePublications[0].text,'export-test-body😀\r\n');
 await db.query('UPDATE auth_accounts SET closed_at=now() WHERE id=$1',[f.owner]);assert.equal(await new PostgresNpcMemoryTurnRepository(app,true).getReceiptForOwner(f.owner,f.saveId,f.key),null);assert.equal(await repository.claim(f.owner,f.saveId,f.key),null);
});

test('existing HTTP turn route returns 503 UNKNOWN and original recovery identity after ambiguous COMMIT',async()=>{
 const {createRequire}=require('module'),{pathToFileURL}=require('url'),apiReq=createRequire(path.join(S.root,'apps/api/package.json'));
 const {Hono}=await import(pathToFileURL(apiReq.resolve('hono')).href),{mountServerTurnRoutes}=await import(pathToFileURL(path.join(S.root,'apps/api/dist/routes/turns.js')).href);
 const {PostgresNpcMemoryTurnRepository}=await S.load('npc-memory-turn-transaction'),{f,input}=await commitInput(),stats={commitSends:0,recoveryQueries:0};
 const repository=new PostgresNpcMemoryTurnRepository(faultDatabase('query-unavailable',stats),true),web=new Hono();
 mountServerTurnRoutes(web,{auth:{resolveOwnerId:async()=>f.owner},service:{execute:async()=>repository.commitAcceptedTurn(input)}});
 const response=await web.request('/api/turns',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intent:{kind:'move',saveId:f.saveId,actorId:'p',expectedRevision:1,idempotencyKey:input.receipt.idempotencyKey,payload:{destinationId:'synthetic-gate'}}})});
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'TURN_COMMIT_OUTCOME_UNKNOWN',saveId:f.saveId,requestKey:input.receipt.idempotencyKey,recovery:'query_original_receipt'});
 assert.equal(stats.commitSends,1);assert.equal((await counts(f)).revision,2);
 observations.push({case:'existing-route-unknown',status:503,realPg:true,syntheticPreparedTurn:true,formalGameplay:false,stats});
});

test('real PG attempt budget is three and exhausted running work becomes terminal failed',async()=>{
 const f=await S.seedManaged(db),repository=new lib.NarrativePublicationRepository(app,lib.TEST_BODY_LIMITS,{maxAttempts:3,leaseMs:10});
 for(let epoch=1;epoch<=3;epoch++){assert.equal((await repository.claim(f.owner,f.saveId,f.key)).leaseEpoch,epoch);await sleep(30);}
 assert.equal(await repository.claim(f.owner,f.saveId,f.key),null);assert.equal((await counts(f)).attempts,3);assert.equal((await repository.presentation(f.owner,f.saveId,f.key)).generation,'failed');
 assert.equal(await repository.claim(f.owner,f.saveId,f.key),null);
});

for(const operation of ['close','delete'])test('trusted lifecycle '+operation+' completes verified session-bound workflow',async()=>{
 const f=await S.seedManaged(db),{AccountLifecycle}=await S.load('account-lifecycle');let mailedCode;
 // Email-confirmed workflows require a registered account, rather than a null-email guest.
 await db.query('UPDATE auth_accounts SET email=$2,is_guest=false WHERE id=$1',[f.owner,randomUUID()+'@gate-review.invalid']);
 const session=(await db.query('SELECT token_hash FROM auth_sessions WHERE owner_id=$1',[f.owner])).rows[0];assert.ok(session);
 const service=new AccountLifecycle(eraser,async(_email,code)=>{mailedCode=code;},f.secret,'isolated-gate-policy',true);
 const started=await service.begin(f.owner,session.token_hash,operation);assert.equal((await service.verify(f.owner,session.token_hash,started.operationId,mailedCode)).phase,'ready');
 const result=await service.complete(f.owner,session.token_hash,started.operationId,operation==='close'?'CLOSE_ACCOUNT':'DELETE_ACCOUNT');
 assert.equal(result.status,operation==='close'?'account_closed':'account_deleted');
 const accounts=(await db.query('SELECT closed_at FROM auth_accounts WHERE id=$1',[f.owner])).rows;
 if(operation==='delete'){assert.equal(accounts.length,0);assert.equal((await db.query('SELECT 1 FROM narrative_receipt_ownership WHERE owner_id=$1',[f.owner])).rowCount,0);}
 else{assert.ok(accounts[0].closed_at);assert.equal((await db.query('SELECT 1 FROM narrative_receipt_ownership WHERE owner_id=$1',[f.owner])).rowCount,1);}
 observations.push({case:'trusted-lifecycle',operation,status:result.status,role:'gr01_eraser',productionPoolWiringVerified:false});
});
