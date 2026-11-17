import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { CardImportService } from './service.js';
import { createCardImportRouter } from './router.js';
import { assertLocalCardDatabase } from './local-runtime.js';
const url = process.env.CARD_IMPORT_TEST_DATABASE_URL;
const enabled = !!url;
if (url) assertLocalCardDatabase(url, /^\/jiuxiao_test_card_import_[0-9_]+$/);
const pool = new Pool({ connectionString: url });
const card = {name:'合成人物', description:'测试',personality:'静',scenario:'场景',first_mes:'你好',mes_example:'例子',extensions:{retained:true}};
const raw = (v: unknown) => Buffer.from(JSON.stringify(v));
let calls=0;
const service = new CardImportService(pool, async () => { calls++; return '模拟剧情，非真实模型验收'; });
const app = createCardImportRouter(service,{ resolveOwnerId:async r => ({'Bearer A':'test-A','Bearer B':'test-B'}[r.headers.get('authorization')??''] ?? null) },'http://card.test');
async function call(path: string, method='GET', data?: unknown, account='A') { return app.request(path,{method,headers:{authorization:'Bearer '+account,Origin:'http://card.test','Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})}); }
async function setup(s=service, owner='test-A', suffix=randomUUID()) { const p=await s.preview(owner,'test.json','card',raw({...card,name:suffix})); const c=await s.confirm(owner,{importId:p.id,parentId:null,source:'synthetic',notes:'',links:[]}); const session=await s.createSession(owner,randomUUID(),c.id); return {p,c,session}; }
describe.skipIf(!enabled)('real PG card isolation with injected model/auth', () => {
 beforeAll(async()=>{ await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8')); await pool.query('CREATE TABLE public.native_test_sentinel (value text); INSERT INTO public.native_test_sentinel VALUES (\'unchanged\')'); });
 afterAll(async()=>{ await pool.end(); });
 it('imports, confirms, downloads exact bytes and restores independent session/history through HTTP',async()=>{
   const original=raw(card); const p=await (await call('/imports','POST',{filename:'card.json',kind:'card',bytesBase64:original.toString('base64'),rightsConfirmed:true})).json();
   expect(p.parsed.document.extensions.retained).toBe(true);
   const confirm={importId:p.id,parentId:null,source:'synthetic',notes:'notes',links:[]};
   const c=await (await call('/cards','POST',confirm)).json(); expect((await (await call('/cards','POST',confirm)).json()).id).toBe(c.id);
   const download=await call('/imports/'+p.id+'/original'); expect(Buffer.from(await download.arrayBuffer())).toEqual(original);
   const id=randomUUID(); expect((await call('/sessions','POST',{id,cardId:c.id})).status).toBe(200);
   const action={idempotencyKey:randomUUID(),expectedRevision:0,action:'你好'}; const before=calls;
   expect((await (await call('/sessions/'+id+'/actions','POST',action)).json()).status).toBe('completed');
   expect((await (await call('/sessions/'+id+'/actions','POST',action)).json()).resulting_revision).toBe(1); expect(calls-before).toBe(1);
   expect((await new CardImportService(pool).history('test-A',id,0)).length).toBe(1);
   expect((await call('/sessions/'+id,'GET',undefined,'B')).status).toBe(404);
   expect((await call('/imports/'+p.id+'/original','GET',undefined,'B')).status).toBe(404);
   expect((await call('/sessions/'+id+'/requests/'+action.idempotencyKey,'GET',undefined,'B')).status).toBe(404);
   expect((await call('/sessions/'+id+'/actions','POST',{...action,action:'different'})).status).toBe(409);
 });
 it('requires authentication, exact origin, valid IDs and explicit rights',async()=>{
   expect((await app.request('/cards')).status).toBe(401);
   expect((await app.request('/imports',{method:'POST',headers:{authorization:'Bearer A'}})).status).toBe(403);
   expect((await call('/cards/not-an-id')).status).toBe(400);
   expect((await call('/imports','POST',{})).status).toBe(400);
 });
 it('preserves failed raw input, deduplicates per owner and keeps versions/attachments',async()=>{
   const failed=await service.preview('test-A','bad.json','card',Buffer.from('{broken')); expect(failed.error).toBe('INVALID_JSON');
   expect((await service.readImport('test-A',failed.id)).original.toString()).toBe('{broken');
   expect((await service.preview('test-A','same.json','card',Buffer.from('{broken'))).duplicate).toBe(true);
   expect((await service.preview('test-B','same.json','card',Buffer.from('{broken'))).id).not.toBe(failed.id);
   const {c}=await setup(); const p=await service.preview('test-A','v3.json','card',raw({spec:'chara_card_v3',spec_version:'3.0',data:{...card,assets:[{uri:'asset:test'}]}}));
   const confirmation={importId:p.id,parentId:c.id,source:'',notes:'',links:[] as {importId:string;uri:string}[]};
   await expect(service.confirm('test-A',confirmation)).rejects.toThrow('MISSING_OR_DUPLICATE_ASSET');
   const asset=await service.preview('test-A','asset.bin','attachment',Buffer.from('opaque')); confirmation.links.push({importId:asset.id,uri:'asset:test'});
   const next=await service.confirm('test-A',confirmation); expect((await service.confirm('test-A',confirmation)).id).toBe(next.id);
   expect(next.parent_id).toBe(c.id); await expect(service.remove('test-A','cards',c.id)).rejects.toThrow('RESOURCE_IN_USE');
 });
 it('fences concurrent requests and never retries an unknown query automatically',async()=>{
   let release!: (s:string)=>void; let started!:()=>void; const ready=new Promise<void>(r=>{started=r;}); let n=0;
   const s=new CardImportService(pool,async()=>{n++;started();return new Promise<string>(r=>{release=r;});}); const {session}=await setup(s); const key=randomUUID();
   const first=s.act('test-A',session.id,key,0,'action'); await ready;
   expect((await s.act('test-A',session.id,key,0,'action')).status).toBe('pending');
   await expect(s.act('test-A',session.id,randomUUID(),0,'other')).rejects.toThrow('REQUEST_PENDING');
   expect((await s.request('test-A',session.id,randomUUID())).status).toBe('unknown'); expect(n).toBe(1);
   release('response'); await first; await expect(s.act('test-A',session.id,randomUUID(),0,'old')).rejects.toThrow('REVISION_CONFLICT');
 });
 it('timeout keeps revision, same key cannot regenerate; expired pending recovery is explicit',async()=>{
   const s=new CardImportService(pool,async()=>new Promise<string>(()=>{}),10);const {session}=await setup(s);const key=randomUUID();
   expect((await s.act('test-A',session.id,key,0,'action')).error).toBe('GENERATION_TIMEOUT'); expect((await s.session('test-A',session.id)).revision).toBe(0);
   expect((await s.act('test-A',session.id,key,0,'action')).status).toBe('failed');
   await pool.query("UPDATE card_import.requests SET status='pending',expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1",[session.id]);
   expect((await s.request('test-A',session.id,key)).status).toBe('pending');
   expect((await s.recover('test-A',session.id,key)).error).toBe('GENERATION_EXPIRED');
 });
 it('deletion during generation cannot resurrect data; native data remains untouched',async()=>{
   let release!: (s:string)=>void;let started!:()=>void;const ready=new Promise<void>(r=>{started=r;});
   const s=new CardImportService(pool,async()=>{started();return new Promise<string>(r=>{release=r;});});const {session}=await setup(s);
   const running=s.act('test-A',session.id,randomUUID(),0,'action');await ready;await s.remove('test-A','sessions',session.id);release('late');await expect(running).rejects.toThrow('NOT_FOUND');
   expect((await pool.query('SELECT * FROM public.native_test_sentinel')).rows).toEqual([{value:'unchanged'}]);
 });
});
