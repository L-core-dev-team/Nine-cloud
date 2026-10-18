'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.resolve(root,'../../交接/T1-V2-GATE-REVIEW-01');
const cases=[['draft','d83f5317d71a9d0334d676fff14ba21fd635a87c','gate-review-minimal.patch'],['stageB','d8ea49a8a74beb79233b100db71bbc4295db47c3','candidate-from-stageB.patch']];const results=[];
for(const [name,base,file] of cases){const index=path.join(out,'check-'+name+'.index');assert.ok(!fs.existsSync(index));const env={...process.env,GIT_INDEX_FILE:index};
 for(const args of [['read-tree',base],['apply','--cached','--check',path.join(out,file)]]){const r=cp.spawnSync('git',args,{cwd:root,env,encoding:'utf8',windowsHide:true});results.push({name,args,exitCode:r.status,stdout:r.stdout,stderr:r.stderr,temporaryIndex:index,realIndexUntouched:true});assert.equal(r.status,0);}}
fs.writeFileSync(path.join(out,'patch-applicability.json'),JSON.stringify({status:'PASS',actualPatchApplied:false,results},null,2),{flag:'wx'});console.log('PATCH_APPLICABILITY_PASS');
