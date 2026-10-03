import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,describe,it,expect} from 'vitest';
import {PolicyCloudSaveRepository} from './policy-cloud-save-repository.js';
import {purgeExpiredArchives} from './data-retention.js';
import type {SaveEnvelope} from '@jiuxiao/contracts';
const suite=process.env.TEST_DATABASE_URL?describe:describe.skip;
suite('approved synthetic policy consumers in PostgreSQL',()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:8}),owner=randomUUID(),ids:string[]=[];
 const policy={version:'synthetic-only',expiresAt:'2099-01-01T00:00:00Z',approvedBy:['Bird','LYL'],maxSaves:1,perSaveBytes:1024,totalBytes:1024,trashRetentionDays:1,backupPolicy:'test-only'};
 const save=(id:string):SaveEnvelope=>({schemaVersion:1,saveId:id,revision:0,canonVersion:'fixture',ruleVersion:'fixture',memoryPolicyVersion:'fixture',state:{playerId:'p',locationId:'gate',elapsedMinutes:0,facts:{archiveKind:'local-untrusted-v1'}}});
 afterAll(async()=>{const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");await client.query('DELETE FROM cloud_archive_trash WHERE owner_id=$1',[owner]);await client.query('DELETE FROM game_saves WHERE owner_id=$1',[owner]);await client.query('DELETE FROM auth_accounts WHERE id=$1',[owner]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}});
 it('serializes concurrent writes at the owner quota and purges only approved expired client trash',async()=>{
  await pool.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2)',[owner,`${owner}@example.invalid`]);
  const repo=new PolicyCloudSaveRepository(pool,policy);ids.push(randomUUID(),randomUUID());
  const results=await Promise.allSettled(ids.map(id=>repo.createForOwner(owner,save(id))));expect(results.filter(r=>r.status==='fulfilled'&&r.value)).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const row=(await pool.query('SELECT id FROM game_saves WHERE owner_id=$1',[owner])).rows[0];
  await pool.query("INSERT INTO cloud_archive_trash(save_id,owner_id,deleted_revision,backup,digest,deleted_at) VALUES($1,$2,0,'{}'::jsonb,$3,now()-interval '2 days')",[row.id,owner,'a'.repeat(64)]);
  await expect(pool.query('DELETE FROM game_saves WHERE id=$1 AND owner_id=$2',[row.id,owner])).rejects.toThrow(/verified account erasure or archive retention purge/);
  expect(await purgeExpiredArchives(pool,policy)).toMatchObject({mode:'dry_run',eligible:1,purged:0});expect((await pool.query('SELECT id FROM game_saves WHERE owner_id=$1',[owner])).rowCount).toBe(1);
  expect(await purgeExpiredArchives(pool,policy,true)).toMatchObject({purged:1});expect((await pool.query('SELECT id FROM game_saves WHERE owner_id=$1',[owner])).rowCount).toBe(0);
  expect((await pool.query('SELECT save_id FROM archive_retention_purge_receipts WHERE save_id=$1',[row.id])).rowCount).toBe(0);
  await expect(new PolicyCloudSaveRepository(pool,{...policy,expiresAt:'2000-01-01'}).createForOwner(owner,save(randomUUID()))).rejects.toThrow('DATA_POLICY_NOT_READY');
 });
});
