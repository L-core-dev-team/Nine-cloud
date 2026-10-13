'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=__dirname,repo=path.resolve(root,'../../..'),name=process.argv[2];if(!name||!/^[a-z0-9-]+$/.test(name))throw Error('Unique name required');const out=path.join(root,'evidence',name),runtime=path.join(root,'.runs',name);fs.mkdirSync(out);fs.mkdirSync(runtime,{recursive:true});const results=[];
function run(label,args,timeout=120000){const r=spawnSync(process.execPath,args,{cwd:repo,env:{...process.env,TEMP:runtime,TMP:runtime},encoding:'utf8',windowsHide:true,timeout,maxBuffer:8*1024*1024});fs.writeFileSync(path.join(out,label+'.log'),(r.stdout??'')+(r.stderr??'')+(r.error?'\n'+r.error.stack:''));const item={label,status:r.status,error:r.error?.message??null};results.push(item);console.log(JSON.stringify(item));if(r.status!==0)process.exitCode=1;}
const copied=[];if(process.argv[3]!=='type-only'){
const dest=path.join(runtime,'regression/p6-longmem-reliability');fs.mkdirSync(dest,{recursive:true});
for(const f of ['store.cjs','worker.cjs','store.test.cjs','adapter.ts','adapter.test.ts','workload.ts']){const source=path.resolve(root,'../p6-longmem-reliability',f),target=path.join(dest,f);fs.copyFileSync(source,target);copied.push({file:f,sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex'),byteEqual:fs.readFileSync(source).equals(fs.readFileSync(target))});}
for(const d of ['p6-longmem','p6-longmem-lexical','p6-longmem-prose','p6-longmem-hardening'])fs.symlinkSync(path.resolve(root,'..',d),path.join(runtime,'regression',d),'junction');
run('old-storage-and-adapter',['--test','--test-reporter=tap',path.join(dest,'store.test.cjs'),path.join(dest,'adapter.test.ts')]);
run('old-lexical-prose-safety',['--test','--test-reporter=tap','tests/experiments/p6-longmem-lexical/lexical.test.ts','tests/experiments/p6-longmem-lexical/compatibility.test.ts','tests/experiments/p6-longmem-prose/retrieval.test.ts','tests/experiments/p6-longmem-hardening/retrieval.test.ts']);
}
run('typescript',[path.resolve(repo,'../Nine-cloud-P6-main-sync-20261012/node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.json')]);
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.cjs')))run('syntax-'+f,['--check',path.join(root,f)]);
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({node:process.version,copiedOriginalBytes:copied,results},null,2)+'\n');
