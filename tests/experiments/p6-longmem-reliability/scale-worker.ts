import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {DiskRecall,originalInput,attachment,writeRegistry} from './adapter.ts';
import {dataFor,scope,corpusDigest} from './workload.ts';
import {assess} from '../p6-longmem/evaluate.ts';
import type {Dataset, Query, GoldQuestion} from '../p6-longmem/types.ts';
const require=createRequire(import.meta.url),{ReliableStore,digest}=require('./store.cjs');
const mode=process.argv[2],cfg=JSON.parse(fs.readFileSync(process.argv[3]!,'utf8'));
const percentile=(v:number[],p:number)=>[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*p))]??0;
if(mode==='write'||mode==='crash-write'){
  const data=dataFor(cfg.kind,cfg.count),root=corpusDigest(data.turns),s=new ReliableStore(cfg.file),latencies:number[]=[];
  writeRegistry(s,scope,data);const start=performance.now();
  let saved=0,duplicates=0;
  for(const source of data.turns){const t=performance.now();const status=s.save(originalInput(scope,source),attachment(source)).status;status==='saved'?saved++:duplicates++;latencies.push(performance.now()-t);
    if(mode==='crash-write'&&source.turnId===cfg.count/2){fs.writeSync(1,JSON.stringify({checkpoint:'halfway-after-commit',committedTurns:source.turnId,pid:process.pid})+'\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}
  }
  const writeMs=performance.now()-start,duplicatesStart=performance.now();
  // Retry sparse acknowledged turns without creating additional rows.
  for(const index of [0,Math.floor(cfg.count/2),cfg.count-1])s.save(originalInput(scope,data.turns[index]!),attachment(data.turns[index]!));
  const duplicateMs=performance.now()-duplicatesStart;s.close();
  process.stdout.write(JSON.stringify({pid:process.pid,root,count:data.turns.length,saved,duplicates,writeMs,writeP50Ms:percentile(latencies,.5),writeP95Ms:percentile(latencies,.95),duplicateMs,dbBytes:fs.statSync(cfg.file).size,bodyBytes:data.turns.reduce((n,s)=>n+Buffer.byteLength(s.narrative),0),heapUsed:process.memoryUsage().heapUsed,sqlite:'WAL + synchronous FULL'})+'\n');
}else if(mode==='read'){
  // Fresh process: never call dataFor or read the original history fixtures.
  const t=performance.now(),recall=new DiskRecall(cfg.file,scope,cfg.count),restoreMs=performance.now()-t;
  assert.equal(recall.sources.length,cfg.count);assert.equal(corpusDigest(recall.sources),cfg.writer.root,'Restored corpus/provenance differs from writer');
  const questions=JSON.parse(fs.readFileSync(cfg.questions,'utf8')),rows:any[]=[],runs:any[]=[],builds:any[]=[];
  assert.equal(digest(fs.readFileSync(cfg.questions)),cfg.questionsSha256,'Frozen query plan changed');
  const dataset:Dataset={schemaVersion:1,synthetic:true,entities:recall.registry.entities,turns:recall.sources};
  for(const budget of [512,1024,2048,4096]){
    const records:any[]=[];
    for(const q of questions as (GoldQuestion & {expectedSpans?:{text:string}[];gameMinuteRange?:[number,number]})[]){
      const query:Query={text:q.text,asOfTurn:q.asOfTurn,audience:q.audience,...(q.turnRange?{turnRange:q.turnRange}:{}),...(q.gameMinuteRange?{gameMinuteRange:q.gameMinuteRange}:{})};
      const before=performance.now(),result=recall.search(query,budget),endToEndMs=performance.now()-before,a=assess(dataset,q,result);
      const spanPass=(q.expectedSpans??[]).every(s=>result.context.includes(s.text));
      let byteChecks=0;
      for(const p of result.originalSpans){const raw=recall.original(p.sourceId,query)!;assert.ok(raw,'Retrieved source must allow original access');assert.equal(raw.narrative.slice(p.start,p.end),p.text);assert.equal(digest(Buffer.from(raw.narrative)),p.originalSha256);byteChecks++;}
      assert.ok(result.estimatedTokens<=budget);
      const row={...a,pass:a.pass&&spanPass,spanPass,byteChecks,budget,endToEndMs,originalSpans:result.originalSpans,context:result.context,diagnosis:result.diagnosis,factStates:result.evidence.map(s=>({sourceId:s.sourceId,states:s.factStates})),candidateSourceIds:result.ranked.map(s=>s.sourceId)};
      records.push(row);rows.push(row);
    }
    const sum=(f:(r:any)=>number)=>records.reduce((n,r)=>n+f(r),0),lat=records.map(r=>r.endToEndMs);
    const expected=sum(r=>r.expectedCount),selected=sum(r=>r.selectedCount);
    runs.push({budget,queries:records.length,pass:records.filter(r=>r.pass).length,fail:records.filter(r=>!r.pass).length,sourceRecall:expected?(expected-sum(r=>r.missingImportantSourceIds.length))/expected:null,sourcePrecision:selected?sum(r=>r.supportedCount)/selected:null,
      npcLeaks:sum(r=>r.leakedSourceIds.length),futureLeaks:sum(r=>r.futureSourceIds.length),wrongFactStatus:sum(r=>r.factResults.filter((f:any)=>f.present&&!f.statusCorrect).length),misattribution:sum(r=>r.incorrectAttributionCount),negativeFalsePositive:records.filter(r=>r.noEvidence&&!r.correctlyRefused).length,
      byteChecks:sum(r=>r.byteChecks),estimatedTokensMean:sum(r=>r.estimatedTokens)/records.length,estimatedTokensMax:Math.max(...records.map(r=>r.estimatedTokens)),endToEndP50Ms:percentile(lat,.5),endToEndP95Ms:percentile(lat,.95),endToEndMaxMs:Math.max(...lat)});
  }
  // Dedicated cold-build measurement using a new instance, separated from warm searches.
  for(const audience of [{kind:'player' as const},{kind:'npc' as const,npcId:cfg.kind==='complex'?'p-a0-lead':'observer'}]){
    const fresh=new DiskRecall(cfg.file,scope,cfg.count),query:Query={text:cfg.kind==='complex'?'栖潮埠秘匣当前归属':'陆砚最早的衣着',asOfTurn:cfg.count,audience};
    const start=performance.now();fresh.search(query,2048);builds.push({audience,firstSearchIncludingIndexMs:performance.now()-start,indexBuildMs:fresh.measurements()[0]!.buildMs});fresh.close();
  }
  assert.deepEqual(recall.store.check(),['ok']);const heapUsed=process.memoryUsage().heapUsed,viewBuilds=recall.measurements();recall.close();
  fs.writeFileSync(path.join(cfg.output,'queries.json.gz'),gzipSync(JSON.stringify(rows)+'\n'));
  fs.writeFileSync(path.join(cfg.output,'failures.json'),JSON.stringify(rows.filter(r=>!r.pass),null,2)+'\n');
  process.stdout.write(JSON.stringify({pid:process.pid,restoreMs,restoredRoot:cfg.writer.root,restoredCount:cfg.count,unboundWorldLabelsExcluded:recall.sources.reduce((n,s)=>n+s.facts.filter(f=>f.kind==='world-event'&&(!f.confirmedBy||!s.eventIds.includes(f.confirmedBy))).length,0),heapUsed,builds,viewBuildCount:viewBuilds.length,viewBuildTotalMs:viewBuilds.reduce((n,b)=>n+b.buildMs,0),runs,processResource:process.resourceUsage()})+'\n');
}else throw Error('Unknown mode');
