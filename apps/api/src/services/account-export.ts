import type { Pool } from 'pg';
/** A single repeatable-read owner snapshot. No OTPs, token hashes or mail credentials are exported. */
export class AccountExport {
 constructor(private readonly pool:Pool){}
 async read(owner:string){const c=await this.pool.connect();try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const own=await c.query("SELECT pg_try_advisory_xact_lock(41031,hashtext($1)) AS ok",[owner]);
  if(!own.rows[0].ok)throw new Error('EXPORT_BUSY');
  let slot=false;for(let n=0;n<4;n++){if((await c.query('SELECT pg_try_advisory_xact_lock(41032,$1) AS ok',[n])).rows[0].ok){slot=true;break;}}
  if(!slot)throw new Error('EXPORT_BUSY');await c.query("SET LOCAL statement_timeout='10s'");
  const account=(await c.query('SELECT id,email,created_at,closed_at FROM auth_accounts WHERE id=$1',[owner])).rows[0];if(!account){await c.query('ROLLBACK');return null;}
  const corrupt=await c.query(`SELECT 1 FROM narrative_publications p JOIN narrative_sources s ON s.id=p.source_id
    JOIN game_saves v ON v.id=p.save_id WHERE v.owner_id=$1
    AND (s.body_sha<>encode(sha256(s.body),'hex') OR s.utf8_length<>octet_length(s.body)) LIMIT 1`,[owner]);
  if(corrupt.rowCount)throw new Error('NARRATIVE_BODY_CORRUPT');
  const sources:Record<string,string>={narrativePublications:`SELECT p.id AS publication_id,p.source_id,p.save_id,p.request_key,p.version,p.is_default,p.created_at,s.body_sha,convert_from(s.body,'UTF8') AS text FROM narrative_publications p JOIN narrative_sources s ON s.id=p.source_id JOIN game_saves v ON v.id=p.save_id WHERE v.owner_id=$1`,audit:"SELECT id,operation,policy_version,occurred_at FROM account_lifecycle_audit WHERE owner_digest=encode(sha256(convert_to($1,'UTF8')),'hex')",saves:'SELECT s.* FROM game_saves s WHERE s.owner_id=$1',events:'SELECT e.* FROM turn_events e JOIN game_saves s ON s.id=e.save_id WHERE s.owner_id=$1',receipts:'SELECT r.* FROM turn_requests r JOIN game_saves s ON s.id=r.save_id WHERE s.owner_id=$1',trash:'SELECT t.* FROM cloud_archive_trash t WHERE t.owner_id=$1',usageBalances:'SELECT b.* FROM entitlement_balances b WHERE b.owner_id=$1',usageLedger:'SELECT l.* FROM entitlement_ledger_entries l WHERE l.owner_id=$1',accountOperations:'SELECT id,operation,old_email,new_email,phase,created_at,expires_at FROM account_operations WHERE owner_id=$1',sessions:'SELECT expires_at FROM auth_sessions WHERE owner_id=$1'};
  const data:Record<string,unknown>={};let bytes=0;
  if((await c.query("SELECT to_regclass('public.narrative_receipt_ownership') AS relation")).rows[0].relation)
    sources.narrativeOwnership='SELECT owner_id,save_id,request_key,receipt_sha,protocol_version,ownership,request_narrative,renderer_version,context_version,branch_id,generation_id,legacy_inventory_sha,legacy_body_sha,CASE WHEN legacy_body IS NULL THEN NULL ELSE convert_from(legacy_body,\'UTF8\') END AS legacy_text FROM narrative_receipt_ownership WHERE owner_id=$1';
  for(const [key,query]of Object.entries(sources)){
   const size=(await c.query(`SELECT coalesce(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM (${query}) t`,[owner])).rows[0].bytes;bytes+=Number(size);
   if(bytes>30_000_000)throw new Error('EXPORT_REQUIRES_OFFLINE_TRANSFER');
   data[key]=(await c.query(query,[owner])).rows;
  }
  const result={schemaVersion:1,kind:'jiuxiao-account-export',exportedAt:new Date().toISOString(),account,data,settings:{serverStored:false,note:'Client settings and independent local saves are appended by this browser.'}};
  if(Buffer.byteLength(JSON.stringify(result))>32_000_000)throw new Error('EXPORT_REQUIRES_OFFLINE_TRANSFER');
  await c.query('COMMIT');return result;
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
}
