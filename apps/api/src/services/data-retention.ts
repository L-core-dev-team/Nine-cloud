import type {Pool} from 'pg';
import {assertDataPolicy,type DataPolicy} from './data-policy.js';
/** Only expired soft-deleted client archives. Never purges rule/event saves or external backups. */
export async function purgeExpiredArchives(pool:Pool,policy:DataPolicy|undefined,apply=false){
 assertDataPolicy(policy);const c=await pool.connect();
 try{await c.query('BEGIN');
  const rows=(await c.query(`SELECT s.id FROM game_saves s JOIN cloud_archive_trash t ON t.save_id=s.id AND t.owner_id=s.owner_id
   WHERE t.deleted_at<now()-($1::int*interval '1 day') AND s.snapshot #>> '{facts,archiveKind}'='local-untrusted-v1'
   AND NOT EXISTS(SELECT 1 FROM turn_requests r WHERE r.save_id=s.id)
   AND NOT EXISTS(SELECT 1 FROM turn_events e WHERE e.save_id=s.id)
   AND NOT EXISTS(SELECT 1 FROM npc_memory_journals n WHERE n.save_id=s.id)
   ORDER BY s.id LIMIT 100 FOR UPDATE OF s,t SKIP LOCKED`,[policy.trashRetentionDays])).rows;
  if(apply)for(const row of rows){await c.query('DELETE FROM cloud_archive_trash WHERE save_id=$1',[row.id]);await c.query('DELETE FROM game_saves WHERE id=$1',[row.id]);}
  await c.query(apply?'COMMIT':'ROLLBACK');return {policyVersion:policy.version,mode:apply?'applied':'dry_run',eligible:rows.length,purged:apply?rows.length:0,externalBackups:'HOST_POLICY_PENDING'};
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
