import { spawnSync } from 'node:child_process';
import { mkdtemp,writeFile,realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { once } from 'node:events';
import { createRequire } from 'node:module';
const bin=process.env.CARD_TEST_PG_BIN;
if(!bin)throw Error('CARD_TEST_PG_BIN required');
const {Pool}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('pg');
const dir=await mkdtemp(join(tmpdir(),'jiuxiao-closeout-')), data=join(dir,'cluster'), password=randomBytes(32).toString('hex');
const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
const port=listener.address().port;await new Promise(r=>listener.close(r));
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG|DATABASE_URL|SUPABASE|NARRATIVE_KEY/i.test(k)));
function pg(name,args){const result=spawnSync(join(bin,name+(process.platform==='win32'?'.exe':'')),args,{env,stdio:'ignore',timeout:45000,windowsHide:true});if(result.status!==0)throw Error('isolated '+name+' failed: '+(result.error?.code??result.status));}
await writeFile(join(dir,'password'),password,{mode:0o600});
pg('initdb',['-D',data,'-U','fixture_owner','-A','scram-sha-256','--encoding=UTF8','--no-locale','--pwfile='+join(dir,'password')]);
let started=false,failure;
try{
 pg('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);started=true;
 const u=new URL('postgresql://fixture_owner@127.0.0.1:'+port+'/postgres');u.password=password;
 const pool=new Pool({connectionString:u.href});
 try{if(await realpath((await pool.query('SHOW data_directory')).rows[0].data_directory)!==await realpath(data))throw Error('wrong instance');
 await pool.query('CREATE DATABASE jiuxiao_test');}finally{await pool.end();}
 u.pathname='/jiuxiao_test';
 const run=spawnSync(process.execPath,['scripts/build/card-pg-ci.mjs'],{env:{...env,TEST_DATABASE_URL:u.href,CARD_LOCAL_CI_DATA:data},stdio:'inherit',timeout:480000,windowsHide:true});
 if(run.status!==0)throw Error('isolated PG suite failed: '+(run.error?.code??run.status));
}catch(e){failure=e;}
finally{if(started)try{pg('pg_ctl',['-D',data,'-m','fast','-w','stop']);}catch(e){throw new AggregateError([...(failure?[failure]:[]),e],'PG suite cleanup failed');}}
if(failure)throw failure;
