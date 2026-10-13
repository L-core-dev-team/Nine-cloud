// Offline, whole-source authorization simulation. Never imported by production.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {LexicalIndex} from '../p6-longmem-lexical/retrieval.ts';
import type {Dataset, Source, Query} from '../p6-longmem/types.ts';
const require = createRequire(import.meta.url);
const {ReliableStore, canonical} = require('./store.cjs');
export type Scope = {ownerId:string;saveId:string;branchId:string};
export const registryId = '@p6-registry';
export function originalInput(scope:Scope, s:Source) {
  return {...scope, sourceId:s.sourceId,revision:s.turnId,idempotencyKey:`turn-request:${s.sourceId}`,narrativeText:s.narrative,generationVersion:'synthetic-frozen-v1',visibilitySnapshotId:`visibility:${s.sourceId}`};
}
export function attachment(s:Source) {
  const {narrative, ...source} = s;
  return {kind:'source',source,visibility:{snapshotId:`visibility:${s.sourceId}`,authorizedNpcIds:[...s.authorizedNpcIds]}};
}
export function writeRegistry(store:InstanceType<typeof ReliableStore>, scope:Scope, data:Dataset & {aliasSince?:object}) {
  return store.save({...scope,sourceId:registryId,revision:0,idempotencyKey:registryId,narrativeText:'Synthetic offline identity registry. Not Canon or an authorization grant.',generationVersion:'synthetic-frozen-v1',visibilitySnapshotId:null},
    {kind:'registry',schemaVersion:1,synthetic:true,entities:data.entities,maxTurn:data.turns.length,aliasSince:data.aliasSince??{}});
}
function validateSource(entry:any):Source {
  const a=entry.attachment, r=entry.record;
  assert.equal(a?.kind,'source','Missing source metadata');
  assert.deepEqual(Object.keys(a).sort(),['kind','source','visibility']);
  const s=a.source;
  assert.deepEqual(Object.keys(s).sort(),['sourceId','turnId','gameMinute','gameTime','participants','location','items','eventIds','tags','facts','historicalSources','authorizedNpcIds'].sort());
  assert.equal(s.sourceId,r.sourceId);assert.equal(s.turnId,r.revision);assert.ok(Number.isSafeInteger(s.turnId)&&s.turnId>=1);
  assert.ok(Number.isSafeInteger(s.gameMinute)&&s.gameMinute>=0);assert.equal(typeof s.gameTime,'string');assert.equal(typeof s.location,'string');
  for(const k of ['participants','items','eventIds','tags','historicalSources','authorizedNpcIds'])assert.ok(Array.isArray(s[k])&&s[k].every((v:unknown)=>typeof v==='string'));
  assert.ok(Array.isArray(s.facts));
  for(const f of s.facts){
    for(const k of ['id','subject','predicate','value'])assert.equal(typeof f[k],'string');
    assert.ok(['world-event','narrative-detail','character-claim'].includes(f.kind));assert.equal(f.validFrom,s.turnId);
    if(f.validUntil!==undefined)assert.ok(Number.isSafeInteger(f.validUntil)&&f.validUntil>f.validFrom);
    if(f.kind==='world-event')assert.ok(s.eventIds.includes(f.confirmedBy),'World event requires a confirmed rule event');
    else assert.equal(f.confirmedBy,undefined,'Prose or claim cannot become a confirmed world fact');
  }
  assert.deepEqual(Object.keys(a.visibility).sort(),['authorizedNpcIds','snapshotId']);
  assert.equal(typeof r.visibilitySnapshotId,'string','Null snapshot cannot grant source access');
  assert.equal(a.visibility.snapshotId,r.visibilitySnapshotId,'Snapshot binding mismatch');
  assert.deepEqual(a.visibility.authorizedNpcIds,s.authorizedNpcIds,'Snapshot ACL mismatch');
  return {...structuredClone(s),narrative:r.narrativeText};
}
const placeholder=(turnId:number):Source=>({sourceId:`@unavailable:${turnId}`,turnId,gameMinute:(turnId-1)*72,gameTime:'',participants:[],location:'',items:[],narrative:'',eventIds:[],tags:[],facts:[],historicalSources:[],authorizedNpcIds:[]});
export class DiskRecall {
  store:InstanceType<typeof ReliableStore>;scope:Scope;revision:number;registry:any;entries:Map<string,any>;sources:Source[];
  private views=new Map<string,LexicalIndex>();
  private buildSamples:{key:string;buildMs:number;authorizedSources:number;slots:number}[]=[];
  constructor(file:string,scope:Scope,revision:number){
    this.scope={...scope};this.revision=revision;this.store=new ReliableStore(file,{readOnly:true});
    try{
      const rows=this.store.list(scope,revision), header=rows.find((e:any)=>e.record.sourceId===registryId);
      assert.equal(header?.attachment?.kind,'registry','Missing registry');this.registry=header.attachment;
      assert.equal(this.registry.schemaVersion,1);assert.equal(this.registry.synthetic,true);
      assert.ok(Number.isSafeInteger(this.registry.maxTurn)&&this.registry.maxTurn>=revision&&revision>=1);
      assert.ok(Array.isArray(this.registry.entities));
      const entities=new Set(this.registry.entities.map((e:any)=>e.id));assert.equal(entities.size,this.registry.entities.length);
      for(const e of this.registry.entities){assert.equal(typeof e.id,'string');assert.equal(typeof e.name,'string');assert.ok(['person','place','item'].includes(e.kind));assert.ok(Array.isArray(e.aliases)&&e.aliases.every((a:unknown)=>typeof a==='string'));}
      this.entries=new Map(rows.filter((e:any)=>e.record.sourceId!==registryId).map((e:any)=>[e.record.sourceId,e]));
      this.sources=[...this.entries.values()].map(validateSource);
      const turns=new Set(this.sources.map(s=>s.turnId));assert.equal(turns.size,this.sources.length,'Duplicate turn in this branch');
      for(const s of this.sources){assert.ok(s.turnId<=revision);for(const id of [...s.participants,...s.items,...s.authorizedNpcIds])assert.ok(entities.has(id),'Unknown entity');}
    }catch(e){this.store.close();throw e;}
  }
  private validate(q:Query,budget:number){
    assert.ok(Object.keys(q).every(k=>['text','asOfTurn','audience','turnRange','gameMinuteRange'].includes(k)),'Unknown query binding');
    assert.ok(typeof q.text==='string'&&q.text.trim());assert.ok(Number.isSafeInteger(q.asOfTurn)&&q.asOfTurn>=1&&q.asOfTurn<=this.revision);
    assert.ok(Number.isSafeInteger(budget)&&budget>=1);
    assert.ok(q.audience?.kind==='player'||q.audience?.kind==='npc');
    assert.deepEqual(Object.keys(q.audience).sort(),q.audience.kind==='npc'?['kind','npcId']:['kind']);
    if(q.audience.kind==='npc')assert.ok(this.registry.entities.some((e:any)=>e.id===(q.audience as {npcId:string}).npcId&&e.kind==='person'),'Unknown NPC');
    for(const range of [q.turnRange,q.gameMinuteRange])if(range)assert.ok(range.length===2&&range.every(Number.isSafeInteger)&&range[0]>=0&&range[1]>=range[0]);
  }
  private readable(s:Source,q:Query){return s.turnId<=q.asOfTurn&&(q.audience.kind==='player'||s.authorizedNpcIds.includes(q.audience.npcId));}
  private view(q:Query){
    const key=canonical({audience:q.audience,asOfTurn:q.asOfTurn});const cached=this.views.get(key);if(cached)return cached;
    // Filter before index construction, not after scoring. Dense empty slots only satisfy the unchanged old engine's turn-count validation.
    const start=performance.now();const turns=Array.from({length:this.revision},(_,i)=>placeholder(i+1));
    const visible=this.sources.filter(s=>this.readable(s,q));
    const visibleIds=new Set(visible.map(s=>s.sourceId)),factIds=new Set(visible.flatMap(s=>s.facts.map(f=>f.id)));
    const successor=new Set(visible.flatMap(s=>s.facts.flatMap(f=>f.supersedes?[f.supersedes]:[])));
    for(const s of visible){
      const copy=structuredClone(s);copy.historicalSources=copy.historicalSources.filter(id=>visibleIds.has(id));
      for(const f of copy.facts){if(f.validUntil!==undefined&&(f.validUntil>q.asOfTurn||!successor.has(f.id)))delete f.validUntil;if(f.supersedes&&!factIds.has(f.supersedes))delete f.supersedes;}
      if(q.audience.kind==='npc')copy.authorizedNpcIds=[q.audience.npcId];turns[s.turnId-1]=copy;
    }
    const data={schemaVersion:1 as const,synthetic:true as const,entities:structuredClone(this.registry.entities),aliasSince:structuredClone(this.registry.aliasSince),turns};
    const index=new LexicalIndex(data);this.buildSamples.push({key,buildMs:performance.now()-start,authorizedSources:visible.length,slots:turns.length});if(this.views.size>=4)this.views.delete(this.views.keys().next().value!);this.views.set(key,index);return index;
  }
  search(q:Query,budget=2048){
    this.validate(q,budget);const result=this.view(q).search(q,budget);
    for(const s of result.ranked){const current=this.store.load(this.scope,s.sourceId);assert.equal(current?.integrity,this.entries.get(s.sourceId)?.integrity,'Disk provenance changed after snapshot');}
    return result;
  }
  original(sourceId:string,q:Query){
    this.validate(q,1);const entry=this.entries.get(sourceId);if(!entry)return undefined;
    const s=validateSource(entry);if(!this.readable(s,q))return undefined;
    if(q.turnRange&&(s.turnId<q.turnRange[0]||s.turnId>q.turnRange[1])||q.gameMinuteRange&&(s.gameMinute<q.gameMinuteRange[0]||s.gameMinute>q.gameMinuteRange[1]))return undefined;
    const disk=this.store.load(this.scope,sourceId);assert.equal(disk?.integrity,entry.integrity,'Disk source changed');
    return this.view(q).original(sourceId,q);
  }
  close(){this.views.clear();this.store.close();}
  measurements(){return structuredClone(this.buildSamples);}
}
