import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {describe,it,expect,afterAll} from 'vitest';
import {configureAccountQuota,consumeAccountQuota} from './account-rate-limit.js';
import {AccountExport} from './account-export.js';
const suite=process.env.TEST_DATABASE_URL?describe:describe.skip;
suite('shared runtime controls',()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:8});
 afterAll(async()=>{configureAccountQuota(undefined);await pool.end();});
 it('allows exactly one concurrent slot across simulated instances and resets expired windows',async()=>{
 configureAccountQuota(pool);const id=randomUUID();const hits=await Promise.all(Array.from({length:20},()=>consumeAccountQuota(id,'synthetic',1,60000)));expect(hits.filter(Boolean)).toHaveLength(1);
 await pool.query("UPDATE account_rate_limits SET expires_at=now()-interval '1 second'");expect(await consumeAccountQuota(id,'synthetic',1,60000)).toBe(true);
 });
 it('rejects concurrent owner export and releases the lock on rollback',async()=>{
 const owner=randomUUID(),block=await pool.connect();try{await block.query('BEGIN');await block.query('SELECT pg_advisory_xact_lock(41031,hashtext($1))',[owner]);await expect(new AccountExport(pool).read(owner)).rejects.toThrow('EXPORT_BUSY');await block.query('ROLLBACK');expect(await new AccountExport(pool).read(owner)).toBeNull();}finally{block.release();}
 });
 it('enforces a global four-export ceiling and recovers after transaction termination',async()=>{
  const block=await pool.connect();try{await block.query('BEGIN');for(let n=0;n<4;n++)await block.query('SELECT pg_advisory_xact_lock(41032,$1)',[n]);await expect(new AccountExport(pool).read(randomUUID())).rejects.toThrow('EXPORT_BUSY');await block.query('ROLLBACK');expect(await new AccountExport(pool).read(randomUUID())).toBeNull();}finally{block.release();}
 });
 it('rejects orphan saves at database boundary',async()=>{await expect(pool.query("INSERT INTO game_saves(id,owner_id,schema_version,canon_version,rule_version,memory_policy_version,snapshot) VALUES($1,$2,1,'test','test','test','{}')",[randomUUID(),randomUUID()])).rejects.toMatchObject({code:'23503'});});
});
