import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {questionsFor,corpusDigest,dataFor} from './workload.ts';
const root=path.dirname(fileURLToPath(import.meta.url)),name=process.argv[2];
if(!name||!/^[a-z0-9-]+$/i.test(name))throw Error('Provide a unique safe run name.');
const output=path.join(root,'evidence',name),runtime=path.join(root,'.runs',name);
// Never replace evidence, even if a previous run failed halfway through.
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(output,{recursive:false});fs.mkdirSync(runtime,{recursive:true});
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const summary:any={name,createdAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,testedSourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),corpora:[],tokenMethod:'ESTIMATE ceil(UTF-8 context bytes/2), not actual tokenizer or billing; excludes system/query/output',latencyMethod:'Sequential local subprocesses. End-to-end search includes disk verification and first view construction; independent cold-build samples listed separately. Not a production SLO.',modelCalls:0,paidServices:0};
for(const kind of ['complex','prose'] as const)for(const count of [1000,3000,10000]){
 if(process.argv[3]==='resume-scale-02'){
   const previous=JSON.parse(fs.readFileSync(path.join(root,'evidence/scale-02/summary.json'),'utf8'));
   const completed=previous.corpora.find((c:any)=>c.kind===kind&&c.count===count);
   if(completed){summary.corpora.push({...completed,evidenceRun:'scale-02',testedSourceSha:previous.testedSourceSha});fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({reusedCompleted:true,kind,count,evidenceRun:'scale-02'}));continue;}
 }
 const folder=path.join(output,`${kind}-${count}`);fs.mkdirSync(folder);const queries=path.join(folder,'questions.json');
 fs.writeFileSync(queries,JSON.stringify(questionsFor(kind,count))+'\n');
 const cfg:any={kind,count,file:path.join(runtime,`${kind}-${count}.sqlite`),questions:queries,questionsSha256:hash(fs.readFileSync(queries)),output:folder};
 const cfgFile=path.join(runtime,`${kind}-${count}.json`);fs.writeFileSync(cfgFile,JSON.stringify(cfg));
 const call=(mode:string)=>{
   try {const stdout=execFileSync(process.execPath,[path.join(root,'scale-worker.ts'),mode,cfgFile],{encoding:'utf8',windowsHide:true,maxBuffer:2**20,timeout:600000,env:{...process.env,TEMP:runtime,TMP:runtime},stdio:['ignore','pipe','pipe']});fs.writeFileSync(path.join(folder,mode+'-process.json'),stdout);return JSON.parse(stdout);}
   catch(e){fs.writeFileSync(path.join(folder,mode+'-error.log'),String((e as any).stderr??e));throw e;}
 };
 let crashRecovery:any=null;
 if(kind==='complex'&&count===10000){
   crashRecovery=await new Promise((resolve,reject)=>{
     const child=spawn(process.execPath,[path.join(root,'scale-worker.ts'),'crash-write',cfgFile],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,TEMP:runtime,TMP:runtime}});
     let stdout='',stderr='',checkpoint:any;const started=Date.now();const timer=setTimeout(()=>{child.kill();reject(Error('Crash checkpoint timeout '+stderr));},120000);
     child.stdout.on('data',b=>{stdout+=b;const line=stdout.split('\n')[0];if(stdout.includes('\n')&&!checkpoint){checkpoint=JSON.parse(line);child.kill('SIGKILL');}});child.stderr.on('data',b=>stderr+=b);
     child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',(exitCode,signal)=>{clearTimeout(timer);if(!checkpoint)reject(Error('No crash checkpoint: '+stderr));else resolve({...checkpoint,exitCode,signal,interruptedWriteMs:Date.now()-started});});
   });
 }
 let reusedWriter=false;
 if(kind==='prose'&&count===1000&&process.argv[3]==='resume-scale-02'){
   const old=JSON.parse(fs.readFileSync(path.join(root,'.runs/scale-02/prose-1000.json'),'utf8'));cfg.file=old.file;cfg.writer=old.writer;reusedWriter=true;
 }else if(kind==='complex'&&count===1000&&process.argv[3]==='reuse-scale-01'){
   const old=JSON.parse(fs.readFileSync(path.join(root,'.runs/scale-01/complex-1000.json'),'utf8'));
   cfg.file=old.file;cfg.writer={...old.writer,legacyUnsortedDigest:old.writer.root,root:corpusDigest(dataFor('complex',1000).turns)};reusedWriter=true;
 }else cfg.writer=call('write');
 if(crashRecovery&&cfg.writer.duplicates!==5000)throw Error('Killed writer recovery did not retain exactly 5000 commits');fs.writeFileSync(cfgFile,JSON.stringify(cfg));const reader=call('read');
 if(reader.pid===cfg.writer.pid)throw Error('Reader reused writer process');
 const item={kind,count,questionsSha256:cfg.questionsSha256,reusedWriter,crashRecovery,writer:cfg.writer,reader};summary.corpora.push(item);
 fs.writeFileSync(path.join(folder,'summary.json'),JSON.stringify(item,null,2)+'\n');
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({kind,count,writeMs:cfg.writer.writeMs,restoreMs:reader.restoreMs,runs:reader.runs.map((r:any)=>({budget:r.budget,pass:r.pass,fail:r.fail,npcLeaks:r.npcLeaks,futureLeaks:r.futureLeaks,p95:r.endToEndP95Ms}))}));
}
console.log(JSON.stringify({complete:true,output}));
