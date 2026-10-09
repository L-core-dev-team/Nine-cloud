import type { Hono } from 'hono';
import { hashToken } from '../services/email-auth.js';
import { AccountLifecycleError,type AccountLifecycle,type AccountOperation } from '../services/account-lifecycle.js';
import type { AccountExport } from '../services/account-export.js';
import type { AuthSessionService } from './auth.js';
import { consumeAccountQuota, type AccountQuotaLimiter } from '../services/account-rate-limit.js';
import { readJson } from './saves.js';
import { sessionToken,authCookie } from './auth.js';
export function mountAccount(app:Hono,auth:Pick<AuthSessionService,'resolve'>,lifecycle:AccountLifecycle,exporter:AccountExport,origin:string,sameSite:'Strict'|'None'='Strict',quota:AccountQuotaLimiter=consumeAccountQuota){
 // Account lifecycle is email-only. A guest session has no mailbox to verify,
 // no address to change, and no account to close, so every endpoint below must
 // require an email session. Guests upgrade through /api/auth/guest/upgrade and
 // become an email session before any of this becomes reachable.
 const ownerFor=async(req:Request)=>{const token=sessionToken(req);const session=await auth.resolve(token);if(!session||session.kind!=='email')return null;const expected=req.headers.get('x-jiuxiao-account');return token&&(!expected||session.ownerId===expected)?{owner:session.ownerId,hash:hashToken(token)}:null;};
 app.get('/api/account/capabilities',async c=>await ownerFor(c.req.raw)?c.json(lifecycle.capabilities()):c.json({code:'UNAUTHENTICATED'},401));
 app.get('/api/account/export',async c=>{
  const account=await ownerFor(c.req.raw);if(!account)return c.json({code:'UNAUTHENTICATED'},401);
  if(!await quota(account.owner,'export',6,3_600_000))return c.json({code:'RATE_LIMITED'},429);
  try{const data=await exporter.read(account.owner);return data?c.json(data):c.json({code:'NOT_FOUND'},404);}catch(error){return c.json({code:error instanceof Error&&['EXPORT_REQUIRES_OFFLINE_TRANSFER','EXPORT_BUSY'].includes(error.message)?error.message:'EXPORT_UNAVAILABLE'},503);}
 });
 for(const step of ['begin','verify','complete','cancel'] as const)app.post(`/api/account/operation/${step}`,async c=>{
  const account=await ownerFor(c.req.raw);if(!account)return c.json({code:'UNAUTHENTICATED'},401);
  const body=await readJson(c.req.raw,4096);if(!body.ok||!body.value||typeof body.value!=='object'||Array.isArray(body.value))return c.json({code:'INVALID_REQUEST'},400);
  const value=body.value as Record<string,unknown>;const allowed=step==='begin'?['operation','newEmail']:step==='verify'?['operationId','code']:step==='cancel'?['operationId']:['operationId','confirmation'];if(Object.keys(value).some(key=>!allowed.includes(key)))return c.json({code:'INVALID_REQUEST'},400);
  try{
   if(step==='begin')return c.json(await lifecycle.begin(account.owner,account.hash,value.operation as AccountOperation,value.newEmail),202);
   if(typeof value.operationId!=='string'||!/^[a-f0-9-]{36}$/i.test(value.operationId))return c.json({code:'INVALID_REQUEST'},400);
   if(step==='cancel')return c.json(await lifecycle.cancel(account.owner,account.hash,value.operationId));
   if(step==='verify')return c.json(await lifecycle.verify(account.owner,account.hash,value.operationId,value.code));
   if(typeof value.confirmation!=='string')return c.json({code:'CONFIRMATION_REQUIRED'},400);
   const result=await lifecycle.complete(account.owner,account.hash,value.operationId,value.confirmation);
   c.header('Set-Cookie',authCookie('',0,origin,sameSite));return c.json(result);
  }catch(error){const code=error instanceof AccountLifecycleError?error.code:error instanceof TypeError?'INVALID_EMAIL':'ACCOUNT_OPERATION_UNAVAILABLE';return c.json({code},code==='RATE_LIMITED'?429:code==='UNAUTHENTICATED'||code==='INVALID_OR_EXPIRED_CODE'?401:code==='DATA_POLICY_NOT_READY'?503:code==='EMAIL_UNAVAILABLE'?409:code==='ACCOUNT_OPERATION_UNAVAILABLE'?503:400);}
 });
}
