// Destructive tests create their own two clusters. No caller-supplied database URL.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { restoreQuarantined } from '../../scripts/dev/cards-restore-quarantine.mjs';
import { eraseCardImports } from '../../apps/api/dist/card-import/host.js';
import { createApp } from '../../apps/api/dist/app.js';
import { EmailAuthService } from '../../apps/api/dist/services/email-auth.js';
import { PostgresEmailAuthRepository } from '../../apps/api/dist/services/postgres-email-auth.js';
import { CardImportService } from '../../apps/api/dist/card-import/service.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {Pool}=requireApi('pg'),{serve}=requireApi('@hono/node-server');
const serverBin=process.env.CARD_TEST_PG_BIN;
if(!serverBin)throw Error('Point CARD_TEST_PG_BIN to the isolated test server binaries');
const clientBin=process.env.CARD_TEST_PG_CLIENT_BIN || serverBin;
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(PG|DATABASE_URL|TEST_DATABASE_URL)/i.test(key)));
const dir=await mkdtemp(join(tmpdir(),'jx-card-upgrade-'));
const password=randomBytes(32).toString('hex');
const passwordFile=join(dir,'init-password');
await writeFile(passwordFile,password,{mode:0o600});
const exe=(bin,cmd)=>join(bin,cmd+(process.platform==='win32'?'.exe':''));
const sqlDir=join(root,'packages/db/drizzle');
const install=await readFile(join(sqlDir,'0025_card_install_upgrade.sql'),'utf8');
const governance=await readFile(join(sqlDir,'0026_account_recovery_governance.sql'),'utf8');
const acl=await readFile(join(root,'packages/db/permissions/card-access.sql'),'utf8');
const evidence=[],instances=[],pools=[];
const ok=name=>{evidence.push(name);console.log('PASS',name);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const flags={windowsHide:true,timeout:60000};
async function port(){
  const s=net.createServer();
  s.listen(0,'127.0.0.1');
  await once(s,'listening');
  const n=s.address().port;
  await new Promise((done,fail)=>s.close(error=>error?fail(error):done()));
  return n;
}
function connection(db,database='postgres',user='fixture_installer'){
  const p=new Pool({host:'127.0.0.1',port:db.port,password,user,database,connectionTimeoutMillis:2500,allowExitOnIdle:true});
  pools.push(p);
  return p;
}
async function cluster(name){
  const data=join(dir,name);
  const db={data,port:await port(),started:false};
  instances.push(db);
  execFileSync(exe(serverBin,'initdb'),['-D',data,'-U','fixture_installer','-A','scram-sha-256','--encoding=UTF8','--no-locale','--pwfile='+passwordFile],{...flags,env,stdio:'pipe'});
  execFileSync(exe(serverBin,'pg_ctl'),['-D',data,'-l',join(dir,name+'.log'),'-o','-c unix_socket_directories= -h 127.0.0.1 -p '+db.port,'-w','start'],{...flags,env,stdio:'ignore'});
  db.started=true;
  const admin=connection(db);
  assert.equal(resolve((await admin.query('SHOW data_directory')).rows[0].data_directory),resolve(data));
  assert.equal((await admin.query('SELECT session_user AS u')).rows[0].u,'fixture_installer');
  await admin.query(`CREATE ROLE jiuxiao_card_runtime NOLOGIN; CREATE ROLE jiuxiao_card_erasure NOLOGIN;
    CREATE ROLE cards_demo_app LOGIN PASSWORD '${password}'; CREATE ROLE fixture_eraser LOGIN PASSWORD '${password}';
    CREATE ROLE fixture_retired NOLOGIN; GRANT jiuxiao_card_runtime TO cards_demo_app; GRANT jiuxiao_card_erasure TO fixture_eraser`);
  return {db,admin};
}
const names=JSON.parse(await readFile(join(sqlDir,'meta/_journal.json'),'utf8')).entries.filter(it=>it.idx<=24).map(it=>it.tag+'.sql');
async function createBase(cluster,dbName){
  assert.match(dbName,/^jiuxiao_test_[a-z0-9_]+$/);
  await cluster.admin.query('CREATE DATABASE '+dbName);
  const p=connection(cluster.db,dbName);
  for(const name of names)await p.query(await readFile(join(sqlDir,name),'utf8'));
  return p;
}
const legacyIds={card:randomUUID(),session:randomUUID(),key:randomUUID(),file:randomUUID(),book:randomUUID(),persona:randomUUID(),pv:randomUUID()};
async function seed(c,version){
  const {card,session,key,file,book,persona,pv}=legacyIds;
  await c.query("INSERT INTO public.auth_accounts(id,email) VALUES ('a','fixture-a@example.invalid'),('b','fixture-b@example.invalid')");
  const document={name:'Synthetic seed',description:'Fixture',personality:'Quiet',scenario:'Demo',first_mes:'Start',mes_example:'Hi'};
  const bytes=Buffer.from(JSON.stringify(document));
  const parsed={kind:'card',name:document.name,document,assetRefs:[]};
  await c.query('INSERT INTO card_import.imports(owner_id,id,kind,sha256,original,filename,parsed) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    ['a',file,'card',sha(bytes),bytes,'synthetic.json',parsed]);
  const wb=Buffer.from(JSON.stringify({entries:[]}));
  await c.query('INSERT INTO card_import.imports(owner_id,id,kind,sha256,original,filename,parsed) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    ['a',book,'worldbook',sha(wb),wb,'synthetic-book.json',{kind:'worldbook',document:{entries:[]},assetRefs:[]}]);
  await c.query('INSERT INTO card_import.cards(owner_id,id,import_id,metadata) VALUES ($1,$2,$3,$4)',['a',card,file,{links:[]}]);
  await c.query('INSERT INTO card_import.links VALUES ($1,$2,$3,$4)',['a',card,book,'book']);
  await c.query('INSERT INTO card_import.sessions(owner_id,id,card_id,revision) VALUES ($1,$2,$3,1)',['a',session,card]);
  await c.query("INSERT INTO card_import.requests(owner_id,session_id,key,fingerprint,expected_revision,action,status,narrative,resulting_revision,expires_at) VALUES ('a',$1,$2,'fixture-v1',0,'first','completed','saved',1,now())",[session,key]);
  if(version!=='054daa0'){
    await c.query("INSERT INTO card_import.personas VALUES ('a',$1,false)",[persona]);
    await c.query("INSERT INTO card_import.persona_versions(owner_id,id,persona_id,name,description,extensions) VALUES ('a',$1,$2,'demo','version 1','{}')",[pv,persona]);
    await c.query("INSERT INTO card_import.session_personas VALUES ('a',$1,$2)",[session,pv]);
    await c.query("INSERT INTO card_import.session_worldbooks VALUES ('a',$1,$2)",[session,book]);
  }
  if(version==='pr110'){
    await c.query("INSERT INTO card_import.model_allowances VALUES ('fixture-approval','old-binding',1)");
    await c.query("INSERT INTO card_import.model_calls VALUES ('fixture-approval','a',$1,$2)",[session,key]);
  }
}
async function records(c){
  const tables=(await c.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='card_import' ORDER BY tablename")).rows;
  const snapshot={};
  for(const {tablename} of tables){
    assert.match(tablename,/^[a-z_]+$/);
    const r=await c.query('SELECT to_jsonb(t) AS row FROM card_import.'+tablename+' t ORDER BY to_jsonb(t)');
    snapshot[tablename]=r.rows.map(x=>x.row);
  }
  return snapshot;
}
function checkConservation(before,after){
  for(const [name,rows] of Object.entries(before)){
    const keys=rows.length?Object.keys(rows[0]):[];
    const originalProjection=after[name].map(row=>Object.fromEntries(keys.map(k=>[k,row[k]])));
    assert.equal(sha(JSON.stringify(originalProjection)),sha(JSON.stringify(rows)),name+' content or references changed');
  }
}
async function installLegacy(p,text=install){
  const c=await p.connect();
  try{
    await c.query('BEGIN');
    await c.query("SET LOCAL jiuxiao.card_retired_writer='fixture_retired'");
    await c.query("CREATE TEMP TABLE requests(status text) ON COMMIT DROP; SET LOCAL search_path=pg_temp,public");
    await c.query("INSERT INTO pg_temp.requests VALUES('pending')");
    await c.query(text);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function restoredHttp(pool){
  const secret=randomBytes(32).toString('hex');
  const codes=new Map();
  const auth=new EmailAuthService(new PostgresEmailAuthRepository(pool,secret),async(email,code)=>{codes.set(email,code);},secret);
  let app;
  const server=serve({hostname:'127.0.0.1',port:0,fetch:req=>app.fetch(req)});
  try{
    if(!server.listening)await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    app=createApp(undefined,undefined,{service:auth,origin},undefined,{pool,model:async()=> 'restored HTTP response'});
    const call=(path,body,cookie)=>fetch(origin+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
    async function login(email){
      const challenge=await call('/api/auth/code',{email});assert.equal(challenge.status,202);
      const verify=await call('/api/auth/verify',{email,code:codes.get(email)});assert.equal(verify.status,200);
      return verify.headers.get('set-cookie').split(';')[0];
    }
    const a=await login('fixture-a@example.invalid'),b=await login('fixture-b@example.invalid');
    const path='/api/card-import/sessions/'+legacyIds.session;
    assert.equal((await call(path+'/history',null,b)).status,404);
    assert.equal((await (await call(path+'/history',null,a)).json()).length,2);
    const result=await call(path+'/actions',{idempotencyKey:randomUUID(),expectedRevision:2,action:'restored HTTP continuation'},a);
    assert.equal(result.status,200);assert.equal((await result.json()).status,'completed');
  } finally {server.closeAllConnections();await new Promise((done,fail)=>server.close(e=>e?fail(e):done()));}
}
async function expectSql(fn,code){await assert.rejects(fn,e=>e.code===code);}
async function verifyRestricted(db,name){
  const runtime=connection(db,name,'cards_demo_app');
  const eraser=connection(db,name,'fixture_eraser');
  const {session,card}=legacyIds;
  assert.equal((await runtime.query('SELECT session_user AS rol')).rows[0].rol,'cards_demo_app');
  const service=new CardImportService(runtime,async()=> 'continued with synthetic provider');
  assert.equal((await service.history('a',session,0))[0].narrative,'saved');
  await assert.rejects(()=>service.session('b',session),e=>e.code==='NOT_FOUND');
  assert.equal((await service.session('a',session)).recursive_worldbook,true);
  const modelSnapshot=await service.request('a',session,legacyIds.key);
  assert.equal(modelSnapshot.model_snapshot,null);
  const newSession=await service.createSession('a',randomUUID(),card);
  assert.equal(newSession.recursive_worldbook,false);
  const k=randomUUID();
  assert.equal((await service.act('a',session,k,1,'continue')).status,'completed');
  assert.equal((await service.recover('a',session,k)).resulting_revision,2);
  for(const sql of ['SET ROLE fixture_installer','SET ROLE jiuxiao_card_erasure',
    'ALTER TABLE card_import.cards ADD COLUMN forbidden int','DELETE FROM card_import.model_allowances',
    'UPDATE card_import.imports SET original=NULL','CREATE FUNCTION card_import.forbidden() RETURNS int LANGUAGE sql AS $$SELECT 1$$']){
    await expectSql(()=>runtime.query(sql),'42501');
  }
  await expectSql(()=>eraser.query('SELECT original FROM card_import.imports'),'42501');
  const c=await eraser.connect();
  try{await c.query('BEGIN');await c.query("DELETE FROM card_import.group_settings WHERE owner_id='a'");await c.query('ROLLBACK');}finally{c.release();}
}
let primaryError;
try {
  const first=await cluster('first'),second=await cluster('second');
  const fresh=await createBase(first,'jiuxiao_test_fresh');
  await fresh.query(install);
  await fresh.query('GRANT jiuxiao_card_erasure TO cards_demo_app');
  await assert.rejects(()=>fresh.query(acl),/CARD_ROLE_INHERITS_UNEXPECTED_AUTHORITY/);
  await fresh.query('REVOKE jiuxiao_card_erasure FROM cards_demo_app');
  await fresh.query('GRANT DELETE ON card_import.model_allowances TO cards_demo_app');
  await assert.rejects(()=>fresh.query(acl),/CARD_EXISTING_EXCESS_PRIVILEGES/);
  assert.equal((await fresh.query("SELECT has_table_privilege('cards_demo_app','card_import.cards','SELECT') AS ok")).rows[0].ok,false);
  await fresh.query('REVOKE DELETE ON card_import.model_allowances FROM cards_demo_app');await fresh.query(acl);
  assert.equal(Object.keys(await records(fresh)).length,18);
  ok('fresh journal baseline + 0025; separate runtime and erasure ACL');
  for(const [version,blob] of Object.entries({'054daa0':'08fed4bb735c89cdba09fbb5e6e5043eaaf67d28',pre110:'c5b0132bc25b08916a8d805b672fcbdb589bcab2',pr110:'4d681b9219e2c999df945ccdd2d70dc02d7e03aa'})){
    const name='jiuxiao_test_'+version;
    const p=await createBase(first,name);
    const raw=await readFile(join(root,'tests/integration/fixtures','card-schema-'+version+'.sql'));
    // Git records LF bytes; honor Windows checkout autocrlf without changing fixture semantics.
    const fixture=Buffer.from(raw.toString('utf8').replaceAll('\r\n','\n'));
    assert.equal(createHash('sha1').update('blob '+fixture.length+'\0').update(fixture).digest('hex'),blob);
    await p.query(fixture.toString());await seed(p,version);
    if(version==='054daa0')await p.query('ALTER TABLE card_import.cards RENAME CONSTRAINT cards_owner_id_import_id_key TO fixture_renamed_constraint');
    const before=await records(p);
    await assert.rejects(()=>p.query(install),/CARD_LEGACY_WRITER_NOT_RETIRED/);
    await p.query(`ALTER ROLE fixture_retired LOGIN PASSWORD '${password}'; GRANT USAGE ON SCHEMA card_import TO fixture_retired; GRANT INSERT ON card_import.imports TO fixture_retired`);
    await assert.rejects(()=>installLegacy(p),/CARD_LEGACY_WRITER_NOT_RETIRED/);
    const oldPool=connection(first.db,name,'fixture_retired');
    const oldClient=await oldPool.connect();
    try{
      await oldClient.query('BEGIN');
      await oldClient.query("INSERT INTO card_import.imports(owner_id,id,kind,sha256,filename,original) VALUES ('a',$1,'card','unused','synthetic',''::bytea)",[randomUUID()]);
      await oldClient.query('ROLLBACK');
      await p.query("ALTER ROLE fixture_retired NOLOGIN");
      await assert.rejects(()=>installLegacy(p),/CARD_LEGACY_WRITER_NOT_RETIRED/);
    }finally{oldClient.release(true);}
    await expectSql(()=>oldPool.query('SELECT 1'),'28000');
    await assert.rejects(()=>installLegacy(p),/CARD_SCHEMA_UNRECOGNIZED_ACL_OR_OBJECT/);
    await p.query('REVOKE INSERT ON card_import.imports FROM fixture_retired');
    await p.query("UPDATE card_import.requests SET status='pending'");
    await assert.rejects(()=>installLegacy(p),/CARD_PENDING_REQUESTS_MUST_DRAIN/);
    await p.query("UPDATE card_import.requests SET status='completed'");
    await p.query('CREATE INDEX unexpected_extra_index ON card_import.requests(action)');
    await assert.rejects(()=>installLegacy(p),/CARD_SCHEMA_UNSUPPORTED_CATALOG/);
    await p.query('DROP INDEX card_import.unexpected_extra_index');
    const injected=install.replace("PERFORM set_config('search_path',previous_path,true);","RAISE EXCEPTION 'TEST_ONLY_AFTER_CARD_UPGRADE';");
    assert.notEqual(injected,install);
    await assert.rejects(()=>installLegacy(p,injected),/TEST_ONLY_AFTER_CARD_UPGRADE/);
    assert.deepEqual(await records(p),before);
    assert.equal((await p.query("SELECT to_regnamespace('jx_0025_expected') AS n")).rows[0].n,null);
    await installLegacy(p);await p.query(governance);await p.query(acl);
    const after=await records(p);
    checkConservation(before,after);
    await verifyRestricted(first.db,name);
    ok(version+' catalog, backing rows, retired writer, pending/drift refusal, rollback/retry, restricted read/continuation/tenant isolation');
    if(version==='pr110'){
      const restored='jiuxiao_test_restored';
      const archive=join(dir,'synthetic.dump');
      const clientEnv={...env,PGPASSWORD:password};
      execFileSync(exe(clientBin,'pg_dump'),['-h','127.0.0.1','-p',String(first.db.port),'-U','fixture_installer','-d',name,'-Fc','-f',archive],{...flags,env:clientEnv});
      await second.admin.query('CREATE DATABASE '+restored);
      execFileSync(exe(clientBin,'pg_restore'),['-h','127.0.0.1','-p',String(second.db.port),'-U','fixture_installer','-d',restored,'--exit-on-error','--single-transaction',archive],{...flags,env:clientEnv});
      const restoredPool=connection(second.db,restored),restoredRuntime=connection(second.db,restored,'cards_demo_app');
      assert.deepEqual(await records(restoredPool),await records(p));
      assert.deepEqual((await restoredPool.query('SELECT used,binding FROM card_import.model_allowances')).rows,[{used:1,binding:'old-binding'}]);
      await expectSql(()=>restoredRuntime.query('DELETE FROM card_import.model_calls'),'42501');
      await restoredPool.query(await readFile(join(root,'packages/db/permissions/card-local-auth.sql'),'utf8'));
      await restoredHttp(restoredRuntime);
      ok('second data directory: exact logical contents, quota, grants, restricted TCP/Cookie login, history, continuation and account isolation');
      // This is now a stale backup. Restore it only through the offline quarantine.
      // Changing these synthetic source records models later consumption and erasure.
      await p.query("UPDATE card_import.model_allowances SET used=used+1 WHERE approval_id='fixture-approval'");
      // M3's host tests exercise qualification. This recovery fixture creates
      // actual committed erasure on the source before restoring the older dump.
      await p.query('GRANT DELETE,SELECT(id) ON public.auth_accounts TO fixture_eraser');
      const erasure=await connection(first.db,name,'fixture_eraser').connect();
      try{
        await erasure.query('BEGIN');
        await eraseCardImports(erasure,'a');
        assert.equal((await erasure.query("DELETE FROM public.auth_accounts WHERE id='a'")).rowCount,1);
        await erasure.query('COMMIT');
      }catch(error){await erasure.query('ROLLBACK');throw error;}finally{erasure.release();}
      assert.equal((await p.query("SELECT id FROM public.auth_accounts ORDER BY id")).rows.map(row=>row.id).join(','),'b');
      assert.equal((await p.query("SELECT used FROM card_import.model_allowances")).rows[0].used,2);
      const maintenanceUrl=new URL(`postgresql://fixture_installer@127.0.0.1:${second.db.port}/postgres`);
      maintenanceUrl.password=password;
      const cold=await restoreQuarantined({maintenanceUrl:maintenanceUrl.href,dataDirectory:second.db.data,archive,clientBin});
      assert.equal(cold.admission,'QUARANTINED');assert.equal(cold.modelCallsEnabled,false);
      assert.equal((await second.admin.query('SELECT datallowconn FROM pg_database WHERE datname=$1',[cold.database])).rows[0].datallowconn,false);
      await expectSql(()=>connection(second.db,cold.database,'cards_demo_app').query('SELECT 1'),'55000');
      ok('post-backup consumption and committed synthetic account erasure: quarantined stale restore denies login and all prior authorizations');
    }
  }
} catch(e){primaryError=e;}
const failed=[];
for(const p of pools)try{await p.end();}catch(e){failed.push(e);}
for(const inst of instances.reverse()){
  if(!inst.started)continue;
  try{
    const pidfile=(await readFile(join(inst.data,'postmaster.pid'),'utf8')).split(/\r?\n/);
    assert.equal(resolve(pidfile[1]),resolve(inst.data));assert.equal(Number(pidfile[3]),inst.port);
    execFileSync(exe(serverBin,'pg_ctl'),['-D',inst.data,'-m','fast','-w','stop'],{...flags,env,stdio:'pipe'});
    const stat=spawnSync(exe(serverBin,'pg_ctl'),['-D',inst.data,'status'],{...flags,env,stdio:'ignore'});
    assert.equal(stat.status,3);
    const probe=net.connect(inst.port,'127.0.0.1');
    try{await assert.rejects(()=>once(probe,'connect'),e=>e.code==='ECONNREFUSED');}finally{probe.destroy();}
  }catch(e){failed.push(e);}
}
if(primaryError||failed.length)throw new AggregateError([...(primaryError?[primaryError]:[]),...failed],'Card upgrade or cleanup failed');
console.log(JSON.stringify({passed:evidence,clustersStopped:instances.length,realProviderRequests:0}));
