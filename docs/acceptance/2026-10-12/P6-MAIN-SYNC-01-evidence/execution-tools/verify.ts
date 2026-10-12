import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {goldQuestions} from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/gold.ts';
import {generateDataset} from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/dataset.ts';
import {assess} from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/evaluate.ts';
import {estimateTokens} from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/retrieval.ts';
import type {Dataset,GoldQuestion,Retrieval} from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/types.ts';
const root=new URL("file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem-hardening/"),fixtures=new URL('fixtures/',root),out=new URL("file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/docs/acceptance/2026-10-12/P6-MAIN-SYNC-01-evidence/p6-02/");
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const lock=JSON.parse(readFileSync(new URL('freeze-manifest.json',fixtures),'utf8'));
for(const file of lock.files)assert.equal(hash(readFileSync(new URL(file.name,fixtures))),file.sha256);
const old=readFileSync(new URL('../../../docs/acceptance/2026-10-11/P6-LONGMEM-01-evidence/review/gold-questions.json',root));
assert.equal(hash(old),lock.oldGoldSha256);assert.deepEqual(goldQuestions,JSON.parse(old.toString('utf8')));
const summary=JSON.parse(readFileSync(new URL('summary.json',out),'utf8'));
execFileSync('git',['diff','--exit-code',summary.testedSourceSha,'--','tests/experiments/p6-longmem','tests/experiments/p6-longmem-hardening/retrieval.ts','tests/experiments/p6-longmem-hardening/benchmark.ts','tests/experiments/p6-longmem-hardening/fixtures']);
const complex=JSON.parse(readFileSync(new URL('complex-history-1000.json',fixtures),'utf8')) as Dataset;
const dataSets:Record<string,Dataset>={original60:generateDataset(200),development50:complex,frozen50:complex};
const questions:Record<string,GoldQuestion[]>={original60:goldQuestions,development50:JSON.parse(readFileSync(new URL('development-questions.json',fixtures),'utf8')),frozen50:JSON.parse(readFileSync(new URL('frozen-questions.json',fixtures),'utf8'))};
let checkedQueries=0,checkedSpans=0;const files=[];
for(const name of readdirSync(out).filter(n=>n.endsWith('.json.gz')&&!n.includes('-failures'))){
  const bytes=readFileSync(new URL(name,out));const run=JSON.parse(gunzipSync(bytes).toString('utf8'));const data=dataSets[run.set]!;
  const oracle=new Map(questions[run.set]!.map(q=>[q.questionId,q]));
  for(const record of run.records){
    const r=record.rawResult as Retrieval & {spans?:{sourceId:string;start:number;end:number;text:string}[]};const q=oracle.get(record.questionId)!;
    assert.equal(assess(data,q,r).pass,record.pass);assert.equal(estimateTokens(r.context),r.estimatedTokens);assert.ok(r.estimatedTokens<=run.budget);
    for(const s of r.ranked){assert.ok(s.turnId<=q.asOfTurn);if(q.audience.kind==='npc')assert.ok(s.authorizedNpcIds.includes(q.audience.npcId));}
    for(const span of r.spans??[]){assert.equal(data.turns.find(s=>s.sourceId===span.sourceId)!.narrative.slice(span.start,span.end),span.text);checkedSpans++;}
    checkedQueries++;
  }
  files.push({name,bytes:bytes.length,sha256:hash(bytes)});
}
assert.equal(checkedQueries,2560);
const verification={testedSourceSha:summary.testedSourceSha,checkedQueries,checkedSpans,frozenHashesUnchanged:true,old60Unchanged:true,sourceUnchangedAfterFinal:true,rawPassReassessed:true,files};
writeFileSync("C:\\Users\\11954\\Desktop\\水龙吟专用\\项目\\Nine-cloud-P6-main-sync-20261012\\docs\\acceptance\\2026-10-12\\P6-MAIN-SYNC-01-evidence\\p6-02-verification.json",JSON.stringify(verification,null,2)+'\n');console.log(JSON.stringify({...verification,files:files.length}));
