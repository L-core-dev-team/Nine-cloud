const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '../../项目/Nine-cloud-P6-main-sync-20261012');
const out = path.join(root, 'docs/acceptance/2026-10-12/P6-MAIN-SYNC-01-evidence');
const pnpm = path.resolve(__dirname, '../S-FINAL/tools/node_modules/pnpm/bin/pnpm.cjs');
fs.mkdirSync(out, {recursive:true});
const tmp = path.join(__dirname,'temp'); fs.mkdirSync(tmp,{recursive:true});
const mode = process.argv[2];
function adapted(file, changes) {
  const src = path.join(root,file);
  let text = fs.readFileSync(src,'utf8').replace(/from (['"])(\.\.?\/[^'"]+)\1/g, (_,q,p)=>`from ${q}${pathToFileURL(path.resolve(path.dirname(src),p)).href}${q}`);
  text = text.replace("new URL('./',import.meta.url)", `new URL(${JSON.stringify(pathToFileURL(path.dirname(src)+path.sep).href)})`);
  for(const [a,b] of changes) { if(!text.includes(a)) throw Error('Adapter target absent: '+a); text=text.replace(a,b); }
  const target=path.join(__dirname,path.basename(file)); fs.writeFileSync(target,text); return target;
}
let jobs;
if(mode==='install') jobs=[[pnpm,'install','--frozen-lockfile','--store-dir',path.join(__dirname,'store')]];
if(mode==='unit') jobs=[['--test','tests/experiments/p6-longmem/*.test.ts','tests/experiments/p6-longmem-hardening/*.test.ts']];
if(mode==='typecheck') jobs=[[pnpm,'typecheck'],['node_modules/typescript/bin/tsc','-p','tests/experiments/p6-longmem/tsconfig.json'],['node_modules/typescript/bin/tsc','-p','tests/experiments/p6-longmem-hardening/tsconfig.json']];
if(mode==='build') jobs=[[pnpm,'build']];
if(mode==='regression') jobs=[[pnpm,'--filter','@jiuxiao/content','test'],[pnpm,'--filter','@jiuxiao/domain','test'],[pnpm,'--filter','@jiuxiao/web','test']];
if(mode==='p6-01') jobs=[['tests/experiments/p6-longmem/run.ts','--sizes','200,500,1000','--out',path.join(out,'p6-01')]];
if(mode==='p6-02') jobs=[[adapted('tests/experiments/p6-longmem-hardening/benchmark.ts',[["const out=new URL(final?'evidence/final/':'evidence/development/',root)",`const out=new URL(${JSON.stringify(pathToFileURL(path.join(out,'p6-02')+path.sep).href)})`]]),'--final']];
if(mode==='verify') jobs=[
  [adapted('tests/experiments/p6-longmem/verify-evidence.ts',[["writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n');",`writeFileSync(${JSON.stringify(path.join(out,'p6-01-original-verification.json'))}, JSON.stringify(manifest, null, 2) + '\\n');`]])],
  [adapted('tests/experiments/p6-longmem-hardening/verify.ts',[["out=new URL('evidence/final/',root)",`out=new URL(${JSON.stringify(pathToFileURL(path.join(out,'p6-02')+path.sep).href)})`],["writeFileSync(new URL('evidence/verification.json',root)",`writeFileSync(${JSON.stringify(path.join(out,'p6-02-verification.json'))}`]])]
];
if(!jobs) throw Error('Unknown mode '+mode);
const records=[];
for(const [i,args] of jobs.entries()) {
 console.log('Starting '+mode+'/'+i);
 const started=new Date().toISOString();
 const r=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,TEMP:tmp,TMP:tmp,PATH:path.resolve(path.dirname(pnpm),'../../.bin')+path.delimiter+process.env.PATH}});
 fs.writeFileSync(path.join(out,mode+'-'+i+'.log'),(r.stdout||'')+'\n'+(r.stderr||'')+'\n'+(r.error||''));
 records.push({args,started,finished:new Date().toISOString(),exitCode:r.status,error:r.error?.message});
 fs.writeFileSync(path.join(out,mode+'-commands.json'),JSON.stringify(records,null,2)+'\n');
 console.log('Finished '+mode+'/'+i+' exit '+r.status+'\n'+(r.stdout||'').slice(-2000)+'\n'+(r.stderr||'').slice(-1200));
}
process.exitCode=records.some(r=>r.exitCode!==0)?1:0;
