import type {Hono} from 'hono';
import {readJson,type CloudSaveRouteAuth} from './saves.js';
import type {AuthoritativeGameService} from '../services/authoritative-game.js';
import {CloudCapacityError} from '../services/cloud-save-service.js';
export function mountGames(app:Hono,service:AuthoritativeGameService,auth:CloudSaveRouteAuth){
 app.post('/api/games',async c=>{
  let owner:string|null;try{owner=await auth.resolveOwnerId(c.req.raw);}catch{return c.json({code:'UNAUTHENTICATED'},401);}
  const expected=c.req.header('x-jiuxiao-account');
  if(!owner||(expected!==undefined&&expected!==owner))return c.json({code:'UNAUTHENTICATED'},401);
  const body=await readJson(c.req.raw,16384);if(!body.ok)return c.json({code:'INVALID_GAME'},body.status);
  const value=body.value as Record<string,unknown>|null;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['idempotencyKey','choices'].includes(k))||typeof value.idempotencyKey!=='string'||!/^\w[\w-]{7,199}$/.test(value.idempotencyKey)||!value.choices||typeof value.choices!=='object'||Array.isArray(value.choices))return c.json({code:'INVALID_GAME'},400);
  try{const result=await service.create(owner,value.idempotencyKey,value.choices as Record<string,unknown>);
   if(result.status==='rules_not_ready')return c.json({code:'RULES_NOT_READY'},503);
   if(result.status==='conflict')return c.json({code:'IDEMPOTENCY_CONFLICT'},409);
   return c.json(result,result.duplicate?200:201);
  }catch(error){if(error instanceof CloudCapacityError)return c.json({code:'CAPACITY_EXCEEDED'},413);if(error instanceof Error&&error.message==='DATA_POLICY_NOT_READY')return c.json({code:'DATA_POLICY_NOT_READY'},503);return c.json({code:'GAME_UNAVAILABLE'},503);}
 });
}
