'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=__dirname,old=path.resolve(root,'../p6-longmem-06'),name=process.argv[2];if(!name||!/^[a-z0-9-]+$/.test(name))throw Error('New run name required');
const out=path.join(root,'evidence',name);fs.mkdirSync(out,{recursive:false});const rows=[];
const jobs=[['boundary',['--test',path.join(root,'boundary.test.ts')]],['historical-targeted',['--test',path.join(old,'legacy-targeted.test.ts')]],['compatibility',['--test',path.join(old,'compatibility.test.ts')]],['adversarial',['--test',path.join(old,'adversarial.test.ts')]],['safety-continuity',['--test',path.join(old,'safety.test.ts'),path.join(old,'continuity.test.ts')]],['typescript',[path.resolve(root,'../../../../Nine-cloud-P6-main-sync-20261012/node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.json')]]];
for(const [label,args] of jobs){const r=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:16*1024*1024});fs.writeFileSync(path.join(out,label+'.log'),(r.stdout??'')+(r.stderr??'')+(r.error?.stack??''));rows.push({label,status:r.status,error:r.error?.message});console.log(JSON.stringify(rows.at(-1)));}
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(rows,null,2));if(rows.some(r=>r.status!==0))process.exitCode=1;
