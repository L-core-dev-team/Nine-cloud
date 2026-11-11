import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../app.js';
import { EmailAuthService, hashToken } from '../services/email-auth.js';
import { PostgresEmailAuthRepository } from '../services/postgres-email-auth.js';
import { AccountLifecycle } from '../services/account-lifecycle.js';
import { eraseCardImports } from './host.js';
import type { CardModel } from './service.js';
import { createCardModel } from './card-model-provider.js';
import { createProviderTransport } from '@jiuxiao/domain/provider-narrative';
import { createCardEgressFetch } from './provider-egress.js';
import { exportCard } from './export.js';

const url=process.env.CARD_IMPORT_HOST_TEST_DATABASE_URL;
if(url){const u=new URL(url);if(u.hostname!=='127.0.0.1'||!/^\/jiuxiao_test_card_host_[0-9_]+$/.test(u.pathname))throw Error('ISOLATED_HOST_TEST_DATABASE_REQUIRED');}
const pool=new Pool({connectionString:url,max:6});
const origin='https://card.example.invalid', secret='synthetic-local-card-host-test-secret-no-production';
const mail=new Map<string,string>();
const auth=new EmailAuthService(new PostgresEmailAuthRepository(pool,secret),async(email,code)=>{mail.set(email,code);},secret);
let model: CardModel=async()=> 'simulated model';
const app=createApp(undefined,undefined,{service:auth,origin},undefined,{pool,model:(input,signal)=>model(input,signal)});
const path='/api/card-import';
const request=(p:string,method='GET',data?:unknown,cookie='')=>app.request(p,{method,headers:{origin,cookie,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
async function login(){const email=`card-${randomUUID()}@example.invalid`;expect((await request('/api/auth/code','POST',{email})).status).toBe(202);const r=await request('/api/auth/verify','POST',{email,code:mail.get(email)});expect(r.status).toBe(200);const cookie=r.headers.get('set-cookie')!.split(';')[0]!;const body=await r.json();return{email,cookie,owner:body.account.id as string,hash:hashToken(cookie.slice('jx_session='.length))};}
async function fixture(cookie:string){const source={name:randomUUID(),description:'synthetic',personality:'kind',scenario:'fixture',first_mes:'hello',mes_example:'example'};const p=await(await request(path+'/imports','POST',{filename:'card.json',kind:'card',bytesBase64:Buffer.from(JSON.stringify(source)).toString('base64'),rightsConfirmed:true},cookie)).json();const c=await(await request(path+'/cards','POST',{importId:p.id,parentId:null,source:'fixture',notes:'',links:[]},cookie)).json();const id=randomUUID();expect((await request(path+'/sessions','POST',{id,cardId:c.id},cookie)).status).toBe(200);return{id,card:c.id,importId:p.id};}
async function operation(f:Awaited<ReturnType<typeof login>>,type:'close'|'delete',lifecycle:AccountLifecycle){const op=await lifecycle.begin(f.owner,f.hash,type);await lifecycle.verify(f.owner,f.hash,op.operationId,mail.get(f.email));return lifecycle.complete(f.owner,f.hash,op.operationId,type==='close'?'CLOSE_ACCOUNT':'DELETE_ACCOUNT');}
const lifecycle=new AccountLifecycle(pool,async(email,code)=>{mail.set(email,code);},secret,'local-card-test',true,()=>true,undefined,eraseCardImports);
const native=async()=>{const out:Record<string,unknown>={};for(const t of ['game_saves','turn_events','turn_requests','npc_memory_journals','npc_authorized_observation_outbox'])out[t]=(await pool.query(`SELECT to_jsonb(t) FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows;return out;};

describe.skipIf(!url)('existing host + real PostgreSQL session integration',()=>{
 beforeAll(async()=>{
  const migrationRoot=new URL('../../../../packages/db/drizzle/',import.meta.url);
  for(const f of (await readdir(migrationRoot)).filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort())await pool.query(await readFile(new URL(f,migrationRoot),'utf8'));
  const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  const install=await pool.connect();try {
   await install.query('BEGIN');await expect(install.query(sql.replace('CREATE TABLE card_import.cards','SELECT 1/0; CREATE TABLE card_import.cards'))).rejects.toThrow();await install.query('ROLLBACK');
   expect((await install.query("SELECT to_regnamespace('card_import') AS n")).rows[0].n).toBeNull();
   await install.query('BEGIN');await install.query(sql);await install.query('COMMIT');
   await install.query('BEGIN');await expect(install.query(sql)).rejects.toThrow();await install.query('ROLLBACK');
  } finally { install.release(); }
 });
 afterAll(async()=>{await pool.end();});
 it('group sessions pin participants, attribute output and preserve atomic idempotent history',async()=>{
  const a=await login(),b=await login();const cards=await Promise.all([fixture(a.cookie),fixture(a.cookie),fixture(a.cookie)]);const id=randomUUID();
  expect((await request(path+'/group-sessions','POST',{id,cardIds:cards.map(x=>x.card)},a.cookie)).status).toBe(200);
  const ps=await(await request(path+`/sessions/${id}/group`,'GET',undefined,a.cookie)).json();expect(ps).toHaveLength(3);
  expect((await request(path+`/sessions/${id}/group`,'GET',undefined,b.cookie)).status).toBe(404);
  let calls=0;model=async input=>{calls++;expect(JSON.stringify(input.messages)).toContain(ps[1].id);return 'speaker reply';};
  const key=randomUUID(),body={action:'hello',expectedRevision:0,idempotencyKey:key,mode:'manual',participantIds:[ps[1].id]};
  expect((await(await request(path+`/sessions/${id}/group-actions`,'POST',body,a.cookie)).json()).status).toBe('completed');
  expect((await(await request(path+`/sessions/${id}/group-actions`,'POST',body,a.cookie)).json()).status).toBe('completed');expect(calls).toBe(1);
  expect((await request(path+`/sessions/${id}/group-actions`,'POST',{...body,idempotencyKey:randomUUID(),expectedRevision:1,participantIds:[randomUUID()]},a.cookie)).status).toBe(400);
  model=async()=>JSON.stringify({messages:[{participantId:ps[0].id,text:'first'},{participantId:ps[2].id,text:'second'}]});
  const multi={action:'together',expectedRevision:1,idempotencyKey:randomUUID(),mode:'multi',participantIds:[ps[0].id,ps[2].id]};
  expect((await(await request(path+`/sessions/${id}/group-actions`,'POST',multi,a.cookie)).json()).status).toBe('completed');
  const history=await(await request(path+`/sessions/${id}/group-history`,'GET',undefined,a.cookie)).json();expect(history.map((x:{participant_id:string})=>x.participant_id)).toEqual([ps[1].id,ps[0].id,ps[2].id]);
  model=async()=>JSON.stringify({messages:[{participantId:randomUUID(),text:'forged'}]});
  expect((await(await request(path+`/sessions/${id}/group-actions`,'POST',{...multi,idempotencyKey:randomUUID(),expectedRevision:2},a.cookie)).json()).status).toBe('failed');
  expect((await(await request(path+`/sessions/${id}/group-history`,'GET',undefined,a.cookie)).json())).toHaveLength(3);
  model=async()=> 'automatic';const auto=await(await request(path+`/sessions/${id}/group-actions`,'POST',{action:'next',expectedRevision:2,idempotencyKey:randomUUID(),mode:'auto'},a.cookie)).json();expect(auto.status).toBe('completed');
  const result=await(await request(path+`/sessions/${id}/group-history`,'GET',undefined,a.cookie)).json();expect(result.at(-1).participant_id).toBe(ps[2].id);
  const two=randomUUID(),personaId=randomUUID();const persona=await(await request(path+'/personas','POST',{id:personaId,name:'pinned player',description:'fixed',extensions:{}},a.cookie)).json();
  expect((await request(path+'/group-sessions','POST',{id:two,cardIds:cards.slice(0,2).map(x=>x.card),personaVersionId:persona.id},a.cookie)).status).toBe(200);
  expect((await(await request(path+`/sessions/${two}`,'GET',undefined,a.cookie)).json()).persona.id).toBe(persona.id);
  await pool.query("CREATE FUNCTION card_import.test_group_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.ordinal=1 THEN RAISE EXCEPTION 'synthetic group write failure'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER test_group_failure BEFORE INSERT ON card_import.group_messages FOR EACH ROW EXECUTE FUNCTION card_import.test_group_failure()');
  const twoPs=await(await request(path+`/sessions/${two}/group`,'GET',undefined,a.cookie)).json();model=async()=>JSON.stringify({messages:twoPs.map((x:{id:string})=>({participantId:x.id,text:'test'}))});
  try {const failed=await(await request(path+`/sessions/${two}/group-actions`,'POST',{action:'atomic',expectedRevision:0,idempotencyKey:randomUUID(),mode:'multi',participantIds:twoPs.map((x:{id:string})=>x.id)},a.cookie)).json();expect(failed.status).toBe('failed');}
  finally {await pool.query('DROP TRIGGER test_group_failure ON card_import.group_messages');await pool.query('DROP FUNCTION card_import.test_group_failure()');}
  expect((await(await request(path+`/sessions/${two}/group-history`,'GET',undefined,a.cookie)).json())).toEqual([]);
  expect((await(await request(path+`/sessions/${two}`,'GET',undefined,a.cookie)).json()).revision).toBe(0);

 });
 it('group settings, concurrency, output validation and cancellation retain authoritative state',async()=>{
  const a=await login(),b=await login(),cards=await Promise.all([fixture(a.cookie),fixture(a.cookie)]),id=randomUUID();
  expect((await request(path+'/group-sessions','POST',{id,cardIds:cards.map(x=>x.card)},a.cookie)).status).toBe(200);
  const ps=await(await request(path+`/sessions/${id}/group`,'GET',undefined,a.cookie)).json();
  expect((await(await request(path+`/sessions/${id}/group-strategy`,'GET',undefined,a.cookie)).json()).strategy).toBe('manual');
  expect((await request(path+`/sessions/${id}/group-strategy`,'PUT',{strategy:'auto'},b.cookie)).status).toBe(404);
  expect((await request(path+`/sessions/${id}/group-strategy`,'PUT',{strategy:'auto'},a.cookie)).status).toBe(200);
  let release!:(v:string)=>void,ready!:()=>void,calls=0;const started=new Promise<void>(r=>{ready=r;});model=async()=>{calls++;ready();return new Promise<string>(r=>{release=r;});};
  const key=randomUUID(),body={action:'concurrent',expectedRevision:0,idempotencyKey:key};const first=request(path+`/sessions/${id}/group-actions`,'POST',body,a.cookie);await started;
  expect((await(await request(path+`/sessions/${id}/group-actions`,'POST',body,a.cookie)).json()).status).toBe('pending');
  expect((await request(path+`/sessions/${id}/group-actions`,'POST',{...body,action:'different'},a.cookie)).status).toBe(409);
  await request(path+`/sessions/${id}/group-strategy`,'PUT',{strategy:'manual'},a.cookie);release('one');expect((await(await first).json()).status).toBe('completed');expect(calls).toBe(1);
  expect((await(await request(path+`/sessions/${id}/group-actions`,'POST',body,a.cookie)).json()).status).toBe('completed');
  expect((await(await request(path+`/sessions/${id}/group-history`,'GET',undefined,a.cookie)).json())[0].participant_id).toBe(ps[0].id);
  const invalid=['not json',JSON.stringify({}),JSON.stringify({messages:[{participantId:randomUUID(),text:'x'}]}),JSON.stringify({messages:[{participantId:ps[0].id,text:''}]}),JSON.stringify({messages:[{participantId:ps[0].id,text:'x'.repeat(8001)}]}),JSON.stringify({messages:Array.from({length:13},()=>({participantId:ps[0].id,text:'x'}))}),JSON.stringify({messages:[{participantId:ps[0].id,text:'valid'},{participantId:randomUUID(),text:'invalid'}]})];
  for(const value of invalid){model=async()=>value;const res=await(await request(path+`/sessions/${id}/group-actions`,'POST',{action:'invalid',expectedRevision:1,idempotencyKey:randomUUID(),mode:'multi',participantIds:ps.map((x:{id:string})=>x.id)},a.cookie)).json();expect(res.status).toBe('failed');}
  model=async()=>JSON.stringify({extra:'ignored',messages:[{participantId:ps[0].id,text:'one',extra:'ignored'},{participantId:ps[0].id,text:'two'}]});
  expect((await(await request(path+`/sessions/${id}/group-actions`,'POST',{action:'repeat speaker',expectedRevision:1,idempotencyKey:randomUUID(),mode:'multi',participantIds:ps.map((x:{id:string})=>x.id)},a.cookie)).json()).status).toBe('completed');
  const cancel=new AbortController();let late!:(v:string)=>void,wake!:()=>void;const waiting=new Promise<void>(r=>{wake=r;});model=async()=>{wake();return new Promise<string>(r=>{late=r;});};
  const cancelKey=randomUUID(),cancelBody={action:'cancel',expectedRevision:2,idempotencyKey:cancelKey,mode:'manual',participantIds:[ps[0].id]};
  const running=app.request(path+`/sessions/${id}/group-actions`,{method:'POST',headers:{origin,cookie:a.cookie,'content-type':'application/json'},body:JSON.stringify(cancelBody),signal:cancel.signal});await waiting;cancel.abort();expect((await(await running).json()).error).toBe('GENERATION_CANCELLED');late('late');
  expect((await(await request(path+`/sessions/${id}/requests/${cancelKey}`,'GET',undefined,a.cookie)).json()).status).toBe('failed');
  expect((await(await request(path+`/sessions/${id}/group-history`,'GET',undefined,a.cookie)).json())).toHaveLength(3);
 });
 it('group lore snapshots combine selected participant and global books without duplicate or cross-owner leakage',async()=>{
  const a=await login(),b=await login();const upload=async(cookie:string,kind:string,data:unknown)=>await(await request(path+'/imports','POST',{filename:'synthetic.json',kind,bytesBase64:Buffer.from(JSON.stringify(data)).toString('base64'),rightsConfirmed:true},cookie)).json();
  const world=async(cookie:string,text:string)=>upload(cookie,'worldbook',{name:text,entries:[{keys:['moon'],content:text}]});
  const shared=await world(a.cookie,'shared lore'),privateBook=await world(a.cookie,'second lore'),foreign=await world(b.cookie,'foreign secret');
  const makeCard=async(name:string,links:unknown[])=>{const raw=await upload(a.cookie,'card',{name,description:name,personality:'kind',scenario:'test',first_mes:'hello',mes_example:'hi'});return await(await request(path+'/cards','POST',{importId:raw.id,parentId:null,source:'test',notes:'',links},a.cookie)).json();};
  const one=await makeCard('first',[{importId:shared.id,uri:'local:shared'}]),two=await makeCard('second',[{importId:shared.id,uri:'local:shared'},{importId:privateBook.id,uri:'local:private'}]);
  expect((await request(path+`/worldbooks/${foreign.id}/global`,'PUT',{enabled:true},a.cookie)).status).toBe(404);
  await request(path+`/worldbooks/${shared.id}/global`,'PUT',{enabled:true},a.cookie);const id=randomUUID();await request(path+'/group-sessions','POST',{id,cardIds:[one.id,two.id]},a.cookie);
  const ps=await(await request(path+`/sessions/${id}/group`,'GET',undefined,a.cookie)).json();await request(path+`/worldbooks/${shared.id}/global`,'PUT',{enabled:false},a.cookie);
  const newer=await(await request(path+`/imports/${shared.id}/worldbook-versions`,'POST',{changes:{name:'changed book',entries:[{keys:['moon'],content:'new lore'}]}},a.cookie)).json();expect(newer.id).toBeTruthy();await request(path+`/worldbooks/${newer.id}/global`,'PUT',{enabled:true},a.cookie);
  const changed=await(await request(path+`/cards/${two.id}/versions`,'POST',{changes:{description:'updated'},links:[]},a.cookie)).json();expect(changed.id).toBeTruthy();
  let captured='';model=async input=>{captured=JSON.stringify(input.messages);return 'ok';};
  expect((await(await request(path+`/sessions/${id}/group-actions`,'POST',{action:'moon',expectedRevision:0,idempotencyKey:randomUUID(),mode:'manual',participantIds:[ps[1].id]},a.cookie)).json()).status).toBe('completed');
  expect(captured.match(/shared lore/g)).toHaveLength(1);expect(captured).toContain('second lore');expect(captured).not.toContain('foreign secret');expect(captured).not.toContain('new lore');expect(captured).toContain('second');expect(captured).not.toContain('updated');
  expect((await request(path+`/sessions/${id}/group-history`,'GET',undefined,b.cookie)).status).toBe(404);
 });
 it('group timeout and budget preserve identity, recent turns, and trusted constraints',async()=>{
  const a=await login(),cards=await Promise.all([fixture(a.cookie),fixture(a.cookie)]),id=randomUUID();await request(path+'/group-sessions','POST',{id,cardIds:cards.map(x=>x.card)},a.cookie);
  const ps=await(await request(path+`/sessions/${id}/group`,'GET',undefined,a.cookie)).json();let n=0;model=async()=>{n++;return new Promise<string>(()=>{});};
  const timeoutApp=createApp(undefined,undefined,{service:auth,origin},undefined,{pool,timeoutMs:20,model:(input,signal)=>model(input,signal)}),key=randomUUID();
  const invoke=()=>timeoutApp.request(path+`/sessions/${id}/group-actions`,{method:'POST',headers:{origin,cookie:a.cookie,'content-type':'application/json'},body:JSON.stringify({action:'wait',expectedRevision:0,idempotencyKey:key,mode:'manual',participantIds:[ps[0].id]})});
  expect((await(await invoke()).json()).error).toBe('GENERATION_TIMEOUT');expect((await(await invoke()).json()).error).toBe('GENERATION_TIMEOUT');expect(n).toBe(1);
  model=async()=> 'x'.repeat(7900);for(let rev=0;rev<8;rev++){const res=await(await request(path+`/sessions/${id}/group-actions`,'POST',{action:`turn ${rev}`,expectedRevision:rev,idempotencyKey:randomUUID(),mode:'manual',participantIds:[ps[0].id]},a.cookie)).json();expect(res.status).toBe('completed');}
  let seen='';model=async input=>{seen=JSON.stringify(input);expect(input.messages[0].role).toBe('system');expect(input.history.at(-1)?.action).toBe('turn 7');expect(input.history.length).toBeLessThan(8);expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThanOrEqual(100000);return 'last';};
  expect((await(await request(path+`/sessions/${id}/group-actions`,'POST',{action:'current request',expectedRevision:8,idempotencyKey:randomUUID(),mode:'manual',participantIds:[ps[1].id]},a.cookie)).json()).status).toBe('completed');expect(seen).toContain(ps[1].id);expect(seen).toContain('current request');
 });
 it('group cancellation around commit and relogin preserve request boundaries',async()=>{
  const a=await login(),cards=await Promise.all([fixture(a.cookie),fixture(a.cookie)]),id=randomUUID();await request(path+'/group-sessions','POST',{id,cardIds:cards.map(x=>x.card)},a.cookie);
  const ps=await(await request(path+`/sessions/${id}/group`,'GET',undefined,a.cookie)).json(),headers={origin,cookie:a.cookie,'content-type':'application/json'};
  const pre=new AbortController();pre.abort();const preKey=randomUUID();const preResponse=await app.request(path+`/sessions/${id}/group-actions`,{method:'POST',headers,signal:pre.signal,body:JSON.stringify({action:'pre',expectedRevision:0,idempotencyKey:preKey,mode:'manual',participantIds:[ps[0].id]})});expect(preResponse.status).toBe(409);
  expect((await(await request(path+`/sessions/${id}/requests/${preKey}`,'GET',undefined,a.cookie)).json()).status).toBe('unknown');
  let release!:(v:string)=>void,started!:()=>void;const ready=new Promise<void>(r=>{started=r;});model=async()=>{started();return new Promise<string>(r=>{release=r;});};const abort=new AbortController(),key=randomUUID();
  const pending=app.request(path+`/sessions/${id}/group-actions`,{method:'POST',headers,signal:abort.signal,body:JSON.stringify({action:'precommit',expectedRevision:0,idempotencyKey:key,mode:'manual',participantIds:[ps[0].id]})});await ready;
  const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT 1 FROM card_import.sessions WHERE owner_id=$1 AND id=$2 FOR UPDATE',[a.owner,id]);release('before commit');await new Promise(r=>setTimeout(r,50));abort.abort();await blocker.query('ROLLBACK');blocker.release();expect((await(await pending).json()).status).toBe('failed');
  expect((await(await request(path+`/sessions/${id}/group-history`,'GET',undefined,a.cookie)).json())).toEqual([]);expect((await(await request(path+`/sessions/${id}`,'GET',undefined,a.cookie)).json()).revision).toBe(0);
  model=async()=> 'committed';const completedKey=randomUUID();const after=new AbortController();const response=await app.request(path+`/sessions/${id}/group-actions`,{method:'POST',headers,signal:after.signal,body:JSON.stringify({action:'done',expectedRevision:0,idempotencyKey:completedKey,mode:'manual',participantIds:[ps[1].id]})});expect((await response.json()).status).toBe('completed');after.abort();
  await request(path+`/sessions/${id}/group-strategy`,'PUT',{strategy:'auto'},a.cookie);await request('/api/auth/logout','POST',{},a.cookie);expect((await request(path+`/sessions/${id}/group-history`,'GET',undefined,a.cookie)).status).toBe(401);
  await pool.query("UPDATE auth_challenges SET issued_at=issued_at-interval '2 minutes' WHERE email=$1",[a.email]);await request('/api/auth/code','POST',{email:a.email});const relogin=await request('/api/auth/verify','POST',{email:a.email,code:mail.get(a.email)});const cookie=relogin.headers.get('set-cookie')!.split(';')[0]!;
  expect((await(await request(path+`/sessions/${id}/group-history`,'GET',undefined,cookie)).json())).toHaveLength(1);expect((await(await request(path+`/sessions/${id}/group-strategy`,'GET',undefined,cookie)).json()).strategy).toBe('auto');
  const other=randomUUID();await request(path+'/group-sessions','POST',{id:other,cardIds:cards.map(x=>x.card)},cookie);expect((await(await request(path+`/sessions/${other}/group-history`,'GET',undefined,cookie)).json())).toEqual([]);
  expect((await(await request(path+`/sessions/${id}/group-actions`,'POST',{action:'continue',expectedRevision:1,idempotencyKey:randomUUID(),mode:'manual',participantIds:[ps[0].id]},cookie)).json()).status).toBe('completed');
 });
 it('applies probability to single and group model contexts through authenticated sessions',async()=>{
  const a=await login(),cards=await Promise.all([fixture(a.cookie),fixture(a.cookie)]);
  const book={name:'probability-test',entries:[{keys:['moon'],content:'selected-probability',extensions:{probability:100}},{keys:['moon'],content:'suppressed-probability',extensions:{probability:0}},{keys:['selected-probability'],content:'recursive-winner',group:'choice',groupOverride:true},{keys:['selected-probability'],content:'recursive-loser',group:'choice'}]};
  const uploaded=await(await request(path+'/imports','POST',{filename:'w.json',kind:'worldbook',bytesBase64:Buffer.from(JSON.stringify(book)).toString('base64'),rightsConfirmed:true},a.cookie)).json();
  expect((await request(path+`/worldbooks/${uploaded.id}/global`,'PUT',{enabled:true},a.cookie)).status).toBe(200);
  const single=randomUUID(),group=randomUUID();await request(path+'/sessions','POST',{id:single,cardId:cards[0].card,recursiveWorldbook:true},a.cookie);await request(path+'/group-sessions','POST',{id:group,cardIds:cards.map(c=>c.card),recursiveWorldbook:true},a.cookie);
  const ps=await(await request(path+`/sessions/${group}/group`,'GET',undefined,a.cookie)).json(),seen:string[]=[];model=async input=>{seen.push(JSON.stringify(input.messages));return 'reply';};
  const draw=vi.spyOn(Math,'random').mockReturnValue(0.5);try {
   expect((await(await request(path+`/sessions/${single}/actions`,'POST',{action:'moon',expectedRevision:0,idempotencyKey:randomUUID()},a.cookie)).json()).status).toBe('completed');
   expect((await(await request(path+`/sessions/${group}/group-actions`,'POST',{action:'moon',expectedRevision:0,idempotencyKey:randomUUID(),mode:'manual',participantIds:[ps[0].id]},a.cookie)).json()).status).toBe('completed');
  } finally {draw.mockRestore();}
  expect(seen).toHaveLength(2);for(const value of seen){expect(value).toContain('selected-probability');expect(value).not.toContain('suppressed-probability');expect(value).toContain('recursive-winner');expect(value).not.toContain('recursive-loser');}
 });
 it('pins recursion mode for new and legacy single and group sessions',async()=>{
  const a=await login(),b=await login(),cards=await Promise.all([fixture(a.cookie),fixture(a.cookie)]);
  const book={name:'chain',entries:[{keys:['moon'],content:'alpha-chain'},{keys:['alpha-chain'],content:'beta-chain'},{keys:['beta-chain'],content:'gamma-chain'}]};
  const upload=await(await request(path+'/imports','POST',{filename:'chain.json',kind:'worldbook',bytesBase64:Buffer.from(JSON.stringify(book)).toString('base64'),rightsConfirmed:true},a.cookie)).json();await request(path+`/worldbooks/${upload.id}/global`,'PUT',{enabled:true},a.cookie);
  const ids=Array.from({length:4},()=>randomUUID());const single=(id:string,on?:boolean)=>request(path+'/sessions','POST',{id,cardId:cards[0].card,...(on===undefined?{}:{recursiveWorldbook:on})},a.cookie);const group=(id:string,on?:boolean)=>request(path+'/group-sessions','POST',{id,cardIds:cards.map(c=>c.card),...(on===undefined?{}:{recursiveWorldbook:on})},a.cookie);
  expect((await single(ids[0]!)).status).toBe(200);expect((await single(ids[1]!,true)).status).toBe(200);expect((await group(ids[2]!)).status).toBe(200);expect((await group(ids[3]!,true)).status).toBe(200);
  expect((await single(ids[0]!,true)).status).toBe(409);expect((await request(path+`/sessions/${ids[1]}`,'GET',undefined,b.cookie)).status).toBe(404);
  const ctx:string[]=[];model=async input=>{ctx.push(JSON.stringify(input.messages));return 'reply';};
  for(let i=0;i<4;i++){const id=ids[i]!,ps=i>=2?await(await request(path+`/sessions/${id}/group`,'GET',undefined,a.cookie)).json():null;const payload={action:'moon',expectedRevision:0,idempotencyKey:randomUUID(),...(ps?{mode:'manual',participantIds:[ps[0].id]}:{})};expect((await(await request(path+`/sessions/${id}/${ps?'group-actions':'actions'}`,'POST',payload,a.cookie)).json()).status).toBe('completed');}
  for(const i of [0,2]){expect(ctx[i]).toContain('alpha-chain');expect(ctx[i]).not.toContain('beta-chain');}for(const i of [1,3]){expect(ctx[i]).toContain('beta-chain');expect(ctx[i]!.indexOf('gamma-chain')).toBeLessThan(ctx[i]!.indexOf('beta-chain'));expect(ctx[i]!.indexOf('beta-chain')).toBeLessThan(ctx[i]!.indexOf('alpha-chain'));}
  const legacyClient=await pool.connect();try{await legacyClient.query('CREATE TEMP TABLE legacy_recursion (id uuid PRIMARY KEY)');const legacy=randomUUID();await legacyClient.query('INSERT INTO legacy_recursion VALUES($1)',[legacy]);await legacyClient.query('ALTER TABLE legacy_recursion ADD COLUMN recursive_worldbook boolean NOT NULL DEFAULT true');expect((await legacyClient.query('SELECT recursive_worldbook FROM legacy_recursion WHERE id=$1',[legacy])).rows[0].recursive_worldbook).toBe(true);}finally{legacyClient.release();}
  expect((await(await request(path+`/sessions/${ids[1]}`,'GET',undefined,a.cookie)).json()).recursive_worldbook).toBe(true);
 });
 it('allows explicit no persona even when a default exists',async()=>{
  const a=await login(),f=await fixture(a.cookie),id=randomUUID();await request(path+'/personas','POST',{id,name:'default identity',description:'secret setting',extensions:{}},a.cookie);await request(path+`/personas/${id}/default`,'PUT',{},a.cookie);
  const sid=randomUUID();expect((await request(path+'/sessions','POST',{id:sid,cardId:f.card,personaVersionId:null},a.cookie)).status).toBe(200);
  expect((await(await request(path+`/sessions/${sid}`,'GET',undefined,a.cookie)).json()).persona).toBeNull();
  expect((await request(path+'/sessions','POST',{id:sid,cardId:f.card,personaVersionId:null},a.cookie)).status).toBe(200);
 });
 it('pins persona versions to sessions and prevents cross-account access and deletion',async()=>{
  const a=await login(),b=await login(),f=await fixture(a.cookie),id=randomUUID();
  const v1=await(await request(path+'/personas','POST',{id,name:'first',description:'old identity',extensions:{role:'fixture'}},a.cookie)).json();
  expect((await request(path+`/personas/${id}/default`,'PUT',{},a.cookie)).status).toBe(200);
  const old=randomUUID();expect((await request(path+'/sessions','POST',{id:old,cardId:f.card},a.cookie)).status).toBe(200);
  const v2=await(await request(path+`/personas/${id}/versions`,'POST',{name:'second',description:'new identity',extensions:{}},a.cookie)).json();
  const newer=randomUUID();expect((await request(path+'/sessions','POST',{id:newer,cardId:f.card,personaVersionId:v2.id},a.cookie)).status).toBe(200);
  expect((await(await request(path+`/sessions/${old}`,'GET',undefined,a.cookie)).json()).persona.id).toBe(v1.id);
  expect((await request(path+'/sessions','POST',{id:randomUUID(),cardId:f.card,personaVersionId:v2.id},b.cookie)).status).toBe(404);
  expect((await request(path+`/personas/${id}`,'DELETE',undefined,a.cookie)).status).toBe(409);
  const inputs:string[]=[];model=async input=>{inputs.push(JSON.stringify(input.messages));return 'reply';};
  for(const sid of [old,newer])await request(path+`/sessions/${sid}/actions`,'POST',{action:'hi',expectedRevision:0,idempotencyKey:randomUUID()},a.cookie);
  expect(inputs[0]).toContain('old identity');expect(inputs[0]).not.toContain('new identity');expect(inputs[1]).toContain('new identity');
 });
 it('replaces global books atomically with session creation and rolls back insert failure',async()=>{
  const a=await login(),b=await login(),f=await fixture(a.cookie);
  const upload=async(name:string)=>await(await request(path+'/imports','POST',{filename:'w.json',kind:'worldbook',bytesBase64:Buffer.from(JSON.stringify({name,entries:[]})).toString('base64'),rightsConfirmed:true},a.cookie)).json();
  const old=await upload('old'),next=await upload('new');await request(path+`/worldbooks/${old.id}/global`,'PUT',{enabled:true},a.cookie);
  const oldSession=randomUUID();await request(path+'/sessions','POST',{id:oldSession,cardId:f.card},a.cookie);
  const replacement={oldId:old.id,newId:next.id};expect((await request(path+'/worldbooks/global/replace','POST',replacement,b.cookie)).status).toBe(404);
  await pool.query("CREATE FUNCTION card_import.test_global_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$");await pool.query('CREATE TRIGGER test_global_failure BEFORE INSERT ON card_import.global_worldbooks FOR EACH ROW EXECUTE FUNCTION card_import.test_global_failure()');
  try {expect((await request(path+'/worldbooks/global/replace','POST',replacement,a.cookie)).status).toBe(500);}finally{await pool.query('DROP TRIGGER test_global_failure ON card_import.global_worldbooks');await pool.query('DROP FUNCTION card_import.test_global_failure()');}
  expect((await(await request(path+'/worldbooks/global','GET',undefined,a.cookie)).json()).map((x:{import_id:string})=>x.import_id)).toEqual([old.id]);
  const ids=Array.from({length:8},()=>randomUUID());const actions=ids.map(id=>request(path+'/sessions','POST',{id,cardId:f.card},a.cookie));actions.push(request(path+'/worldbooks/global/replace','POST',replacement,a.cookie));expect((await Promise.all(actions)).every(r=>r.status===200)).toBe(true);
  const newSession=randomUUID();await request(path+'/sessions','POST',{id:newSession,cardId:f.card},a.cookie);
  const rows=(await pool.query('SELECT session_id,import_id FROM card_import.session_worldbooks WHERE owner_id=$1',[a.owner])).rows;const selected=(id:string)=>rows.filter(r=>r.session_id===id).map(r=>r.import_id);
  expect(selected(oldSession)).toEqual([old.id]);expect(selected(newSession)).toEqual([next.id]);for(const id of ids)expect([[old.id],[next.id]]).toContainEqual(selected(id));
 });
 it('simulates old unique-constraint upgrade and preserves duplicate versions on rollback attempt',async()=>{
  const c=await pool.connect();try {await c.query('BEGIN');await c.query('CREATE TEMP TABLE legacy_cards (owner_id text,id uuid,import_id uuid, UNIQUE(owner_id,import_id)) ON COMMIT DROP');const importId=randomUUID(),first=randomUUID(),second=randomUUID();
   await c.query('INSERT INTO legacy_cards VALUES($1,$2,$3)',['owner',first,importId]);await c.query('ALTER TABLE legacy_cards DROP CONSTRAINT legacy_cards_owner_id_import_id_key');
   await c.query('INSERT INTO legacy_cards VALUES($1,$2,$3)',['owner',second,importId]);await c.query('SAVEPOINT before_downgrade');
   await expect(c.query('ALTER TABLE legacy_cards ADD UNIQUE(owner_id,import_id)')).rejects.toThrow();await c.query('ROLLBACK TO SAVEPOINT before_downgrade');
   expect((await c.query('SELECT id FROM legacy_cards WHERE owner_id=$1 ORDER BY id',['owner'])).rowCount).toBe(2);await c.query('ROLLBACK');
  }finally{c.release();}
 });
 it('snapshots global books per session and preserves references on disable',async()=>{
  const a=await login(),b=await login(),f=await fixture(a.cookie),world={name:'global',entries:[{keys:['moon'],content:'global lore'}]};
  const book=await(await request(path+'/imports','POST',{filename:'w.json',kind:'worldbook',bytesBase64:Buffer.from(JSON.stringify(world)).toString('base64'),rightsConfirmed:true},a.cookie)).json();
  expect((await request(path+`/worldbooks/${book.id}/global`,'PUT',{enabled:true},b.cookie)).status).toBe(404);
  expect((await request(path+`/worldbooks/${book.id}/global`,'PUT',{enabled:true},a.cookie)).status).toBe(200);
  const enabled=randomUUID();await request(path+'/sessions','POST',{id:enabled,cardId:f.card},a.cookie);
  expect((await request(path+`/worldbooks/${book.id}/global`,'PUT',{enabled:false},a.cookie)).status).toBe(200);
  const disabled=randomUUID();await request(path+'/sessions','POST',{id:disabled,cardId:f.card},a.cookie);
  const contexts:string[]=[];model=async input=>{contexts.push(JSON.stringify(input.messages));return 'reply';};
  for(const id of [f.id,enabled,disabled])await request(path+`/sessions/${id}/actions`,'POST',{action:'moon',expectedRevision:0,idempotencyKey:randomUUID()},a.cookie);
  expect(contexts[0]).not.toContain('global lore');expect(contexts[1]).toContain('global lore');expect(contexts[2]).not.toContain('global lore');
  expect((await request(path+`/imports/${book.id}`,'DELETE',undefined,a.cookie)).status).toBe(409);
 });
 it('keeps duplicate import strategies idempotent across concurrent requests and owners',async()=>{
  const a=await login(),b=await login(),f=await fixture(a.cookie);
  for(const strategy of ['skip','copy','update']){
   const body={strategy,idempotencyKey:randomUUID(),importId:f.importId,targetId:f.card};
   const [one,two]=await Promise.all([request(path+'/cards/duplicates','POST',body,a.cookie),request(path+'/cards/duplicates','POST',body,a.cookie)]);
   expect(one.status).toBe(200);expect(two.status).toBe(200);const x=await one.json(),y=await two.json();expect(x.cardId).toBe(y.cardId);if(strategy==='skip')expect(x.cardId).toBe(f.card);else expect(x.cardId).not.toBe(f.card);
   expect((await request(path+'/cards/duplicates','POST',{...body,strategy:strategy==='skip'?'copy':'skip'},a.cookie)).status).toBe(409);
   expect((await request(path+'/cards/duplicates','POST',{...body,idempotencyKey:randomUUID()},b.cookie)).status).toBe(404);
  }
 });
 it('preserves the imported PNG cover when exporting an edited descendant',async()=>{
  const a=await login(),doc={name:'png',description:'old',personality:'kind',scenario:'test',first_mes:'hi',mes_example:'sample'},original=exportCard(doc,'png');
  const imported=await(await request(path+'/imports','POST',{filename:'cover.png',kind:'card',bytesBase64:original.toString('base64'),rightsConfirmed:true},a.cookie)).json();
  const card=await(await request(path+'/cards','POST',{importId:imported.id,parentId:null,source:'test',notes:'',links:[]},a.cookie)).json();const edited=await(await request(path+`/cards/${card.id}/versions`,'POST',{changes:{description:'changed'}},a.cookie)).json();
  const response=await request(path+`/cards/${edited.id}/export?format=png`,'GET',undefined,a.cookie);expect(response.status).toBe(200);expect(response.headers.get('X-Card-Cover')).toBe('original');const output=Buffer.from(await response.arrayBuffer());
  const chunks=(bytes:Buffer)=>{const parts:Buffer[]=[];for(let i=8;i<bytes.length;){const end=i+bytes.readUInt32BE(i)+12;if(bytes.toString('ascii',i+4,i+8)!=='tEXt')parts.push(bytes.subarray(i,end));i=end;}return parts;};expect(chunks(output)).toEqual(chunks(original));
 });
 it('pages deterministically across equal timestamps without leaking another account',async()=>{
  const a=await login(),b=await login(),f=await fixture(a.cookie);for(let i=0;i<101;i++)await pool.query('INSERT INTO card_import.cards(owner_id,id,import_id,parent_id,metadata,created_at) VALUES($1,$2,$3,NULL,$4,$5)',[a.owner,randomUUID(),f.importId,{library:{folder:'page',tags:['t'],favorite:true}},'2026-01-01T00:00:00.123456Z']);
  const first=await(await request(path+'/library/page?folder=page&tag=t&favorite=true','GET',undefined,a.cookie)).json();expect(first.items).toHaveLength(100);expect(first.nextCursor).toBeTruthy();
  const second=await(await request(path+'/library/page?folder=page&tag=t&favorite=true&after='+encodeURIComponent(first.nextCursor),'GET',undefined,a.cookie)).json();expect(second.items).toHaveLength(1);expect(new Set([...first.items,...second.items].map((v:{id:string})=>v.id)).size).toBe(101);
  const foreign=await(await request(path+'/library/page?folder=page','GET',undefined,b.cookie)).json();expect(foreign.items).toHaveLength(0);
 });
 it('creates an edited card version without changing original bytes or old session context',async()=>{
  const a=await login(),b=await login();const doc={spec:'chara_card_v2',spec_version:'2.0',data:{name:'old',description:'old description',personality:'kind',scenario:'place',first_mes:'hello',mes_example:'example',extensions:{unknown:'preserved'}}};
  const original=JSON.stringify(doc);const imported=await(await request(path+'/imports','POST',{filename:'card.json',kind:'card',bytesBase64:Buffer.from(original).toString('base64'),rightsConfirmed:true},a.cookie)).json();
  const card=await(await request(path+'/cards','POST',{importId:imported.id,parentId:null,source:'test',notes:'',links:[]},a.cookie)).json();const oldSession=randomUUID();await request(path+'/sessions','POST',{id:oldSession,cardId:card.id},a.cookie);
  expect((await request(path+`/cards/${card.id}/versions`,'POST',{changes:{description:'new description'}},b.cookie)).status).toBe(404);
  const edit=await request(path+`/cards/${card.id}/versions`,'POST',{changes:{description:'new description'}},a.cookie);expect(edit.status).toBe(200);const version=await edit.json();expect(version.parent_id).toBe(card.id);
  const loaded=await(await request(path+`/cards/${version.id}`,'GET',undefined,a.cookie)).json();expect(loaded.parsed.document.data.extensions.unknown).toBe('preserved');
  for(const format of ['v2','v3','png']) { const exported=await request(path+`/cards/${version.id}/export?format=${format}`,'GET',undefined,a.cookie);expect(exported.status).toBe(200);const bytes=Buffer.from(await exported.arrayBuffer());const round=await(await request(path+'/imports','POST',{filename:`export.${format==='png'?'png':'json'}`,kind:'card',bytesBase64:bytes.toString('base64'),rightsConfirmed:true},a.cookie)).json();expect(round.parsed.document.data.description).toBe('new description');expect(round.parsed.document.data.extensions.unknown).toBe('preserved'); }
  expect((await request(path+`/cards/${version.id}/export?format=v2`,'GET',undefined,b.cookie)).status).toBe(404);
  expect((await request(path+`/cards/${version.id}/library`,'PUT',{folder:'favorites',tags:['moon'],favorite:true},a.cookie)).status).toBe(200);
  expect((await request(path+`/cards/${version.id}/library`,'PUT',{folder:'x',tags:[],favorite:false},b.cookie)).status).toBe(404);
  const found=await(await request(path+'/library?q=old&folder=favorites&tag=moon&favorite=true','GET',undefined,a.cookie)).json();expect(found.map((v:{id:string})=>v.id)).toContain(version.id);
  expect(await(await request(path+`/imports/${imported.id}/original`,'GET',undefined,a.cookie)).text()).toBe(original);
  const newSession=randomUUID();await request(path+'/sessions','POST',{id:newSession,cardId:version.id},a.cookie);const contexts:string[]=[];model=async input=>{contexts.push(JSON.stringify(input.messages));return 'reply';};
  for(const id of [oldSession,newSession])expect((await(await request(path+`/sessions/${id}/actions`,'POST',{action:'hi',expectedRevision:0,idempotencyKey:randomUUID()},a.cookie)).json()).status).toBe('completed');
  expect(contexts[0]).toContain('old description');expect(contexts[1]).toContain('new description');
 });
 it('atomically creates a link-only version, rejects invalid links and preserves old session',async()=>{
  const a=await login(),f=await fixture(a.cookie),other=await login();
  const world={name:'moon',entries:[{keys:['moon'],content:'world lore'}]};
  const imported=await(await request(path+'/imports','POST',{filename:'book.json',kind:'worldbook',bytesBase64:Buffer.from(JSON.stringify(world)).toString('base64'),rightsConfirmed:true},a.cookie)).json();
  const initial=(await pool.query('SELECT count(*)::int AS n FROM card_import.imports WHERE owner_id=$1',[a.owner])).rows[0].n;
  expect((await request(path+`/cards/${f.card}/versions`,'POST',{changes:{description:'changed'},links:[{importId:randomUUID(),uri:'book'}]},a.cookie)).status).toBe(409);
  expect((await pool.query('SELECT count(*)::int AS n FROM card_import.imports WHERE owner_id=$1',[a.owner])).rows[0].n).toBe(initial);
  await pool.query("CREATE FUNCTION card_import.test_fail_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$");
  await pool.query('CREATE TRIGGER test_fail_link BEFORE INSERT ON card_import.links FOR EACH ROW EXECUTE FUNCTION card_import.test_fail_link()');
  try {expect((await request(path+`/cards/${f.card}/versions`,'POST',{changes:{description:'rollback'},links:[{importId:imported.id,uri:'book'}]},a.cookie)).status).toBe(500);} finally {await pool.query('DROP TRIGGER test_fail_link ON card_import.links');await pool.query('DROP FUNCTION card_import.test_fail_link()');}
  expect((await pool.query('SELECT count(*)::int AS n FROM card_import.imports WHERE owner_id=$1',[a.owner])).rows[0].n).toBe(initial);
  expect((await request(path+`/cards/${f.card}/versions`,'POST',{changes:{},links:[{importId:imported.id,uri:'book'}]},other.cookie)).status).toBe(404);
  const response=await request(path+`/cards/${f.card}/versions`,'POST',{changes:{},links:[{importId:imported.id,uri:'book'}]},a.cookie);expect(response.status).toBe(200);const version=await response.json();expect(version.import_id).toBe(f.importId);
  const session=randomUUID();await request(path+'/sessions','POST',{id:session,cardId:version.id},a.cookie);const contexts:string[]=[];model=async input=>{contexts.push(JSON.stringify(input.messages));return 'reply';};
  for(const id of [f.id,session])await request(path+`/sessions/${id}/actions`,'POST',{action:'moon',expectedRevision:0,idempotencyKey:randomUUID()},a.cookie);
  expect(contexts[0]).not.toContain('world lore');expect(contexts[1]).toContain('world lore');
 });
 it('plays cards without lore and with a linked standalone worldbook through authenticated sessions',async()=>{
  const a=await login(), sent:string[]=[];
  model=async input=>{sent.push(JSON.stringify(input.messages));return 'reply';};
  for(const linked of [false,true]){
   const data={name:randomUUID(),description:'desc',personality:'kind',scenario:'test',first_mes:'hello',mes_example:'sample'};
   const uploaded=await(await request(path+'/imports','POST',{filename:'card.json',kind:'card',bytesBase64:Buffer.from(JSON.stringify(data)).toString('base64'),rightsConfirmed:true},a.cookie)).json();
   const links=[];
   if(linked){const world={name:'synthetic',entries:[{keys:['moon'],content:'standalone moon lore'},{keys:['sun'],content:'unmatched sun lore'}]};const w=await(await request(path+'/imports','POST',{filename:'world.json',kind:'worldbook',bytesBase64:Buffer.from(JSON.stringify(world)).toString('base64'),rightsConfirmed:true},a.cookie)).json();links.push({importId:w.id,uri:'local:book'});const exported=await request(path+`/imports/${w.id}/worldbook-export`,'GET',undefined,a.cookie);expect(await exported.json()).toEqual(world);const edit=await request(path+`/imports/${w.id}/worldbook-versions`,'POST',{changes:{name:'edited'}},a.cookie);expect(edit.status).toBe(200);expect((await edit.json()).parsed.document.name).toBe('edited');expect(await(await request(path+`/imports/${w.id}/worldbook-export`,'GET',undefined,a.cookie)).json()).toEqual(world);}
   const card=await(await request(path+'/cards','POST',{importId:uploaded.id,parentId:null,source:'test',notes:'',links},a.cookie)).json();const id=randomUUID();
   expect((await request(path+'/sessions','POST',{id,cardId:card.id},a.cookie)).status).toBe(200);
   const key=randomUUID(), act={action:'moon',expectedRevision:0,idempotencyKey:key};
   expect((await(await request(path+`/sessions/${id}/actions`,'POST',act,a.cookie)).json()).status).toBe('completed');
   expect((await(await request(path+`/sessions/${id}/history`,'GET',undefined,a.cookie)).json())).toHaveLength(1);
   if(linked){expect(sent.at(-1)).toContain('standalone moon lore');expect(sent.at(-1)).not.toContain('unmatched sun lore');}else expect(sent.at(-1)).not.toContain('standalone moon lore');
  }
 });
 it('preserves legacy session rows when the local-only greeting column is added',async()=>{
  const c=await pool.connect();try {
   await c.query('BEGIN');await c.query('CREATE TEMP TABLE legacy_session (owner_id text, id uuid, revision integer) ON COMMIT DROP');
   const id=randomUUID();await c.query('INSERT INTO legacy_session VALUES ($1,$2,7)',['synthetic-owner',id]);
   await c.query('ALTER TABLE legacy_session ADD COLUMN greeting_index integer NOT NULL DEFAULT -1 CHECK(greeting_index >= -1)');
   expect((await c.query('SELECT * FROM legacy_session WHERE id=$1',[id])).rows[0]).toMatchObject({owner_id:'synthetic-owner',revision:7,greeting_index:-1});
   await c.query('ROLLBACK');
  } finally {c.release();}
 });
 it('composes session, saved card, triggered lore, provider adapter and history without duplicate calls',async()=>{
  const a=await login();const doc={spec:'chara_card_v2',spec_version:'2.0',data:{name:'fixture',description:'desc',personality:'kind',scenario:'night',first_mes:'hello',alternate_greetings:['alternate opening'],mes_example:'example',system_prompt:'format',post_history_instructions:'post',character_book:{entries:[{keys:['moon'],content:'moon lore'},{keys:['sun'],content:'sun lore'}]}}};
  const imported=await(await request(path+'/imports','POST',{filename:'card.json',kind:'card',bytesBase64:Buffer.from(JSON.stringify(doc)).toString('base64'),rightsConfirmed:true},a.cookie)).json();
  const card=await(await request(path+'/cards','POST',{importId:imported.id,parentId:null,source:'fixture',notes:'',links:[]},a.cookie)).json();const id=randomUUID();
  expect((await request(path+'/sessions','POST',{id,cardId:card.id,greetingIndex:0},a.cookie)).status).toBe(200);
  expect((await request(path+'/sessions','POST',{id,cardId:card.id,greetingIndex:-1},a.cookie)).status).toBe(409);
  expect((await request(path+'/sessions','POST',{id:randomUUID(),cardId:card.id,greetingIndex:1},a.cookie)).status).toBe(400);
  const sent:string[]=[];const guarded=createCardEgressFetch({allowedHosts:['provider.example.invalid']},async()=>[{address:'8.8.8.8',family:4}],async(_url,init,address)=>{expect(address).toBe('8.8.8.8');sent.push(String(init.body));return Response.json({choices:[{message:{content:'synthetic reply'}}]});});
  const transport=createProviderTransport({protocol:'openai-chat',baseUrl:'https://provider.example.invalid',model:'synthetic',keyEnv:'NARRATIVE_KEY_STORY'},{NARRATIVE_KEY_STORY:'synthetic'},guarded);
  model=createCardModel(transport,100);const key=randomUUID(),action={action:'moon',expectedRevision:0,idempotencyKey:key};
  expect((await(await request(path+`/sessions/${id}/actions`,'POST',action,a.cookie)).json()).status).toBe('completed');
  expect((await(await request(path+`/sessions/${id}/actions`,'POST',action,a.cookie)).json()).status).toBe('completed');expect(sent).toHaveLength(1);
  expect(sent[0]).toContain('moon lore');expect(sent[0]).not.toContain('sun lore');expect(sent[0]).toContain('post');expect(sent[0]).toContain('alternate opening');
  const history=await(await request(path+`/sessions/${id}/history`,'GET',undefined,a.cookie)).json();expect(history).toHaveLength(1);expect(history[0].narrative).toBe('synthetic reply');
  const b=await login();expect((await request(path+`/sessions/${id}/history`,'GET',undefined,b.cookie)).status).toBe(404);
  await request('/api/auth/logout','POST',{},a.cookie);
  // Synthetic test clock advance for the normal one-minute email throttle.
  await pool.query("UPDATE auth_challenges SET issued_at=issued_at-interval '2 minutes' WHERE email=$1",[a.email]);
  expect((await request('/api/auth/code','POST',{email:a.email})).status).toBe(202);const verified=await request('/api/auth/verify','POST',{email:a.email,code:mail.get(a.email)});expect(verified.status).toBe(200);
  const newCookie=verified.headers.get('set-cookie')!.split(';')[0]!;
  expect((await(await request(path+`/sessions/${id}`,'GET',undefined,newCookie)).json())).toMatchObject({greeting_index:0,greeting:'alternate opening'});
  expect((await(await request(path+`/sessions/${id}/history`,'GET',undefined,newCookie)).json())).toHaveLength(1);
  const second={action:'moon again',expectedRevision:1,idempotencyKey:randomUUID()};
  expect((await(await request(path+`/sessions/${id}/actions`,'POST',second,newCookie)).json()).status).toBe('completed');
  expect(sent).toHaveLength(2);expect(sent[1]).toContain('alternate opening');
 });
 it('is disabled by default, refuses mount without auth; same host rejects anonymous and foreign Origin',async()=>{
  expect((await createApp().request(path+'/cards')).status).toBe(404);
  expect(()=>createApp(undefined,undefined,undefined,undefined,{pool})).toThrow('CARD_AUTH_REQUIRED');
  expect((await request(path+'/cards')).status).toBe(401);
  const f=await login();expect((await app.request(path+'/imports',{method:'POST',headers:{cookie:f.cookie,origin:'https://evil.invalid'}})).status).toBe(403);
  const preflight=await app.request(path+'/imports',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type,x-jiuxiao-account'}});expect(preflight.status).toBe(204);
 });
 it('uses real email/session ownership across import/play/history and logout with unchanged native gameplay',async()=>{
  const before=await native(),a=await login(),b=await login();const f=await fixture(a.cookie);let calls=0;
  model=async input=>{calls++;expect(input.history).toEqual([]);return 'first';};
  const key=randomUUID(),action={action:'hello',expectedRevision:0,idempotencyKey:key};
  expect((await(await request(path+`/sessions/${f.id}/actions`,'POST',action,a.cookie)).json()).status).toBe('completed');
  expect((await(await request(path+`/sessions/${f.id}/actions`,'POST',action,a.cookie)).json()).status).toBe('completed');expect(calls).toBe(1);
  for(const p of [`/cards/${f.card}`,`/sessions/${f.id}`,`/sessions/${f.id}/requests/${key}`,`/imports/${f.importId}/original`])expect((await request(path+p,'GET',undefined,b.cookie)).status).toBe(404);
  model=async input=>{expect(input.history).toEqual([{action:'hello',narrative:'first'}]);return 'second';};
  await request(path+`/sessions/${f.id}/actions`,'POST',{action:'next',expectedRevision:1,idempotencyKey:randomUUID()},a.cookie);
  expect((await(await request(path+`/sessions/${f.id}/history`,'GET',undefined,a.cookie)).json()).length).toBe(2);
  await request('/api/auth/logout','POST',{},a.cookie);expect((await request(path+'/cards','GET',undefined,a.cookie)).status).toBe(401);
  expect(await native()).toEqual(before);
 });
 it('closure blocks late generated text and preserves data for explicit account recovery',async()=>{
  const a=await login(),f=await fixture(a.cookie);let release!:(s:string)=>void,started!:()=>void;const ready=new Promise<void>(r=>{started=r;});
  model=async()=>{started();return new Promise<string>(r=>{release=r;});};
  const key=randomUUID(),running=request(path+`/sessions/${f.id}/actions`,'POST',{action:'wait',expectedRevision:0,idempotencyKey:key},a.cookie);await ready;
  expect((await operation(a,'close',lifecycle)).status).toBe('account_closed');release('must-not-persist');const result=await(await running).json();expect(result.status).toBe('failed');expect(result.error).toBe('ACCOUNT_UNAVAILABLE');
  expect((await pool.query('SELECT revision FROM card_import.sessions WHERE id=$1',[f.id])).rows[0].revision).toBe(0);
  expect((await request(path+'/cards','GET',undefined,a.cookie)).status).toBe(401);
  expect((await pool.query('SELECT id FROM card_import.imports WHERE owner_id=$1',[a.owner])).rowCount).toBe(1);
 });
 it('existing beforeDelete callback cleans only owner data; rollback preserves it',async()=>{
  const a=await login(),b=await login(),f=await fixture(a.cookie),other=await fixture(b.cookie);
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM auth_accounts WHERE id=$1 FOR UPDATE',[a.owner]);await eraseCardImports(client,a.owner);await client.query('ROLLBACK');}finally{client.release();}
  expect((await request(path+`/cards/${f.card}`,'GET',undefined,a.cookie)).status).toBe(200);
  expect((await operation(a,'delete',lifecycle)).status).toBe('account_deleted');
  for(const table of ['imports','cards','sessions','links','requests'])expect((await pool.query(`SELECT 1 FROM card_import.${table} WHERE owner_id=$1`,[a.owner])).rowCount).toBe(0);
  expect((await request(path+`/cards/${other.card}`,'GET',undefined,b.cookie)).status).toBe(200);
 });
 it('provider failure and read-only unknown lookup do not advance revision or regenerate',async()=>{
  const a=await login(),f=await fixture(a.cookie);let n=0;model=async()=>{n++;throw Error('synthetic-private-provider-error');};
  const key=randomUUID(),action={action:'fail',expectedRevision:0,idempotencyKey:key};const r=await(await request(path+`/sessions/${f.id}/actions`,'POST',action,a.cookie)).json();expect(r.error).toBe('GENERATION_FAILED');
  await request(path+`/sessions/${f.id}/actions`,'POST',action,a.cookie);expect(n).toBe(1);
  expect((await(await request(path+`/sessions/${f.id}/requests/${randomUUID()}`,'GET',undefined,a.cookie)).json()).status).toBe('unknown');expect(n).toBe(1);
  expect((await pool.query('SELECT revision FROM card_import.sessions WHERE id=$1',[f.id])).rows[0].revision).toBe(0);
 });
 it('allows the owner to find a lost request key, without exposing it to another account',async()=>{
  const a=await login(),b=await login(),f=await fixture(a.cookie),key=randomUUID();model=async()=> 'done';
  await request(path+`/sessions/${f.id}/actions`,'POST',{action:'known action',expectedRevision:0,idempotencyKey:key},a.cookie);
  const list=await(await request(path+`/sessions/${f.id}/requests`,'GET',undefined,a.cookie)).json();
  expect(list[0]).toMatchObject({key,status:'completed',action:'known action',resulting_revision:1});
  expect((await request(path+`/sessions/${f.id}/requests`,'GET',undefined,b.cookie)).status).toBe(404);
 });
 it('records timeout without history or revision advance and same key cannot regenerate',async()=>{
  const a=await login(),f=await fixture(a.cookie),key=randomUUID();let calls=0;model=async()=>{calls++;return new Promise<string>(()=>{});};
  const timeoutApp=createApp(undefined,undefined,{service:auth,origin},undefined,{pool,timeoutMs:20,model:(input,signal)=>model(input,signal)});
  const action={action:'wait',expectedRevision:0,idempotencyKey:key};
  const invoke=()=>timeoutApp.request(path+`/sessions/${f.id}/actions`,{method:'POST',headers:{origin,cookie:a.cookie,'content-type':'application/json'},body:JSON.stringify(action)});
  expect((await(await invoke()).json()).error).toBe('GENERATION_TIMEOUT');
  expect((await(await invoke()).json()).error).toBe('GENERATION_TIMEOUT');expect(calls).toBe(1);
  expect((await(await request(path+`/sessions/${f.id}/history`,'GET',undefined,a.cookie)).json())).toHaveLength(0);
  expect((await pool.query('SELECT revision FROM card_import.sessions WHERE id=$1',[f.id])).rows[0].revision).toBe(0);
 });
 it('cancels an in-flight model without recording late text or repeating the key',async()=>{
  const a=await login(),f=await fixture(a.cookie),key=randomUUID(),abort=new AbortController();let release!:(s:string)=>void,started!:()=>void,calls=0;
  const ready=new Promise<void>(r=>{started=r;});model=async()=>{calls++;started();return new Promise<string>(r=>{release=r;});};
  const action={action:'cancel',expectedRevision:0,idempotencyKey:key};
  const running=app.request(path+`/sessions/${f.id}/actions`,{method:'POST',headers:{origin,cookie:a.cookie,'content-type':'application/json'},body:JSON.stringify(action),signal:abort.signal});
  await ready;abort.abort();expect((await(await running).json()).error).toBe('GENERATION_CANCELLED');release('late');
  expect((await(await request(path+`/sessions/${f.id}/requests/${key}`,'GET',undefined,a.cookie)).json()).status).toBe('failed');
  await request(path+`/sessions/${f.id}/actions`,'POST',action,a.cookie);expect(calls).toBe(1);
  expect((await(await request(path+`/sessions/${f.id}/history`,'GET',undefined,a.cookie)).json())).toHaveLength(0);
 });
});
