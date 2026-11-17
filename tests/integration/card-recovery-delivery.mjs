// TEST_ONLY: run AFTER dev:cards --init in a new checkout created for this task.
// No arbitrary URL accepted. Each run creates new databases in that verified instance.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fork, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { digest } from './database-snapshot.mjs';
import { exportCard } from '../../apps/api/dist/card-import/export.js';
import { assertLocalCardDatabase } from '../../apps/api/dist/card-import/local-runtime.js';
const root=resolve(import.meta.dirname,'../..'),state=JSON.parse(readFileSync(join(root,'.cards-local/state.json')));
assert.equal(resolve(state.root),root);assert.equal(state.mode,'native');assert.equal(state.installed,true);
const runId=randomUUID().replaceAll('-',''),privateDir=join(root,'test-results/card-recovery',runId);mkdirSync(privateDir,{recursive:true});
const {Pool}=createRequire(join(root,'apps/api/package.json'))('pg');
const osEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(k)));
const pgEnv={...osEnv,PGPASSWORD:state.password,PGHOST:'127.0.0.1',PGPORT:String(state.port),PGUSER:'cards_local'};
// No inherited libpq options, service files, or remote URLs.
for(const k of ['PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGDATABASE','DATABASE_URL','TEST_DATABASE_URL'])delete pgEnv[k];
const exe=n=>join(['pg_dump','pg_restore','psql'].includes(n)?(process.env.CARD_TEST_PG_CLIENT_BIN??state.bin):state.bin,n+(process.platform==='win32'?'.exe':''));
const command=(n,args,options={})=>{const r=spawnSync(exe(n),args,{env:pgEnv,windowsHide:true,encoding:'utf8',timeout:60000,...options});appendFileSync(join(privateDir,'commands.jsonl'),JSON.stringify({command:n,args,status:r.status,error:r.error?.code,stderr:String(r.stderr??'')})+'\n');return r;};
const pgStatus=command('pg_ctl',['-D',join(root,'.cards-local/postgres'),'status']);
if(pgStatus.status!==0)assert.equal(command('pg_ctl',['-D',join(root,'.cards-local/postgres'),'-l',join(root,'.cards-local/postgres.log'),'-o',`-h 127.0.0.1 -p ${state.port}`,'-w','start'],{stdio:'ignore'}).status,0);
const opts={host:'127.0.0.1',port:state.port,user:'cards_local',password:state.password,connectionTimeoutMillis:3000};
const admin=new Pool({...opts,database:'postgres'});
assert.equal(resolve((await admin.query('SHOW data_directory')).rows[0].data_directory),resolve(join(root,'.cards-local/postgres')));
const names=new Set();const fresh=async label=>{const n=`jiuxiao_test_recovery_${label}_${runId}`;assert.match(n,/^jiuxiao_test_recovery_[a-z_0-9]+$/);assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[n])).rowCount,0);await admin.query(`CREATE DATABASE ${n}`);names.add(n);return n;};
const url=n=>{const u=new URL(`postgresql://cards_local@127.0.0.1:${state.port}/${n}`);u.password=state.password;return u.href;};
const probeAt=process.argv.indexOf('--probe-restored'),probe=probeAt<0?null:process.argv[probeAt+1];
if(probe){assert.match(probe,/^[a-f0-9]{32}$/);assert.equal(JSON.parse(readFileSync(join(root,'test-results/card-recovery',probe,'results.json'))).status,'PASS');}
const source=probe?`jiuxiao_test_recovery_restored_${probe}`:await fresh('source'),pool=new Pool({...opts,database:source});
if(!probe){
 for(const file of readdirSync(join(root,'packages/db/drizzle')).filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort())await pool.query(readFileSync(join(root,'packages/db/drizzle',file),'utf8'));
 await pool.query(readFileSync(join(root,'apps/api/src/card-import/schema.sql'),'utf8'));
}
const results={kind:'CARD-RECOVERY-DELIVERY-TEST_ONLY',started:new Date().toISOString(),sourceDatabase:source,postgresVersion:(await pool.query('SHOW server_version')).rows[0].server_version,checks:[],crashes:[]};
const save=()=>writeFileSync(join(privateDir,'results.json'),JSON.stringify(results,null,2));
const pass=(name,details={})=>{results.checks.push({name,status:'PASS',...details});save();console.log('PASS '+name);};
const ledger=join(privateDir,'provider.jsonl');writeFileSync(ledger,'');
const calls=action=>readFileSync(ledger,'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(x=>x.action===action).length;
const reserve=async()=>{const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const secret=randomBytes(32).toString('hex');let host;
async function start(database=source,window=''){
 const port=await reserve(),child=fork(join(root,'tests/integration/card-recovery-host.mjs'),[],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,NODE_ENV:'test'}});
 const messages=[];child.on('message',m=>messages.push(m));child.stderr.on('data',b=>appendFileSync(join(privateDir,'host-stderr.log'),b));child.stdout.on('data',b=>appendFileSync(join(privateDir,'host-stdout.log'),b));
 child.send({url:url(database),secret,port,ledger,window});
 const wait=async type=>{const until=Date.now()+15000;while(Date.now()<until){const m=messages.find(x=>x.type===type);if(m)return m;if(child.exitCode!==null)throw Error('HOST_EXIT_'+child.exitCode);await new Promise(r=>setTimeout(r,20));}throw Error('HOST_WAIT_'+type);};
 await wait('ready');return {child,messages,wait,origin:`http://127.0.0.1:${port}`};
}
async function stop(h=host){if(!h||h.child.exitCode!==null)return;h.child.send({type:'stop'});await Promise.race([once(h.child,'exit'),new Promise((_,reject)=>setTimeout(()=>reject(Error('STOP_TIMEOUT')),5000))]);}
const api=async(path,method='GET',body,who,h=host)=>{
 const r=await fetch(h.origin+path,{method,headers:{origin:h.origin,cookie:who?.cookie??'','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await r.text();let value;try{value=JSON.parse(text);}catch{value=text;}
 return {status:r.status,value,cookie:r.headers.get('set-cookie')?.split(';')[0]};
};
const ok=async(...args)=>{const r=await api(...args);assert.equal(r.status,200,JSON.stringify({path:args[0],status:r.status,value:r.value}));return r.value;};
const base='/api/card-import';
async function login(email){assert.equal((await api('/api/auth/code','POST',{email})).status,202);const code=host.messages.filter(x=>x.type==='code'&&x.email===email).at(-1)?.code;assert.ok(code);const r=await api('/api/auth/verify','POST',{email,code});assert.equal(r.status,200);return {email,cookie:r.cookie,owner:r.value.account.id};}
async function upload(who,kind,name,bytes){return ok(base+'/imports','POST',{filename:name,kind,bytesBase64:bytes.toString('base64'),rightsConfirmed:true},who);}
async function session(who,card,group=false,extra={}){const id=randomUUID();await ok(base+(group?'/group-sessions':'/sessions'),'POST',{id,...(group?{cardIds:card}:{cardId:card}),...extra},who);return id;}
const act=(who,id,body,group=false)=>ok(base+`/sessions/${id}/${group?'group-actions':'actions'}`,'POST',body,who);
const body=(action,revision=0,extra={})=>({action,expectedRevision:revision,idempotencyKey:randomUUID(),...extra});
try{
 if(probe){
  host=await start();const emails=(await pool.query('SELECT email FROM auth_accounts ORDER BY email')).rows;assert.equal(emails.length,2);
  const a=await login(emails[0].email),b=await login(emails[1].email);
  const requestsBefore=(await pool.query('SELECT to_jsonb(r)::text AS row FROM card_import.requests r ORDER BY to_jsonb(r)::text')).rows;
  const sessions=await ok(base+'/sessions','GET',undefined,a);assert.ok(sessions.length>=2);
  const known=(await pool.query("SELECT session_id,key FROM card_import.requests WHERE owner_id=$1 AND status='completed' LIMIT 1",[a.owner])).rows[0];assert.ok(known);
  const other=sessions.find(s=>s.id!==known.session_id);assert.ok(other);
  assert.equal((await ok(base+`/sessions/${other.id}/requests/${known.key}`,'GET',undefined,a)).status,'unknown');
  assert.equal((await api(base+`/sessions/${known.session_id}/requests/${known.key}`,'GET',undefined,b)).status,404);
  assert.deepEqual((await pool.query('SELECT to_jsonb(r)::text AS row FROM card_import.requests r ORDER BY to_jsonb(r)::text')).rows,requestsBefore);
  pass('restored-same-account-different-session-and-cross-account-key-isolation',{requestRowsUnchanged:true,providerCalls:0,probeOf:probe});
 }else{
 host=await start();const a=await login(`a-${runId}@example.invalid`),b=await login(`b-${runId}@example.invalid`);
 const doc={name:'Synthetic explorer',description:'local fixture',personality:'kind',scenario:'moon',first_mes:'original hello',mes_example:'example',alternate_greetings:['alternate hello'],assets:[{uri:'local-attachment'}],extensions:{synthetic:true}};
 const att=await upload(a,'attachment','synthetic.txt',Buffer.from('synthetic attachment\r\n'));
 const wb=await upload(a,'worldbook','synthetic-world.json',Buffer.from(JSON.stringify({name:'synthetic world',entries:[{keys:['moon'],content:'WORLD_SNAPSHOT_MARKER'}]})));
 const png=exportCard({...doc,name:'PNG explorer'},'png');
 const raw=Buffer.from(JSON.stringify(doc)),imp=await upload(a,'card','synthetic.json',raw),pimp=await upload(a,'card','synthetic.png',png);
 const links=[{uri:'local-attachment',importId:att.id},{uri:'world',importId:wb.id}];
 const c1=await ok(base+'/cards','POST',{importId:imp.id,parentId:null,source:'synthetic',notes:'recovery fixture',links},a);
 const c2=await ok(base+'/cards','POST',{importId:pimp.id,parentId:null,source:'synthetic',notes:'png',links},a);
 await ok(base+`/worldbooks/${wb.id}/global`,'PUT',{enabled:true},a);
 const personaId=randomUUID(),p1=await ok(base+'/personas','POST',{id:personaId,name:'P1',description:'v1',extensions:{}},a);
 await ok(base+`/personas/${personaId}/default`,'PUT',{},a);
 const single=await session(a,c1.id,false,{greetingIndex:0,personaVersionId:p1.id,recursiveWorldbook:true});
 const group=await session(a,[c1.id,c2.id],true,{personaVersionId:p1.id});
 await ok(base+`/sessions/${group}/group-strategy`,'PUT',{strategy:'auto'},a);
 await ok(base+`/personas/${personaId}/versions`,'POST',{name:'P2',description:'v2',extensions:{}},a);
 const c3=await ok(base+`/cards/${c1.id}/versions`,'POST',{changes:{description:'edited version'},links},a);
 assert.notEqual(c3.id,c1.id);
 const w2=await ok(base+`/imports/${wb.id}/worldbook-versions`,'POST',{changes:{name:'new world'}},a);
 await ok(base+'/worldbooks/global/replace','POST',{oldId:wb.id,newId:w2.id},a);
 // Existing duplicate API does not accept attachment bindings; retain linked
 // originals above, and exercise the three strategies with a self-contained card.
 const duplicateImport=await upload(a,'card','duplicate.json',Buffer.from(JSON.stringify({...doc,assets:[],name:'Duplicate fixture'})));
 const duplicateCard=await ok(base+'/cards','POST',{importId:duplicateImport.id,parentId:null,source:'synthetic',notes:'',links:[]},a);
 for(const strategy of ['skip','update','copy'])await ok(base+'/cards/duplicates','POST',{idempotencyKey:randomUUID(),strategy,importId:duplicateImport.id,targetId:strategy==='copy'?null:duplicateCard.id},a);
 const ps=await ok(base+`/sessions/${group}/group`,'GET',undefined,a);
 assert.equal((await act(a,single,body('moon single'))).status,'completed');
 assert.equal((await act(a,group,body('moon group',0,{mode:'multi',participantIds:ps.map(p=>p.id)}),true)).status,'completed');
 const failedSession=await session(a,c2.id);assert.equal((await act(a,failedSession,body('synthetic-failure'))).status,'failed');
 const bi=await upload(b,'card','b.json',Buffer.from(JSON.stringify({...doc,assets:[],name:'Account B only'})));
 const bc=await ok(base+'/cards','POST',{importId:bi.id,parentId:null,source:'synthetic',notes:'',links:[]},b),bs=await session(b,bc.id);
 assert.equal((await api(base+`/sessions/${single}`,'GET',undefined,b)).status,404);
 const pinned=await ok(base+`/sessions/${single}`,'GET',undefined,a);assert.equal(pinned.persona.id,p1.id);assert.equal(pinned.greeting,'alternate hello');
 pass('nonempty-linked-fixture-created-through-http',{accounts:2,rawJsonSha256:createHash('sha256').update(raw).digest('hex'),rawPngSha256:createHash('sha256').update(png).digest('hex')});
 // Four real API process exits. Existing service transaction semantics are unmodified.
 for(const window of (process.argv.includes('--backup-only')?[]:['registered','model','segment','committed'])){
  const multi=window==='segment'||window==='committed',id=await session(a,multi?[c1.id,c2.id]:c1.id,multi);
  const participants=multi?await ok(base+`/sessions/${id}/group`,'GET',undefined,a):[];
  const request=body('crash-'+window,0,multi?{mode:'multi',participantIds:participants.map(x=>x.id)}:{});
  await stop();host=await start(source,window);
  const inflight=api(base+`/sessions/${id}/${multi?'group-actions':'actions'}`,'POST',request,a).then(v=>({http:v}),e=>({tcpError:e.cause?.code??e.name}));
  const checkpoint=await host.wait('checkpoint');
  const visible=(await pool.query('SELECT status FROM card_import.requests WHERE session_id=$1 AND key=$2',[id,request.idempotencyKey])).rows[0].status;
  assert.equal(visible,window==='committed'?'completed':'pending');
  const killedPid=host.child.pid;const exit=once(host.child,'exit');assert.equal(host.child.kill('SIGKILL'),true);const [exitCode,signal]=await exit;
  const outcome=await inflight;assert.ok(outcome.tcpError,'actual TCP response must be interrupted');
  host=await start();
  const queryPath=base+`/sessions/${id}/requests/${request.idempotencyKey}`;
  const recovered=await ok(queryPath,'GET',undefined,a);
  assert.equal(recovered.status,visible);
  assert.equal((await act(a,id,request,multi)).status,visible);
  assert.equal(calls(request.action),window==='registered'?0:1);
  const history=await ok(base+`/sessions/${id}/${multi?'group-history':'history'}`,'GET',undefined,a);
  assert.equal(history.length,window==='committed'?2:0);
  assert.equal((await ok(base+`/sessions/${id}`,'GET',undefined,a)).revision,window==='committed'?1:0);
  assert.equal((await api(queryPath,'GET',undefined,b)).status,404);
  if(window!=='committed'){
   const expires=(await pool.query('SELECT expires_at FROM card_import.requests WHERE session_id=$1 AND key=$2',[id,request.idempotencyKey])).rows[0].expires_at;
   await new Promise(r=>setTimeout(r,Math.max(0,new Date(expires).getTime()-Date.now()+100)));
   assert.equal((await ok(queryPath+'/recover','POST',{},a)).status,'failed');
   assert.equal((await act(a,id,request,multi)).status,'failed');assert.equal(calls(request.action),window==='registered'?0:1);
  }
  results.crashes.push({window,status:'PASS',checkpoint:checkpoint.stage,killedPid,exitCode,signal,tcp:outcome.tcpError,observedAfterRestart:visible,final:window==='committed'?'completed':'failed-expired',modelInvocations:calls(request.action),historyRows:history.length});save();pass('process-crash-'+window);
 }
 // Preserve a genuine registered pending request in the backup, with no fabricated reply.
 const pendingId=await session(a,c1.id),pendingBody=body('backup-pending');await stop();host=await start(source,'registered');
 const pendingFetch=api(base+`/sessions/${pendingId}/actions`,'POST',pendingBody,a).catch(()=>{});await host.wait('checkpoint');const pendingExit=once(host.child,'exit');host.child.kill('SIGKILL');await pendingExit;await pendingFetch;host=undefined;
 // No application writer remains. Entire user catalog, originals and all row contents included.
 const before=await digest(url(source));for(const name of ['imports','cards','links','personas','persona_versions','sessions','session_personas','session_worldbooks','global_worldbooks','duplicate_requests','requests','group_participants','group_participant_worldbooks','group_settings','group_turns','group_messages'])assert.ok(before.counts['card_import.'+name]>0,name+' must be nonempty');
 assert.deepEqual((await pool.query('SELECT DISTINCT status FROM card_import.requests ORDER BY status')).rows.map(x=>x.status),['completed','failed','pending']);
 const dump=join(privateDir,'synthetic.dump');assert.equal(command('pg_dump',['-d',source,'--format=custom','--file',dump]).status,0);
 const dumpHash=createHash('sha256').update(readFileSync(dump)).digest('hex');
 async function safeTarget(raw){const parsed=assertLocalCardDatabase(raw);assert.equal(parsed.port,String(state.port));const name=parsed.pathname.slice(1);assert.ok(names.has(name)&&name!==source,'only databases created by this run');const p=new Pool({connectionString:raw});try{const n=Number((await p.query("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")).rows[0].count);assert.equal(n,0,'nonempty target refused');}finally{await p.end();}return name;}
 await assert.rejects(safeTarget('postgresql://invalid@192.0.2.1/jiuxiao_test_unknown'));await assert.rejects(safeTarget(url(source)));pass('wrong-or-source-target-refused');
 const nonempty=await fresh('nonempty'),np=new Pool({...opts,database:nonempty});await np.query('CREATE TABLE preserve_me(value text); INSERT INTO preserve_me VALUES(\'synthetic sentinel\')');await np.end();await assert.rejects(safeTarget(url(nonempty)));pass('nonempty-target-refused');
 for(const kind of ['truncated','corrupt']){const name=await fresh(kind),bytes=Buffer.from(readFileSync(dump));const bad=join(privateDir,kind+'.dump');if(kind==='corrupt')bytes.fill(0,0,16);writeFileSync(bad,kind==='truncated'?bytes.subarray(0,Math.floor(bytes.length/2)):bytes);await safeTarget(url(name));assert.notEqual(command('pg_restore',['-d',name,'--single-transaction','--exit-on-error',bad]).status,0);await safeTarget(url(name));pass(kind+'-dump-fails-with-empty-target');}
 // Deterministic interruption of pg_restore's SQL stream, run inside psql -1.
 // The original custom dump is untouched; a TEST_ONLY barrier follows a real table DDL.
 const interrupted=await fresh('interrupted');await safeTarget(url(interrupted));const plain=command('pg_restore',['--file=-',dump]);assert.equal(plain.status,0);
 const marker='CREATE TABLE card_import.cards';const startAt=plain.stdout.indexOf(marker);assert.ok(startAt>0);const at=plain.stdout.indexOf(';',startAt)+1;
 const interruptedSql=join(privateDir,'interrupted.TEST_ONLY.sql');writeFileSync(interruptedSql,plain.stdout.slice(0,at)+'\nSELECT pg_advisory_lock(171711);\n'+plain.stdout.slice(at));
 const ip=new Pool({...opts,database:interrupted}),barrier=await ip.connect();await barrier.query('SELECT pg_advisory_lock(171711)');
 const restore=spawn(exe('psql'),['-d',interrupted,'-X','-v','ON_ERROR_STOP=1','--single-transaction','-f',interruptedSql],{env:{...pgEnv,PGAPPNAME:'recovery-interruption-'+runId},windowsHide:true,stdio:'ignore'});
 let blocked;for(let i=0;i<150;i++){blocked=(await ip.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory'",['recovery-interruption-'+runId])).rows[0];if(blocked)break;await new Promise(r=>setTimeout(r,20));}assert.ok(blocked,'restore reached barrier after table creation');
 const restoreExit=once(restore,'exit');restore.kill('SIGKILL');await restoreExit;
 // A server blocked inside an advisory lock cannot see its disconnected socket yet.
 // Terminate ONLY the verified backend belonging to this test restore, before releasing barrier.
 assert.equal((await ip.query('SELECT pg_terminate_backend($1) AS stopped',[blocked.pid])).rows[0].stopped,true);
 await barrier.query('SELECT pg_advisory_unlock(171711)');barrier.release();await ip.end();await safeTarget(url(interrupted));pass('restore-interruption-transaction-rollback',{processPid:restore.pid,backendPid:blocked.pid,level:'actual psql process + its verified blocked backend termination'});
 const target=await fresh('restored');await safeTarget(url(target));assert.equal(command('pg_restore',['-d',target,'--single-transaction','--exit-on-error',dump]).status,0);
 const after=await digest(url(target));assert.deepEqual(after,before);assert.deepEqual(await digest(url(source)),before);
 pass('full-catalog-restore-identical',{sourceUnchanged:true,sameInstanceNewDatabase:true,counts:after.counts,logicalSha256:after.sha256,structureSha256:after.structureSha256,dumpSha256:dumpHash});
 // Re-login after challenge cooldown, with real cookie/session against restored auth data.
 host=await start(target);const waitMs=65000-(Date.now()-new Date(results.started).getTime());if(waitMs>0)await new Promise(r=>setTimeout(r,waitMs));
 const ar=await login(a.email),br=await login(b.email);assert.equal(ar.owner,a.owner);assert.equal(br.owner,b.owner);
 assert.equal((await ok(base+`/sessions/${single}`,'GET',undefined,ar)).persona.id,p1.id);
 assert.equal((await ok(base+`/sessions/${single}`,'GET',undefined,ar)).greeting,'alternate hello');
 assert.equal((await ok(base+`/sessions/${single}/history`,'GET',undefined,ar)).length,1);
 assert.equal((await ok(base+`/sessions/${group}/group-history`,'GET',undefined,ar)).length,2);
 assert.equal((await act(ar,single,body('after restore single',1))).status,'completed');
 assert.equal((await act(ar,group,body('after restore group',1,{mode:'multi',participantIds:ps.map(x=>x.id)}),true)).status,'completed');
 for(const route of [`/cards/${c1.id}`,`/sessions/${single}`,`/sessions/${group}/group-history`,`/imports/${att.id}/original`])assert.equal((await api(base+route,'GET',undefined,br)).status,404);
 assert.equal((await api(base+`/sessions/${bs}`,'GET',undefined,ar)).status,404);
 assert.equal((await ok(base+`/sessions/${pendingId}/requests/${pendingBody.idempotencyKey}/recover`,'POST',{},ar)).status,'failed');assert.equal(calls('backup-pending'),0);
 assert.deepEqual(await digest(url(source)),before);
 pass('restored-http-login-history-continue-and-isolation',{sourceUnchanged:true,restoredOriginalRowsProvenByFullContentHash:true,pendingRecoveredWithoutGeneration:true});
 }
 results.status='PASS';results.finished=new Date().toISOString();save();console.log('RESULT '+join('test-results/card-recovery',runId,'results.json'));
}catch(e){results.status='FAIL';results.failure={name:e.name,message:e.message,stack:e.stack};save();console.error(e);process.exitCode=1;}
finally{await stop().catch(()=>{});await pool.end();await admin.end();}
