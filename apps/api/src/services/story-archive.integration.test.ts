import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { TurnReceipt } from '@jiuxiao/contracts';
import { StoryArchive } from './story-archive.js';
import { ServerTurnService } from './server-turn.js';
import { createPostgresServerTurnRepository } from './postgres-server-turn.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite('presentation archive on isolated PostgreSQL (synthetic pagination fixture, not author gameplay)', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const archive = new StoryArchive(pool);
  const owner = 'story-fixture-owner-' + randomUUID();
  const saveId = 'story-fixture-save-' + randomUUID();
  const receipts: TurnReceipt[] = [];
  let service: ServerTurnService;
  beforeAll(async () => {
    await pool.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2)', [owner, owner + '@fixture.invalid']);
    await pool.query(`INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot)
      VALUES($1,$2,0,1,'fixture','fixture','fixture',$3::jsonb)`, [saveId, owner, JSON.stringify({playerId:'fixture-player',locationId:'fixture-place',elapsedMinutes:0,facts:{gameMinute:0}})]);
    service = new ServerTurnService(createPostgresServerTurnRepository(pool), {
      ruleVersion:'fixture',canonVersion:'fixture',memoryPolicyVersion:'fixture',
      decide: (intent,save) => ({status:'accepted',nextRevision:save.revision+1,events:[{id:randomUUID(),saveId:save.saveId,type:'fixture.story',beforeRevision:save.revision,afterRevision:save.revision+1,source:'RULES',ruleVersion:'fixture',occurredAt:new Date().toISOString(),payload:{}}]}),
      reduce: state => ({...state,elapsedMinutes:state.elapsedMinutes+1,facts:{gameMinute:Number(state.facts.gameMinute)+1}}),
      grantsForEvent:()=>[],policyForNpc:()=> 'fixture',
    });
    for(let i=0;i<101;i++) {
      const result=await service.execute(owner,{kind:'move',saveId,actorId:'fixture-player',expectedRevision:i,idempotencyKey:randomUUID(),payload:{destinationId:'fixture-place'}});
      if(result.status!=='accepted')throw new Error('FIXTURE_COMMIT_FAILED');
      receipts.push(result.receipt);
      // First row predates archiving; last row is reserved for a concurrent write.
      if(i>0&&i<100)await archive.retain(result.receipt,'deterministic',()=>`synthetic paragraph ${i+1}`);
    }
  });
  afterAll(async () => {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");
      await client.query('DELETE FROM turn_events WHERE save_id=ANY($1::text[])',[[saveId,saveId+'-long']]);
      await client.query('DELETE FROM turn_requests WHERE save_id=ANY($1::text[])',[[saveId,saveId+'-long']]);
      await client.query('DELETE FROM game_saves WHERE id=ANY($1::text[]) AND owner_id=$2',[[saveId,saveId+'-long'],owner]);
      await client.query('DELETE FROM auth_accounts WHERE id=$1',[owner]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
  });
  it('paginates all accepted receipts in revision order and leaves old prose explicitly missing',async()=>{
    const last=await archive.read(owner,saveId,101);
    expect(last.items).toHaveLength(100);expect(last.nextBefore).toBe(1);
    expect(last.items[0]?.receipt.resultingRevision).toBe(2);
    const first=await archive.read(owner,saveId,101,last.nextBefore!);
    expect(first.nextBefore).toBeNull();expect(first.items).toHaveLength(1);
    expect(first.items[0]?.text).toBeNull();
    expect((await archive.read(owner,saveId,0)).items).toEqual([]);
  });
  it('isolates owners and save IDs',async()=>{
    expect((await archive.read('foreign-owner',saveId,101)).items).toEqual([]);
    expect((await archive.read(owner,'other-save',101)).items).toEqual([]);
  });
  it('paginates long Chinese prose under the client byte limit without dropping any revision or text',async()=>{
    const id=saveId+'-long';
    await pool.query(`INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot)
      VALUES($1,$2,0,1,'fixture','fixture','fixture',$3::jsonb)`,[id,owner,JSON.stringify({playerId:'fixture-player',locationId:'fixture-place',elapsedMinutes:0,facts:{gameMinute:0}})]);
    const prose=(revision:number)=>`${revision}:`+'灵'.repeat(4000)+'\u0001'.repeat(20);
    for(let i=0;i<80;i++) {
      const result=await service.execute(owner,{kind:'move',saveId:id,actorId:'fixture-player',expectedRevision:i,idempotencyKey:randomUUID(),payload:{destinationId:'fixture-place'}});
      if(result.status!=='accepted')throw Error('FIXTURE_COMMIT_FAILED');
      await archive.retain(result.receipt,'deterministic',()=>prose(i+1));
    }
    const revisions:number[]=[];let before:number|undefined;let pages=0;
    do {
      const page=await archive.read(owner,id,80,before);pages++;
      expect(Buffer.byteLength(JSON.stringify(page),'utf8')).toBeLessThanOrEqual(850_000);
      expect(page.items.length).toBeGreaterThan(0);
      for(const row of page.items){expect(row.text).toBe(prose(row.receipt.resultingRevision));revisions.push(row.receipt.resultingRevision);}
      if(page.nextBefore===null)break;
      expect(page.nextBefore).toBeLessThan(before??81);before=page.nextBefore;
      if(pages>80)throw Error('NON_ADVANCING_STORY_CURSOR');
    }while(true);
    expect(pages).toBeGreaterThan(1);expect(revisions.sort((a,b)=>a-b)).toEqual(Array.from({length:80},(_,i)=>i+1));
    expect((await pool.query('SELECT count(*)::int AS count FROM story_narratives WHERE save_id=$1',[id])).rows[0].count).toBe(80);
  });
  it('concurrent render attempts return one immutable winning text and retries do not render again',async()=>{
    const receipt=receipts[100]!;
    const results=await Promise.all([archive.retain(receipt,'model',()=> 'synthetic A'),archive.retain(receipt,'deterministic',()=> 'synthetic B')]);
    expect(results[0]).toBe(results[1]);
    let called=false;expect(await archive.retain(receipt,'model',()=>{called=true;return 'overwrite';})).toBe(results[0]);expect(called).toBe(false);
    await expect(pool.query('UPDATE story_narratives SET narrative_text=$2 WHERE save_id=$1',[saveId,'overwrite'])).rejects.toThrow('STORY_NARRATIVE_IMMUTABLE');
  });
  it('refuses a forged or uncommitted receipt before invoking the renderer',async()=>{
    let called=false;
    await expect(archive.retain({...receipts[0]!,resultingRevision:999},'model',()=>{called=true;return 'forged';})).rejects.toThrow('STORY_RECEIPT_MISMATCH');
    await expect(archive.retain({...receipts[0]!,idempotencyKey:randomUUID()},'model',()=>{called=true;return 'forged';})).rejects.toThrow('STORY_RECEIPT_MISMATCH');
    expect(called).toBe(false);
  });
});
