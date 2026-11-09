import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {generateDataset} from '../p6-longmem/dataset.ts';
import {goldQuestions} from '../p6-longmem/gold.ts';
import {assess} from '../p6-longmem/evaluate.ts';
import {HardenedIndex} from '../p6-longmem-hardening/retrieval.ts';
import {ProseIndex} from './retrieval.ts';
import type {Dataset,GoldQuestion} from '../p6-longmem/types.ts';
import type {ProseQuestion} from './freeze.ts';
const read=<T>(url:URL):T=>JSON.parse(readFileSync(url,'utf8')) as T;
const root=new URL('./',import.meta.url),final=process.argv.includes('--final');
const iteration=process.argv.find(a=>a.startsWith('--iteration='))?.split('=')[1]??'initial';
if(!/^[a-z0-9-]+$/.test(iteration))throw Error('Invalid iteration');
const out=new URL(final?'evidence/final/':`evidence/development-${iteration}/`,root);
// Final evidence is append-once. Do not silently replace a held-out run.
if(final&&existsSync(new URL('summary.json',out)))throw Error('FINAL_ALREADY_UNSEALED');
const manifest=read<{files:{name:string;sha256:string}[]}>(new URL('fixtures/freeze-manifest.json',root));
for(const f of manifest.files)if(createHash('sha256').update(readFileSync(new URL('fixtures/'+f.name,root))).digest('hex')!==f.sha256)throw Error('Freeze changed '+f.name);
const complex=read<Dataset>(new URL('../p6-longmem-hardening/fixtures/complex-history-1000.json',root));
const sets:{name:string;data:Dataset;qs:(GoldQuestion|ProseQuestion)[]}[]=[
 ...[200,500,1000].map(n=>({name:'original60-'+n,data:generateDataset(n),qs:goldQuestions})),
 {name:'p602-development50',data:complex,qs:read(new URL('../p6-longmem-hardening/fixtures/development-questions.json',root))},
 {name:'p602-public50',data:complex,qs:read(new URL('../p6-longmem-hardening/fixtures/frozen-questions.json',root))},
 {name:'prose-development100',data:read(new URL('fixtures/history-1000.json',root)),qs:read(new URL('fixtures/development.json',root))},
];
if(final)sets.push({name:'prose-holdout100',data:sets.at(-1)!.data,qs:read(new URL('fixtures/holdout.json',root))});
mkdirSync(out,{recursive:true});const runs=[];
for(const set of sets)for(const engine of ['p602','prose'] as const){
 const buildStart=performance.now(),index=engine==='p602'?new HardenedIndex(set.data):new ProseIndex(set.data),indexBuildMs=performance.now()-buildStart;
 for(const budget of [512,1024,2048,4096]){
  const records=set.qs.map(q=>{
   const r=index.search(q,budget);const a=assess(set.data,q,r);
   const expected='expectedSpans' in q?q.expectedSpans:[];
   const spanPass=expected.every(s=>r.context.includes(s.text));
   const unrelated=r.evidence.filter(e=>!q.supportingSourceIds.includes(e.sourceId));
   return {...a,pass:a.pass&&spanPass,spanPass,category:'category' in q?q.category:'public-regression',expectedSpans:expected,supportingSourceIds:q.supportingSourceIds,unrelatedContextBytes:unrelated.reduce((n,s)=>n+Buffer.byteLength(s.narrative),0),rawResult:r};
  });
  const sum=(f:(r:typeof records[number])=>number)=>records.reduce((n,r)=>n+f(r),0),ratio=(n:number,d:number)=>d?n/d:null;
  const latencies=records.map(r=>r.elapsedMs).sort((a,b)=>a-b);
  // Context redundancy is computed from packed original spans rather than full stored narratives.
  const unrelatedBytes=records.reduce((n,r)=>n+('spans' in r.rawResult?r.rawResult.spans.filter(s=>!r.supportingSourceIds.includes(s.sourceId)).reduce((a,s)=>a+Buffer.byteLength(s.text),0):0),0);
  const run={set:set.name,engine,budget,indexBuildMs,metrics:{PASS:records.filter(r=>r.pass).length,FAIL:records.filter(r=>!r.pass).length,
   sourceRecall:ratio(sum(r=>r.expectedCount-r.missingImportantSourceIds.length),sum(r=>r.expectedCount)),sourcePrecision:ratio(sum(r=>r.supportedCount),sum(r=>r.selectedCount)),
   answerSpanPass:records.filter(r=>r.spanPass).length,missedSources:sum(r=>r.missingImportantSourceIds.length),rankMissedSources:sum(r=>r.rankMissedImportantSourceIds.length),budgetOmittedSources:sum(r=>r.budgetOmittedImportantSourceIds.length),
   unrelatedContextByteRate:ratio(unrelatedBytes,sum(r=>r.contextBytes)),npcLeaks:sum(r=>r.leakedSourceIds.length),futureLeaks:sum(r=>r.futureSourceIds.length),wrongFactStatus:sum(r=>r.factResults.filter(f=>f.present&&!f.statusCorrect).length),misattribution:sum(r=>r.incorrectAttributionCount),negativeFalsePositive:records.filter(r=>r.noEvidence&&!r.correctlyRefused).length,
   estimatedTokensMean:sum(r=>r.estimatedTokens)/records.length,estimatedTokensMax:Math.max(...records.map(r=>r.estimatedTokens)),latencyMeanMs:sum(r=>r.elapsedMs)/records.length,latencyP95Ms:latencies[Math.floor(latencies.length*.95)]??0},categories:Object.fromEntries([...new Set(records.map(r=>r.category))].map(c=>[c,{total:records.filter(r=>r.category===c).length,pass:records.filter(r=>r.category===c&&r.pass).length}]))};
  runs.push(run);const name=`${set.name}-${engine}-${budget}`;
  writeFileSync(new URL(name+'.json.gz',out),gzipSync(JSON.stringify({...run,records})+'\n'));
  writeFileSync(new URL(name+'-failures.json.gz',out),gzipSync(JSON.stringify(records.filter(r=>!r.pass))+'\n'));
  console.log(JSON.stringify({set:set.name,engine,budget,...run.metrics}));
 }
}
writeFileSync(new URL('summary.json',out),JSON.stringify({testedSourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),finalUnseal:final,tokenMethod:'ESTIMATE ceil(UTF-8 bytes/2), excludes system/query/output; not API billing',latencyMethod:'single sequential local process; index construction separated; no production SLO',freezeManifest:manifest,runs},null,2)+'\n');
