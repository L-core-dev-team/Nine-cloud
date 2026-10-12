// Expectations authored before matcher changes. Baseline initially imports P6-03.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ProseIndex as LexicalIndex} from '../p6-longmem-prose/retrieval.ts';
import type {Dataset,Query} from '../p6-longmem/types.ts';
const data:Dataset={schemaVersion:1,synthetic:true,entities:[
 {id:'yao',name:'姚镜',aliases:[],kind:'person'},{id:'tao',name:'陶隽',aliases:[],kind:'person'},
 {id:'observer',name:'观察者',aliases:[],kind:'person'},{id:'outsider',name:'未在场者',aliases:[],kind:'person'},
 {id:'twin-a',name:'江穗',aliases:['东门画师'],kind:'person'},{id:'twin-b',name:'江穗',aliases:['西门药师'],kind:'person'},
 {id:'stone',name:'青瞳石',aliases:[],kind:'item'},{id:'pin',name:'乌发簪',aliases:[],kind:'item'},
],turns:[
 ['yao','双眼因疲倦泛着血丝。',''],['yao','额前垂着一缕发。',''],['yao','她说：“留住这张纸。”',''],
 ['tao','他发出一声低笑，然后出发。',''],['yao','青瞳石刻着双眼的形状。','stone'],['yao','乌发簪旁垂着一缕发。','pin'],
 ['twin-a','东门画师江穗双眼带着血丝。',''],['twin-b','西门药师江穗双眼十分清亮。',''],
].map(([person,narrative,item],i)=>({sourceId:`x${i+1}`,turnId:i+1,gameMinute:i*10,gameTime:`第${i+1}刻`,participants:[person!],location:'实验庭院',items:item?[item]:[],narrative:narrative!,eventIds:[],tags:[],facts:[],historicalSources:[],authorizedNpcIds:['observer']}))};
const query=(text:string):Query=>({text,asOfTurn:8,audience:{kind:'player'}});
const index=new LexicalIndex(data);
test('eyes: ordinary 眼睛 finds original 双眼 without adding a fact',()=>{
 const r=index.search(query('姚镜眼睛的细节是什么？'));assert.ok(r.context.includes('双眼因疲倦泛着血丝。'));assert.ok(r.evidence.every(s=>s.facts.length===0));
});
test('hair: 头发 finds 一缕发 and returns original bytes',()=>{
 const r=index.search(query('姚镜头发是什么样？'));assert.ok(r.context.includes('额前垂着一缕发。'));for(const p of r.originalSpans){const raw=data.turns.find(s=>s.sourceId===p.sourceId)!;assert.equal(raw.narrative.slice(p.start,p.end),p.text);assert.equal(p.originalSha256,createHash('sha256').update(raw.narrative).digest('hex'));}
});
test('retain request: 留下 matches 留住 only as a verbatim quote',()=>{
 const r=index.search(query('姚镜请求留下什么原话？'));assert.ok(r.context.includes('她说：“留住这张纸。”'));assert.ok(!r.context.includes('她说：“留下这张纸。”'));
});
test('a retain verb alone does not support an unknown requested object',()=>{
 assert.equal(index.search(query('姚镜请求留下铜钱的原话是什么？')).ranked.length,0);
});
test('eyes are not an eye disease: unknown concrete condition abstains',()=>{
 assert.equal(index.search(query('姚镜眼疾的原文细节是什么？')).evidence.length,0);
});
test('发出 and 出发 are not hair synonyms',()=>{
 assert.equal(index.search(query('陶隽头发的原文细节是什么？')).evidence.length,0);
});
test('same names stay ambiguous; unique identity never combines twins',()=>{
 assert.equal(index.search(query('江穗眼睛的细节是什么？')).ranked.length,0);
 const r=index.search(query('东门画师眼睛的细节是什么？'));assert.ok(r.evidence.some(s=>s.sourceId==='x7'));assert.ok(r.ranked.every(s=>!s.participants.includes('twin-b')));
});
test('different items remain distinct even when matching body vocabulary',()=>{
 const r=index.search(query('青瞳石眼睛的细节是什么？'));assert.ok(r.evidence.some(s=>s.sourceId==='x5'));assert.ok(r.ranked.every(s=>s.items.includes('stone')));
 assert.equal(index.search(query('青瞳石头发的原文细节是什么？')).ranked.length,0);
});
test('synonym matching cannot expose unauthorized original sources',()=>{
 const q={...query('姚镜眼睛的细节是什么？'),audience:{kind:'npc' as const,npcId:'outsider'}};
 assert.equal(index.search(q).ranked.length,0);assert.equal(index.original('x1',q),undefined);
});
test('rumors keep unverified status instead of becoming world facts',()=>{
 const copy=structuredClone(data);copy.turns[0]!.narrative='姚镜自称是守门人，这个说法尚未证实。';copy.turns[0]!.facts=[{id:'rumor',subject:'yao',predicate:'身份传闻',value:'守门人',kind:'character-claim',validFrom:1}];
 const r=new LexicalIndex(copy).search(query('姚镜的身份传闻是什么？'));assert.ok(r.evidence.length);assert.ok(r.evidence.flatMap(s=>s.factStates).filter(f=>f.kind==='character-claim').every(f=>f.status==='unverified'));assert.ok(r.originalSpans.every(s=>s.authority==='unverified'));
});
test('time boundaries and all four budgets retain original safety rules',()=>{
 assert.equal(index.search({...query('姚镜头发是什么样？'),asOfTurn:1}).ranked.length,0);
 for(const budget of [512,1024,2048,4096]){const r=index.search(query('姚镜眼睛的细节是什么？'),budget);assert.ok(r.context.includes('双眼因疲倦泛着血丝。'));assert.ok(r.estimatedTokens<=budget);}
});
