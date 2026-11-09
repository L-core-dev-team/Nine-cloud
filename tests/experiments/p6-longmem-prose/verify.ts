/** Read frozen results independently; never invoke optimization or rewrite fixtures. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {generateDataset} from '../p6-longmem/dataset.ts';
import {goldQuestions} from '../p6-longmem/gold.ts';
import {assess} from '../p6-longmem/evaluate.ts';
import {estimateTokens} from '../p6-longmem/retrieval.ts';
import type {Dataset,GoldQuestion,Retrieval} from '../p6-longmem/types.ts';
import type {ProseQuestion} from './freeze.ts';
import type {ProseResult} from './retrieval.ts';
const root=new URL('./',import.meta.url),out=new URL('evidence/final/',root);
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const read=<T>(url:URL):T=>JSON.parse(readFileSync(url,'utf8')) as T;
const git=(...args:string[])=>execFileSync('git',['-c','core.quotepath=false',...args],{encoding:'utf8',maxBuffer:20*1024*1024}).trim();
const manifest=read<{files:{name:string;bytes:number;sha256:string}[]}>(new URL('fixtures/freeze-manifest.json',root));
for(const f of manifest.files){const b=readFileSync(new URL('fixtures/'+f.name,root));assert.equal(hash(b),f.sha256);assert.equal(b.length,f.bytes);}
const oldFreeze=read<{files:{name:string;sha256:string}[]}>(new URL('../p6-longmem-hardening/fixtures/freeze-manifest.json',root));
for(const f of oldFreeze.files)assert.equal(hash(readFileSync(new URL('../p6-longmem-hardening/fixtures/'+f.name,root))),f.sha256);
const summary=read<{testedSourceSha:string;runs:{set:string;engine:string;budget:number;metrics:{PASS:number;FAIL:number}}[]}>(new URL('summary.json',out));
const sourceFiles=['retrieval.ts','intent.ts','retrieval.test.ts','benchmark.ts','query.ts','tsconfig.json'];
for(const file of sourceFiles){const p='tests/experiments/p6-longmem-prose/'+file;assert.equal(hash(readFileSync(new URL(file,root))),hash(execFileSync('git',['show',summary.testedSourceSha+':'+p])),'Source changed after unseal '+file);}
assert.equal(git('diff','--name-only','1c7abe23679678810b94dbf5ff5f3034c28fb6f5','HEAD','--','tests/experiments/p6-longmem','tests/experiments/p6-longmem-hardening','docs/acceptance/2026-10-11','docs/acceptance/2026-10-12/P6-MAIN-SYNC-01-evidence'),'','Old experiment or evidence modified');
const protectedPaths=['apps','packages','scripts','deployment','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','AGENTS.md'];
assert.equal(git('diff','--name-only','origin/main','HEAD','--',...protectedPaths),'','Production diverges from main');
const complex=read<Dataset>(new URL('../p6-longmem-hardening/fixtures/complex-history-1000.json',root));
const prose=read<Dataset>(new URL('fixtures/history-1000.json',root));
const setFor=(name:string):{data:Dataset;qs:(GoldQuestion|ProseQuestion)[]}=>name.startsWith('original60-')?{data:generateDataset(Number(name.split('-')[1])),qs:goldQuestions}:name==='p602-development50'?{data:complex,qs:read(new URL('../p6-longmem-hardening/fixtures/development-questions.json',root))}:name==='p602-public50'?{data:complex,qs:read(new URL('../p6-longmem-hardening/fixtures/frozen-questions.json',root))}:{data:prose,qs:read(new URL('fixtures/'+(name==='prose-holdout100'?'holdout':'development')+'.json',root))};
let queries=0,spans=0,originalSpans=0;const failures:{set:string;engine:string;budget:number;id:string;text:string;missing:string[];spanPass:boolean}[]=[];
for(const run of summary.runs){
 const set=setFor(run.set),sources=new Map(set.data.turns.map(s=>[s.sourceId,s]));
 const records=JSON.parse(gunzipSync(readFileSync(new URL(`${run.set}-${run.engine}-${run.budget}.json.gz`,out))).toString()).records as {questionId:string;pass:boolean;spanPass:boolean;rawResult:ProseResult}[];
 assert.equal(records.length,set.qs.length);let passed=0;
 for(const saved of records){
  const q=set.qs.find(q=>q.questionId===saved.questionId)!;assert.ok(q);const r=saved.rawResult,a=assess(set.data,q,r);
  const expected='expectedSpans' in q?q.expectedSpans:[];const spanPass=expected.every(s=>r.context.includes(s.text));
  assert.equal(saved.spanPass,spanPass);assert.equal(saved.pass,a.pass&&spanPass);if(saved.pass)passed++;
  else failures.push({set:run.set,engine:run.engine,budget:run.budget,id:q.questionId,text:q.text,missing:a.missingImportantSourceIds,spanPass});
  assert.ok(r.estimatedTokens<=run.budget);assert.equal(r.estimatedTokens,estimateTokens(r.context));
  for(const selected of [...r.ranked,...r.evidence]){const s=sources.get(selected.sourceId)!;assert.ok(s);assert.ok(s.turnId<=q.asOfTurn);if(q.audience.kind==='npc')assert.ok(s.authorizedNpcIds.includes(q.audience.npcId));if(q.turnRange)assert.ok(s.turnId>=q.turnRange[0]&&s.turnId<=q.turnRange[1]);}
  for(const s of r.spans??[]){const original=sources.get(s.sourceId)!;assert.equal(original.narrative.slice(s.start,s.end),s.text);assert.ok(r.evidence.some(e=>e.sourceId===s.sourceId));assert.ok(r.context.includes(s.text));spans++;}
  for(const s of r.originalSpans??[]){const original=sources.get(s.sourceId)!;assert.equal(s.originalSha256,hash(original.narrative));assert.equal(s.turnId,original.turnId);assert.equal(original.narrative.slice(s.start,s.end),s.text);assert.ok(['narrative-detail','character-claim'].includes(s.kind));assert.ok(['original-prose-only','unverified'].includes(s.authority));originalSpans++;}
  queries++;
 }
 assert.equal(passed,run.metrics.PASS);assert.equal(records.length-passed,run.metrics.FAIL);
}
const files=readdirSync(out).filter(n=>n.endsWith('.json.gz')||n==='summary.json').map(name=>{const b=readFileSync(new URL(name,out));return {name,bytes:b.length,sha256:hash(b)};});
const result={testedSourceSha:summary.testedSourceSha,freezeCommit:'c8a2c976e668daf8838a3366e790a97e71a71083',checkedQueries:queries,checkedSpans:spans,checkedOriginalSpans:originalSpans,sourceUnchangedAfterUnseal:true,newAndOldFreezeHashesUnchanged:true,oldExperimentsAndEvidenceUnmodified:true,protectedProductionMatchesMain:true,main:git('rev-parse','origin/main'),reassessedPassAndFailure:true,files};
writeFileSync(new URL('verification.json',out),JSON.stringify(result,null,2)+'\n');
writeFileSync(new URL('failure-index.json',out),JSON.stringify(failures,null,2)+'\n');
console.log(JSON.stringify({...result,files:files.length}));
