import { performance } from 'node:perf_hooks';
import type { Dataset, Evidence, Query, Retrieval, Source } from '../p6-longmem/types.ts';
import { HistoryIndex, estimateTokens, tokenMethod } from '../p6-longmem/retrieval.ts';

export type ProofRole = 'direct' | 'necessary-background' | 'weak' | 'irrelevant';
export type Span = { sourceId: string; start: number; end: number; text: string };
export type ProofResult = Retrieval & { roles: Record<string, ProofRole>; spans: Span[]; diagnosis: string; candidateAudit: {sourceId:string;role:ProofRole;reason:string}[] };
const intents: [RegExp, RegExp][] = [
  [/初遇|初次|见面.*地点/, /初遇/], [/赠|交给|来源/, /来源/],
  [/归属|持有|归谁|保管|转手|转交|购买|买下/, /归属/],
  [/关系|态度|戒备|信任|疏远/, /关系|态度/], [/约定|承诺|兑现|期限/, /约定/],
  [/伏笔|刻痕|短线/, /刻痕|伏笔/], [/身份|伪装|更名/, /身份|伪装|更名/],
  [/传闻|谣言|说法|自称/, /传闻|说法|身份/], [/秘密|密信|暗格/, /秘密|密信/],
  [/封面/, /封面/], [/气味/, /气味/], [/通行|封闭|开放/, /通行/],
  [/重逢|再次遇/, /重逢/], [/同行/, /同行/], [/工程|进度|批次/, /工程进度/],
  [/看法|主观|观点/, /看法/],
];
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function bigrams(s: string) { const a = [...norm(s)]; return new Set(a.slice(1).map((c,i) => a[i]! + c)); }

/** Independent offline index. No gold-question IDs/answers are consulted. */
export class HardenedIndex {
  data: Dataset;
  byId: Map<string, Source>;
  factSource: Map<string, Source>;
  successor: Map<string, Source>;
  documents: { source: Source; grams: Set<string> }[];
  recentIndex?: HistoryIndex;
  constructor(data: Dataset) {
    this.data = data;
    this.byId = new Map(data.turns.map(s => [s.sourceId,s]));
    this.factSource = new Map(); this.successor = new Map();
    for (const s of data.turns) for (const f of s.facts) {
      this.factSource.set(f.id,s); if (f.supersedes) this.successor.set(f.supersedes,s);
    }
    this.documents = data.turns.map(source => ({ source, grams: bigrams(source.narrative) }));
  }
  readable(s: Source, q: Query) { return s.turnId <= q.asOfTurn && (q.audience.kind === 'player' || s.authorizedNpcIds.includes(q.audience.npcId)); }
  visible(s: Source, q: Query) { return this.readable(s,q) && (!q.turnRange || s.turnId >= q.turnRange[0] && s.turnId <= q.turnRange[1]) && (!q.gameMinuteRange || s.gameMinute >= q.gameMinuteRange[0] && s.gameMinute <= q.gameMinuteRange[1]); }
  materialize(s: Source, q: Query, score: number): Evidence {
    const facts = s.facts.map(f => {
      const known = {...f}; const next = this.successor.get(f.id);
      if (known.validUntil !== undefined && (known.validUntil > q.asOfTurn || q.audience.kind === 'npc' && (!next || !this.readable(next,q)))) delete known.validUntil;
      const previous = known.supersedes && this.factSource.get(known.supersedes);
      if (known.supersedes && (!previous || !this.readable(previous,q))) delete known.supersedes;
      return known;
    });
    return {...s, facts, score, historicalSources:s.historicalSources.filter(id => {const x=this.byId.get(id); return x && this.readable(x,q);}),
      factStates:facts.map(f => ({factId:f.id,kind:f.kind,status:f.kind==='character-claim'?'unverified':f.validUntil!==undefined?'historical':'current',validity:f.kind==='character-claim'?'unverified':f.validUntil!==undefined?'expired':'active'}))};
  }
  search(q: Query, budget=1024, strategy: 'historical'|'recent'='historical'): ProofResult {
    const started=performance.now();
    if (!q.text.trim() || !Number.isSafeInteger(q.asOfTurn) || q.asOfTurn<1 || q.asOfTurn>this.data.turns.length || !Number.isSafeInteger(budget) || budget<1) throw new TypeError('Invalid query/budget');
    if (q.turnRange && (!q.turnRange.every(Number.isSafeInteger) || q.turnRange[0]<1 || q.turnRange[0]>q.turnRange[1])) throw new TypeError('Invalid turn range');
    if (q.gameMinuteRange && (!q.gameMinuteRange.every(Number.isSafeInteger) || q.gameMinuteRange[0]<0 || q.gameMinuteRange[0]>q.gameMinuteRange[1])) throw new TypeError('Invalid time range');
    if(q.audience.kind==='npc' && !this.data.entities.some(e=>e.kind==='person'&&e.id===(q.audience as {npcId:string}).npcId)) throw new TypeError('Unknown NPC');
    if(strategy==='recent') { this.recentIndex??=new HistoryIndex(this.data); const r=this.recentIndex.search(q,budget,'recent'); return {...r,roles:{},spans:[],diagnosis:'recent-unverified',candidateAudit:[]}; }
    const text=q.text;
    const aliasSince=(this.data as Dataset & {aliasSince?:Record<string,Record<string,number>>}).aliasSince;
    const futureAlias=this.data.entities.some(e=>e.aliases.some(a=>text.includes(a)&&(aliasSince?.[e.id]?.[a]??1)>q.asOfTurn));
    const matches=this.data.entities.filter(e=>e.id!=='p-player').flatMap(e=>[e.id,e.name,...e.aliases].filter(a=>text.includes(a) && (aliasSince?.[e.id]?.[a]??1)<=q.asOfTurn).map(alias=>({entity:e,alias})));
    // A location contained in a longer item/person name is not another query entity.
    const explicit=matches.filter(m=>!matches.some(other=>other.alias.length>m.alias.length && other.alias.includes(m.alias)));
    const entities=[...new Map(explicit.map(m=>[m.entity.id,m.entity])).values()];
    const ambiguous=entities.some(e=>entities.some(other=>other.id!==e.id && other.name===e.name) && !explicit.some(m=>m.entity.id===e.id && !explicit.some(other=>other.entity.id!==e.id && other.alias===m.alias)));
    const items=entities.filter(e=>e.kind==='item').map(e=>e.id);
    const people=entities.filter(e=>e.kind==='person' && (q.audience.kind!=='npc'||e.id!==q.audience.npcId)).map(e=>e.id);
    const subjects=items.length?items:people;
    const event=text.match(/\be\d{3,4}-[a-z]+\b/i)?.[0];
    const chain=/变化|经过|前后|分别|哪些来源|全部|完整|从.+到|后来.*兑现|伏笔.*揭晓|交织|旧案/.test(text);
    const now=/现在|当前|截至/.test(text), first=/第一次|最初|最早|初遇|初次/.test(text);
    let predicates=intents.filter(([r])=>r.test(text)).map(([,r])=>r);
    if (/交给了我什么|交给我哪些物品|赠给|来自何处/.test(text)) predicates=[/来源/];
    if (/约定|承诺/.test(text)) predicates=[/约定/];
    if (/真实身份/.test(text)&&!chain&&!/伪装/.test(text)) predicates=[/真实身份|^身份$/];
    if (/自称/.test(text)&&first) predicates=[/自称身份|身份说法|身份传闻/];
    if (/守墓人/.test(text)&&/传闻/.test(text)&&!/证实/.test(text)) predicates=[/身份传闻/];
    if (/守墓人/.test(text)&&/正式证实/.test(text)) predicates=[/^身份$|真实身份/];
    const actions=['盗走','烧毁','击败','结为道侣','获得王位','杀害','销毁','出售'].filter(a=>text.includes(a));
    const giftObject=text.match(/(?:把|将)([^，。？]+?)(?:送给|赠给|交给|转交给)/)?.[1];
    const queryGrams=bigrams(text);
    const raw = this.documents.filter(({source:s})=>this.visible(s,q));
    let selected = ambiguous||futureAlias?[]:raw.filter(({source:s,grams})=>{
      if(actions.length&&!actions.every(a=>s.narrative.includes(a))) return false;
      if(event) return s.eventIds.includes(event);
      if(giftObject&&!s.narrative.includes(giftObject)) return false;
      if(items.length&&!items.some(id=>s.items.includes(id)||s.facts.some(f=>f.subject===id))) return false;
      if(!items.length&&people.length&&!people.some(id=>s.participants.includes(id)||s.facts.some(f=>f.subject===id))) return false;
      if(items.length&&people.length&&/转交|购买|买下/.test(text)&&!people.every(id=>s.participants.includes(id))) return false;
      if(/购买|买下/.test(text)&&!s.narrative.includes('买下')&&!s.narrative.includes('购买')) return false;
      if(/转交/.test(text)&&!s.narrative.includes('转交')&&!s.tags.includes('转交')) return false;
      const relevant=s.facts.filter(f=>(!subjects.length||subjects.includes(f.subject)||/约定/.test(f.predicate)||!items.length&&/来源/.test(f.predicate)&&people.some(id=>s.participants.includes(id)))&&predicates.some(p=>p.test(f.predicate)));
      if(relevant.length) return true;
      // Prose has no rule labels: demand entity anchoring and lexical evidence.
      const overlap=[...queryGrams].filter(g=>grams.has(g)).length;
      return s.facts.length===0&&entities.length>0&&overlap>=2&&predicates.some(p=>p.test(s.narrative));
    }).map(({source:s})=>this.materialize(s,q,100));
    if(!event && now && !chain) {
      selected=selected.filter(s=>s.facts.some(f=>(!subjects.length||subjects.includes(f.subject))&&predicates.some(p=>p.test(f.predicate))&&f.kind!=='character-claim'&&f.validUntil===undefined));
    }
    if(!event && first && !chain && selected.length) {
      // Keep earliest independent provenance for each requested entity/predicate.
      const seen=new Set<string>(); selected=selected.sort((a,b)=>a.turnId-b.turnId).filter(s=> {
        const keys=s.facts.filter(f=>predicates.some(p=>p.test(f.predicate))).map(f=>f.subject+'/'+f.predicate);
        if(keys.every(k=>seen.has(k)))return false; keys.forEach(k=>seen.add(k));return true;
      });
    }
    // Explicit transition endpoints refer to the first contiguous occurrence of that change.
    const transition=text.match(/从(戒备|信任|疏远)(?:变为|到)(戒备|信任|疏远)/);
    if(transition) {
      const chronological=selected.sort((a,b)=>a.turnId-b.turnId);
      const i=chronological.findIndex((s,j)=>s.facts.some(f=>f.value===transition[1])&&chronological[j+1]?.facts.some(f=>f.value===transition[2]));
      selected=i<0?[]:chronological.slice(i,i+2);
    }
    const roles:Record<string,ProofRole>={}; selected.forEach(s=>roles[s.sourceId]='direct');
    if(chain&&/伏笔|交织/.test(text)) {
      const queue=[...selected], seen=new Set(queue.map(s=>s.sourceId));
      for(const s of queue)for(const id of s.historicalSources){const prev=this.byId.get(id);if(prev&&!seen.has(id)&&this.visible(prev,q)){const proof=this.materialize(prev,q,90); selected.push(proof);queue.push(proof);seen.add(id);roles[id]='necessary-background';}}
    }
    selected.sort((a,b)=>a.turnId-b.turnId);
    const candidateAudit=raw.map(({source:s})=>({sourceId:s.sourceId,role:roles[s.sourceId]??(entities.some(e=>s.items.includes(e.id)||s.participants.includes(e.id))?'weak':'irrelevant'),reason:roles[s.sourceId]?'typed predicate or required historical link':'entity co-occurrence alone cannot support query'} as const));
    const spans:Span[]=[], evidence:Evidence[]=[],omittedSourceIds:string[]=[];
    let context='';
    for(const s of selected) {
      const facts=s.facts.filter(f=>event||!predicates.length||predicates.some(p=>p.test(f.predicate)));
      // Whole original sentences only, offsets use JavaScript UTF-16 units.
      const sentences=[...s.narrative.matchAll(/[^。！？]+[。！？]?/gu)];
      let picked=sentences.filter(m=>predicates.some(p=>p.test(m[0])) || facts.some(f=>m[0].includes(f.value)));
      if(!picked.length || !facts.length) picked=sentences;
      const partSpans=picked.map(m=>({sourceId:s.sourceId,start:m.index!,end:m.index!+m[0].length,text:m[0]}));
      const factLines=facts.map(f=>`${f.id} ${f.subject}/${f.predicate}=${f.value} [${s.factStates.find(x=>x.factId===f.id)!.status};${f.kind}]`).join('\n');
      const piece=`[${s.sourceId} turn=${s.turnId}]\n`+partSpans.map(x=>x.text).join('')+(factLines?'\n'+factLines:'');
      const candidate=context+(context?'\n\n':'')+piece;
      if(estimateTokens(candidate)>budget){omittedSourceIds.push(s.sourceId);continue;}
      context=candidate; evidence.push({...s,facts,factStates:s.factStates.filter(x=>facts.some(f=>f.id===x.factId))});spans.push(...partSpans);
    }
    const enoughEvidence=evidence.length>0 && (!chain || !omittedSourceIds.length);
    const diagnosis=ambiguous?'ambiguous-entity':futureAlias?'alias-not-yet-established':!selected.length?'no-readable-support':omittedSourceIds.length?'budget-missing-key-source':'selected-support-complete';
    return {strategy,ranked:selected,evidence,context,spans,roles,diagnosis,candidateAudit,omittedSourceIds,enoughEvidence,
      reason:diagnosis+'; source claims retain unverified status; no generated answer',estimatedTokens:estimateTokens(context),tokenMethod,contextBytes:Buffer.byteLength(context),elapsedMs:performance.now()-started};
  }
}
