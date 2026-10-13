'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');const name=process.argv[2];if(!name||!/^[a-z0-9-]+$/.test(name))throw Error('Unique name required');const out=path.join(__dirname,'evidence',name);fs.mkdirSync(out);const rows=[];
function run(label,args){const r=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,label+'.log'),(r.stdout??'')+(r.stderr??'')+(r.error?'\n'+r.error.stack:''));rows.push({label,status:r.status});console.log(JSON.stringify(rows.at(-1)));if(r.status!==0)process.exitCode=1;}
if(process.argv[3]!=='type-only')run('retention-tests',['--test','--test-reporter=tap',path.join(__dirname,'retention.test.ts')]);
run('typescript',[path.resolve(__dirname,'../../../../Nine-cloud-P6-main-sync-20261012/node_modules/typescript/bin/tsc'),'--project',path.join(__dirname,'tsconfig.json')]);
for(const f of fs.readdirSync(__dirname).filter(f=>f.endsWith('.cjs')||f.endsWith('.ts')&&!f.endsWith('.d.cts')))run('syntax-'+f,['--check',path.join(__dirname,f)]);
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({results:rows},null,2)+'\n');
