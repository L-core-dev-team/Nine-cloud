import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { generateDataset } from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/dataset.ts';
import { goldQuestions } from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/gold.ts';
import { HistoryIndex } from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/retrieval.ts';
import { assess } from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/evaluate.ts';
import type { Dataset, GoldQuestion, Retrieval } from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/types.ts';
import { HardenedIndex } from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem-hardening/retrieval.ts';

const root=new URL("file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem-hardening/");
const final=process.argv.includes('--final');
const fixtures=new URL('fixtures/',root);
const manifest=JSON.parse(readFileSync(new URL('freeze-manifest.json',fixtures),'utf8'));
for(const f of manifest.files){if(createHash('sha256').update(readFileSync(new URL(f.name,fixtures))).digest('hex')!==f.sha256)throw new Error('Frozen hash changed: '+f.name);}
const complex=JSON.parse(readFileSync(new URL('complex-history-1000.json',fixtures),'utf8')) as Dataset;
const dev=JSON.parse(readFileSync(new URL('development-questions.json',fixtures),'utf8')) as GoldQuestion[];
const sets:{name:string;data:Dataset;questions:GoldQuestion[]}[]=[{name:'original60',data:generateDataset(200),questions:goldQuestions},{name:'development50',data:complex,questions:dev}];
if(final) sets.push({name:'frozen50',data:complex,questions:JSON.parse(readFileSync(new URL('frozen-questions.json',fixtures),'utf8'))});
const out=new URL("file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/docs/acceptance/2026-10-12/P6-MAIN-SYNC-01-evidence/p6-02/");mkdirSync(out,{recursive:true});
const ratio=(n:number,d:number)=>d?n/d:null;
const p95=(a:number[])=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*.95))]??0;
const runs=[];
for(const set of sets)for(const engine of ['baseline','hardened'] as const){
  const start=performance.now();const index=engine==='baseline'?new HistoryIndex(set.data):new HardenedIndex(set.data);const indexBuildMs=performance.now()-start;
  for(const budget of [512,1024,2048,4096])for(const strategy of ['historical','recent'] as const){
    const records=set.questions.map(q=>{
      const result:Retrieval=index.search(q,budget,strategy);
      const record=assess(set.data,q,result);
      const wrongTime=record.factResults.filter(f=>f.present&&!f.statusCorrect).length;
      const blocks=result.context.split(/\n\n(?=\[s\d+ turn=)/);
      const unrelatedBytes=blocks.filter(b=>!q.supportingSourceIds.includes(b.match(/^\[(s\d+) /)?.[1]??'')).reduce((n,b)=>n+Buffer.byteLength(b),0);
      return {...record,wrongTime,unrelatedBytes,context:result.context,rawResult:result};
    });
    const expected=records.reduce((n,r)=>n+r.expectedCount,0),selected=records.reduce((n,r)=>n+r.selectedCount,0),supported=records.reduce((n,r)=>n+r.supportedCount,0),missing=records.reduce((n,r)=>n+r.missingImportantSourceIds.length,0);
    const early=records.filter(r=>r.longDistance),comparable=records.reduce((n,r)=>n+r.comparableFactCount,0);
    const metrics={PASS:records.filter(r=>r.pass).length,FAIL:records.filter(r=>!r.pass).length,BLOCKED:0,
      packagedSourceRecall:ratio(expected-missing,expected),directSourcePrecision:ratio(supported,selected),unrelatedSourceRate:ratio(selected-supported,selected),
      missedSourceRate:ratio(missing,expected),historicalFactMisattributionRate:ratio(records.reduce((n,r)=>n+r.incorrectAttributionCount,0),comparable),
      unrelatedContextByteRate:ratio(records.reduce((n,r)=>n+r.unrelatedBytes,0),records.reduce((n,r)=>n+r.contextBytes,0)),
      sufficiencyFalseNegative:records.filter(r=>r.sufficiencyFalseNegative).length,sufficiencyFalsePositive:records.filter(r=>r.sufficiencyFalsePositive).length,
      npcUnauthorizedSourceLeaks:records.reduce((n,r)=>n+r.leakedSourceIds.length,0),futureSourceLeaks:records.reduce((n,r)=>n+r.futureSourceIds.length,0),historicalTimeErrors:records.reduce((n,r)=>n+r.wrongTime,0),
      earlyClueMissRate:ratio(early.filter(r=>r.missingImportantSourceIds.length).length,early.length),
      latencyMeanMs:records.reduce((n,r)=>n+r.elapsedMs,0)/records.length,latencyP95Ms:p95(records.map(r=>r.elapsedMs)),indexBuildMs,
      estimatedTokensMean:records.reduce((n,r)=>n+r.estimatedTokens,0)/records.length,estimatedTokensMax:Math.max(...records.map(r=>r.estimatedTokens)),
      budgetOmittedImportant:records.reduce((n,r)=>n+r.budgetOmittedImportantSourceIds.length,0),rankMissedImportant:records.reduce((n,r)=>n+r.rankMissedImportantSourceIds.length,0)};
    const run={set:set.name,turns:set.data.turns.length,engine,budget,strategy,metrics};runs.push(run);
    const name=`${set.name}-${engine}-${strategy}-${budget}`;
    // Lossless compression retains full ranked/selected raw results without gigabytes of repeated prose.
    writeFileSync(new URL(name+'.json.gz',out),gzipSync(JSON.stringify({...run,records},null,2)+'\n'));
    writeFileSync(new URL(name+'-failures.json.gz',out),gzipSync(JSON.stringify(records.filter(r=>!r.pass),null,2)+'\n'));
    if(strategy==='historical')console.log(JSON.stringify(run));
  }
}
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
writeFileSync(new URL('summary.json',out),JSON.stringify({testedSourceSha:sha,finalUnseal:final,freezeManifest:manifest,tokenMethod:'ESTIMATE ceil(UTF-8 bytes/2); no target tokenizer; not API tokens',latencyMethod:'single sequential process query sample; no network; recent fallback index is cached, initial lazy construction excluded by baseline timer',runs},null,2)+'\n');
