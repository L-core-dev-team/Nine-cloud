import {createRequire} from 'node:module';
const {Pool}=createRequire(new URL('../apps/api/package.json',import.meta.url))('pg');
import {AccountLifecycle} from '../apps/api/dist/services/account-lifecycle.js';
import {loadDataPolicy} from '../apps/api/dist/services/data-policy-node.js';
import {assertDataPolicy} from '../apps/api/dist/services/data-policy.js';
if(process.env.SUPABASE_AUTH_ENABLED==='true'&&process.env.ACCOUNT_DELETE_ENABLED==='true')
 throw Error('SUPABASE_AUTH_ERASURE_NOT_INTEGRATED');
if(!process.env.DATABASE_URL||!process.env.ACCOUNT_DATA_POLICY_PATH)throw Error('PRIVATE_DATABASE_AND_APPROVED_POLICY_REQUIRED');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{const policy=loadDataPolicy(process.env.ACCOUNT_DATA_POLICY_PATH);assertDataPolicy(policy);
const service=new AccountLifecycle(pool,async()=>{throw Error('SCHEDULED_JOB_DOES_NOT_SEND_MAIL');},process.env.AUTH_SECRET??'',policy.version,process.env.ACCOUNT_DELETE_ENABLED==='true',()=>Date.parse(policy.expiresAt)>Date.now());
console.log(JSON.stringify(await service.expireClosed(process.argv.includes('--apply'))));
}catch{console.error('ACCOUNT_EXPIRY_FAILED');process.exitCode=1;}finally{await pool.end();}
