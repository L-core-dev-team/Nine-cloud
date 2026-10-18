'use strict';
// Isolated synthetic SQL/permission preflight. No formal T1 and no golden-baseline acceptance.
const {test,before,after}=require('node:test'),assert=require('assert/strict'),fs=require('fs'),path=require('path'),{randomUUID}=require('crypto');
const S=require('./support.cjs'),M=require('./migration.cjs');
const run=process.env.SIGNOFF_RUN;assert.match(run??'',/^[a-z0-9-]+$/);
const out=path.join(S.root,'docs/integration/t1-v2-signoff-preflight');fs.mkdirSync(out,{recursive:true});
const saved=path.resolve(S.root,'../../交接/T1-V2-SIGNOFF-PREFLIGHT/恢复保护-20261017/docs/integration/pending/0023_narrative_ownership_v2.sql');
const observations=[],pools=[];let oldDb,oldApp,db,app,eraser,operator,outsider,lib,oldPending,oldRunning;
async function pool(name,user){const p=await S.pool(name,user);pools.push(p);return p;}
async function tx(p,fn){const c=await p.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function newManaged(){const f=await S.fixture(db,{seed:false});await tx(app,async c=>{await S.recordOwner(c,f);f.generation=await lib.seedNarrativeInTransaction(c,{ownerId:f.owner,receipt:f.receipt,save:f.save,rendererVersion:'handover-fixture-v1'});await c.query('UPDATE narrative_receipt_ownership SET generation_id=$1 WHERE save_id=$2 AND request_key=$3',[f.generation,f.saveId,f.key]);});return f;}
async function counts(f){return (await db.query('SELECT (SELECT count(*)::int FROM narrative_sources s JOIN narrative_generation_requests g ON g.id=s.generation_id WHERE g.save_id=$1) AS sources,(SELECT count(*)::int FROM narrative_publications WHERE save_id=$1) AS publications',[f.saveId])).rows[0];}
before(async()=>{
 lib=await S.load('narrative-publication-repository');
 oldDb=await S.createDatabase('jiuxiao_test_gate-preflight-old-'+run);pools.push(oldDb);await S.migrate(oldDb);await M.prepareRoles(oldDb);
 oldPending=await S.fixture(oldDb);oldRunning=await S.fixture(oldDb);const oldRepo=new lib.NarrativePublicationRepository(oldDb,lib.TEST_BODY_LIMITS);await oldRepo.claim(oldRunning.owner,oldRunning.saveId,oldRunning.key,150000);
 await tx(oldDb,c=>c.query(fs.readFileSync(saved,'utf8')));await M.grantApplication(oldDb);oldApp=await pool('jiuxiao_test_gate-preflight-old-'+run,'gr01_app');
 db=await S.createDatabase('jiuxiao_test_gate-preflight-new-'+run);pools.push(db);await S.migrate(db);await M.prepareRoles(db);
 const pending=await S.fixture(db),running=await S.fixture(db);
 for(const role of ['grpf_old_writer','grpf_untrusted'])if(!(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await db.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
 await db.query('ALTER ROLE grpf_old_writer LOGIN');await db.query('GRANT USAGE ON SCHEMA public TO grpf_old_writer,grpf_untrusted');await db.query('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO grpf_old_writer');
 const writer=await S.pool('jiuxiao_test_gate-preflight-new-'+run,'grpf_old_writer'),repo=new lib.NarrativePublicationRepository(writer,lib.TEST_BODY_LIMITS);
 const runningLease=await repo.claim(running.owner,running.saveId,running.key,150000),folder=M.buildCandidate('preflight-'+run,out);
 await assert.rejects(()=>M.migrateCandidate(db,folder),/0022_UNFINISHED_GENERATIONS/);
 assert.equal((await db.query("SELECT to_regclass('public.narrative_receipt_ownership') AS relation")).rows[0].relation,null);
 // Exercise existing 0022 terminalization as the real non-admin old writer before the migration.
 await repo.publish(await repo.claim(pending.owner,pending.saveId,pending.key),'drained old 0022 body');await repo.fail(runningLease);
 const terminal=(await writer.query('SELECT id,state FROM narrative_generation_requests ORDER BY id')).rows;
 assert.deepEqual(terminal.map(r=>r.state).sort(),['failed','published']);await writer.end();
 await db.query('ALTER ROLE grpf_old_writer NOLOGIN');await db.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM grpf_old_writer');
 await M.migrateCandidate(db,folder);await M.grantApplication(db);
 app=await pool('jiuxiao_test_gate-preflight-new-'+run,'gr01_app');eraser=await pool('jiuxiao_test_gate-preflight-new-'+run,'gr01_eraser');operator=await pool('jiuxiao_test_gate-preflight-new-'+run,'gr01_operator');outsider=await pool('jiuxiao_test_gate-preflight-new-'+run,'grpf_untrusted');
 observations.push({case:'install-sequence',rejectedUnfinished:true,failedInstallLeftNoOwnershipTable:true,oldWriterUser:'grpf_old_writer',terminal,officialJournalUnchanged:true,externalFleetProven:false});
});
after(async()=>{fs.writeFileSync(path.join(out,run+'-observations.json'),JSON.stringify({kind:'real-pg-signoff-preflight',formalT1Executed:false,P01_P06:'BLOCKED',T01_T16:{pass:0,blocked:16},observations},null,2),{flag:'wx'});await Promise.all(pools.map(p=>p.end()));});

test('sealed prior SQL blocks pending and running 0022 G updates under actual application login',async()=>{
 const rejected=[];for(const f of [oldPending,oldRunning]){
  await assert.rejects(()=>oldApp.query("UPDATE narrative_generation_requests SET state='failed' WHERE id=$1",[f.generation]),e=>{rejected.push({generation:f.generation,code:e.code,message:e.message});return /MANAGED_DECLARATION_REQUIRED/.test(e.message);});
 }
 observations.push({case:'old-0022-update-block',session:(await oldApp.query('SELECT session_user,current_user')).rows[0],rejected});
});

test('prior SQL temporary-table shadow reproduces missing-G admission; revised candidate must prevent it',async()=>{
 const f=await S.fixture(oldDb,{seed:false}),c=await oldApp.connect();try{
  await c.query('BEGIN');await c.query('CREATE TEMP TABLE narrative_receipt_ownership (LIKE public.narrative_receipt_ownership) ON COMMIT DROP');
  await c.query(`INSERT INTO public.narrative_receipt_ownership(owner_id,save_id,request_key,receipt_sha,protocol_version,ownership,request_narrative,renderer_version,context_version,branch_id)
   SELECT $1,$2,$3,encode(sha256(convert_to(result::text,'UTF8')),'hex'),2,'managed',true,'handover-fixture-v1','authority-context-v1','root'
   FROM public.turn_requests WHERE save_id=$2 AND idempotency_key=$3`,[f.owner,f.saveId,f.key]);await c.query('COMMIT');
  const row=(await oldApp.query('SELECT generation_id FROM public.narrative_receipt_ownership WHERE save_id=$1',[f.saveId])).rows[0];assert.equal(row.generation_id,null);
  observations.push({case:'prior-temp-shadow-vulnerability',expected:'DB_REJECT',actual:'ACCEPT',originalCandidateSafety:'FAIL',session:'gr01_app',generation:null});
 }finally{await c.query('ROLLBACK');c.release();}
});

test('revised trigger search paths reject temporary ownership shadow and roll back incomplete managed registration',async()=>{
 const f=await S.fixture(db,{seed:false});await assert.rejects(()=>tx(app,async c=>{
  await c.query('CREATE TEMP TABLE narrative_receipt_ownership (LIKE public.narrative_receipt_ownership) ON COMMIT DROP');
  await c.query(`INSERT INTO public.narrative_receipt_ownership(owner_id,save_id,request_key,receipt_sha,protocol_version,ownership,request_narrative,renderer_version,context_version,branch_id)
   SELECT $1,$2,$3,encode(sha256(convert_to(result::text,'UTF8')),'hex'),2,'managed',true,'handover-fixture-v1','authority-context-v1','root'
   FROM public.turn_requests WHERE save_id=$2 AND idempotency_key=$3`,[f.owner,f.saveId,f.key]);
 }),/MANAGED_INTEGRITY_FAILURE/);
 assert.equal((await app.query('SELECT 1 FROM narrative_receipt_ownership WHERE save_id=$1',[f.saveId])).rowCount,0);
 observations.push({case:'revised-temp-shadow',session:'gr01_app',rejectedAtCommit:true});
});

test('target PG narrative_updated_at column and seal trigger exist; application registration preserves receipt/timestamp',async()=>{
 const fields=(await app.query(`SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attgenerated,a.attidentity
  FROM pg_attribute a WHERE a.attrelid='public.turn_requests'::regclass AND a.attname='narrative_updated_at' AND NOT a.attisdropped`)).rows;
 assert.equal(fields.length,1);assert.equal(fields[0].type,'timestamp with time zone');assert.equal(fields[0].attnotnull,false);
 const triggers=(await app.query(`SELECT c.relname,t.tgname,t.tgenabled,p.proname,pg_get_triggerdef(t.oid) AS definition
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE c.oid IN('public.turn_requests'::regclass,'public.narrative_receipt_ownership'::regclass,'public.narrative_generation_requests'::regclass) AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
 assert.ok(triggers.some(t=>t.proname==='seal_narrative_receipt_v2'&&t.tgenabled==='O'&&t.definition.includes('BEFORE INSERT')));
 const f=await S.fixture(db,{seed:false});await app.query("UPDATE turn_requests SET narrative_updated_at='2026-10-17T00:00:00Z' WHERE save_id=$1",[f.saveId]);
 const query='SELECT result,narrative_updated_at,xmin::text AS version FROM public.turn_requests WHERE save_id=$1 AND idempotency_key=$2';
 const before=(await app.query(query,[f.saveId,f.key])).rows[0];await tx(app,c=>S.recordOwner(c,f,'suppressed'));const after=(await app.query(query,[f.saveId,f.key])).rows[0];
 assert.deepEqual(after.result,before.result);assert.deepEqual(after.narrative_updated_at,before.narrative_updated_at);assert.notEqual(after.version,before.version);
 const managed=await newManaged();assert.ok(managed.generation);
 observations.push({case:'field-trigger-registration',session:(await app.query('SELECT session_user,current_user')).rows[0],fields,triggers,before,after,managedGeneration:managed.generation});
});

test('SECURITY DEFINER owner, search path and execute ACL are restricted, with no outsider access',async()=>{
 const functions=(await app.query(`SELECT p.proname,p.prosecdef,p.proconfig,p.proacl::text AS acl,r.rolname AS owner,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls,
  EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x WHERE x.grantee=0 AND x.privilege_type='EXECUTE') AS public_execute
  FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.pronamespace='public'::regnamespace AND p.proname IN('narrative_erasure_allowed','lock_narrative_writer_fence_v2') ORDER BY p.proname`)).rows;
 assert.equal(functions.length,2);for(const f of functions){assert.equal(f.prosecdef,true);assert.equal(f.owner,'jiuxiao_narrative_schema_owner');assert.equal(f.rolcanlogin,false);assert.equal(f.rolsuper,false);assert.equal(f.rolcreaterole,false);assert.equal(f.rolcreatedb,false);assert.equal(f.rolbypassrls,false);assert.equal(f.public_execute,false);assert.ok(f.proconfig.includes('search_path=pg_catalog, public, pg_temp'));}
 for(const q of ["SELECT * FROM public.lock_narrative_writer_fence_v2('forged')","SELECT public.narrative_erasure_allowed('{}'::jsonb)"])await assert.rejects(()=>outsider.query(q),/permission denied/);
 for(const q of ['SET ROLE jiuxiao_narrative_schema_owner','SET ROLE jiuxiao_narrative_operator','SET ROLE jiuxiao_narrative_erasure','ALTER FUNCTION public.lock_narrative_writer_fence_v2(text) OWNER TO gr01_app','CREATE TABLE public.preflight_forgery(id integer)'])await assert.rejects(()=>app.query(q),/permission denied|must be owner|must be able/);
 const roles=(await app.query("SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname IN('gr01_app','gr01_eraser','gr01_operator','jiuxiao_narrative_schema_owner','jiuxiao_narrative_runtime') ORDER BY rolname")).rows;
 observations.push({case:'security-definer-audit',querySession:'gr01_app',functions,roles,outsiderSession:'grpf_untrusted',outsiderDenied:true});
});

test('non-admin operator alone can attest fence; application read locks and rejects column-write boot privilege',async()=>{
 await assert.rejects(()=>app.query("INSERT INTO narrative_writer_fence(singleton,protocol_version,phase,fleet_manifest_sha,renderer_version,valid_until) VALUES(true,2,'fenced',$1,'handover-fixture-v1',now()+interval '1 hour')",['a'.repeat(64)]),/permission denied/);
 await operator.query(`INSERT INTO narrative_writer_fence(singleton,protocol_version,phase,fleet_manifest_sha,renderer_version,old_writer_drained,old_role_revoked,valid_until,retired_roles,drain_evidence_sha)
  VALUES(true,2,'managed',$1,'handover-fixture-v1',true,true,now()+interval '1 hour',ARRAY['grpf_old_writer'],$2)`,['a'.repeat(64),'b'.repeat(64)]);
 assert.equal((await app.query("SELECT * FROM public.lock_narrative_writer_fence_v2('handover-fixture-v1')")).rowCount,1);
 await tx(app,async c=>{await c.query('CREATE TEMP TABLE narrative_writer_fence(singleton boolean,protocol_version integer,phase text) ON COMMIT DROP');assert.equal((await c.query("SELECT * FROM public.lock_narrative_writer_fence_v2('wrong-renderer')")).rowCount,0);});
 const {prepareNarrativeV2RuntimeDraft}=await S.load('narrative-v2-runtime-draft');await db.query('GRANT UPDATE(singleton) ON narrative_writer_fence TO gr01_app');
 try{await assert.rejects(()=>prepareNarrativeV2RuntimeDraft({pool:app,rules:{},rendererVersion:'handover-fixture-v1',render:()=> 'unused',limits:lib.TEST_BODY_LIMITS}),/APPLICATION_ROLE_NOT_ISOLATED/);}
 finally{await db.query('REVOKE UPDATE(singleton) ON narrative_writer_fence FROM gr01_app');}
 observations.push({case:'fence-role-boundary',application:'gr01_app',operator:'gr01_operator',attestedBy:(await app.query('SELECT attested_by FROM narrative_writer_fence')).rows[0].attested_by,syntheticManifestOnly:true,productionEvidence:'BLOCKED'});
});

test('genuine operation GUC does not authorize app erasure; separately authorized eraser can remove owned narrative',async()=>{
 const f=await newManaged(),id=randomUUID();await db.query("INSERT INTO account_operations(id,owner_id,session_hash,operation,phase,expires_at) VALUES($1,$2,'preflight-fixture','delete','ready',now()+interval '1 minute')",[id,f.owner]);
 await db.query('GRANT DELETE ON narrative_receipt_ownership TO gr01_app');try{await assert.rejects(()=>tx(app,async c=>{await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[id]);await c.query('DELETE FROM narrative_receipt_ownership WHERE owner_id=$1',[f.owner]);}),/AUTHORIZED_ERASURE_REQUIRED/);}finally{await db.query('REVOKE DELETE ON narrative_receipt_ownership FROM gr01_app');}
 await assert.rejects(()=>tx(eraser,async c=>{await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[randomUUID()]);await lib.eraseNarrativeForOwner(c,f.owner);}),/AUTHORIZED_ERASURE_REQUIRED/);
 await tx(eraser,async c=>{await c.query('SELECT id FROM auth_accounts WHERE id=$1 FOR UPDATE',[f.owner]);await c.query('SELECT id FROM game_saves WHERE owner_id=$1 FOR UPDATE',[f.owner]);await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[id]);await lib.eraseNarrativeForOwner(c,f.owner);});
 assert.equal((await app.query('SELECT 1 FROM narrative_receipt_ownership WHERE owner_id=$1',[f.owner])).rowCount,0);
 observations.push({case:'erasure-boundary',app:'gr01_app',eraser:'gr01_eraser',genuineSelectorAloneRejected:true,unauthorizedProofRejected:true,authorizedErasure:true});
});

test('cooperative abort and uncooperative late attempt both fail safely; arbitrary external compute cancellation stays unproven',async()=>{
 const {NarrativeOutboxWorker}=await S.load('narrative-outbox-worker');
 for(const cooperative of [true,false]){
  const f=await newManaged(),repo=new lib.NarrativePublicationRepository(app,lib.TEST_BODY_LIMITS,{maxAttempts:3,leaseMs:150000});let captured,signal,release,abortEvents=0,completed=0;
  const claim=repo.claim.bind(repo);repo.claim=async(...args)=>(captured=await claim(...args));
  const renderer=async(_r,_c,s)=>{signal=s;return new Promise((resolve,reject)=>{release=()=>{completed++;resolve('late body');};s.addEventListener('abort',()=>{abortEvents++;if(cooperative)reject(Error('RENDERER_ABORTED'));},{once:true});});};
  const worker=new NarrativeOutboxWorker(repo,new Map([['handover-fixture-v1',renderer]]),25);
  await assert.rejects(()=>worker.run(f.owner,f.saveId,f.key),/EXECUTION_TIMEOUT|RENDERER_ABORTED/);assert.equal(signal.aborted,true);assert.equal(abortEvents,1);
  if(!cooperative){release();await new Promise(r=>setTimeout(r,20));assert.equal(completed,1);}
  await assert.rejects(()=>repo.publish(captured,'attempted late publish'),/STALE_ATTEMPT/);assert.deepEqual(await counts(f),{sources:0,publications:0});
  observations.push({case:'abort-and-late-attempt',app:'gr01_app',cooperative,signalAborted:true,abortEvents,completed,sources:0,publications:0,externalProviderCancellationProven:false});
 }
});
