import {createRequire} from 'node:module';
import {loadDataPolicy} from '../apps/api/dist/services/data-policy.js';
import {purgeExpiredArchives} from '../apps/api/dist/services/data-retention.js';
const {Pool}=createRequire(new URL('../apps/api/package.json',import.meta.url))('pg');
if(!process.env.DATABASE_URL||!process.env.ACCOUNT_DATA_POLICY_PATH)throw new Error('PRIVATE_DATABASE_AND_APPROVED_POLICY_REQUIRED');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{console.log(JSON.stringify(await purgeExpiredArchives(pool,loadDataPolicy(process.env.ACCOUNT_DATA_POLICY_PATH),process.argv.includes('--apply'))));}
catch{console.error('RETENTION_UNAVAILABLE; no private database or policy details logged.');process.exitCode=1;}
finally{await pool.end();}
