// Deterministic synthetic scale extension; existing frozen corpora/answers are read-only.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import type {Dataset, Source, GoldQuestion} from '../p6-longmem/types.ts';
export const scope={ownerId:'synthetic-player',saveId:'offline-scale',branchId:'root'};
const require=createRequire(import.meta.url),{canonical}=require('./store.cjs');
export const mapTurn=(t:number,count:number)=>Math.floor((t-1)*(count-1)/999)+1;
const read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
export function dataFor(kind:'complex'|'prose',count:number):Dataset & {aliasSince?:Record<string,Record<string,number>>}{
  if(![1000,3000,10000].includes(count))throw Error('Unknown size');
  const data=read(kind==='complex'?'../p6-longmem-hardening/fixtures/complex-history-1000.json':'../p6-longmem-prose/fixtures/history-1000.json');
  if(count===1000)return data;
  const anchors=new Map<number,Source>();
  for(const s of data.turns){
    s.turnId=mapTurn(s.turnId,count);s.gameMinute=(s.turnId-1)*72;s.gameTime=`第${Math.ceil(s.turnId/20)}日`;
    for(const f of s.facts){f.validFrom=mapTurn(f.validFrom,count);if(f.validUntil!==undefined)f.validUntil=mapTurn(f.validUntil,count);}
    anchors.set(s.turnId,s);
  }
  for(const names of Object.values(data.aliasSince??{}) as Record<string,number>[])for(const name of Object.keys(names))names[name]=mapTurn(names[name]!,count);
  data.entities.push({id:'scale-inspector',name:'离线巡检员',aliases:[],kind:'person'},{id:'scale-route',name:'离线巡检道',aliases:[],kind:'place'});
  data.turns=Array.from({length:count},(_,i)=>{
    const t=i+1,anchor=anchors.get(t);if(anchor)return anchor;
    const section=['苇岸','石阶','木桥','浅滩','灯桩','船棚'][t%6], task=['核验刻度','更换护绳','清点浮标','记录水位','修补灯罩'][t%5];
    return {sourceId:`extension:${t}`,turnId:t,gameMinute:i*72,gameTime:`第${Math.ceil(t/20)}日`,participants:['scale-inspector'],location:'离线巡检道',items:[],
      narrative:`离线巡检员在${section}完成第${t}批${task}，登记${t%37+1}处验点，保留批次凭证。此处是合成扩展事件，与护潮档案和原人物叙事没有身份或物品合并。`,
      eventIds:[`extension-event:${t}`],tags:['合成扩展','巡检'],facts:[{id:`extension-fact:${t}`,subject:'scale-route',predicate:'巡检批次',value:`${t}:${section}:${task}`,kind:'world-event',validFrom:t,confirmedBy:`extension-event:${t}`}],historicalSources:[],authorizedNpcIds:['scale-inspector']} satisfies Source;
  });
  return data;
}
export function questionsFor(kind:'complex'|'prose',count:number):(GoldQuestion & {expectedSpans?:any[];category?:string})[]{
  const files=kind==='complex'?['../p6-longmem-hardening/fixtures/development-questions.json','../p6-longmem-hardening/fixtures/frozen-questions.json']:['../p6-longmem-prose/fixtures/development.json','../p6-longmem-prose/fixtures/holdout.json'];
  const qs=files.flatMap(read); // Prior holdouts were already unsealed; now public compatibility cases.
  for(const q of qs){q.asOfTurn=mapTurn(q.asOfTurn,count);if(q.turnRange)q.turnRange=q.turnRange.map((t:number)=>mapTurn(t,count));if(q.gameMinuteRange)q.gameMinuteRange=q.gameMinuteRange.map((t:number)=>(mapTurn(t/72+1,count)-1)*72);}
  return qs;
}
export function corpusDigest(sources:Source[]){
  const h=createHash('sha256');for(const s of [...sources].sort((a,b)=>a.turnId-b.turnId))h.update(canonical(s)+'\n');return h.digest('hex');
}
