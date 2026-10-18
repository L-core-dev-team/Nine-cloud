'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),name=process.argv[2],command=process.argv[3],args=process.argv.slice(4);
if(!/^[a-z0-9-]+$/.test(name??'')||!command)throw Error('UNIQUE_NAME_AND_COMMAND_REQUIRED');
const out=path.join(root,'docs/integration/handover-02/runs',name);fs.mkdirSync(out,{recursive:false});
const pnpm='C:/Users/11954/Documents/Codex/p3-test-tools/pnpm-11-19/node_modules/pnpm/bin/pnpm.cjs';
const temp=path.resolve(root,'../..','工具/INTEGRATION-HANDOVER-01/tmp');
const started=new Date().toISOString(),head=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim();
const r=cp.spawnSync(command==='pnpm'?process.execPath:command,command==='pnpm'?[pnpm,...args]:args,{cwd:root,
 env:{...process.env,TEMP:temp,TMP:temp,Path:path.dirname(path.dirname(pnpm))+'/../.bin;'+process.env.Path,
 pnpm_config_store_dir:path.resolve(root,'../..','工具/INTEGRATION-HANDOVER-01/pnpm-store'),pnpm_config_enable_global_virtual_store:'false'},windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});
fs.writeFileSync(path.join(out,'run.log'),(r.stdout??'')+(r.stderr??'')+(r.error?.stack??''),{flag:'wx'});
const result={name,head,command:[command,...args],started,finished:new Date().toISOString(),exitCode:r.status,error:r.error?.message};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
if(r.status!==0){console.error(((r.stdout??'')+(r.stderr??'')).slice(-4500));process.exitCode=1;}
