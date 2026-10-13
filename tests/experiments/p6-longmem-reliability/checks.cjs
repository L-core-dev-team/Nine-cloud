'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=__dirname,repo=path.resolve(root,'../../..'),name=process.argv[2];
assert.ok(name&&/^[a-z0-9-]+$/i.test(name),'Unique check run name required');
const out=path.join(root,'evidence',name),runtime=path.join(root,'.runs',name);fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out);fs.mkdirSync(runtime,{recursive:true});
const env={...process.env,TEMP:runtime,TMP:runtime},results=[];
function run(label,args){const r=spawnSync(process.execPath,args,{cwd:repo,env,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,label+'.log'),(r.stdout??'')+(r.stderr??'')+(r.error?'\n'+r.error.stack:''));results.push({label,status:r.status,error:r.error?.message??null});if(r.status!==0)process.exitCode=1;}
if(process.argv[3]!=='type-only')run('boundaries',['--test','--test-reporter=tap','tests/experiments/p6-longmem-reliability/store.test.cjs','tests/experiments/p6-longmem-reliability/adapter.test.ts']);
const types=path.resolve(repo,'../Nine-cloud-P6-main-sync-20261012/node_modules');
run('typescript',[path.join(types,'typescript/bin/tsc'),'--noEmit','--module','esnext','--moduleResolution','bundler','--target','es2023','--allowImportingTsExtensions','--esModuleInterop','--strict','--skipLibCheck','--types','node','--typeRoots',path.join(types,'@types'),...['adapter.ts','adapter.test.ts','workload.ts','scale-worker.ts','benchmark.ts'].map(f=>path.relative(repo,path.join(root,f)))]);
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({node:process.version,results},null,2)+'\n');console.log(JSON.stringify(results));
