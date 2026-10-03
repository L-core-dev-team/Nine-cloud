import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
let shared:Pool|undefined;
const buckets=new Map<string,number[]>();
export function configureAccountQuota(pool:Pool|undefined){shared=pool;}
/** Production instances use the same atomic PostgreSQL bucket; failure is closed. */
export async function consumeAccountQuota(key:string,action:string,limit:number,windowMs:number):Promise<boolean>{
 if(!key.trim())return false;
 if(shared){try{const digest=createHash('sha256').update(action+'\0'+key).digest('hex');
 const result=await shared.query(`INSERT INTO account_rate_limits(key,expires_at,hits) VALUES($1,now()+($2::bigint*interval '1 millisecond'),1)
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN account_rate_limits.expires_at<=now() THEN 1 ELSE account_rate_limits.hits+1 END,
 expires_at=CASE WHEN account_rate_limits.expires_at<=now() THEN excluded.expires_at ELSE account_rate_limits.expires_at END
 WHERE account_rate_limits.expires_at<=now() OR account_rate_limits.hits<$3 RETURNING hits`,[digest,windowMs,limit]);return Boolean(result.rowCount);
 }catch{return false;}}
 // Isolated route tests only; production entry point always installs the shared store.
 const id=action+':'+key,now=Date.now(),hits=(buckets.get(id)??[]).filter(t=>now-t<windowMs);
 if(hits.length>=limit)return false;hits.push(now);buckets.set(id,hits);return true;
}
