import {randomUUID,randomBytes} from 'node:crypto';
import type { DomainEvent, SaveEnvelope, TurnReceipt } from '@jiuxiao/contracts';
import { createNpcMemoryJournal, prepareNpcMemoryTurn } from '@jiuxiao/domain';
import { PostgresNpcMemoryTurnRepository } from './npc-memory-turn-transaction.js';
import {Pool} from 'pg';
import {describe,it,expect,afterAll} from 'vitest';
import {AccountLifecycle} from './account-lifecycle.js';
import {AccountExport} from './account-export.js';
import {EmailAuthService,hashToken} from './email-auth.js';
import {PostgresEmailAuthRepository} from './postgres-email-auth.js';
import {PostgresCloudSaveRepository} from './postgres-cloud-save-repository.js';
import {createApp} from '../app.js';
const suite=process.env.TEST_DATABASE_URL?describe:describe.skip;
suite('account lifecycle, isolated PostgreSQL only',()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:5});const owners:string[]=[];const emails:string[]=[];const ids:string[]=[];const sent=new Map<string,string>();
 const secret='synthetic-account-secret'.repeat(3);const mail=async(email:string,code:string)=>{sent.set(email,code);};
 const lifecycle=new AccountLifecycle(pool,mail,secret,'synthetic-test-policy',true),exporter=new AccountExport(pool),auth=new EmailAuthService(new PostgresEmailAuthRepository(pool,secret),mail,secret);
 const app=createApp(undefined,undefined,{service:auth,origin:'https://fixture.invalid',lifecycle,exporter});
 async function fixture(){const owner=randomUUID(),email=`${owner}@example.invalid`,token=randomBytes(32).toString('base64url');owners.push(owner);emails.push(email);await pool.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2)',[owner,email]);await pool.query("INSERT INTO auth_sessions(token_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[hashToken(token),owner]);return {owner,email,token,hash:hashToken(token)};}
 async function ready(f:Awaited<ReturnType<typeof fixture>>,operation:'close'|'delete'){const begun=await lifecycle.begin(f.owner,f.hash,operation);await lifecycle.verify(f.owner,f.hash,begun.operationId,sent.get(f.email));return begun.operationId;}
 afterAll(async()=>{const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");for(const id of ids){await client.query('DELETE FROM cloud_archive_trash WHERE save_id=$1',[id]);await client.query('DELETE FROM turn_events WHERE save_id=$1',[id]);await client.query('DELETE FROM turn_requests WHERE save_id=$1',[id]);await client.query('DELETE FROM game_saves WHERE id=$1',[id]);}await client.query('DELETE FROM auth_accounts WHERE id=ANY($1::text[])',[owners]);await client.query('DELETE FROM auth_challenges WHERE email=ANY($1::text[])',[emails]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}await pool.end();});
 it('requires old and new proof, binds the original session, revokes all sessions after changing email',async()=>{
  const f=await fixture(),other=await fixture(),newEmail=`new-${randomUUID()}@example.invalid`;emails.push(newEmail);const op=await lifecycle.begin(f.owner,f.hash,'email_change',newEmail);const oldCode=sent.get(f.email);
  await expect(lifecycle.verify(other.owner,other.hash,op.operationId,oldCode)).rejects.toThrow('INVALID_OR_EXPIRED_CODE');
  await expect(lifecycle.complete(f.owner,f.hash,op.operationId,'CHANGE_EMAIL')).rejects.toThrow('INVALID_OPERATION');
  await expect(lifecycle.verify(f.owner,f.hash,op.operationId,'wrong')).rejects.toThrow('INVALID_OR_EXPIRED_CODE');
  expect(await lifecycle.verify(f.owner,f.hash,op.operationId,oldCode)).toEqual({phase:'new'});expect(sent.has(newEmail)).toBe(true);
  const saved=(await pool.query('SELECT digest,session_hash FROM account_operations WHERE id=$1',[op.operationId])).rows[0];expect(saved.digest).toMatch(/^[a-f0-9]{64}$/);expect(saved.digest).not.toBe(sent.get(newEmail));expect(saved.session_hash).not.toBe(f.token);
  await lifecycle.verify(f.owner,f.hash,op.operationId,sent.get(newEmail));await expect(lifecycle.complete(f.owner,f.hash,op.operationId,'WRONG')).rejects.toThrow('CONFIRMATION_REQUIRED');
  expect(await lifecycle.complete(f.owner,f.hash,op.operationId,'CHANGE_EMAIL')).toMatchObject({status:'email_changed'});expect(await auth.resolve(f.token)).toBeNull();expect((await pool.query('SELECT email FROM auth_accounts WHERE id=$1',[f.owner])).rows[0].email).toBe(newEmail);
 });
 it('owner export never exposes another account, OTP digests or token hashes; expected-account mismatch is refused',async()=>{
  const a=await fixture(),b=await fixture();const id=randomUUID();ids.push(id);await pool.query("INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot) VALUES($1,$2,0,1,'fixture','fixture','fixture',$3::jsonb)",[id,b.owner,JSON.stringify({playerId:'p',locationId:'b-secret',elapsedMinutes:0,facts:{secret:'B private'}})]);
  const op=await lifecycle.begin(a.owner,a.hash,'email_change',`new-${randomUUID()}@example.invalid`);const data=await exporter.read(a.owner);expect(JSON.stringify(data)).not.toContain('B private');expect(JSON.stringify(data)).not.toContain(a.hash);expect(JSON.stringify(data)).not.toMatch(/"(?:digest|session_hash|token_hash)":/);expect((data?.data.accountOperations as unknown[]).length).toBe(1);
  const response=await app.request('/api/account/export',{headers:{cookie:`jx_session=${a.token}`,'x-jiuxiao-account':b.owner}});expect(response.status).toBe(401);
  await lifecycle.cancel(a.owner,a.hash,op.operationId);await expect(lifecycle.verify(a.owner,a.hash,op.operationId,sent.get(a.email))).rejects.toThrow('INVALID_OR_EXPIRED_CODE');
 });
 it('close revokes tokens, blocks future login and prevents stale authenticated cloud writes',async()=>{
  const f=await fixture(),id=await ready(f,'close');await lifecycle.complete(f.owner,f.hash,id,'CLOSE_ACCOUNT');expect(await auth.resolve(f.token)).toBeNull();
  await auth.requestCode(f.email);expect(await auth.verify(f.email,sent.get(f.email))).toBeNull();
  const saveId=randomUUID();ids.push(saveId);expect(await new PostgresCloudSaveRepository(pool,true).createForOwner(f.owner,{schemaVersion:1,saveId,revision:0,canonVersion:'fixture',ruleVersion:'fixture',memoryPolicyVersion:'fixture',state:{playerId:'p',locationId:'gate',elapsedMinutes:0,facts:{}}})).toBe(false);
 });
 it('permanent deletion removes live account data rather than soft deleting; unrelated account survives',async()=>{
  const f=await fixture(),b=await fixture(),saveId=randomUUID();ids.push(saveId);
  await new PostgresCloudSaveRepository(pool,true).createForOwner(f.owner,{schemaVersion:1,saveId,revision:0,canonVersion:'fixture',ruleVersion:'fixture',memoryPolicyVersion:'fixture',state:{playerId:'p',locationId:'gate',elapsedMinutes:0,facts:{}}});
  const event:DomainEvent={id:randomUUID(),saveId,branchId:'root',type:'fixture.visible',beforeRevision:0,afterRevision:1,occurredAt:new Date().toISOString(),source:'RULES',ruleVersion:'fixture',payload:{}};
  const previousJournal=createNpcMemoryJournal(saveId,0);
  const prepared=prepareNpcMemoryTurn({journal:previousJournal,saveId,beforeRevision:0,afterRevision:1,events:[event],observedAtMinute:1,grantsForEvent:current=>[{npcId:'npc-erasure-test',eventId:current.id,channel:'witnessed',authorizationPolicyVersion:'visibility-v1',authorizedFields:['summary'],authorizedFacts:{summary:'authorized fact'},visibleSummary:'authorized fact'}],policyForNpc:()=>'exact-recall-v1'});
  if(prepared.status!=='prepared')throw new Error('Expected authorized observation to be prepared.');
  const saved:SaveEnvelope={schemaVersion:1,saveId,canonVersion:'fixture',ruleVersion:'fixture',memoryPolicyVersion:'fixture',revision:1,state:{playerId:'p',locationId:'gate',elapsedMinutes:1,facts:{gameMinute:1}}};
  const receipt:TurnReceipt={idempotencyKey:randomUUID(),saveId,requestFingerprint:'sha256:v1:'+'a'.repeat(64),branchId:'root',rulesVersion:'fixture',clockMinute:1,rng:{seed:null,draws:0},decision:{status:'accepted',outcome:'success',events:[event],nextRevision:1},resultingRevision:1};
  const memoryRepository=new PostgresNpcMemoryTurnRepository(pool,true);
  const committed=await memoryRepository.commitAcceptedTurn({ownerId:f.owner,expectedRevision:0,receipt,save:saved,events:[event],previousJournal,nextJournal:prepared.journal,authorizedObservations:prepared.authorizedObservations});
  expect(committed.kind).toBe('committed');
  expect((await pool.query('SELECT count(*)::integer AS count FROM npc_authorized_observation_outbox WHERE save_id=$1',[saveId])).rows[0]?.count).toBe(1);
  await pool.query("INSERT INTO turn_requests(save_id,idempotency_key,expected_revision,result) VALUES($1,$2,0,'{}'::jsonb)",[saveId,randomUUID()]);

  await pool.query("INSERT INTO cloud_archive_trash(save_id,owner_id,deleted_revision,backup,digest) VALUES($1,$2,0,'{}'::jsonb,$3)",[saveId,f.owner,'a'.repeat(64)]);
  await pool.query("INSERT INTO entitlement_balances(owner_id,entitlement_key,available_units) VALUES($1,'fixture',1)",[f.owner]);
  await pool.query("INSERT INTO entitlement_ledger_entries(id,owner_id,entitlement_key,entry_type,delta_units,balance_after,idempotency_key,request_hash) VALUES($1,$2,'fixture','grant',1,1,$3,$4)",[randomUUID(),f.owner,randomUUID(),'a'.repeat(64)]);
  await expect(pool.query('DELETE FROM entitlement_ledger_entries WHERE owner_id=$1',[f.owner])).rejects.toThrow('append-only');
  const id=await ready(f,'delete');expect(await lifecycle.complete(f.owner,f.hash,id,'DELETE_ACCOUNT')).toMatchObject({status:'account_deleted'});
  expect((await pool.query('SELECT id FROM auth_accounts WHERE id=$1',[f.owner])).rowCount).toBe(0);expect((await pool.query('SELECT id FROM game_saves WHERE id=$1',[saveId])).rowCount).toBe(0);expect(await auth.resolve(f.token)).toBeNull();expect(await auth.resolve(b.token)).not.toBeNull();
  for(const table of ['turn_requests','npc_memory_journals','npc_authorized_observation_outbox','cloud_archive_trash'])expect((await pool.query(`SELECT save_id FROM ${table} WHERE save_id=$1`,[saveId])).rowCount).toBe(0);
  for(const table of ['entitlement_balances','entitlement_ledger_entries'])expect((await pool.query(`SELECT owner_id FROM ${table} WHERE owner_id=$1`,[f.owner])).rowCount).toBe(0);
 });
 it('SEC-01: turn events are append-only and archive rows are erasure-only',async()=>{
  const f=await fixture(),saveId=randomUUID();ids.push(saveId);
  await new PostgresCloudSaveRepository(pool,true).createForOwner(f.owner,{schemaVersion:1,saveId,revision:0,canonVersion:'fixture',ruleVersion:'fixture',memoryPolicyVersion:'fixture',state:{playerId:'p',locationId:'gate',elapsedMinutes:0,facts:{}}});
  await pool.query("INSERT INTO turn_events(id,save_id,idempotency_key,sequence,event_type,source,rule_version,before_revision,after_revision,payload,occurred_at) VALUES($1,$2,$3,0,'fixture','MIGRATION','fixture',0,1,'{}'::jsonb,now())",[randomUUID(),saveId,randomUUID()]);
  await expect(pool.query('UPDATE turn_events SET payload=$1::jsonb WHERE save_id=$2',['{"tampered":true}',saveId])).rejects.toThrow('append-only');
  await expect(pool.query('DELETE FROM turn_events WHERE save_id=$1',[saveId])).rejects.toThrow('verified account erasure');
  await expect(pool.query('DELETE FROM game_saves WHERE id=$1',[saveId])).rejects.toThrow('verified account erasure');
  const spoof=await pool.connect();try{
   await spoof.query('BEGIN');await spoof.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[randomUUID()]);
   await expect(spoof.query('DELETE FROM turn_events WHERE save_id=$1',[saveId])).rejects.toThrow('verified account erasure');
   await spoof.query('ROLLBACK');
  }finally{spoof.release();}
  await expect(pool.query('UPDATE game_saves SET owner_id=$2 WHERE id=$1',[saveId,randomUUID()])).rejects.toThrow('identity is immutable');
  await pool.query('UPDATE game_saves SET revision=1 WHERE id=$1',[saveId]);
  await expect(pool.query('UPDATE game_saves SET revision=0 WHERE id=$1',[saveId])).rejects.toThrow('monotonic');
 });
 it('persists failed attempts and refuses the correct OTP after five failures',async()=>{
  const f=await fixture(),op=await lifecycle.begin(f.owner,f.hash,'close');const code=sent.get(f.email)!;const wrong=code==='000000'?'000001':'000000';
  for(let i=0;i<5;i++)await expect(lifecycle.verify(f.owner,f.hash,op.operationId,wrong)).rejects.toThrow('INVALID_OR_EXPIRED_CODE');
  expect((await pool.query('SELECT attempts FROM account_operations WHERE id=$1',[op.operationId])).rows[0].attempts).toBe(5);
  await expect(lifecycle.verify(f.owner,f.hash,op.operationId,code)).rejects.toThrow('INVALID_OR_EXPIRED_CODE');
 });
 it('data policy pending disables closure/deletion without proof or mail writes',async()=>{const f=await fixture();const pending=new AccountLifecycle(pool,mail,secret);expect(pending.capabilities()).toMatchObject({close:false,permanentDelete:false});await expect(pending.begin(f.owner,f.hash,'delete')).rejects.toThrow('DATA_POLICY_NOT_READY');});
 it('recovers only during the 30-day grace period, erases expired accounts and minimizes audit emails',async()=>{
  const f=await fixture(),id=await ready(f,'close');await lifecycle.complete(f.owner,f.hash,id,'CLOSE_ACCOUNT');
  expect((await pool.query('SELECT old_email,new_email FROM account_operations WHERE id=$1',[id])).rows[0]).toEqual({old_email:null,new_email:null});
  await auth.requestCode(f.email);expect(await auth.verify(f.email,sent.get(f.email),true)).not.toBeNull();
  const expired=await fixture(),closeId=await ready(expired,'close');await lifecycle.complete(expired.owner,expired.hash,closeId,'CLOSE_ACCOUNT');
  await pool.query("UPDATE auth_accounts SET closed_at=now()-interval '31 days' WHERE id=$1",[expired.owner]);
  await auth.requestCode(expired.email);expect(await auth.verify(expired.email,sent.get(expired.email),true)).toBeNull();
  expect(await lifecycle.expireClosed()).toMatchObject({eligible:1,erased:0});
  expect(await lifecycle.expireClosed(true)).toMatchObject({erased:1});
  expect((await pool.query('SELECT id FROM auth_accounts WHERE id=$1',[expired.owner])).rowCount).toBe(0);
  expect(JSON.stringify((await pool.query("SELECT * FROM account_lifecycle_audit WHERE operation='expired_erasure'")).rows)).not.toContain(expired.email);
 });
 it('dry-run selects inactive guests at 90 days but retains guests seen within the window',async()=>{
  const stale=randomUUID(),recent=randomUUID();owners.push(stale,recent);
  const baseline=await lifecycle.expireClosed();
  await pool.query("INSERT INTO auth_accounts(id,email,is_guest,last_seen_at) VALUES($1,NULL,true,now()-interval '91 days'),($2,NULL,true,now()-interval '89 days')",[stale,recent]);
  const preview=await lifecycle.expireClosed();
  expect(preview).toMatchObject({mode:'dry_run',eligibleGuests:baseline.eligibleGuests+1,erased:0});
  expect((await pool.query('SELECT count(*)::int AS count FROM auth_accounts WHERE id=ANY($1::text[])',[ [stale,recent] ])).rows[0].count).toBe(2);
 });

});
