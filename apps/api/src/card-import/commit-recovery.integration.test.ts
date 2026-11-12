import { afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../app.js';
import { EmailAuthService } from '../services/email-auth.js';
import { PostgresEmailAuthRepository } from '../services/postgres-email-auth.js';
import { CardImportService } from './service.js';
import { assertLocalCardDatabase } from './local-runtime.js';
const url=process.env.CARD_IMPORT_HOST_TEST_DATABASE_URL;
if(url)assertLocalCardDatabase(url,/^\/jiuxiao_test_card_host_[0-9_]+$/);
const pool=new Pool({connectionString:url,max:4});
const secret='synthetic-commit-recovery-fixture-not-a-production-secret';
let code='';
const auth=new EmailAuthService(new PostgresEmailAuthRepository(pool,secret),async(_email,c)=>{code=c;},secret);
const origin='https://card.example.invalid';
async function fixture(){const email=`recovery-${randomUUID()}@example.invalid`;await auth.requestCode(email);const f=await auth.verify(email,code);if(!f)throw Error('AUTH_FIXTURE_FAILED');const service=new CardImportService(pool);const p=await service.preview(f.session.ownerId,'synthetic.json','card',Buffer.from(JSON.stringify({name:randomUUID(),description:'fixture',personality:'fixture',scenario:'fixture',first_mes:'fixture',mes_example:'fixture'})));const card=await service.confirm(f.session.ownerId,{importId:p.id,parentId:null,source:'synthetic',notes:'',links:[]});const session=await service.createSession(f.session.ownerId,randomUUID(),card.id);return{session,cookie:`jx_session=${f.token}`};}
/** Real PG COMMIT, then deliberately lose the client delivery acknowledgement.
 * Driver-boundary fault injection, not a claim that network/PG crash was executed.
 */
function lostCommitPool(targetCommit:number){let commits=0;return new Proxy(pool,{get(target,p){if(p==='connect')return async()=>{const c=await target.connect();return new Proxy(c,{get(client,k){if(k==='query')return async(sql:string,values?:unknown[])=>{const result=await client.query(sql,values);if(sql==='COMMIT'&&++commits===targetCommit)throw Error('INJECTED_POST_COMMIT_ACK_LOSS');return result;};const value=Reflect.get(client,k);return typeof value==='function'?value.bind(client):value;}});};const value=Reflect.get(target,p);return typeof value==='function'?value.bind(target):value;}});}

describe.skipIf(!url)('incremental real PG post-COMMIT acknowledgement loss',()=>{
 afterAll(async()=>{await pool.end();});
 it('lost pending COMMIT acknowledgement remains queryable; same key never dispatches model',async()=>{
  const f=await fixture();let calls=0;const app=createApp(undefined,undefined,{service:auth,origin},undefined,{pool:lostCommitPool(1),model:async()=>{calls++;return 'no';}});
  const key=randomUUID(),path=`/api/card-import/sessions/${f.session.id}`,body={action:'wait',expectedRevision:0,idempotencyKey:key};
  const post=()=>app.request(path+'/actions',{method:'POST',headers:{cookie:f.cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
  expect((await post()).status).toBe(500);
  expect((await(await app.request(path+'/requests/'+key,{headers:{cookie:f.cookie}})).json()).status).toBe('pending');
  expect((await(await post()).json()).status).toBe('pending');expect(calls).toBe(0);
  expect((await pool.query('SELECT revision FROM card_import.sessions WHERE id=$1',[f.session.id])).rows[0].revision).toBe(0);
 });
 it('lost completion COMMIT acknowledgement returns stored text, never generates twice',async()=>{
  const f=await fixture();let calls=0;const app=createApp(undefined,undefined,{service:auth,origin},undefined,{pool:lostCommitPool(2),model:async()=>{calls++;return 'saved once';}});
  const key=randomUUID(),body={action:'hello',expectedRevision:0,idempotencyKey:key},path=`/api/card-import/sessions/${f.session.id}`;
  const post=()=>app.request(path+'/actions',{method:'POST',headers:{cookie:f.cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
  expect((await(await post()).json())).toMatchObject({status:'completed',narrative:'saved once',resulting_revision:1});
  expect((await(await post()).json()).status).toBe('completed');expect(calls).toBe(1);
  expect((await pool.query('SELECT count(*)::int AS n FROM card_import.requests WHERE session_id=$1',[f.session.id])).rows[0].n).toBe(1);
 });
 it('reuses shared PG account quota across two hosts without a second limiter',async()=>{
  const f=await fixture();let calls=0;const opts={pool,model:async()=>{calls++;return 'once';}};
  const a=createApp(undefined,undefined,{service:auth,origin},undefined,opts),b=createApp(undefined,undefined,{service:auth,origin},undefined,opts);
  const path=`/api/card-import/sessions/${f.session.id}`,body={action:'bounded',expectedRevision:0,idempotencyKey:randomUUID()};
  for(let i=0;i<30;i++)expect((await(i%2?a:b).request(path+'/actions',{method:'POST',headers:{cookie:f.cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)})).status).toBe(200);
  const denied=await a.request(path+'/actions',{method:'POST',headers:{cookie:f.cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
  expect(denied.status).toBe(429);expect(calls).toBe(1);
  expect((await(await b.request(path+'/requests/'+body.idempotencyKey,{headers:{cookie:f.cookie}})).json()).status).toBe('completed');
 });});
