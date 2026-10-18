'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const S=require('./support.cjs'),out=path.join(S.root,'docs/integration/t1-v2-signoff-preflight'),tools=path.resolve(S.root,'../../工具/INTEGRATION-HANDOVER-01');
(async()=>{const p=await S.pool('postgres');let identity;try{identity=(await p.query("SELECT current_user,current_setting('data_directory') AS directory,inet_server_port() AS port,version() AS version")).rows[0];}finally{await p.end();}
 const real=p=>fs.realpathSync.native(p).toLowerCase();assert.equal(real('J:/'),real(tools));
 const r=cp.spawnSync('J:/pg18/pgsql/bin/pg_ctl.exe',['-D','J:/gate-review-01/pgdata-02','-m','fast','-w','stop'],{cwd:'J:/gate-review-01',encoding:'utf8',windowsHide:true,timeout:30000});
 fs.writeFileSync(path.join(out,'pg-stop.log'),(r.stdout??'')+(r.stderr??''),{flag:'wx'});assert.equal(r.status,0);
 fs.copyFileSync(path.join(tools,'gate-review-01/postgres.log'),path.join(out,'postgres-final.log'),fs.constants.COPYFILE_EXCL);
 assert.equal(cp.spawnSync('subst.exe',['J:','/d'],{windowsHide:true}).status,0);
 fs.writeFileSync(path.join(out,'cluster-stop.json'),JSON.stringify({identity,stopped:true,mappingRemoved:!fs.existsSync('J:/'),allDatabaseFilesRetained:true},null,2),{flag:'wx'});console.log('SIGNOFF_PG_STOP_PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
