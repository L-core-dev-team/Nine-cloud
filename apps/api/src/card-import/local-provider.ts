import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { CardError, record } from './parser.js';
import { createCardProvider } from './card-provider-runtime.js';
import type { CardImportHostOptions } from './host.js';
import type { ModelStatus } from './model-access.js';
import { CARD_TOKEN_METHOD, cardFitsBudget } from './model-budget.js';

export type LocalProviderConfig = {
 version: 1; approvalId: string; approved: boolean; expiresAt: string; allowedOwners: string[];
 protocol: 'openai-chat'; model: 'gpt-4o-2024-08-06'; baseUrl: 'https://api.openai.com/v1';
 keyEnv: 'NARRATIVE_KEY_CARD_LOCAL'; contextWindow: number; maxOutputTokens: number;
 maxCalls: number; maxConcurrent: number;
};
export function validateLocalProvider(value: unknown): LocalProviderConfig {
 if(!record(value) || Object.keys(value).some(k=>!['version','approvalId','approved','expiresAt','allowedOwners','protocol','model','baseUrl','keyEnv','contextWindow','maxOutputTokens','maxCalls','maxConcurrent'].includes(k)) ||
 value.version!==1 || typeof value.approvalId!=='string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value.approvalId) || typeof value.approved!=='boolean' ||
 typeof value.expiresAt!=='string' || !Number.isFinite(Date.parse(value.expiresAt)) || !Array.isArray(value.allowedOwners) || value.allowedOwners.length>10 || value.allowedOwners.some(x=>typeof x!=='string'||!x||x.length>200) ||
 value.protocol!=='openai-chat'||value.model!=='gpt-4o-2024-08-06'||value.baseUrl!=='https://api.openai.com/v1'||value.keyEnv!=='NARRATIVE_KEY_CARD_LOCAL') throw new CardError('MODEL_CONFIG_INVALID',503);
 for(const [v,min,max] of [[value.contextWindow,2048,128000],[value.maxOutputTokens,1,16384],[value.maxCalls,0,100],[value.maxConcurrent,1,4]]) if(typeof v!=='number'||!Number.isSafeInteger(v)||v<Number(min)||v>Number(max))throw new CardError('MODEL_CONFIG_INVALID',503);
 if(Number(value.maxOutputTokens)+1024>=Number(value.contextWindow))throw new CardError('MODEL_CONFIG_INVALID',503);
 return structuredClone(value) as LocalProviderConfig;
}

/** No hot reload, no env autodetection, no browser-owned config. Injectable factory is test-only code, not a configuration switch. */
export function localProviderOptions(pool: Pool, raw: unknown, env: Record<string,string|undefined>, factory= createCardProvider): CardImportHostOptions {
 const config=validateLocalProvider(raw);
 const binding=createHash('sha256').update(JSON.stringify(config)).digest('hex');
 const credential=config.approved ? env[config.keyEnv] : undefined;
 const provider=config.approved && credential ? factory(config,{[config.keyEnv]:credential},{allowedHosts:['api.openai.com']},config.maxOutputTokens) : undefined;
 const denial=(owner:string):string|undefined=> !config.allowedOwners.includes(owner)?'MODEL_NOT_AUTHORIZED':!config.approved?'MODEL_APPROVAL_REQUIRED':Date.now()>=Date.parse(config.expiresAt)?'MODEL_APPROVAL_EXPIRED':!provider?'MODEL_CREDENTIAL_MISSING':undefined;
 const publicStatus=(owner:string):ModelStatus=> {
  const reason=denial(owner);
  if(reason==='MODEL_NOT_AUTHORIZED')return {mode:'provider',available:false,reason};
  return {mode:'provider',available:!reason,...(reason?{reason}:{}),binding,model:config.model,protocol:config.protocol,contextWindow:config.contextWindow,maxOutputTokens:config.maxOutputTokens,counting:CARD_TOKEN_METHOD};
 };
 const requireOwner=(owner:string)=>{const reason=denial(owner);if(reason)throw new CardError(reason,403);};
 return {pool, modelAccess:{
  async status(owner) {
   const s=publicStatus(owner);if(!s.available)return s;
   const row=(await pool.query('SELECT binding,used FROM card_import.model_allowances WHERE approval_id=$1',[config.approvalId])).rows[0];
   const remaining=Math.max(0,config.maxCalls-(row?.used??0));
   return {...s,remainingCalls:remaining,...(row&&row.binding!==binding?{available:false,reason:'MODEL_APPROVAL_CHANGED'}:remaining===0?{available:false,reason:'MODEL_CALL_LIMIT'}:{})};
  },
  async admit(_client,owner,expected) {requireOwner(owner);if(expected!==binding)throw new CardError('MODEL_BINDING_CHANGED',409);return publicStatus(owner);},
  fits:input=>cardFitsBudget(input,config.contextWindow,config.maxOutputTokens),
 }, model:async(input,signal,call)=>{
  if(!call)throw new CardError('MODEL_NOT_AUTHORIZED',403);
  requireOwner(call.owner);
  if(!cardFitsBudget(input,config.contextWindow,config.maxOutputTokens))throw new CardError('MODEL_CONTEXT_LIMIT',413);
  signal.throwIfAborted();
  // One dedicated connection holds a cluster-wide session lock through HTTP cancellation.
  // Counts are committed before send and never refunded, even on ambiguous failure/restart.
  const c=await pool.connect();let slot:number|undefined;
  try {
   for(let i=0;i<config.maxConcurrent;i++)if((await c.query('SELECT pg_try_advisory_lock(hashtext($1),$2) AS ok',[`card-provider:${config.approvalId}`,i])).rows[0].ok){slot=i;break;}
   if(slot===undefined)throw new CardError('MODEL_CONCURRENCY_LIMIT',429);
   await c.query('BEGIN');
   try {
    await c.query('INSERT INTO card_import.model_allowances(approval_id,binding,used) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[config.approvalId,binding]);
    const quota=(await c.query('SELECT binding,used FROM card_import.model_allowances WHERE approval_id=$1 FOR UPDATE',[config.approvalId])).rows[0];
    if(quota.binding!==binding)throw new CardError('MODEL_APPROVAL_CHANGED',409);
    if(quota.used>=config.maxCalls)throw new CardError('MODEL_CALL_LIMIT',429);
    const persisted=(await c.query("SELECT model_snapshot FROM card_import.requests WHERE owner_id=$1 AND session_id=$2 AND key=$3 AND status='pending' AND expires_at>clock_timestamp()",[call.owner,call.sessionId,call.key])).rows[0];
    if(persisted?.model_snapshot?.binding!==binding)throw new CardError('MODEL_BINDING_CHANGED',409);
    await c.query('INSERT INTO card_import.model_calls(approval_id,owner_id,session_id,key) VALUES($1,$2,$3,$4)',[config.approvalId,call.owner,call.sessionId,call.key]);
    await c.query('UPDATE card_import.model_allowances SET used=used+1 WHERE approval_id=$1',[config.approvalId]);
    requireOwner(call.owner);signal.throwIfAborted();
    await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}
   requireOwner(call.owner);signal.throwIfAborted();
   try{return await provider!(input,signal);}catch{throw new CardError(signal.aborted?'GENERATION_CANCELLED':'MODEL_PROVIDER_FAILED',502);}
  }finally{
   // Never return a possibly locked connection to the pool after an unlock failure.
   let destroy=false;
   try{if(slot!==undefined)await c.query('SELECT pg_advisory_unlock(hashtext($1),$2)',[`card-provider:${config.approvalId}`,slot]);}catch{destroy=true;}finally{c.release(destroy);}
  }
 }};
}
