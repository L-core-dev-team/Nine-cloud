/** Independent scripted oracle. No retrieval implementation or model is imported here. */
import {createHash} from 'node:crypto';
import type {Dataset,Source,Fact,Query} from '../p6-longmem/types.ts';
export type Ledger={id:string;sourceId:string;turn:number;start:number;end:number;text:string;sha256:string;kind:string;subject:string;value:string;status:string};
export type Question=Query&{questionId:string;split:'development'|'holdout';category:string;expectedSourceIds:string[];expectedSpans:Ledger[];expectedFactValues:string[];noEvidence:boolean};
export const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export function world(count:number,suite:'development'|'holdout'='development'){
 if(![1000,3000,10000].includes(count))throw Error('Staged sizes only');
 const data:Dataset&{aliasSince:Record<string,Record<string,number>>}={schemaVersion:1,synthetic:true,entities:[],turns:[],aliasSince:{}};
 const ledger:Ledger[]=[],questions:Question[]=[];const anchors=new Map<number,Source>();
 const names=suite==='development'?['岑雾','方鹭','祝霜','陆苔','孟芦','江砾','纪汀','陶栎']:['温芹','谢荻','钱柚','蒋榆','鲁蓼','曹苓','邵芩','许薇'];
 const places=suite==='development'?['折苇轩','映沙院','寒苔馆','观藻台','青砾庭','深芦坞','沉汀阁','照栎楼']:['斜榆轩','温苓院','映荻馆','沉柚台','听蓼庭','寒薇坞','望芩阁','渡芹楼'];
 const objects=suite==='development'?['铜铃','石珠','木杯','铁环','竹筒','陶盏','骨笛','银扣']:['木珠','瓷杯','铜环','石盏','竹笛','铁扣','银铃','陶筒'];
 const fillers=['潮汐退过石阶后，抄录者对照两册旧账，逐笔确认数目，却没有对任何人的身份作出结论。','门外有人借道而行，守门人先询问来处，再把借用的灯送还；这段经过只记录日常往来。','廊下的木桌被移开半尺，学徒重排坐席，争论午后应当先修屋檐还是清点柴薪，直到更鼓响起才各自散去。','一位旅人翻开残缺的行路札记，读到道路岔口便停下，旁人提醒旧路标未必适用于今日，两人决定翌日亲自查验。','值日人没有认可街巷间的传闻。他只在纸上写下听到的内容，并在末尾标明尚未核实，不把转述当作可靠见证。','有人问：“难道每个故事都能凭一句话说清？”同行者摇头，将破损的纸页一一铺平，提醒应当保留前后语境。','小院正在更换门框，匠人核对榫眼和尺寸，几次试装后仍把最后一道工序留待明日；学徒逐条抄下尚未完成的步骤。','案头的草图画着三条岔路，执笔者逐一注明沿途补给与路程，另将道听途说的捷径圈出，留给后来者复核。'];
 function filler(t:number){let x=t*1664525+1013904223+(suite==='holdout'?739:0);const lines=[];for(let j=0;j<6;j++){x=(Math.imul(x,1664525)+1013904223)>>>0;const a=fillers[x%fillers.length]!;lines.push(`第${t}回合第${j+1}记，${a}本次登记的验点是${(x>>>8)%997}号，簿页${t*13+j}未与旧页合并。`);}return lines.join('');}
 function add(i:number,phase:number,kind:string,text:string,facts:Fact[]=[]){const turn=Math.floor((phase*8+i+1)*(count-1)/70)+1;const sourceId=`long:${i}:${phase}`;const prefix=(filler(turn).match(/[^。！？]+[。！？]/gu)??[]).slice(0,3).join('');const suffix=filler(turn+101);const narrative=prefix+text+suffix;const s:Source={sourceId,turnId:turn,gameMinute:(turn-1)*72,gameTime:`合成第${turn}刻`,participants:[`n${i}`],location:`l${i}`,items:[`o${i}`],narrative,eventIds:[`ev:${sourceId}`],tags:[kind],facts:facts.map(f=>({...f,validFrom:turn,confirmedBy:f.kind==='world-event'?`ev:${sourceId}`:undefined})),historicalSources:[],authorizedNpcIds:[`n${i}`]};anchors.set(turn,s);const entry:Ledger={id:`ledger:${sourceId}`,sourceId,turn,start:prefix.length,end:prefix.length+text.length,text,sha256:hash(narrative),kind,subject:`n${i}`,value:facts[0]?.value??text,status:facts[0]?.kind==='character-claim'?'unverified':'original-prose-only'};ledger.push(entry);return entry;}
 function q(i:number,category:string,text:string,entries:Ledger[],asOfTurn=count,audience:Query['audience']={kind:'player'},values:string[]=[]){questions.push({questionId:`${suite}:${i}:${category}:${questions.length}`,split:suite,category,text,asOfTurn,audience,expectedSourceIds:[...new Set(entries.map(e=>e.sourceId))],expectedSpans:entries,expectedFactValues:values,noEvidence:entries.length===0});}
 for(let i=0;i<8;i++){
  const n=names[i]!,l=places[i]!,o=objects[i]!;data.entities.push({id:`n${i}`,name:n,aliases:[`${n}客`,'老渡客'],kind:'person'},{id:`l${i}`,name:l,aliases:[],kind:'place'},{id:`o${i}`,name:o+'信物',aliases:[],kind:'item'});
  const f=(predicate:string,value:string,kind:Fact['kind']='world-event',supersedes?:string):Fact=>({id:`f:${i}:${predicate}:${value}`,subject:`n${i}`,predicate,value,kind,validFrom:1,...(supersedes?{supersedes}:{})});
  const meet=add(i,0,'meeting',`${n}第一次在${l}见到玩家，态度戒备，说：“先问清来处，再谈同行。”`,[f('初遇地点',l),f('关系','戒备')]);
  const ear=add(i,1,'body',`${n}耳后别着一片青叶，腰间系着灰绳，衣襟别着铜扣。`);
  const rain=add(i,2,'weather',`${l}雨中，湿苔带起青草味，檐下还有泥土气味。`);
  const clear=add(i,3,'weather',`${l}晴天，日光晒出木香。`);
  const landing=add(i,4,'event',`${l}里，${o}${suite==='holdout'?'掉到地上':'落在地上'}弹了两下，棋子留在桌上没有移动。`);
  const trustFact=f('关系','信任','world-event',`f:${i}:关系:戒备`);
  const trust=add(i,5,'relationship',`${n}在${l}兑现共同修桥的承诺，改称玩家为同行者；双方建立信任。`,[trustFact,f('约定','已兑现')]);
  const item=add(i,6,'transfer',`${n}把${o}信物交给玩家，随后信物被消耗于阵门，归属不再有效。`,[{...f('归属','已消耗'),subject:`o${i}`}]);
  const claim=add(i,7,'rumor',`${n}说：“听说远方的门已经开放。”他没有亲眼确认，谣言仍未核实。`,[f('身份传闻','远门已开放','character-claim')]);
  data.aliasSince[`n${i}`]={[`${n}客`]:trust.turn};
  const prior=anchors.get(meet.turn)!;prior.facts.find(f=>f.predicate==='关系')!.validUntil=trust.turn;
  q(i,'body',`${n}耳后有什么装饰？`,[ear]);
  q(i,'body-waist',`${n}腰间有什么装饰？`,[ear]);
  q(i,'body-missing',`${n}耳后的翡翠耳坠原文在哪里？`,[]);
  q(i,'rain',`${l}雨里的气味是什么？`,[rain]);
  q(i,'clear',`${l}晴天的气味是什么？`,[clear]);
  q(i,'landing',`${l}落地${o}的声音出现在哪里？`,[landing]);
  q(i,'wrong-object',`${l}落地棋子的声音出现在哪里？`,[]);
  q(i,'future',`${n}耳后有什么装饰？`,[],ear.turn-1);
  q(i,'alias-future',`${n}客耳后有什么装饰？`,[],trust.turn-1);
  q(i,'alias-known',`${n}客耳后有什么装饰？`,[ear]);
  q(i,'npc-self',`${n}耳后有什么装饰？`,[ear],count,{kind:'npc',npcId:`n${i}`});
  q(i,'npc-unknown',`${n}耳后有什么装饰？`,[],count,{kind:'npc',npcId:`n${(i+1)%8}`});
  q(i,'same-name','老渡客耳后有什么装饰？',[]);
  q(i,'historical-relation',`${n}当时的关系如何？`,[meet],trust.turn-1,{kind:'player'},['戒备']);
  q(i,'current-relation',`${n}当前关系如何？`,[trust],count,{kind:'player'},['信任']);
  q(i,'promise',`${n}当前承诺是否兑现？`,[trust],count,{kind:'player'},['已兑现']);
  q(i,'consumed',`${o}信物当前归属？`,[item],count,{kind:'player'},['已消耗']);
  q(i,'rumor',`${n}的身份传闻是什么？`,[claim],count,{kind:'player'},['远门已开放']);
 }
 data.entities.push({id:'scribe',name:'合成记簿人',aliases:[],kind:'person'},{id:'filler',name:'旁支记录院',aliases:[],kind:'place'});
 data.turns=Array.from({length:count},(_,j)=>anchors.get(j+1)??{sourceId:`ambient:${j+1}`,turnId:j+1,gameMinute:j*72,gameTime:`合成第${j+1}刻`,participants:['scribe'],location:'filler',items:[],narrative:filler(j+1),eventIds:[],tags:['synthetic-ambient'],facts:[],historicalSources:[],authorizedNpcIds:['scribe']});
 const narratives=data.turns.map(s=>s.narrative);const lengths=narratives.map(s=>s.length).sort((a,b)=>a-b);const sentences=narratives.flatMap(s=>s.match(/[^。！？]+[。！？]?/gu)??[]);const unique=new Set(sentences);
 return {data,ledger,questions,meta:{count,synthetic:true,source:'deterministic scripted ledger and finite narrative grammar; no real players, Canon or model APIs',characters:lengths.reduce((a,b)=>a+b,0),utf8Bytes:narratives.reduce((n,s)=>n+Buffer.byteLength(s),0),p50Chars:lengths[Math.floor(count*.5)],p95Chars:lengths[Math.floor(count*.95)],exactDocumentDuplicateRate:1-new Set(narratives).size/count,exactSentenceDuplicateRate:1-unique.size/sentences.length,finiteAmbientTemplates:fillers.length,limitation:'Unique counters lower exact duplicate rates; semantic/template repetition remains high. Eight finite story arcs are not human gameplay; no semantic coverage claim.',oracle:'Ledger emitted at authoring time with UTF-16 offsets and source SHA256; retriever never emits or receives gold.',developmentQuestions:questions.filter(q=>q.split==='development').length,holdoutQuestions:questions.filter(q=>q.split==='holdout').length}};
}
