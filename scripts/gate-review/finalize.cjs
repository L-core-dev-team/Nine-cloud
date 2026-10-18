'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),net=require('net'),assert=require('assert/strict'),{createHash}=require('crypto');
const root=path.resolve(__dirname,'../..'),out=path.resolve(root,'../../交接/T1-V2-GATE-REVIEW-01'),evidence=path.join(root,'docs/integration/t1-v2-gate-review-01');
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=file=>{const b=fs.readFileSync(file);return b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8');};
const git=(args,cwd=root)=>cp.execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const write=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2),{flag:'wx'});
(async()=>{
 const identities=JSON.parse(fs.readFileSync(path.join(out,'release-identities.json')));
 for(const f of identities.inventory)assert.equal(sha(fs.readFileSync(path.join(root,f.path))),f.sha256);
 assert.equal(git(['status','--porcelain'],path.resolve(root,'../Nine-cloud-p3-p6-handover-01-20261014')),'');
 assert.equal(git(['status','--porcelain'],path.resolve(root,'../Nine-cloud-t1-v2-draft-20261016')),'');
 assert.match(read(path.join(evidence,'resume08-real-pg.log')),/pass 37/);assert.match(read(path.join(evidence,'resume08-real-pg.log')),/fail 0/);
 assert.match(read(path.join(evidence,'resume-draft-unit-01.log')),/pass 8/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(evidence,'resume08-backup-restore.json'))).status,'PASS');
 assert.equal(JSON.parse(fs.readFileSync(path.join(out,'patch-applicability.json'))).status,'PASS');
 await new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port:55463});socket.once('connect',()=>{socket.destroy();reject(Error('PG_STILL_LISTENING'));});socket.once('error',e=>{assert.equal(e.code,'ECONNREFUSED');resolve();});});
 const mapping=cp.execFileSync('subst.exe',[],{encoding:'utf8'});assert.ok(!/^J:/m.test(mapping));
 const untracked=git(['ls-files','--others','--exclude-standard']).split('\n').filter(Boolean),modified=git(['diff','--name-only']).split('\n').filter(Boolean);
 write('file-operations-final.json',{modifiedTracked:modified,newUntracked:untracked,localFilesDeleted:[],outsideBoundaryWrites:false,
  paths:[root,out,path.resolve(root,'../../工具/INTEGRATION-HANDOVER-01/gate-review-01')],
  otherWrites:['専属PG数据及日志','apps/api/dist','packages/db/dist','apps/web/node_modules junction to circle stable dependencies'],stableAndOriginalDraftClean:true});
 write('FINAL-RECEIPT.json',{status:'REVIEW_COMPLETE_PENDING_REVIEW_FORMAL_T1_BLOCKED',at:new Date().toISOString(),head:git(['rev-parse','HEAD']),
  productFiles:identities.inventory.length,changedSinceDraft:identities.inventory.filter(f=>f.changedSinceDraft).length,worktreeClean:false,
  realPg:{pass:37,fail:0},fixtureUnit:{pass:8,fail:0},apiBuild:'PASS',dbBuild:'PASS',webTypecheck:'PASS',backupRestore:'PASS',patchObjectApplicability:'PASS',
  formalAcceptance:{pass:0,blocked:16,executed:0},pgStopped:true,port55463Closed:true,mappingRemoved:true,allDatabaseFilesRetained:true,
  originalDraftUnchanged:true,stableUnchanged:true,approvalOrPinChanged:false,pushed:false,PRCreated:false,deployed:false,localFilesDeleted:0,outsideBoundaryWrites:false,
  remainingBlocked:['production fleet and old-writer cutover evidence','production erasure pool delegation and role provisioning','external renderer cancellation and effects','signature and migration approval','online downgrade not proven']});
 const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())walk(f);else if(entry.isFile())files.push(f);}}
 walk(evidence);walk(path.join(root,'scripts/gate-review'));walk(out);
 write('SHA256-MANIFEST-FINAL.json',files.map(f=>({path:f,sha256:sha(fs.readFileSync(f)),bytes:fs.statSync(f).size})));
 console.log(JSON.stringify({status:'SEALED',modifiedTracked:modified.length,newUntracked:untracked.length,manifestFiles:files.length,realPg:'37 PASS',formal:'0 PASS / 16 BLOCKED'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
