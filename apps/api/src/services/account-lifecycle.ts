import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { normalizeEmail, type AuthMailSender } from './email-auth.js';
export type AccountOperation='email_change'|'close'|'delete';
export class AccountLifecycleError extends Error {constructor(readonly code:string){super(code);}}
/** All workflow proof is HMAC'd, bound to the original owner/session, single use and durable. */
export class AccountLifecycle {
 constructor(private readonly pool:Pool,private readonly send:AuthMailSender,private readonly secret:string,readonly policyVersion:string|null=null,readonly deletionEnabled=false,private readonly policyValid:()=>boolean=()=>true,
  private readonly onEmailChange?: (client:PoolClient,ownerId:string,newEmail:string)=>Promise<void>,
  private readonly beforeDelete?: (client:PoolClient,ownerId:string)=>Promise<void>){if(Buffer.byteLength(secret)<32)throw new Error('AUTH_SECRET_REQUIRED');}
 capabilities(){return {emailChange:true,close:Boolean(this.policyVersion&&this.policyValid()),permanentDelete:Boolean(this.policyVersion&&this.deletionEnabled&&this.policyValid()),policyVersion:this.policyVersion};}
 async cancel(owner:string,sessionHash:string,id:string){const result=await this.pool.query("UPDATE account_operations SET phase='cancelled',digest=NULL WHERE id=$1 AND owner_id=$2 AND session_hash=$3 AND phase IN ('old','new','ready','failed')",[id,owner,sessionHash]);return {status:result.rowCount?'cancelled':'already_inactive'};}
 private digest(id:string,phase:string,email:string,code:string){return createHmac('sha256',this.secret).update(`account-operation\0${id}\0${phase}\0${email}\0${code}`).digest('hex');}
 private async account(c:PoolClient,owner:string,sessionHash:string){return (await c.query('SELECT a.id,a.email FROM auth_accounts a JOIN auth_sessions s ON s.owner_id=a.id WHERE a.id=$1 AND s.token_hash=$2 AND s.expires_at>now() AND a.closed_at IS NULL FOR UPDATE OF a',[owner,sessionHash])).rows[0];}
 async begin(owner:string,sessionHash:string,operation:AccountOperation,newEmailValue?:unknown){
  if(!['email_change','close','delete'].includes(operation))throw new AccountLifecycleError('INVALID_OPERATION');
  if(operation!=='email_change'&&(!this.policyVersion||!this.policyValid()))throw new AccountLifecycleError('DATA_POLICY_NOT_READY');
  if(operation==='delete'&&!this.deletionEnabled)throw new AccountLifecycleError('DATA_POLICY_NOT_READY');
  const newEmail=operation==='email_change'?normalizeEmail(newEmailValue):null;
  const id=randomUUID(),code=String(randomInt(1_000_000)).padStart(6,'0');let oldEmail='';const c=await this.pool.connect();
  try{await c.query('BEGIN');const account=await this.account(c,owner,sessionHash);if(!account)throw new AccountLifecycleError('UNAUTHENTICATED');oldEmail=account.email;
   if(newEmail===oldEmail)throw new AccountLifecycleError('INVALID_EMAIL');
   const count=await c.query("SELECT count(*)::int AS count,max(created_at) AS latest FROM account_operations WHERE owner_id=$1 AND created_at>now()-interval '1 hour'",[owner]);
   if(count.rows[0].count>=6||(count.rows[0].latest&&Date.now()-new Date(count.rows[0].latest).getTime()<60_000))throw new AccountLifecycleError('RATE_LIMITED');
   await this.mailBudget(c);
   await c.query("INSERT INTO account_operations(id,owner_id,session_hash,operation,old_email,new_email,phase,digest,expires_at) VALUES($1,$2,$3,$4,$5,$6,'old',$7,now()+interval '10 minutes')",[id,owner,sessionHash,operation,oldEmail,newEmail,this.digest(id,'old',oldEmail,code)]);
   await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  try{await this.send(oldEmail,code);}catch{await this.pool.query("UPDATE account_operations SET phase='failed',digest=NULL WHERE id=$1",[id]);throw new AccountLifecycleError('MAIL_UNAVAILABLE');}
  return {operationId:id,phase:'old',expiresInSeconds:600};
 }
 private async mailBudget(c:PoolClient){const bucket=Math.floor(Date.now()/3_600_000);const result=await c.query('INSERT INTO auth_mail_limits(bucket,sent) VALUES($1,1) ON CONFLICT(bucket) DO UPDATE SET sent=auth_mail_limits.sent+1 WHERE auth_mail_limits.sent<600 RETURNING sent',[bucket]);if(!result.rowCount)throw new AccountLifecycleError('RATE_LIMITED');}
 async verify(owner:string,sessionHash:string,id:string,code:unknown){
  if(typeof code!=='string'||!/^\d{6}$/.test(code))throw new AccountLifecycleError('INVALID_OR_EXPIRED_CODE');
  const c=await this.pool.connect();let mail:{email:string;code:string;digest:string}|null=null;let phase='';let committed=false;
  try{await c.query('BEGIN');if(!await this.account(c,owner,sessionHash))throw new AccountLifecycleError('UNAUTHENTICATED');
   const row=(await c.query('SELECT * FROM account_operations WHERE id=$1 AND owner_id=$2 AND session_hash=$3 FOR UPDATE',[id,owner,sessionHash])).rows[0];
   if(!row||!['old','new'].includes(row.phase)||row.attempts>=5||new Date(row.expires_at).getTime()<=Date.now()||!row.digest)throw new AccountLifecycleError('INVALID_OR_EXPIRED_CODE');
   const email=row.phase==='old'?row.old_email:row.new_email;const expected=this.digest(id,row.phase,email,code);
   await c.query('UPDATE account_operations SET attempts=attempts+1 WHERE id=$1',[id]);
   if(!/^[a-f0-9]{64}$/.test(row.digest)||!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(row.digest,'hex'))){await c.query('COMMIT');committed=true;throw new AccountLifecycleError('INVALID_OR_EXPIRED_CODE');}
   if(row.phase==='old'&&row.operation==='email_change'){
    await this.mailBudget(c);const nextCode=String(randomInt(1_000_000)).padStart(6,'0');const digest=this.digest(id,'new',row.new_email,nextCode);mail={email:row.new_email,code:nextCode,digest};phase='new';
    await c.query("UPDATE account_operations SET phase='new',digest=$2,attempts=0 WHERE id=$1",[id,digest]);
   }else{phase='ready';await c.query("UPDATE account_operations SET phase='ready',digest=NULL WHERE id=$1",[id]);}
   await c.query('COMMIT');
  }catch(error){if(!committed)await c.query('ROLLBACK');throw error;}finally{c.release();}
  if(mail)try{await this.send(mail.email,mail.code);}catch{await this.pool.query("UPDATE account_operations SET phase='failed',digest=NULL WHERE id=$1 AND digest=$2",[id,mail.digest]);throw new AccountLifecycleError('MAIL_UNAVAILABLE');}
  return {phase};
 }
 async complete(owner:string,sessionHash:string,id:string,confirmation:string){
  const c=await this.pool.connect();
  try{await c.query('BEGIN');const account=await this.account(c,owner,sessionHash);if(!account)throw new AccountLifecycleError('UNAUTHENTICATED');
   const row=(await c.query('SELECT * FROM account_operations WHERE id=$1 AND owner_id=$2 AND session_hash=$3 FOR UPDATE',[id,owner,sessionHash])).rows[0];
   if(!row||row.phase!=='ready'||row.old_email!==account.email||new Date(row.expires_at).getTime()<=Date.now())throw new AccountLifecycleError('INVALID_OPERATION');
   const required={email_change:'CHANGE_EMAIL',close:'CLOSE_ACCOUNT',delete:'DELETE_ACCOUNT'}[row.operation as AccountOperation];
   if(confirmation!==required)throw new AccountLifecycleError('CONFIRMATION_REQUIRED');
   if(row.operation!=='email_change'&&(!this.policyVersion||!this.policyValid()))throw new AccountLifecycleError('DATA_POLICY_NOT_READY');
   if(row.operation==='email_change'){
    await c.query('UPDATE auth_accounts SET email=$2 WHERE id=$1',[owner,row.new_email]);
    if(!row.new_email)throw new AccountLifecycleError('INVALID_OPERATION');
    await this.onEmailChange?.(c,owner,row.new_email);
   }
   else if(row.operation==='close')await c.query('UPDATE auth_accounts SET closed_at=now() WHERE id=$1',[owner]);
   else{
    if(!this.deletionEnabled)throw new AccountLifecycleError('DATA_POLICY_NOT_READY');
    await this.beforeDelete?.(c,owner);
    await c.query('SELECT id FROM game_saves WHERE owner_id=$1 ORDER BY id FOR UPDATE',[owner]);
    // Transaction-local proof ID: authorizes the erasure-only delete triggers below
    // (including authorized observations), game data, and ledger erasure; other mutations stay blocked.
    await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[id]);
    for(const table of ['npc_authorized_observation_outbox','turn_events','turn_requests','npc_memory_journals'])await c.query(`DELETE FROM ${table} t USING game_saves s WHERE t.save_id=s.id AND s.owner_id=$1`,[owner]);
    await c.query('DELETE FROM cloud_archive_trash WHERE owner_id=$1',[owner]);await c.query('DELETE FROM game_saves WHERE owner_id=$1',[owner]);
    await c.query('DELETE FROM entitlement_ledger_entries WHERE owner_id=$1',[owner]);await c.query('DELETE FROM entitlement_balances WHERE owner_id=$1',[owner]);
   }
   await c.query('DELETE FROM auth_sessions WHERE owner_id=$1',[owner]);
   await c.query('DELETE FROM auth_challenges WHERE email=$1 OR email=$2',[account.email,row.operation==='email_change'?row.new_email:account.email]);
   await c.query("UPDATE account_operations SET phase='completed',digest=NULL,old_email=NULL,new_email=NULL WHERE owner_id=$1",[owner]);
   if(row.operation==='delete')await c.query('DELETE FROM auth_accounts WHERE id=$1',[owner]);
   await c.query("INSERT INTO account_lifecycle_audit(id,owner_digest,operation,policy_version) VALUES($1,$2,$3,$4)",[randomUUID(),createHash('sha256').update(owner).digest('hex'),row.operation,this.policyVersion??'email-change']);
   await c.query('COMMIT');console.info(JSON.stringify({event:'account_lifecycle_completed',operation:row.operation,operationId:id,policyVersion:this.policyVersion,liveDatabaseOnly:true}));return {status:row.operation==='email_change'?'email_changed':row.operation==='close'?'account_closed':'account_deleted',dataHandling:row.operation==='close'?'30_day_grace_then_policy_erasure':row.operation==='delete'?'live_database_removed_backups_under_host_policy':'unchanged',policyVersion:this.policyVersion};
  }catch(error){await c.query('ROLLBACK');if((error as {code?:string}).code==='23505')throw new AccountLifecycleError('EMAIL_UNAVAILABLE');throw error;}finally{c.release();}
 }
 /** Scheduled, policy-approved erasure. Account lock serializes recovery vs expiry. */
 async expireClosed(apply=false){
  if(!this.policyVersion||!this.policyValid()||!this.deletionEnabled)throw new AccountLifecycleError('DATA_POLICY_NOT_READY');
  const c=await this.pool.connect();try{await c.query('BEGIN');
   const rows=(await c.query("SELECT id,email FROM auth_accounts WHERE closed_at<=now()-interval '30 days' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED",[this.beforeDelete?1:100])).rows;
   if(apply)for(const account of rows){
    const owner=account.id,id=randomUUID();
    await this.beforeDelete?.(c,owner);
    await c.query("INSERT INTO account_operations(id,owner_id,session_hash,operation,old_email,phase,expires_at) VALUES($1,$2,'scheduled-expiry','delete',NULL,'ready',now()+interval '1 minute')",[id,owner]);
    await c.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)",[id]);
    for(const table of ['npc_authorized_observation_outbox','turn_events','turn_requests','npc_memory_journals'])await c.query(`DELETE FROM ${table} t USING game_saves s WHERE t.save_id=s.id AND s.owner_id=$1`,[owner]);
    for(const table of ['cloud_archive_trash','game_saves','entitlement_ledger_entries','entitlement_balances'])await c.query(`DELETE FROM ${table} WHERE owner_id=$1`,[owner]);
    await c.query('DELETE FROM auth_challenges WHERE email=$1',[account.email]);
    await c.query("INSERT INTO account_lifecycle_audit(id,owner_digest,operation,policy_version) VALUES($1,$2,'expired_erasure',$3)",[randomUUID(),createHash('sha256').update(owner).digest('hex'),this.policyVersion]);
    await c.query('DELETE FROM auth_accounts WHERE id=$1',[owner]);
   }
   if(apply){await c.query("UPDATE account_operations SET old_email=NULL,new_email=NULL,digest=NULL WHERE phase IN ('completed','cancelled','failed') OR expires_at<=now()");await c.query('DELETE FROM account_rate_limits WHERE expires_at<=now()');}
   await c.query(apply?'COMMIT':'ROLLBACK');return {mode:apply?'applied':'dry_run',eligible:rows.length,erased:apply?rows.length:0,backups:'HOST_POLICY_PENDING'};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }

}
