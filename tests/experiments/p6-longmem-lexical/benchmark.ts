/** P6-03's former holdout is public regression here; no blind-test claim. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {generateDataset} from '../p6-longmem/dataset.ts';
import {goldQuestions} from '../p6-longmem/gold.ts';
import {assess} from '../p6-longmem/evaluate.ts';
import {ProseIndex} from '../p6-longmem-prose/retrieval.ts';
import {LexicalIndex} from './retrieval.ts';
import type {Dataset,GoldQuestion} from '../p6-longmem/types.ts';
import type {ProseQuestion} from '../p6-longmem-prose/freeze.ts';
const root=new URL('./',import.meta.url),out=new URL('evidence/regression/',root);
const read=<T>(p:string):T=>JSON.parse(readFileSync(new URL(p,root),'utf8')) as T;
for(const folder of ['../p6-longmem-hardening/','../p6-longmem-prose/']){
 const lock=read<{files:{name:string;sha256:string}[]}>(folder+'fixtures/freeze-manifest.json');
 for(const f of lock.files)if(createHash('sha256').update(readFileSync(new URL(folder+'fixtures/'+f.name,root))).digest('hex')!==f.sha256)throw Error('Old freeze changed');
}
const complex=read<Dataset>('../p6-longmem-hardening/fixtures/complex-history-1000.json');
const prose=read<Dataset>('../p6-longmem-prose/fixtures/history-1000.json');
const sets:{name:string;data:Dataset;qs:(GoldQuestion|ProseQuestion)[]}[]=[
 ...[200,500,1000].map(n=>({name:'original60-'+n,data:generateDataset(n),qs:goldQuestions})),
 {name:'p602-development50',data:complex,qs:read('../p6-longmem-hardening/fixtures/development-questions.json')},
 {name:'p602-public50',data:complex,qs:read('../p6-longmem-hardening/fixtures/frozen-questions.json')},
 {name:'p603-development100',data:prose,qs:read('../p6-longmem-prose/fixtures/development.json')},
 {name:'p603-public100',data:prose,qs:read('../p6-longmem-prose/fixtures/holdout.json')},
];
mkdirSync(out,{recursive:true});const runs=[],six=[];let spanChecks=0,queries=0;
for(const set of sets)for(const engine of ['p603','lexical'] as const){
 const start=performance.now(),index=engine==='p603'?new ProseIndex(set.data):new LexicalIndex(set.data),indexBuildMs=performance.now()-start;
 for(const budget of [512,1024,2048,4096]){
  const records=set.qs.map(q=>{
   const r=index.search(q,budget),a=assess(set.data,q,r),expected='expectedSpans' in q?q.expectedSpans:[];
   const spanPass=expected.every(s=>r.context.includes(s.text));
   for(const s of r.originalSpans){const raw=set.data.turns.find(x=>x.sourceId===s.sourceId)!;if(raw.narrative.slice(s.start,s.end)!==s.text||raw.turnId!==s.turnId||createHash('sha256').update(raw.narrative).digest('hex')!==s.originalSha256)throw Error('Provenance mismatch');spanChecks++;}
   if(a.leakedSourceIds.length||a.futureSourceIds.length||r.estimatedTokens>budget)throw Error('Safety regression');queries++;
   const record={...a,pass:a.pass&&spanPass,spanPass,expectedSpans:expected,rawResult:r};
   if(set.name==='p603-public100'&&['H-10-0','H-14-2','H-15-0','H-16-1','H-17-0','H-19-4'].includes(q.questionId))six.push({engine,budget,id:q.questionId,text:q.text,pass:record.pass,missing:a.missingImportantSourceIds,context:r.context});
   return record;
  });
  const sum=(f:(r:typeof records[number])=>number)=>records.reduce((n,r)=>n+f(r),0),ratio=(n:number,d:number)=>d?n/d:null;
  const run={set:set.name,engine,budget,indexBuildMs,metrics:{PASS:records.filter(r=>r.pass).length,FAIL:records.filter(r=>!r.pass).length,
   sourceRecall:ratio(sum(r=>r.expectedCount-r.missingImportantSourceIds.length),sum(r=>r.expectedCount)),sourcePrecision:ratio(sum(r=>r.supportedCount),sum(r=>r.selectedCount)),
   missedSources:sum(r=>r.missingImportantSourceIds.length),npcLeaks:sum(r=>r.leakedSourceIds.length),futureLeaks:sum(r=>r.futureSourceIds.length),wrongFactStatus:sum(r=>r.factResults.filter(f=>f.present&&!f.statusCorrect).length),misattribution:sum(r=>r.incorrectAttributionCount),negativeFalsePositive:records.filter(r=>r.noEvidence&&!r.correctlyRefused).length,
   estimatedTokensMean:sum(r=>r.estimatedTokens)/records.length,latencyMeanMs:sum(r=>r.elapsedMs)/records.length}};
  runs.push(run);const name=`${set.name}-${engine}-${budget}`;
  writeFileSync(new URL(name+'.json.gz',out),gzipSync(JSON.stringify({...run,records})+'\n'));
  writeFileSync(new URL(name+'-failures.json.gz',out),gzipSync(JSON.stringify(records.filter(r=>!r.pass))+'\n'));
  console.log(JSON.stringify(run));
 }
}
writeFileSync(new URL('summary.json',out),JSON.stringify({testedSourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:'public regression; old answers unchanged; no blind-test claim',tokenMethod:'ESTIMATE ceil(UTF-8 bytes/2), not API billing',queries,spanChecks,runs},null,2)+'\n');
writeFileSync(new URL('six-public-cases.json',out),JSON.stringify(six,null,2)+'\n');
