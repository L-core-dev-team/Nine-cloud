'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),name=process.argv[2],command=process.argv[3],args=process.argv.slice(4);
if(!name||!/^[a-z0-9-]+$/.test(name)||!command)throw Error('Unique run name and command required');
const out=path.join(root,'docs/integration/handover-01/runs',name);fs.mkdirSync(out,{recursive:false});
const pnpm='C:/Users/11954/Documents/Codex/p3-test-tools/pnpm-11-19/node_modules/pnpm/bin/pnpm.cjs';
const temp='C:/Users/11954/Desktop/水龙吟专用/工具/INTEGRATION-HANDOVER-01/tmp';fs.mkdirSync(temp,{recursive:true});
const env={...process.env,TEMP:temp,TMP:temp,Path:path.dirname(path.dirname(pnpm))+'/../.bin;'+process.env.Path,pnpm_config_store_dir:'C:/Users/11954/Desktop/水龙吟专用/工具/INTEGRATION-HANDOVER-01/pnpm-store',pnpm_config_enable_global_virtual_store:'false'};
const exe=command==='pnpm'?process.execPath:command,parameters=command==='pnpm'?[pnpm,...args]:args;
const started=new Date().toISOString(),r=spawnSync(exe,parameters,{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:24*1024*1024});
fs.writeFileSync(path.join(out,'run.log'),(r.stdout??'')+(r.stderr??'')+(r.error?.stack??''));
const result={name,baselineOrCandidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),command:[command,...args],started,finished:new Date().toISOString(),exitCode:r.status,error:r.error?.message};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(r.status!==0){console.log(((r.stdout??'')+(r.stderr??'')).slice(-5000));process.exitCode=1;}
