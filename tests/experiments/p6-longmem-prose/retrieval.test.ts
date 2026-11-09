import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ProseIndex} from './retrieval.ts';
import {temporalIntent} from './intent.ts';
import {generateDataset} from '../p6-longmem/dataset.ts';
import type {Dataset,Query} from '../p6-longmem/types.ts';
const data=JSON.parse(readFileSync(new URL('./fixtures/history-1000.json',import.meta.url),'utf8')) as Dataset;
const index=new ProseIndex(data);const q=(text:string,asOfTurn=1000):Query=>({text,asOfTurn,audience:{kind:'player'}});
test('temporal lexical boundaries cover compounds, location questions and explicit time',()=>{
 for(const t of ['出现在哪里','体现在衣服上','表现在脸上','发现在场者','呈现在眼前','重现在雨夜','再现在哪里','现在场的人是谁','对白“现在走”出现在哪里'])assert.equal(temporalIntent(t),'ordinary',t);
 for(const t of ['现在由谁保管','当前关系如何','目前是谁持有','如今身份是什么','此刻天气如何','截至第八回合的归属','最新一段原文'])assert.equal(temporalIntent(t),'current',t);
 for(const t of ['当时的衣着','最早遇见谁','此前关系如何','最初的气味','初次穿什么','以前是否知道'])assert.equal(temporalIntent(t),'historical',t);
});
test('no fact labels required, including sources carrying unrelated world facts',()=>{
 const r=index.search(q('陆砚初次穿什么衣裳？'));assert.equal(r.evidence[0]?.sourceId,'p0011');assert.ok(r.context.includes('三颗白扣'));assert.ok(r.evidence.every(s=>s.facts.length===0));
});
test('verbatim dialogue includes closing quotation, with exact UTF-16 offsets and hash',()=>{
 const r=index.search(q('沈禾提到风时怎样说？'));assert.ok(r.context.includes('她说：“等风停了再走。”'));
 for(const s of r.originalSpans){const raw=index.original(s.sourceId,q('沈禾'))!;assert.equal(raw.narrative.slice(s.start,s.end),s.text);assert.equal(createHash('sha256').update(raw.narrative).digest('hex'),s.originalSha256);assert.equal(s.turnId,raw.turnId);}
});
test('query and original recovery enforce the same NPC permissions',()=>{
 const npc:Query={...q('纸鹤亭木栏的气味是什么？'),audience:{kind:'npc',npcId:'outsider'}};
 assert.equal(index.search(npc).ranked.length,0);assert.equal(index.original('p0011',npc),undefined);
 const observer={...npc,audience:{kind:'npc' as const,npcId:'observer'}};assert.ok(index.search(observer).evidence.length);assert.ok(index.original('p0011',observer));
});
test('as-of and explicit ranges forbid future sources and do not leak future aliases',()=>{
 assert.equal(index.search(q('陆砚衣着',10)).ranked.length,0);
 assert.equal(index.search({...q('陆砚衣着'),turnRange:[200,300]}).ranked.length,0);
 assert.equal(index.search({...q('陆砚衣着'),gameMinuteRange:[2000,3000]}).ranked.length,0);
});
test('earliest and latest describe narration time, preserving original provenance',()=>{
 assert.equal(index.search(q('陆砚最早一段原文的衣着')).evidence[0]?.turnId,11);
 const r=index.search(q('陆砚最新一段原文的衣着'));assert.equal(r.evidence[0]?.turnId,701);assert.equal(r.originalSpans[0]?.authority,'original-prose-only');
});
test('same names require unique identity and all explicit entities must match',()=>{
 assert.equal(index.search(q('周寻的衣着')).ranked.length,0);assert.equal(index.search(q('山口画师的衣着')).evidence[0]?.turnId,330);
 assert.equal(index.search(q('陆砚在残月廊的衣着')).ranked.length,0);
});
test('unknown concrete detail abstains rather than substituting known clothing',()=>{
 assert.equal(index.search(q('陆砚的翡翠耳坠原文在哪里？')).evidence.length,0);
});
test('tiny budgets omit intact sentences, do not truncate or paraphrase',()=>{
 for(const budget of [1,20,512,1024,2048,4096]){const r=index.search(q('纸鹤亭木栏的气味是什么？'),budget);assert.ok(r.estimatedTokens<=budget);for(const s of r.originalSpans)assert.equal(index.original(s.sourceId,q('纸鹤亭'))!.narrative.slice(s.start,s.end),s.text);if(budget===1){assert.equal(r.enoughEvidence,false);assert.ok(r.omittedSourceIds.length);}}
});
test('retrieval leaves original objects intact and rejects invalid input',()=>{
 const before=JSON.stringify(data);index.search(q('陆砚衣着'));assert.equal(JSON.stringify(data),before);
 assert.throws(()=>index.search(q('',1000)));assert.throws(()=>index.search(q('陆砚衣着',1001)));assert.throws(()=>index.search(q('陆砚'),0));assert.throws(()=>index.search({...q('陆砚'),audience:{kind:'npc',npcId:'nonexistent'}}));
});
test('legacy typed claims and current NPC knowledge retain status and hidden metadata',()=>{
 const old=new ProseIndex(generateDataset(200));const r=old.search(q('沈砚行踪的两种矛盾说法是什么？',200));assert.ok(r.evidence.length);const claims=r.evidence.flatMap(s=>s.factStates).filter(f=>f.kind==='character-claim');assert.ok(claims.length>=2);assert.ok(claims.every(f=>f.status==='unverified'));
 const complex=JSON.parse(readFileSync(new URL('../p6-longmem-hardening/fixtures/complex-history-1000.json',import.meta.url),'utf8')) as Dataset;
 const npc:Query={text:'栖潮埠秘匣当前归属',asOfTurn:600,audience:{kind:'npc',npcId:'p-a0-lead'}};
 const memory=new ProseIndex(complex).search(npc);assert.equal(memory.evidence[0]?.sourceId,'s241');assert.equal(memory.evidence[0]?.facts[0]?.validUntil,undefined);assert.ok(!JSON.stringify(memory).includes('s541'));
});
test('frozen data and answers remain byte-identical; test never parses holdout answers',()=>{
 const lock=JSON.parse(readFileSync(new URL('./fixtures/freeze-manifest.json',import.meta.url),'utf8'));
 for(const f of lock.files)assert.equal(createHash('sha256').update(readFileSync(new URL('./fixtures/'+f.name,import.meta.url))).digest('hex'),f.sha256);
});
test('unavailable best lexical match cannot affect NPC output or leak provenance',()=>{
 const copy=structuredClone(data);copy.turns[19]!.narrative='陆砚的青袍气味三颗白扣秘密。';copy.turns[19]!.participants=['person-0'];copy.turns[19]!.authorizedNpcIds=[];
 const npc:Query={...q('陆砚青袍气味'),audience:{kind:'npc',npcId:'observer'}};
 const r=new ProseIndex(copy).search(npc);assert.ok(!JSON.stringify(r).includes('p0020'));assert.ok(r.ranked.every(s=>s.authorizedNpcIds.includes('observer')));
});
test('budget pressure keeps an overlong original sentence intact and exposes omission',()=>{
 const copy=structuredClone(data);copy.turns[10]!.narrative='陆砚穿着'+('青袍'.repeat(180))+'。';copy.turns[10]!.facts=[];
 const large=new ProseIndex(copy),query=q('陆砚最早的衣着');const low=large.search(query,512),high=large.search(query,1024);
 assert.equal(low.enoughEvidence,false);assert.ok(low.omittedSourceIds.includes('p0011'));assert.ok(high.evidence.some(s=>s.sourceId==='p0011'));
});
