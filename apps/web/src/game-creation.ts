import {SaveEnvelopeSchema} from '@jiuxiao/contracts';
import {cloudRequest} from './cloud-sync';
/** Persist before sending; an uncertain response must reuse the same request. */
export async function createAuthoritativeGame(owner:string,choices:{name:string;goal:string},storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>=localStorage){
 const key=`jx_game_creation:${owner}`;const value=storage.getItem(key);let request:{idempotencyKey:string;choices:{name:string;goal:string}};
 if(value){request=JSON.parse(value);if(!request||typeof request.idempotencyKey!=='string'||!request.choices||typeof request.choices.name!=='string'||typeof request.choices.goal!=='string')throw new Error('INVALID_GAME_RECOVERY');}
 else{request={idempotencyKey:crypto.randomUUID(),choices};storage.setItem(key,JSON.stringify(request));}
 const response=await cloudRequest('/api/games','POST',request,owner);
 const save=SaveEnvelopeSchema.parse(response.save);storage.removeItem(key);return save;
}
