// Offline recovery only. The DB is created closed to ordinary logins before the dump is read.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { realpath } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readInventory } from './m3-reconciliation.mjs';
const {Pool}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('pg');

async function restoreReviewCopy(command,args,options,file) {
  const hash=createHash('sha256');
  const proc=spawn(command,args,{...options,stdio:['pipe','ignore','ignore'],killSignal:'SIGKILL'});
  const finished=once(proc,'close');
  try {
    const [, [code]]=await Promise.all([pipeline(createReadStream(file),new Transform({
      transform(chunk,encoding,callback){hash.update(chunk);callback(null,chunk);}
    }),proc.stdin),finished]);
    assert.equal(code,0,'review restore failed');
    return hash.digest('hex');
  } finally { if(proc.exitCode===null && proc.signalCode===null)proc.kill('SIGKILL');await finished.catch(()=>{}); }
}

export async function restoreQuarantined({maintenanceUrl,dataDirectory,archive,clientBin,collectReview=false}) {
  const u=new URL(maintenanceUrl);
  assert.ok(['postgres:','postgresql:'].includes(u.protocol)&&u.hostname==='127.0.0.1'&&u.port&&u.pathname==='/postgres'&&!u.search&&!u.hash,'dedicated loopback maintenance connection required');
  const directory=await realpath(dataDirectory), file=await realpath(archive);
  const name='jiuxiao_recovery_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString:u.href,max:1,connectionTimeoutMillis:3000});
  let created=false,failure,review;
  try{
    const r=await pool.query("SELECT current_setting('data_directory') AS dir,rolsuper FROM pg_roles WHERE rolname=session_user");
    assert.equal(await realpath(r.rows[0].dir),directory,'wrong recovery cluster');
    assert.equal(r.rows[0].rolsuper,true,'installer required to restore into a zero-connection-limit database');
    // Fail closed even if the coordinator exits between CREATE and pg_restore.
    await pool.query('CREATE DATABASE '+name+' WITH TEMPLATE template0 CONNECTION LIMIT 0');
    created=true;
    await pool.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');
    const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|LANG|LC_ALL)$/i.test(k)));
    const command=join(resolve(clientBin),process.platform==='win32'?'pg_restore.exe':'pg_restore');
    const args=['--no-password','--single-transaction','--no-owner','--no-acl','-h','127.0.0.1','-p',u.port,'-U',decodeURIComponent(u.username),'-d',name];
    const options={env:{...env,PGPASSWORD:decodeURIComponent(u.password)},windowsHide:true,timeout:180000};
    if(collectReview){
      const archiveHash=await restoreReviewCopy(command,args,options,file);
      const target=new URL(u);target.pathname='/'+name;
      const observer=new Pool({connectionString:target.href,max:1,connectionTimeoutMillis:3000});
      try {
        const client=await observer.connect();
        try {
          await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          review={archive:archiveHash,instance:name,inventory:await readInventory(client)};
          await client.query('COMMIT');
        } finally { client.release(true); }
      } finally { await observer.end(); }
    }else{
      const result=spawnSync(command,[...args,file],{...options,stdio:'ignore'});
      if(result.status!==0)throw Error('QUARANTINED_RESTORE_FAILED ('+(result.status??result.error?.code)+')');
    }
  }catch(error){failure=error;}
  finally{
    try{if(created)await pool.query('ALTER DATABASE '+name+' ALLOW_CONNECTIONS false');}
    catch(error){failure=new AggregateError([...(failure?[failure]:[]),error],'Recovery quarantine sealing failed');}
    finally{await pool.end();}
  }
  if(failure)throw failure;
  return {database:name,admission:'QUARANTINED',modelCallsEnabled:false,...(review?{review}:{})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [dataDirectory,clientBin,archive]=process.argv.slice(2);
 if(!dataDirectory||!clientBin||!archive||!process.env.CARD_RECOVERY_MAINTENANCE_URL)throw Error('Expected data directory, PostgreSQL client bin, archive and CARD_RECOVERY_MAINTENANCE_URL');
 console.log(JSON.stringify(await restoreQuarantined({maintenanceUrl:process.env.CARD_RECOVERY_MAINTENANCE_URL,dataDirectory,clientBin,archive})));
}
