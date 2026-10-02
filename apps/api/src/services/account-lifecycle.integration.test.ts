import {randomUUID,randomBytes} from 'node:crypto';
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
 const lifecycle=new AccountLifecycle(pool,mail,secret,'synthetic-test-policy',true),exporter=new AccountExport(pool),auth=new EmailAuthService(new PostgresEmailAuthRepository(pool),mail,secret);
 const app=createApp(undefined,undefined,{service:auth,origin:'https://fixture.invalid',lifecycle,exporter});
 async function fixture(){const owner=randomUUID(),email=`${owner}@example.invalid`,token=randomBytes(32).toString('base64url');owners.push(owner);emails.push(email);await pool.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2)',[owner,email]);await pool.query("INSERT INTO auth_sessions(token_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[hashToken(token),owner]);return {owner,email,token,hash:hashToken(token)};}
 async function ready(f:Awaited<ReturnType<typeof fixture>>,operation:'close'|'delete'){const begun=await lifecycle.begin(f.owner,f.hash,operation);await lifecycle.verify(f.owner,f.hash,begun.operationId,sent.get(f.email));return begun.operationId;}
 afterAll(async()=>{for(const id of ids){await pool.query('DELETE FROM cloud_archive_trash WHERE save_id=$1',[id]);await pool.query('DELETE FROM turn_events WHERE save_id=$1',[id]);await pool.query('DELETE FROM turn_requests WHERE save_id=$1',[id]);await pool.query('DELETE FROM game_saves WHERE id=$1',[id]);}await pool.query('DELETE FROM auth_accounts WHERE id=ANY($1::text[])',[owners]);await pool.query('DELETE FROM auth_challenges WHERE email=ANY($1::text[])',[emails]);await pool.end();});
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
  await pool.query("INSERT INTO turn_requests(save_id,idempotency_key,expected_revision,result) VALUES($1,$2,0,'{}'::jsonb)",[saveId,randomUUID()]);
  await pool.query("INSERT INTO npc_memory_journals(save_id,payload) VALUES($1,'{}'::jsonb)",[saveId]);
  await pool.query("INSERT INTO cloud_archive_trash(save_id,owner_id,deleted_revision,backup,digest) VALUES($1,$2,0,'{}'::jsonb,$3)",[saveId,f.owner,'a'.repeat(64)]);
  await pool.query("INSERT INTO entitlement_balances(owner_id,entitlement_key,available_units) VALUES($1,'fixture',1)",[f.owner]);
  await pool.query("INSERT INTO entitlement_ledger_entries(id,owner_id,entitlement_key,entry_type,delta_units,balance_after,idempotency_key,request_hash) VALUES($1,$2,'fixture','grant',1,1,$3,$4)",[randomUUID(),f.owner,randomUUID(),'a'.repeat(64)]);
  await expect(pool.query('DELETE FROM entitlement_ledger_entries WHERE owner_id=$1',[f.owner])).rejects.toThrow('append-only');
  const id=await ready(f,'delete');expect(await lifecycle.complete(f.owner,f.hash,id,'DELETE_ACCOUNT')).toMatchObject({status:'account_deleted'});
  expect((await pool.query('SELECT id FROM auth_accounts WHERE id=$1',[f.owner])).rowCount).toBe(0);expect((await pool.query('SELECT id FROM game_saves WHERE id=$1',[saveId])).rowCount).toBe(0);expect(await auth.resolve(f.token)).toBeNull();expect(await auth.resolve(b.token)).not.toBeNull();
  for(const table of ['turn_requests','npc_memory_journals','cloud_archive_trash'])expect((await pool.query(`SELECT save_id FROM ${table} WHERE save_id=$1`,[saveId])).rowCount).toBe(0);
  for(const table of ['entitlement_balances','entitlement_ledger_entries'])expect((await pool.query(`SELECT owner_id FROM ${table} WHERE owner_id=$1`,[f.owner])).rowCount).toBe(0);
 });
 it('persists failed attempts and refuses the correct OTP after five failures',async()=>{
  const f=await fixture(),op=await lifecycle.begin(f.owner,f.hash,'close');const code=sent.get(f.email)!;const wrong=code==='000000'?'000001':'000000';
  for(let i=0;i<5;i++)await expect(lifecycle.verify(f.owner,f.hash,op.operationId,wrong)).rejects.toThrow('INVALID_OR_EXPIRED_CODE');
  expect((await pool.query('SELECT attempts FROM account_operations WHERE id=$1',[op.operationId])).rows[0].attempts).toBe(5);
  await expect(lifecycle.verify(f.owner,f.hash,op.operationId,code)).rejects.toThrow('INVALID_OR_EXPIRED_CODE');
 });
 it('data policy pending disables closure/deletion without proof or mail writes',async()=>{const f=await fixture();const pending=new AccountLifecycle(pool,mail,secret);expect(pending.capabilities()).toMatchObject({close:false,permanentDelete:false});await expect(pending.begin(f.owner,f.hash,'delete')).rejects.toThrow('DATA_POLICY_NOT_READY');});
});
