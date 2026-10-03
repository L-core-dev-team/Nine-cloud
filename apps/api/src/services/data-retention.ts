import type {Pool} from 'pg';
import {assertDataPolicy,type DataPolicy} from './data-policy.js';
/** Only expired soft-deleted client archives. Never purges rule/event saves or external backups. */
export async function purgeExpiredArchives(pool:Pool,policy:DataPolicy|undefined,apply=false){
 assertDataPolicy(policy);const c=await pool.connect();
 try{await c.query('BEGIN');
  const rows=(await c.query(`SELECT s.id,s.owner_id FROM game_saves s JOIN cloud_archive_trash t ON t.save_id=s.id AND t.owner_id=s.owner_id
   WHERE t.deleted_at<now()-($1::int*interval '1 day') AND s.snapshot #>> '{facts,archiveKind}'='local-untrusted-v1'
   AND NOT EXISTS(SELECT 1 FROM turn_requests r WHERE r.save_id=s.id)
   AND NOT EXISTS(SELECT 1 FROM turn_events e WHERE e.save_id=s.id)
   AND NOT EXISTS(SELECT 1 FROM npc_memory_journals n WHERE n.save_id=s.id)
   ORDER BY s.id LIMIT 100 FOR UPDATE OF s,t SKIP LOCKED`,[policy.trashRetentionDays])).rows;
  if(apply)for(const row of rows){
   const owner=row.owner_id;
   await c.query(`INSERT INTO archive_retention_purge_receipts(save_id,owner_id,policy_version,expires_at)
     VALUES($1,$2,$3,now()+interval '1 minute') ON CONFLICT(save_id) DO UPDATE
     SET owner_id=excluded.owner_id,policy_version=excluded.policy_version,expires_at=excluded.expires_at`,[row.id,owner,policy.version]);
   await c.query('DELETE FROM cloud_archive_trash WHERE save_id=$1 AND owner_id=$2',[row.id,owner]);
   const deleted=await c.query('DELETE FROM game_saves WHERE id=$1 AND owner_id=$2 RETURNING id',[row.id,owner]);
   if(deleted.rowCount!==1)throw new Error('ARCHIVE_RETENTION_DELETE_FAILED');
   await c.query('DELETE FROM archive_retention_purge_receipts WHERE save_id=$1',[row.id]);
  }
  await c.query(apply?'COMMIT':'ROLLBACK');return {policyVersion:policy.version,mode:apply?'applied':'dry_run',eligible:rows.length,purged:apply?rows.length:0,externalBackups:'HOST_POLICY_PENDING'};
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
