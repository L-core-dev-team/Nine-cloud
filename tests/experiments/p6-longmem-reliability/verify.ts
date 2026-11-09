// Independent evidence audit. Reopens databases and checks recorded results; never reruns search or rewrites old logs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {DiskRecall} from './adapter.ts';
import {scope,corpusDigest} from './workload.ts';
import type {Source,Query} from '../p6-longmem/types.ts';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../../..');
if(fs.existsSync(path.join(root,'evidence/verification-01')))throw Error('Verification already delivered; use a separate copy/output rather than overwriting evidence.');
const require=createRequire(import.meta.url),{canonical}=require('./store.cjs');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8')),hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const summary=read(path.join(root,'evidence/scale-03/summary.json'));
let queries=0,pass=0,fail=0,spanChecks=0,scopeRecords=0,invalidWorldLabels=0;
const checks:any[]=[],failures:any[]=[];
const visible=(s:Source,q:Query)=>s.turnId<=q.asOfTurn&&(q.audience.kind==='player'||s.authorizedNpcIds.includes(q.audience.npcId));
for(const c of summary.corpora){
 const run=c.evidenceRun??'scale-03',folder=path.join(root,'evidence',run,`${c.kind}-${c.count}`),cfg=read(path.join(root,'.runs',run,`${c.kind}-${c.count}.json`));
 const recall=new DiskRecall(cfg.file,scope,c.count),sources=new Map(recall.sources.map(s=>[s.sourceId,s]));
 assert.equal(recall.sources.length,c.count);assert.equal(corpusDigest(recall.sources),c.writer.root);assert.notEqual(c.writer.pid,c.reader.pid);scopeRecords+=recall.sources.length;
 assert.deepEqual(recall.store.check(),['ok']);assert.equal(hash(fs.readFileSync(path.join(folder,'questions.json'))),c.questionsSha256);
 const questions=read(path.join(folder,'questions.json')),qById=new Map(questions.map((q:any)=>[q.questionId,q]));
 const records=JSON.parse(gunzipSync(fs.readFileSync(path.join(folder,'queries.json.gz'))).toString('utf8'));
 assert.equal(records.length,questions.length*4);
 const actualFailures=records.filter((r:any)=>!r.pass);assert.equal(canonical(actualFailures),canonical(read(path.join(folder,'failures.json'))));
 const unbound=recall.sources.flatMap(s=>s.facts.filter(f=>f.kind==='world-event'&&(!f.confirmedBy||!s.eventIds.includes(f.confirmedBy))));invalidWorldLabels+=unbound.length;
 if(c.kind==='complex')assert.equal(unbound.length,0,'New admission filter cannot change these previously tested complex facts');
 for(const r of records){
   const q=qById.get(r.questionId) as any;assert.ok(q);assert.ok([512,1024,2048,4096].includes(r.budget));assert.ok(r.estimatedTokens<=r.budget);
   assert.equal(r.estimatedTokens,Math.ceil(Buffer.byteLength(r.context)/2));
   assert.equal(r.spanPass,(q.expectedSpans??[]).every((s:any)=>r.context.includes(s.text)));
   for(const id of [...r.selectedSourceIds,...r.candidateSourceIds]){
     const s=sources.get(id)!;assert.ok(s);assert.ok(visible(s,q));
     if(q.turnRange)assert.ok(s.turnId>=q.turnRange[0]&&s.turnId<=q.turnRange[1]);
     if(q.gameMinuteRange)assert.ok(s.gameMinute>=q.gameMinuteRange[0]&&s.gameMinute<=q.gameMinuteRange[1]);
   }
   assert.deepEqual(r.missingImportantSourceIds,q.expectedSourceIds.filter((id:string)=>!r.selectedSourceIds.includes(id)));
   for(const p of r.originalSpans){const s=sources.get(p.sourceId)!;assert.ok(visible(s,q));assert.equal(s.narrative.slice(p.start,p.end),p.text);assert.equal(hash(s.narrative),p.originalSha256);assert.equal(s.turnId,p.turnId);spanChecks++;}
   for(const e of r.factStates)for(const f of e.states){
     const s=sources.get(e.sourceId)!,raw=s.facts.find(x=>x.id===f.factId)!;assert.ok(raw);
     assert.equal(raw.kind,f.kind);if(raw.kind==='world-event')assert.ok(raw.confirmedBy&&s.eventIds.includes(raw.confirmedBy));
     if(raw.kind==='character-claim')assert.equal(f.status,'unverified');
     else {const successor=recall.sources.find(next=>visible(next,q)&&next.facts.some(x=>x.supersedes===raw.id));const expired=raw.validUntil!==undefined&&raw.validUntil<=q.asOfTurn&&!!successor;assert.equal(f.status,expired?'historical':'current');}
   }
   assert.equal(r.leakedSourceIds.length,0);assert.equal(r.futureSourceIds.length,0);assert.equal(r.incorrectAttributionCount,0);
   const factsPass=q.correctFacts.every((expected:any)=>r.selectedSourceIds.some((id:string)=>{
     const s=sources.get(id)!,fact=s.facts.find(f=>f.id===expected.id),state=r.factStates.find((e:any)=>e.sourceId===id)?.states.find((f:any)=>f.factId===expected.id);
     return fact?.value===expected.value&&state?.status===expected.status;
   }));
   const reconstructedPass=q.noEvidence?!r.enoughEvidence&&r.selectedSourceIds.length===0:r.missingImportantSourceIds.length===0&&factsPass&&r.enoughEvidence&&r.spanPass;
   assert.equal(r.pass,reconstructedPass,'Recorded PASS disagrees with independent corpus/answer audit');
   queries++;if(r.pass)pass++;else {fail++;failures.push({kind:c.kind,count:c.count,budget:r.budget,questionId:r.questionId,text:r.text,missing:r.missingImportantSourceIds,reason:r.diagnosis});}
 }
 checks.push({kind:c.kind,count:c.count,testedSourceSha:c.testedSourceSha??summary.testedSourceSha,records:records.length,restoredRoot:c.writer.root,unboundWorldLabelsExcluded:unbound.length});recall.close();
}
const git=(...args:string[])=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const oldPaths=['tests/experiments/p6-longmem','tests/experiments/p6-longmem-hardening','tests/experiments/p6-longmem-prose','tests/experiments/p6-longmem-lexical','tests/experiments/p6-longmem-durability','docs/acceptance/2026-10-11','docs/acceptance/2026-10-12'];
const protectedPaths=['apps','packages','scripts','deployment','package.json','pnpm-lock.yaml','AGENTS.md'];
assert.equal(git('diff','--name-only','ffd0e90','--',...oldPaths,...protectedPaths),'');
assert.equal(git('diff','--name-only','origin/main','--',...protectedPaths),'');
const sourceLocks:any[]=[];
for(const folder of ['p6-longmem-hardening','p6-longmem-prose']){
 const fixtures=path.resolve(root,'..',folder,'fixtures'),manifest=read(path.join(fixtures,'freeze-manifest.json'));
 for(const f of manifest.files){assert.equal(hash(fs.readFileSync(path.join(fixtures,f.name))),f.sha256);sourceLocks.push({folder,file:f.name,sha256:f.sha256});}
}
const crash=summary.corpora.find((c:any)=>c.kind==='complex'&&c.count===10000);assert.equal(crash.crashRecovery.committedTurns,5000);assert.equal(crash.crashRecovery.signal,'SIGKILL');assert.equal(crash.writer.saved,5000);assert.equal(crash.writer.duplicates,5000);
const result={verifiedAt:new Date().toISOString(),sourceHead:git('rev-parse','HEAD'),main:git('rev-parse','origin/main'),queries,pass,fail,spanChecks,scopeRecords,invalidWorldLabels,checks,oldArtifactsUnchanged:true,productionMatchesMain:true,sourceLocks,remainingUniqueQuestions:[...new Set(failures.map(f=>f.questionId))],crashRecovery:true};
const out=path.join(root,'evidence/verification-01');fs.mkdirSync(out);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(out,'failure-index.json'),JSON.stringify(failures,null,2)+'\n');
const freeze=fs.readdirSync(root).filter(f=>/\.(cjs|ts)$/.test(f)).map(f=>({file:f,sha256:hash(fs.readFileSync(path.join(root,f)))}));fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify(freeze,null,2)+'\n');console.log(JSON.stringify(result));
