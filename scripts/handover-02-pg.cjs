'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {Pool}=require('./handover-test-support.cjs'),root=path.resolve(__dirname,'..');
const tools=path.resolve(root,'../..','工具/INTEGRATION-HANDOVER-01'),out=path.join(root,'docs/integration/handover-02'),mode=process.argv[2];
const real=x=>fs.realpathSync.native(x).toLowerCase().replaceAll('\\','/').replace(/\/$/,'');
const ctl=args=>{const r=cp.spawnSync(path.join(tools,'pg18/pgsql/bin/pg_ctl.exe'),args,{windowsHide:true,stdio:'ignore',timeout:20000});assert.equal(r.status,0,r.error?.message??'PG_CTL_FAILED');};
const identity=async()=>{const p=new Pool({connectionString:'postgresql://handover_tester@127.0.0.1:55461/postgres',connectionTimeoutMillis:2000});try{const r=(await p.query("SELECT current_user,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,version() AS version")).rows[0];assert.equal(r.current_user,'handover_tester');assert.equal(r.host,'127.0.0.1');assert.equal(r.port,55461);assert.equal(r.directory.toLowerCase().replaceAll('\\','/'),'j:/pgdata-handover-02');return r;}finally{await p.end();}};
(async()=>{
 if(mode==='start'){
  assert.ok(!fs.existsSync(path.join(out,'pg-start.json')),'NO_OVERWRITE');
  assert.ok(!fs.existsSync('J:/'),'J_ALREADY_EXISTS_REQUIRES_INSPECTION');
  const r=cp.spawnSync('subst.exe',['J:',tools],{windowsHide:true});assert.equal(r.status,0);assert.equal(real('J:/'),real(tools));
  ctl(['-D','J:/pgdata-handover-02','-l',path.join(out,'postgres-handover-02.log'),'-o','-h 127.0.0.1 -p 55461','-w','start']);
  const result={status:'PASS',mode,identity:await identity(),mappingCreated:true,allFilesRetained:true};fs.writeFileSync(path.join(out,'pg-start.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }else if(mode==='inspect'){
  assert.equal(real('J:/'),real(tools));const result={status:'PASS',mode,identity:await identity(),mappingVerified:true};fs.writeFileSync(path.join(out,'pg-inspect.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }else if(mode==='stop'){
  assert.ok(!fs.existsSync(path.join(out,'pg-stop.json')),'NO_OVERWRITE');assert.equal(real('J:/'),real(tools));const id=await identity();
  ctl(['-D','J:/pgdata-handover-02','-m','fast','-w','stop']);
  const net=require('node:net');await new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port:55461});s.once('connect',()=>{s.destroy();reject(Error('PORT_STILL_LISTENING'));});s.once('error',e=>e.code==='ECONNREFUSED'?resolve():reject(e));s.setTimeout(2000,()=>{s.destroy();reject(Error('PORT_CHECK_TIMEOUT'));});});
  assert.equal(real('J:/'),real(tools));assert.equal(cp.spawnSync('subst.exe',['J:','/d'],{windowsHide:true}).status,0);assert.ok(!fs.existsSync('J:/'));
  const result={status:'PASS',mode,identity:id,portClosed:true,mappingRemoved:true,databaseFilesRetained:true};fs.writeFileSync(path.join(out,'pg-stop.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }else throw Error('start or stop required');
})().catch(e=>{fs.writeFileSync(path.join(out,'pg-'+mode+'-failure-'+Date.now()+'.log'),e.stack,{flag:'wx'});console.error(e);process.exitCode=1;});
