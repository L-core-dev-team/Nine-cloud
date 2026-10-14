import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {LexicalIndex} from './retrieval.ts';import {LexicalIndex as Baseline} from '../p6-longmem-lexical/retrieval.ts';
import type {Dataset,Query} from '../p6-longmem/types.ts';
const audience={kind:'player' as const};const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const sample=(narrative:string):Dataset=>({schemaVersion:1,synthetic:true,entities:[{id:'room',name:'测试阁',aliases:[],kind:'place'},{id:'npc',name:'阿岚',aliases:['岚客'],kind:'person'},{id:'outside',name:'局外人',aliases:[],kind:'person'}],turns:[{sourceId:'sample',turnId:1,gameMinute:0,gameTime:'实验',participants:['npc'],location:'room',items:[],narrative,eventIds:[],tags:[],facts:[],historicalSources:[],authorizedNpcIds:['npc']}]});
const cases:[string,string,string,boolean][]=[
 ['ear flower','阿岚耳后别着一朵干花。','阿岚耳后有什么装饰？',true],
 ['waist flower is not ear','阿岚腰间别着一朵干花。','阿岚耳后有什么装饰？',false],
 ['collar ornament is not ear','阿岚衣襟别着一枚银扣。','阿岚耳后有什么装饰？',false],
 ['waist location','阿岚腰间佩着银环。','阿岚腰间有什么装饰？',true],
 ['collar location','阿岚衣襟别着银扣。','阿岚衣襟有什么装饰？',true],
 ['absent ornament','阿岚耳后没有任何饰物。','阿岚耳后有什么装饰？',false],
 ['unknown ornament','阿岚耳后别着干花。','阿岚耳后的翡翠耳坠原文在哪里？',false],
 ['rain smell','测试阁里，雨落在蕨叶上带起青草味。','测试阁雨里的味道是什么？',true],
 ['rain synonym','测试阁雨天，青草味从湿叶上散开。','测试阁雨中的气味是什么？',true],
 ['sunny smell','测试阁晴天，空气有木香。','测试阁晴天的气味是什么？',true],
 ['sunny not rain','测试阁晴天，空气有木香。','测试阁雨里的味道是什么？',false],
 ['no smell','测试阁雨中没有任何气味。','测试阁雨里的气味是什么？',false],
 ['weather and smell separate sentences','测试阁下着雨。晴天的回忆里有木香。','测试阁雨里的气味是什么？',false],
 ['two weather conditions','测试阁雨中有青草味。晴天时有木香。','测试阁雨里的气味是什么？',true],
 ['physical landing','测试阁里，棋子落在地上弹了两下。','测试阁落地棋子的声音出现在哪里？',true],
 ['other object landing','测试阁里，木珠掉到地上弹了一下。','测试阁落地木珠的声音出现在哪里？',true],
 ['same sentence other object','测试阁里，棋子留在桌上，木珠落在地上发出声响。','测试阁落地棋子的声音出现在哪里？',false],
 ['negation and other object','测试阁里，棋子没有落地，木珠落地发出声响。','测试阁落地棋子的声音出现在哪里？',false],
 ['metaphor','测试阁里，棋子的清点计划终于落地，讨论声很低。','测试阁落地棋子的声音出现在哪里？',false],
 ['simile','测试阁里，棋子仿佛落地发出声响，实际上始终捏在手中。','测试阁落地棋子的声音出现在哪里？',false],
 ['explicit negative query abstains','测试阁里，棋子落地。','测试阁没有落地的棋子声音是什么？',false],
];
for(const [name,text,query,positive] of cases)test(name,()=>{const index=new LexicalIndex(sample(text)),q:Query={text:query,asOfTurn:1,audience};for(const budget of [512,1024,2048,4096]){const r=index.search(q,budget);assert.equal(r.evidence.length>0,positive,JSON.stringify(r));assert.ok(r.estimatedTokens<=budget);for(const p of r.originalSpans){assert.equal(text.slice(p.start,p.end),p.text);assert.equal(p.originalSha256,sha(text));assert.equal(p.authority,'original-prose-only');assert.deepEqual(p.factIds,[]);}if(name==='two weather conditions')assert.ok(!r.context.includes('木香'));}});
test('historical three failures at all budgets, using frozen gold only in evaluator',()=>{const data=JSON.parse(fs.readFileSync(new URL('../p6-longmem-prose/fixtures/history-1000.json',import.meta.url),'utf8'));const gold=JSON.parse(fs.readFileSync(new URL('../p6-longmem-prose/fixtures/holdout.json',import.meta.url),'utf8'));const baseline=new Baseline(data),fixed=new LexicalIndex(data);for(const id of ['H-10-0','H-14-2','H-16-1']){const g=gold.find((g:any)=>g.questionId===id);const q={text:g.text,asOfTurn:g.asOfTurn,audience:g.audience};for(const budget of [512,1024,2048,4096]){assert.equal(baseline.search(q,budget).ranked.length,0);const r=fixed.search(q,budget);assert.deepEqual(r.evidence.map(s=>s.sourceId),g.expectedSourceIds);for(const e of g.expectedSpans)assert.ok(r.originalSpans.some(p=>p.sourceId===e.sourceId&&p.start<=e.start&&p.end>=e.end&&p.text.includes(e.text)));}}});
test('same original and search permission, future boundary and intact budget refusal',()=>{const data=sample('阿岚耳后别着干花。');const idx=new LexicalIndex(data);const q:Query={text:'阿岚耳后的装饰原文',asOfTurn:1,audience:{kind:'npc',npcId:'outside'}};assert.equal(idx.search(q).evidence.length,0);assert.equal(idx.original('sample',q),undefined);const tiny=idx.search({...q,audience},1);assert.equal(tiny.enoughEvidence,false);assert.equal(tiny.originalSpans.length,0);assert.deepEqual(tiny.omittedSourceIds,['sample']);});
