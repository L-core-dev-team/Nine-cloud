import type {Pool} from 'pg';
import type {SaveEnvelope} from '@jiuxiao/contracts';
import {PostgresCloudSaveRepository} from './postgres-cloud-save-repository.js';
import {assertDataPolicy,checkQuota,type DataPolicy} from './data-policy.js';
/** Production policy is explicit. Per-owner row lock serializes concurrent quota checks. */
export class PolicyCloudSaveRepository extends PostgresCloudSaveRepository {
 constructor(private readonly database:Pool,private readonly policy:DataPolicy|undefined){super(database,true);}
 private async guarded<T>(owner:string,save:SaveEnvelope,replacing:boolean,write:(repo:PostgresCloudSaveRepository)=>Promise<T>):Promise<T>{
  assertDataPolicy(this.policy);const c=await this.database.connect();
  try{await c.query('BEGIN');await c.query('SELECT id FROM auth_accounts WHERE id=$1 AND closed_at IS NULL FOR UPDATE',[owner]);
   const stats=(await c.query("SELECT count(*)::int AS count,coalesce(sum(octet_length(snapshot::text)),0)::text AS bytes FROM game_saves WHERE owner_id=$1",[owner])).rows[0];
   const existing=(await c.query('SELECT octet_length(snapshot::text) AS bytes FROM game_saves WHERE owner_id=$1 AND id=$2',[owner,save.saveId])).rows[0];
   const bytes=Number((await c.query('SELECT octet_length($1::jsonb::text) AS bytes',[JSON.stringify(save.state)])).rows[0].bytes);
   if(!existing||replacing)checkQuota(this.policy,{count:stats.count,bytes:Number(stats.bytes)},bytes,existing?Number(existing.bytes):null);
   const result=await write(new PostgresCloudSaveRepository(c as unknown as Pool,true));await c.query('COMMIT');return result;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 override createForOwner(owner:string,save:SaveEnvelope){return this.guarded(owner,save,false,repo=>repo.createForOwner(owner,save));}
 override replaceForOwner(input:Parameters<PostgresCloudSaveRepository['replaceForOwner']>[0]){return this.guarded(input.ownerId,input.next,true,repo=>repo.replaceForOwner(input));}
}
