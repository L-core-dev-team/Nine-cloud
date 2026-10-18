import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { Hono } from 'hono';
import { TurnReceiptSchema, type SaveEnvelope } from '@jiuxiao/contracts';
import { NarrativePublicationRepository, seedNarrativeInTransaction, eraseNarrativeForOwner, TEST_BODY_LIMITS, finalBody } from './narrative-publication-repository.js';
import { NarrativeOutboxWorker } from './narrative-outbox-worker.js';
import { mountNarrativePublications } from '../routes/narrative-publications.js';
import { EmailAuthService } from './email-auth.js';
import { PostgresEmailAuthRepository } from './postgres-email-auth.js';
import { AccountExport } from './account-export.js';
import { AccountLifecycle } from './account-lifecycle.js';

const url = process.env.TEST_DATABASE_URL;
if (url && (!['localhost','127.0.0.1'].includes(new URL(url).hostname) || !/^\/jiuxiao_test(?:_[a-z0-9-]+)?$/.test(new URL(url).pathname))) throw Error('LOCAL_TEST_DATABASE_REQUIRED');
const pool = new Pool({ connectionString: url, max: 12 });
const repository = new NarrativePublicationRepository(pool, TEST_BODY_LIMITS);
const owners: string[] = [];
afterAll(async () => { await pool.end(); });

/** Synthetic authority fixture: exercises SQL transactions, not author-approved gameplay acceptance. */
async function fixture(options: { seed?: boolean; rollback?: boolean; guest?: boolean } = {}) {
  const secret='narrative-test-only-secret-'.repeat(3);
  const auth = new EmailAuthService(new PostgresEmailAuthRepository(pool,secret), async()=>{}, secret);
  const guest = await auth.createGuest('127.0.0.'+String(1+owners.length));
  if (!guest) throw Error('FIXTURE_GUEST_FAILED');
  const owner=guest.session.ownerId; owners.push(owner);
  const saveId='narrative-'+randomUUID(), key=randomUUID(), eventId=randomUUID();
  const receipt = TurnReceiptSchema.parse({ saveId,idempotencyKey:key,requestFingerprint:'sha256:v1:'+'a'.repeat(64),resultingRevision:1,
    decision:{status:'accepted',nextRevision:1,events:[{id:eventId,saveId,type:'fixture.observed',source:'RULES',ruleVersion:'fixture',
      beforeRevision:0,afterRevision:1,occurredAt:new Date().toISOString(),payload:{summary:'authorized synthetic event'}}]} });
  const save:SaveEnvelope={schemaVersion:1,saveId,revision:1,canonVersion:'fixture',ruleVersion:'fixture',memoryPolicyVersion:'fixture',
    state:{playerId:'p',locationId:'gate',elapsedMinutes:1,facts:{privateText:'must-not-persist'}}};
  const c=await pool.connect();let generation='';
  try {await c.query('BEGIN');
    await c.query(`INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot)
      VALUES($1,$2,1,1,'fixture','fixture','fixture',$3::jsonb)`,[saveId,owner,JSON.stringify(save.state)]);
    await c.query('INSERT INTO turn_requests(save_id,idempotency_key,expected_revision,result) VALUES($1,$2,0,$3::jsonb)',[saveId,key,JSON.stringify(receipt)]);
    await c.query(`INSERT INTO turn_events(id,save_id,idempotency_key,sequence,event_type,source,rule_version,before_revision,after_revision,payload,occurred_at,branch_id)
      VALUES($1,$2,$3,0,'fixture.observed','RULES','fixture',0,1,$4::jsonb,now(),'root')`,[eventId,saveId,key,JSON.stringify({summary:'authorized synthetic event'})]);
    if(options.seed!==false)generation=await seedNarrativeInTransaction(c,{ownerId:owner,receipt,save,rendererVersion:'fixture-renderer-v1'});
    await c.query(options.rollback?'ROLLBACK':'COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  return {owner,saveId,key,eventId,receipt,save,generation,auth,token:guest.token};
}
async function lease(f:Awaited<ReturnType<typeof fixture>>,ms?:number){const l=await repository.claim(f.owner,f.saveId,f.key,ms);if(!l)throw Error('LEASE_EXPECTED');return l;}
function appFor(f:Awaited<ReturnType<typeof fixture>>) {
  const app=new Hono();mountNarrativePublications(app,{resolveOwnerId:async r=>(await f.auth.resolve(r.headers.get('authorization')?.replace('Bearer ','')??null))?.ownerId??null},repository);return app;
}

(url?describe:describe.skip)('stage1 PostgreSQL publication and recovery (synthetic rules, real database/session)',()=>{
  it('T1: rollback removes receipt, events and generation together; committed seed excludes raw/private text',async()=>{
    const rolled=await fixture({rollback:true});
    for(const table of ['turn_requests','turn_events','narrative_context_snapshots','narrative_generation_requests']) expect((await pool.query(`SELECT 1 FROM ${table} WHERE save_id=$1`,[rolled.saveId])).rowCount).toBe(0);
    const f=await fixture();const rows=(await pool.query('SELECT context FROM narrative_context_snapshots WHERE save_id=$1',[f.saveId])).rows;
    expect(JSON.stringify(rows)).not.toContain('must-not-persist');expect(JSON.stringify(rows)).not.toContain('privateText');
    expect((await pool.query('SELECT * FROM narrative_outbox WHERE generation_id=$1',[f.generation])).rowCount).toBe(1);
  });
  it('I02/I03: twelve connections obtain one lease/publication; same-key lost response returns exact body',async()=>{
    const f=await fixture();const claims=await Promise.all(Array.from({length:12},()=>repository.claim(f.owner,f.saveId,f.key)));
    expect(claims.filter(Boolean)).toHaveLength(1);const l=claims.find(Boolean)!;
    const text='\ufeff中文😀\r\n第二行';const p=await repository.publish(l,text);
    expect(await repository.publish(l,text)).toEqual(p);
    const alteredLease = {...l,context:{...l.context,receipt:{...l.context.receipt,resultingRevision:999}}};
    expect(await repository.publish(alteredLease,text)).toEqual(p);
    await expect(repository.publish(l,text+'异文')).rejects.toThrow('NARRATIVE_PUBLICATION_CONFLICT');
    expect((await new NarrativePublicationRepository(pool,TEST_BODY_LIMITS).presentation(f.owner,f.saveId,f.key))?.source).toEqual(p);
    expect(await repository.claim(f.owner,f.saveId,f.key)).toBeNull();
    expect((await pool.query('SELECT count(*)::int n FROM narrative_publications WHERE save_id=$1',[f.saveId])).rows[0].n).toBe(1);
  });
  it('I04/F04: expired worker is fenced, crash reclaim has a different attempt and higher epoch',async()=>{
    const f=await fixture();const old=await lease(f,1);await pool.query('SELECT pg_sleep(0.02)');const next=await lease(f);
    expect(next.attemptId).not.toBe(old.attemptId);expect(next.leaseEpoch).toBe(old.leaseEpoch+1);
    await expect(repository.publish(old,'旧正文')).rejects.toThrow('NARRATIVE_STALE_ATTEMPT');
    const p=await repository.publish(next,'新执行正文');await repository.fail(old);
    expect((await repository.presentation(f.owner,f.saveId,f.key))?.source).toEqual(p);
  });
  it('failed renderer leaves settled receipt and recoverable task; missing version never uses current renderer',async()=>{
    const f=await fixture();const unknown=new NarrativeOutboxWorker(repository,new Map());
    await expect(unknown.run(f.owner,f.saveId,f.key)).rejects.toThrow('NARRATIVE_RENDERER_VERSION_UNAVAILABLE');
    expect(await repository.presentation(f.owner,f.saveId,f.key)).toMatchObject({settlement:'accepted',publication:'failed'});
    const render=vi.fn(()=> '确定性正文');const worker=new NarrativeOutboxWorker(repository,new Map([['fixture-renderer-v1',render]]));
    const p=await worker.run(f.owner,f.saveId,f.key);expect(await worker.run(f.owner,f.saveId,f.key)).toEqual(p);expect(render).toHaveBeenCalledTimes(1);
    expect((await pool.query('SELECT revision FROM game_saves WHERE id=$1',[f.saveId])).rows[0].revision).toBe(1);
  });
  it('fixed context survives later save changes without copying future/private state',async()=>{
    const f=await fixture();await pool.query(`UPDATE game_saves SET revision=2,snapshot=jsonb_set(snapshot,'{facts}','{"future":true}') WHERE id=$1`,[f.saveId]);
    const render=vi.fn(()=> '旧回执正文');await new NarrativeOutboxWorker(repository,new Map([['fixture-renderer-v1',render]])).run(f.owner,f.saveId,f.key);
    expect(render.mock.calls[0]?.[0]).toMatchObject({resultingRevision:1});expect(JSON.stringify(render.mock.calls)).not.toContain('future');
  });
  it('F09/F10: raw SQL rejects immutable rewrite, false erasure proof, mixed receipt and source identities',async()=>{
    const a=await fixture(), b=await fixture();const p=await repository.publish(await lease(a),'正文');
    await expect(pool.query(`UPDATE narrative_sources SET body=$2 WHERE id=$1`,[p.sourceId,Buffer.from('伪造')])).rejects.toThrow('NARRATIVE_IMMUTABLE');
    const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('jiuxiao.account_erasure_operation','fake-proof',true)");
      await expect(c.query('DELETE FROM narrative_segments WHERE source_id=$1',[p.sourceId])).rejects.toThrow('NARRATIVE_IMMUTABLE');
    }finally{await c.query('ROLLBACK');c.release();}
    await expect(pool.query(`UPDATE narrative_generation_requests SET request_key=$2 WHERE id=$1`,[b.generation,a.key])).rejects.toThrow('NARRATIVE_IMMUTABLE');
    await expect(pool.query(`UPDATE narrative_outbox SET generation_id=$2 WHERE generation_id=$1`,[b.generation,randomUUID()])).rejects.toThrow('NARRATIVE_IMMUTABLE');
    await expect(pool.query(`INSERT INTO source_event_links(id,source_id,segment_id,save_id,event_id,kind) VALUES($1,$2,0,$3,$4,'provenance_only')`,[randomUUID(),p.sourceId,b.saveId,b.eventId])).rejects.toThrow('NARRATIVE_EVENT_SCOPE_INVALID');
  });
  it('real session: cross-account/expired session/expected-account/trash denied; new request restores same body',async()=>{
    const f=await fixture(),other=await fixture();const p=await repository.publish(await lease(f),'持久正文');const app=appFor(f);
    const path=`/api/games/${f.saveId}/receipts/${f.key}/presentation`;
    const get=(token=f.token,owner=f.owner)=>app.request(path,{headers:{authorization:'Bearer '+token,'x-jiuxiao-account':owner}});
    expect((await get()).headers.get('cache-control')).toContain('no-store');expect((await (await get()).json()).source).toEqual(p);
    expect((await get(other.token,other.owner)).status).toBe(404);expect((await get(f.token,other.owner)).status).toBe(401);
    expect((await app.request(`/api/games/${f.saveId}/sources/${p.sourceId}`,{headers:{authorization:'Bearer '+f.token}})).status).toBe(200);
    // Defensive read test only: the current product does not trash authoritative saves.
    await pool.query("INSERT INTO cloud_archive_trash(save_id,owner_id,deleted_revision,backup,digest) VALUES($1,$2,1,'{}'::jsonb,$3)",[f.saveId,f.owner,'a'.repeat(64)]);expect((await get()).status).toBe(404);
    await pool.query('DELETE FROM cloud_archive_trash WHERE save_id=$1',[f.saveId]);expect((await get()).status).toBe(200);
    await pool.query('UPDATE auth_sessions SET expires_at=now()-interval \'1 second\' WHERE owner_id=$1',[f.owner]);expect((await get()).status).toBe(401);
  });
  it('legacy body is explicitly unavailable; unknown and unaccepted receipts have no source',async()=>{
    const f=await fixture({seed:false});expect(await repository.presentation(f.owner,f.saveId,f.key)).toMatchObject({publication:'legacy-body-unavailable',source:null});
    expect(await repository.presentation(f.owner,f.saveId,randomUUID())).toBeNull();
    const worker=new NarrativeOutboxWorker(repository,new Map([['fixture-renderer-v1',()=>{throw Error('MUST_NOT_GENERATE');}]]));
    expect(await worker.run(f.owner,f.saveId,f.key)).toBeNull();
  });
  it('F12: export contains published body only, close blocks reads, verified expiry removes dependencies without orphan data',async()=>{
    const f=await fixture();const p=await repository.publish(await lease(f),'可导出正文');
    const exported=await new AccountExport(pool).read(f.owner);expect(JSON.stringify(exported)).toContain('可导出正文');
    expect(exported?.data).not.toHaveProperty('npcAuthorizedObservations');expect(JSON.stringify(exported)).not.toContain('rendererVersion');
    await pool.query('UPDATE auth_accounts SET closed_at=now() WHERE id=$1',[f.owner]);expect(await repository.source(f.owner,f.saveId,p.sourceId)).toBeNull();
    await pool.query('UPDATE auth_accounts SET closed_at=NULL WHERE id=$1',[f.owner]);expect(await repository.source(f.owner,f.saveId,p.sourceId)).toEqual(p);
    await pool.query("UPDATE auth_accounts SET closed_at=now()-interval '31 days' WHERE id=$1",[f.owner]);
    const lifecycle=new AccountLifecycle(pool,async()=>{},'isolated-lifecycle-secret'.repeat(3),'synthetic-test-policy',true);
    await lifecycle.expireClosed(true);
    expect((await pool.query('SELECT 1 FROM narrative_sources WHERE id=$1',[p.sourceId])).rowCount).toBe(0);
    expect(await repository.presentation(f.owner,f.saveId,f.key)).toBeNull();
  });
  it('F07: publication failure rolls back body, publication and segments together',async()=>{
    const f=await fixture(),l=await lease(f);
    await pool.query(`CREATE FUNCTION narrative_test_failpoint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.generation_id='${f.generation}'::uuid AND NEW.kind='index' THEN RAISE EXCEPTION 'INJECTED_PUBLICATION_FAILURE'; END IF; RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER narrative_test_failpoint BEFORE INSERT ON narrative_outbox FOR EACH ROW EXECUTE FUNCTION narrative_test_failpoint()');
    try {await expect(repository.publish(l,'不得发布')).rejects.toThrow('INJECTED_PUBLICATION_FAILURE');}
    finally {await pool.query('DROP TRIGGER narrative_test_failpoint ON narrative_outbox');await pool.query('DROP FUNCTION narrative_test_failpoint()');}
    expect((await pool.query('SELECT 1 FROM narrative_sources WHERE generation_id=$1',[f.generation])).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM narrative_publications WHERE generation_id=$1',[f.generation])).rowCount).toBe(0);
  });
  it('F03: a nonaccepted receipt cannot create a generation task',async()=>{
    const f=await fixture({seed:false});const c=await pool.connect();
    try {await c.query('BEGIN');
      const rejected={...f.receipt,resultingRevision:0,decision:{status:'rejected',revision:0,code:'FIXTURE',message:'No change'}};
      await expect(seedNarrativeInTransaction(c,{ownerId:f.owner,receipt:rejected as any,save:f.save,rendererVersion:'fixture-renderer-v1'})).rejects.toThrow('NARRATIVE_CONTEXT_INVALID');
    }finally{await c.query('ROLLBACK');c.release();}
    expect((await pool.query('SELECT 1 FROM narrative_generation_requests WHERE save_id=$1',[f.saveId])).rowCount).toBe(0);
  });
  it('F14: account closure after claim prevents publication without advancing the save',async()=>{
    const f=await fixture(),l=await lease(f);
    await pool.query('UPDATE auth_accounts SET closed_at=now() WHERE id=$1',[f.owner]);
    await expect(repository.publish(l,'迟到正文')).rejects.toThrow('NARRATIVE_NOT_FOUND');
    expect((await pool.query('SELECT 1 FROM narrative_publications WHERE save_id=$1',[f.saveId])).rowCount).toBe(0);
    expect((await pool.query('SELECT revision FROM game_saves WHERE id=$1',[f.saveId])).rows[0].revision).toBe(1);
  });
  it('F15: renderer output over the final body limit leaves no published source',async()=>{
    const f=await fixture();const limited=new NarrativePublicationRepository(pool,{maxUtf16:1,maxUtf8:3});
    const worker=new NarrativeOutboxWorker(limited,new Map([['fixture-renderer-v1',()=> '越界正文']]));
    await expect(worker.run(f.owner,f.saveId,f.key)).rejects.toThrow('NARRATIVE_BODY_LIMIT');
    expect(await repository.presentation(f.owner,f.saveId,f.key)).toMatchObject({settlement:'accepted',publication:'failed',source:null});
    expect((await pool.query('SELECT 1 FROM narrative_sources WHERE generation_id=$1',[f.generation])).rowCount).toBe(0);
  });
  it('dispatch excludes live leases and closed accounts while expired tasks become eligible',async()=>{
    const active=await fixture(),closed=await fixture();await lease(active);
    await pool.query('UPDATE auth_accounts SET closed_at=now() WHERE id=$1',[closed.owner]);
    const first=await repository.queued(100);
    expect(first.some(t=>t.saveId===active.saveId||t.saveId===closed.saveId)).toBe(false);
    // Transaction rollback leaves production lease identity immutable; wait for DB-clock expiry on a short lease.
    const stale=await fixture();await lease(stale,1);await pool.query('SELECT pg_sleep(0.02)');
    expect((await repository.queued(100)).some(t=>t.saveId===stale.saveId)).toBe(true);
  });
});

describe('final UTF-8 body boundary (no normalization)',()=>{
 it('preserves BOM, CRLF and astral pairs, rejects malformed surrogates and independently enforces both bounds',()=>{
  expect(finalBody('\ufeff中😀\r\n',TEST_BODY_LIMITS).bytes.toString()).toBe('\ufeff中😀\r\n');
  expect(()=>finalBody('\ud800',TEST_BODY_LIMITS)).toThrow('NARRATIVE_BODY_INVALID');
  expect(()=>finalBody('a'.repeat(100001),TEST_BODY_LIMITS)).toThrow('NARRATIVE_BODY_LIMIT');
  expect(()=>finalBody('中'.repeat(66667),TEST_BODY_LIMITS)).toThrow('NARRATIVE_BODY_LIMIT');
  expect(finalBody('中'.repeat(66666),TEST_BODY_LIMITS).bytes.length).toBe(199998);
 });
});
