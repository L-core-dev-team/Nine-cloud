import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {HardenedIndex,type ProofResult} from '../p6-longmem-hardening/retrieval.ts';
import {estimateTokens,tokenMethod} from '../p6-longmem/retrieval.ts';
import type {Dataset,Query,Evidence,Source} from '../p6-longmem/types.ts';
import {facets,grams,normalize,words,proseIntent,temporalIntent} from './intent.ts';

export type OriginalSpan={sourceId:string;turnId:number;start:number;end:number;text:string;originalSha256:string;kind:'narrative-detail'|'character-claim';authority:'original-prose-only'|'unverified';factIds:string[]};
export type ProseResult=ProofResult & {originalSpans:OriginalSpan[];intent:{mode:'typed'|'prose';temporal:ReturnType<typeof temporalIntent>}};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const stop=/^(的|什么|怎样|如何|哪里|哪里呀|在哪|在哪里|是|有|了|吗|当时|当年|最早|最初|最新|一段|原文|出现|出现于|首次|初次|第一次|什么样|一个|附近|有关|关于|谈到|说|对话|对白|原话|原句|如何响|衣着|外貌|声音|声响|气味|气息|闻起来|细节|颜色|与|或|和|时候|怎样说|什么颜色|如何作响)$/;
const structural=/现在|当前|截至/g;
export class ProseIndex {
 readonly data:Dataset;
 readonly typed:HardenedIndex;
 readonly sentenceIndex:Map<string,{start:number;end:number;text:string;grams:Set<string>}[]>;
 constructor(data:Dataset){
  this.data=data;
  this.typed=new HardenedIndex(data);
  this.sentenceIndex=new Map(data.turns.map(s=>[s.sourceId,[...s.narrative.matchAll(/[^。！？]+(?:[。！？][”」]?|$)/gu)].map(m=>({start:m.index!,end:m.index!+m[0].length,text:m[0],grams:grams(m[0])}))]));
 }
 original(sourceId:string,q:Query){const s=this.typed.byId.get(sourceId);return s&&this.typed.visible(s,q)?structuredClone(this.typed.materialize(s,q,0)):undefined;}
 search(q:Query,budget=1024,strategy:'historical'|'recent'='historical'):ProseResult{
  const started=performance.now(),temporal=temporalIntent(q.text),prose=proseIntent(q.text);
  // Reuse validation and typed knowledge projection, without mutating the original P6-02 engine.
  // Mask legacy substring temporal flags when the lexical intent is not current.
  const typedQuery={...q,text:temporal==='current'?q.text.replace(structural,'此刻')+' 当前':q.text.replace(structural,'此刻')};
  const typed=this.typed.search(typedQuery,budget,strategy);
  if(strategy==='recent'||!prose||typed.ranked.some(s=>s.facts.length>0))return {...typed,originalSpans:this.provenance(typed,q),intent:{mode:'typed',temporal},elapsedMs:performance.now()-started};
  const since=(this.data as Dataset&{aliasSince?:Record<string,Record<string,number>>}).aliasSince;
  const matches=this.data.entities.flatMap(e=>[e.id,e.name,...e.aliases].filter(a=>q.text.includes(a)).map(alias=>({e,alias,since:since?.[e.id]?.[alias]??1})));
  const explicit=matches.filter(m=>!matches.some(o=>o.alias.length>m.alias.length&&o.alias.includes(m.alias)));
  const ambiguous=explicit.some(m=>explicit.some(o=>o.e.id!==m.e.id&&o.alias===m.alias)&&!explicit.some(x=>x.e.id===m.e.id&&!explicit.some(o=>o.e.id!==x.e.id&&o.alias===x.alias)));
  const future=explicit.some(m=>m.since>q.asOfTurn);
  const entities=[...new Map(explicit.map(m=>[m.e.id,m.e])).values()];
  let queryText=q.text;for(const m of explicit.sort((a,b)=>b.alias.length-a.alias.length))queryText=queryText.replaceAll(m.alias,' ');
  let requested=facets.filter(f=>f.query.test(queryText));
  // Generic 如何/怎样 is syntax, not a second physical-action attribute.
  if(requested.some(f=>f.name==='dialogue'))requested=requested.filter(f=>f.name==='dialogue');
  else if(requested.some(f=>f.name==='smell'||f.name==='sound'||f.name==='appearance'))requested=requested.filter(f=>f.name!=='action'&&f.name!=='environment');
  const contentWords=words(queryText).filter(t=>t.length>=2&&!stop.test(t));
  const queryGrams=grams(queryText);
  const concreteText=queryText.replace(/最早|最初|最新|第一次|初次|当时|当年|一段|原文|描述|描写|细节|特点|外观|外貌|衣着|衣物|衣裳|神态|颜色|气味|气息|味道|香气|声音|声响|闻起来|传来|发出|如何|怎样|怎么|什么|哪里|出现|提到|谈到|有关|关于|原话|原句|对白|对话|做了|是什么|在|有|的|了|说|穿|上|下|前|后|时|与|或|和/g,'');
  const concreteGrams=grams(concreteText.replace(/动作|束发|关|谈|用|响/g,''));
  const candidates:{source:Evidence;pieces:{start:number;end:number;text:string;score:number}[];score:number}[]=[];
  if(!ambiguous&&!future)for(const s of this.data.turns){
   if(!this.typed.visible(s,q))continue;
   // Explicit identities are conjunctive; a known place/person is not sufficient evidence alone.
   if(entities.length&&!entities.every(e=>e.kind==='person'?s.participants.includes(e.id):e.kind==='item'?s.items.includes(e.id):s.location===e.id||s.location===e.name||s.narrative.includes(e.name)))continue;
   const pieces=(this.sentenceIndex.get(s.sourceId)??[]).flatMap(p=>{
    const hits=[...queryGrams].filter(g=>p.grams.has(g)).length;
    const lexical=contentWords.filter(t=>normalize(p.text).includes(normalize(t)));
    const matched=requested.filter(f=>f.sentence.test(p.text));
    // Unknown concrete objects require lexical support. Generic facet questions may use vocabulary matches.
    const sourceGrams=grams(s.narrative);
    const unsupportedConcrete=concreteGrams.size>0&&![...concreteGrams].some(g=>sourceGrams.has(g));
    if(unsupportedConcrete)return [];
    const broad=requested.length>0&&matched.length>0;
    if(!broad&&hits<(entities.length?2:3))return [];
    const score=hits*2+lexical.length*4+matched.length*3;
    return [{start:p.start,end:p.end,text:p.text,score}];
   }).sort((a,b)=>b.score-a.score||a.start-b.start);
   if(!pieces.length)continue;
   const score=pieces[0]!.score;candidates.push({source:this.typed.materialize(s,q,score),pieces,score});
  }
  // Earliest/latest original description is evidence of a narration time, not a current world fact.
  const earliest=/最早|最初|初遇|初次|第一次/.test(q.text),latest=temporal==='current';
  let selected=candidates.sort((a,b)=>b.score-a.score||a.source.turnId-b.source.turnId);
  if((earliest||latest)&&selected.length){const turn=(earliest?Math.min:Math.max)(...selected.map(c=>c.source.turnId));selected=selected.filter(c=>c.source.turnId===turn);}
  // Bounded lexical retrieval does not claim exhaustive proof for arbitrary semantic questions.
  selected=selected.slice(0,8);
  const evidence:Evidence[]=[],spans:OriginalSpan[]=[],omittedSourceIds:string[]=[],roles:ProofResult['roles']={};let context='';
  for(const c of selected){
   // Include strongest sentences; retain original ordering. No generated paraphrase enters context.
   const best=c.pieces[0]!.score;const pieces=c.pieces.filter(p=>p.score>=best*.75).slice(0,3).sort((a,b)=>a.start-b.start);
   const kind=c.source.facts.some(f=>f.kind==='character-claim')?'character-claim':'narrative-detail';
   const prefix=`[${c.source.sourceId} turn=${c.source.turnId} type=${kind}; ${kind==='character-claim'?'unverified':'original-prose-only'}]`;
   const full=context+(context?'\n\n':'')+prefix+'\n'+pieces.map(p=>p.text).join('');
   if(estimateTokens(full)>budget){omittedSourceIds.push(c.source.sourceId);continue;}
   context=full;roles[c.source.sourceId]='direct';evidence.push({...c.source,facts:[],factStates:[]});
   for(const p of pieces)spans.push({sourceId:c.source.sourceId,turnId:c.source.turnId,start:p.start,end:p.end,text:p.text,originalSha256:hash(c.source.narrative),kind,authority:kind==='character-claim'?'unverified':'original-prose-only',factIds:[]});
  }
  const diagnosis=ambiguous?'ambiguous-entity':future?'alias-not-yet-established':!selected.length?'no-readable-support':omittedSourceIds.length?'budget-missing-source':'original-prose-support';
  return {strategy,ranked:selected.map(c=>c.source),evidence,context,spans,originalSpans:spans,roles,candidateAudit:selected.map(c=>({sourceId:c.source.sourceId,role:'direct',reason:'authorized entity and lexical/facet evidence; original prose is not a rule fact'})),diagnosis,omittedSourceIds,enoughEvidence:evidence.length>0&&!omittedSourceIds.length,reason:diagnosis+'; no generated answer; original prose is not authoritative world state',estimatedTokens:estimateTokens(context),tokenMethod,contextBytes:Buffer.byteLength(context),elapsedMs:performance.now()-started,intent:{mode:'prose',temporal}};
 }
 private provenance(r:ProofResult,q:Query):OriginalSpan[]{return r.spans.map(p=>{const s=this.typed.byId.get(p.sourceId)!;const claim=s.facts.some(f=>f.kind==='character-claim');return {...p,turnId:s.turnId,originalSha256:hash(s.narrative),kind:claim?'character-claim':'narrative-detail',authority:claim?'unverified':'original-prose-only',factIds:r.evidence.find(e=>e.sourceId===s.sourceId)?.facts.map(f=>f.id)??[]};});}
}
