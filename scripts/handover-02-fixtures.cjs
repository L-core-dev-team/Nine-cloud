'use strict';
// Independent real-PG component tests. Never evidence of signed gameplay T1 wiring.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {isolatedPool,services,fixture}=require('./handover-test-support.cjs');let pool,s,repo;
before(async()=>{pool=await isolatedPool();s=await services();repo=new s.NarrativePublicationRepository(pool,s.TEST_BODY_LIMITS);});after(async()=>{await pool?.end();});
async function counts(f){return(await pool.query(`SELECT
 (SELECT count(*)::int FROM turn_requests WHERE save_id=$1 AND idempotency_key=$2) receipts,
 (SELECT count(*)::int FROM turn_events WHERE save_id=$1) events,
 (SELECT count(*)::int FROM narrative_generation_requests WHERE save_id=$1 AND request_key=$2) generations,
 (SELECT count(*)::int FROM narrative_attempts a JOIN narrative_generation_requests g ON g.id=a.generation_id WHERE g.save_id=$1 AND a.state='running' AND a.lease_until>clock_timestamp()) live_attempts,
 (SELECT count(*)::int FROM narrative_publications WHERE save_id=$1 AND is_default) defaults,
 (SELECT count(*)::int FROM narrative_sources n JOIN narrative_generation_requests g ON g.id=n.generation_id WHERE g.save_id=$1) sources`,[f.saveId,f.key])).rows[0];}
test('component: legacy accepted without generation is explicit and never rendered or seeded on read',async()=>{
 const f=await fixture(pool,{seed:false});let rendered=0;const w=new s.NarrativeOutboxWorker(repo,new Map([['handover-fixture-v1',()=>{rendered++;return 'must not run';}]]));
 assert.deepEqual(await repo.presentation(f.owner,f.saveId,f.key),{settlement:'accepted',generation:'not_recorded',publication:'legacy-body-unavailable',source:null});
 assert.equal(await w.run(f.owner,f.saveId,f.key),null);assert.equal(rendered,0);
 assert.deepEqual(await counts(f),{receipts:1,events:1,generations:0,live_attempts:0,defaults:0,sources:0});
});
test('component: twenty competing workers retain one generation, one effective attempt and one default',async()=>{
 const f=await fixture(pool);let rendered=0;const w=new s.NarrativeOutboxWorker(repo,new Map([['handover-fixture-v1',async()=>{rendered++;await pool.query('SELECT pg_sleep(0.025)');return '一次发布。';}]]));
 await Promise.all(Array.from({length:20},()=>w.run(f.owner,f.saveId,f.key)));assert.equal(rendered,1);
 assert.deepEqual(await counts(f),{receipts:1,events:1,generations:1,live_attempts:0,defaults:1,sources:1});
 const source=(await repo.presentation(f.owner,f.saveId,f.key)).source;assert.deepEqual(await w.run(f.owner,f.saveId,f.key),source);assert.equal(rendered,1);
});
test('component: expired lease cannot publish even before another claimant',async()=>{
 const f=await fixture(pool),lease=await repo.claim(f.owner,f.saveId,f.key,20);await pool.query('SELECT pg_sleep(0.04)');
 await assert.rejects(repo.publish(lease,'已过期。'),/NARRATIVE_STALE_ATTEMPT/);assert.equal((await counts(f)).defaults,0);assert.equal((await counts(f)).events,1);
});
test('component: abandoned wait and late worker cannot replace default; reread uses original key',async()=>{
 const f=await fixture(pool),old=await repo.claim(f.owner,f.saveId,f.key,20);await pool.query('SELECT pg_sleep(0.04)');
 const fresh=await repo.claim(f.owner,f.saveId,f.key),published=await repo.publish(fresh,'新租约唯一原文。');
 await assert.rejects(repo.publish(old,'迟到替换。'),/NARRATIVE_STALE_ATTEMPT/);await repo.fail(old);
 assert.deepEqual((await repo.presentation(f.owner,f.saveId,f.key)).source,published);assert.deepEqual(await repo.publish(fresh,published.text),published);
 await assert.rejects(repo.publish(fresh,'同一尝试异文。'),/NARRATIVE_PUBLICATION_CONFLICT/);
 assert.deepEqual(await counts(f),{receipts:1,events:1,generations:1,live_attempts:0,defaults:1,sources:1});
});
test('component: renderer failure preserves settlement and returns failed with absent original',async()=>{
 const f=await fixture(pool),w=new s.NarrativeOutboxWorker(repo,new Map([['handover-fixture-v1',()=>{throw Error('injected renderer failure');}]]));
 await assert.rejects(w.run(f.owner,f.saveId,f.key),/injected renderer failure/);const p=await repo.presentation(f.owner,f.saveId,f.key);
 assert.equal(p.settlement,'accepted');assert.equal(p.publication,'failed');assert.equal(p.source,null);
 assert.deepEqual(await counts(f),{receipts:1,events:1,generations:1,live_attempts:0,defaults:0,sources:0});
});
test('component: closing account after claim prohibits late publication',async()=>{
 const f=await fixture(pool),lease=await repo.claim(f.owner,f.saveId,f.key);await pool.query('UPDATE auth_accounts SET closed_at=now() WHERE id=$1',[f.owner]);
 await assert.rejects(repo.publish(lease,'关闭后迟到。'),/NARRATIVE_NOT_FOUND/);assert.equal(await repo.presentation(f.owner,f.saveId,f.key),null);
 assert.equal((await counts(f)).defaults,0);assert.equal((await counts(f)).sources,0);assert.equal((await counts(f)).events,1);
});
