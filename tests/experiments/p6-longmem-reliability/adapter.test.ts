import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {DiskRecall,attachment,originalInput,writeRegistry} from './adapter.ts';
import {corpusDigest} from './workload.ts';
import type {Dataset,Query} from '../p6-longmem/types.ts';
const require=createRequire(import.meta.url),{ReliableStore,digest}=require('./store.cjs');
const root=path.dirname(fileURLToPath(import.meta.url)),scratch=fs.mkdtempSync(path.join(root,'.scratch-'));
after(()=>{const real=fs.realpathSync(scratch);assert.ok(real.startsWith(fs.realpathSync(root)+path.sep+'.scratch-'));fs.rmSync(real,{recursive:true});});
const scope={ownerId:'a',saveId:'save',branchId:'root'};
const data:Dataset={schemaVersion:1,synthetic:true,entities:[{id:'yao',name:'姚镜',aliases:[],kind:'person'},{id:'observer',name:'旁观者',aliases:[],kind:'person'},{id:'outsider',name:'未在场者',aliases:[],kind:'person'}],turns:[
  {sourceId:'s1',turnId:1,gameMinute:0,gameTime:'晨',participants:['yao'],location:'合成庭院',items:[],narrative:'姚镜穿着青袍，袖口缝着三颗白扣。\r\n她说：“留住这张纸。”😀  ',eventIds:[],tags:[],facts:[],historicalSources:[],authorizedNpcIds:['observer']},
  {sourceId:'s2',turnId:2,gameMinute:72,gameTime:'午',participants:['yao'],location:'合成庭院',items:[],narrative:'姚镜自称是守门人，未实地证实。',eventIds:[],tags:['传闻'],facts:[{id:'rumor',subject:'yao',predicate:'身份传闻',value:'守门人',kind:'character-claim',validFrom:2}],historicalSources:['s1'],authorizedNpcIds:['observer']},
  {sourceId:'s3',turnId:3,gameMinute:144,gameTime:'晚',participants:['yao'],location:'合成庭院',items:[],narrative:'姚镜头发系着秘密朱绳。',eventIds:[],tags:[],facts:[],historicalSources:[],authorizedNpcIds:[]}
]};
function make(name:string,patch?:(s:any)=>void){const file=path.join(scratch,name+'.sqlite'),s=new ReliableStore(file);writeRegistry(s,scope,data);for(const source of data.turns){const r=originalInput(scope,source),a=attachment(source);if(patch)patch({r,a});s.save(r,a);}s.close();return file;}
const q=(text:string,audience:Query['audience']={kind:'player'},asOfTurn=3):Query=>({text,asOfTurn,audience});
test('disk-restored original bytes, SHA and UTF-16 spans agree with retrieval',()=>{
 const recall=new DiskRecall(make('bytes'),scope,3),query=q('姚镜最早的衣着');const result=recall.search(query);
 assert.ok(result.originalSpans.length);for(const p of result.originalSpans){const raw=recall.original(p.sourceId,query)!;assert.equal(raw.narrative.slice(p.start,p.end),p.text);assert.equal(digest(Buffer.from(raw.narrative)),p.originalSha256);}
 assert.equal(recall.original('s1',query)?.narrative,data.turns[0]!.narrative);recall.close();
});
test('NPC permission precedes index construction and also guards direct full-text reads',()=>{
 const recall=new DiskRecall(make('acl'),scope,3);
 const outsider=q('姚镜最早的衣着',{kind:'npc',npcId:'outsider'});assert.equal(recall.search(outsider).ranked.length,0);assert.equal(recall.original('s1',outsider),undefined);
 const observer=q('姚镜头发的原文细节',{kind:'npc',npcId:'observer'});assert.equal(recall.search(observer).ranked.length,0);assert.equal(recall.original('s3',observer),undefined);
 assert.ok(recall.search(q('姚镜最早的衣着',{kind:'npc',npcId:'observer'})).context.includes('三颗白扣'));recall.close();
});
test('revision, as-of, ranges and owner/branch scope prevent future and cross-save reads',()=>{
 const file=make('limits'),recall=new DiskRecall(file,scope,2);
 assert.throws(()=>recall.search(q('姚镜', {kind:'player'},3)));assert.equal(recall.original('s2',q('姚镜',{kind:'player'},1)),undefined);
 assert.equal(recall.original('s1',{...q('姚镜',{kind:'player'},2),turnRange:[2,2]}),undefined);
 assert.throws(()=>new DiskRecall(file,{...scope,ownerId:'b'},2));assert.throws(()=>new DiskRecall(file,{...scope,branchId:'fork'},2));
 assert.throws(()=>recall.search({...q('姚镜',{kind:'player'},2),audience:{kind:'bogus'} as any}));recall.close();
});
test('claims stay unverified and narrative details never become rule facts',()=>{
 const recall=new DiskRecall(make('facts'),scope,3);const claim=recall.search(q('姚镜的身份传闻是什么？'));
 assert.ok(claim.evidence.some(s=>s.facts.some(f=>f.id==='rumor')));assert.ok(claim.evidence.flatMap(s=>s.factStates).every(f=>f.status==='unverified'));
 assert.ok(claim.originalSpans.every(s=>s.authority==='unverified'));
 const prose=recall.search(q('姚镜最早的衣着'));assert.ok(prose.evidence.every(s=>s.facts.length===0));assert.ok(prose.originalSpans.every(s=>s.authority==='original-prose-only'));recall.close();
});
test('missing, null or mismatched permission snapshots fail closed during restoration',()=>{
 for(const mode of ['null','mismatch','acl']){const f=make('bad-'+mode,({r,a})=>{if(mode==='null')r.visibilitySnapshotId=null;else if(mode==='mismatch')a.visibility.snapshotId='different';else a.visibility.authorizedNpcIds=[];});assert.throws(()=>new DiskRecall(f,scope,3));}
});
test('full-original reads reveal later disk damage instead of trusting cached plaintext',()=>{
 const file=make('cache'),recall=new DiskRecall(file,scope,3);
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file);db.exec('DROP TRIGGER originals_no_update');db.prepare("UPDATE originals SET integrity='bad' WHERE source_id='s1'").run();db.close();
 assert.throws(()=>recall.original('s1',q('姚镜')),e=>(e as any).code==='CORRUPT_RECORD');recall.close();
});
test('corpus checksum preserves exact text but is independent of metadata key insertion order',()=>{
 const {canonical}=require('./store.cjs');const reordered=JSON.parse(canonical(data.turns));
 assert.equal(corpusDigest(data.turns),corpusDigest(reordered));reordered[0].narrative+=' ';
 assert.notEqual(corpusDigest(data.turns),corpusDigest(reordered));
});
test('legacy world-event labels without confirmed rule events remain raw provenance, never authoritative facts',()=>{
 const file=make('unbound',({a})=>{if(a.source.sourceId==='s1')a.source.facts=[{id:'fake-rule',subject:'yao',predicate:'抵达',value:'庭院',kind:'world-event',validFrom:1}];});
 const recall=new DiskRecall(file,scope,3);assert.equal(recall.sources[0]!.facts[0]!.kind,'world-event');
 const original=recall.original('s1',q('姚镜'));assert.equal(original?.facts.length,0);
 const r=recall.search(q('姚镜最早的衣着'));assert.ok(r.context.includes('三颗白扣'));assert.ok(r.evidence.every(s=>s.facts.length===0));assert.ok(r.originalSpans.every(s=>s.authority==='original-prose-only'));recall.close();
});
