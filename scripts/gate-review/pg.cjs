'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/integration/t1-v2-gate-review-01');
fs.mkdirSync(out,{recursive:true});
const tools=path.resolve(root,'../../工具/INTEGRATION-HANDOVER-01'),home=path.join(tools,'gate-review-01');
const {Pool}=require('../handover-test-support.cjs');
const mode=process.argv[2],port=55463;
function run(exe,args,label){const r=cp.spawnSync('J:/pg18/pgsql/bin/'+exe,args,{cwd:'J:/gate-review-01',env:{...process.env,TEMP:'J:/tmp',TMP:'J:/tmp'},encoding:'utf8',windowsHide:true,timeout:30000});fs.writeFileSync(path.join(out,label+'.log'),(r.stdout??'')+(r.stderr??'')+(r.error?.stack??''),{flag:'wx'});assert.equal(r.status,0,label);}
const real=p=>fs.realpathSync.native(p).toLowerCase().replaceAll('\\','/');
async function identity(){const p=new Pool({connectionString:'postgresql://gate_review_admin@127.0.0.1:'+port+'/postgres',connectionTimeoutMillis:2000});try{const r=(await p.query("SELECT current_user,inet_server_port() AS port,current_setting('data_directory') AS directory,version() AS version")).rows[0];assert.equal(r.current_user,'gate_review_admin');assert.equal(r.port,port);assert.equal(r.directory.toLowerCase().replaceAll('\\','/'),'j:/gate-review-01/pgdata-02');return r;}finally{await p.end();}}
(async()=>{
 if(mode==='init-start'){
  assert.ok(!fs.existsSync('J:/'),'J_IN_USE');assert.ok(!fs.existsSync(home),'NEW_CLUSTER_ALREADY_EXISTS');
  fs.mkdirSync(home);assert.ok(real(home).startsWith(real(tools)+'/'));
  assert.equal(cp.spawnSync('subst.exe',['J:',tools],{windowsHide:true}).status,0);assert.equal(real('J:/'),real(tools));
  run('initdb.exe',['-D','J:/gate-review-01/pgdata','-U','gate_review_admin','-A','trust','--encoding=UTF8','--locale=C'],'initdb');
  run('pg_ctl.exe',['-D','J:/gate-review-01/pgdata','-l','J:/gate-review-01/postgres.log','-o','-h 127.0.0.1 -p '+port,'-w','start'],'pg-start');
  fs.writeFileSync(path.join(out,'cluster-identity.json'),JSON.stringify({identity:await identity(),newCluster:true,oldClusterUntouched:true},null,2),{flag:'wx'});
 }else if(mode==='init-retry'){
  assert.ok(fs.existsSync(home));assert.ok(!fs.existsSync(path.join(home,'pgdata-02')));
  if(!fs.existsSync('J:/'))assert.equal(cp.spawnSync('subst.exe',['J:',tools],{windowsHide:true}).status,0);
  assert.equal(real('J:/'),real(tools));
  run('initdb.exe',['-D','J:/gate-review-01/pgdata-02','-L','J:/pg18/pgsql/share','-U','gate_review_admin','-A','trust','--encoding=UTF8','--locale=C'],'initdb-02');
  run('pg_ctl.exe',['-D','J:/gate-review-01/pgdata-02','-l','J:/gate-review-01/postgres.log','-o','-h 127.0.0.1 -p '+port,'-w','start'],'pg-start-02');
  fs.writeFileSync(path.join(out,'cluster-identity.json'),JSON.stringify({identity:await identity(),newCluster:true,oldClusterUntouched:true},null,2),{flag:'wx'});
 }else if(mode==='stop'){
  assert.equal(real('J:/'),real(tools));const id=await identity();
  run('pg_ctl.exe',['-D','J:/gate-review-01/pgdata-02','-m','fast','-w','stop'],'pg-stop');
  fs.copyFileSync(path.join(home,'postgres.log'),path.join(out,'postgres.log'),fs.constants.COPYFILE_EXCL);
  assert.equal(cp.spawnSync('subst.exe',['J:','/d'],{windowsHide:true}).status,0);
  fs.writeFileSync(path.join(out,'cluster-stop.json'),JSON.stringify({identity:id,stopped:true,mappingRemoved:!fs.existsSync('J:/'),allDatabaseFilesRetained:true},null,2),{flag:'wx'});
 }else throw Error('MODE_REQUIRED');
 console.log(JSON.stringify({mode,status:'PASS',port}));
})().catch(e=>{console.error(e);process.exitCode=1;});
