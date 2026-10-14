import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {LexicalIndex} from '../p6-longmem-06/retrieval.ts';
import {units,selectProof,sha} from '../p6-longmem-06/evidence.ts';
import type {Dataset,Source,Fact} from '../p6-longmem/types.ts';

const entities:Dataset['entities']=[{id:'speaker',name:'岑苇',aliases:[],kind:'person'},{id:'other',name:'杜桐',aliases:[],kind:'person'},{id:'item',name:'赤玉符',aliases:[],kind:'item'}];
const event='岑苇把赤玉符交给玩家，随后赤玉符被消耗于阵门，归属不再有效。';
const fact:Fact={id:'spent',subject:'item',predicate:'归属',value:'已消耗',kind:'world-event',validFrom:1,confirmedBy:'receipt'};
const source=(narrative:string,sourceId='source'):Source=>({sourceId,narrative,turnId:1,gameMinute:1,gameTime:'离线',participants:['speaker'],items:['item'],location:'',eventIds:['receipt'],tags:[],facts:[{...fact}],historicalSources:[],authorizedNpcIds:['speaker']});
const data=(turns:Source[]):Dataset=>({schemaVersion:1,synthetic:true,entities,turns});
const query={text:'赤玉符当前归属？',asOfTurn:1,audience:{kind:'player' as const}};

// Deliberately unsafe diagnostics. Never imported by a retriever, never an accepted recovery.
// A freshly parsed suffix looks closed only because the original quote stack was discarded.
function punctuationRestart(text:string){return [...text.matchAll(/[。！？]/gu)].flatMap(m=>units(text.slice(m.index!+1)).filter(u=>u.closed).map(u=>({...u,start:u.start+m.index!+1,end:u.end+m.index!+1})));}
function paragraphRestart(text:string){return text.split(/\n\s*\n/u).flatMap(part=>units(part).filter(u=>u.closed));}

test('frozen consumed evidence: four budgets remain strict failures, not mislabeled successful refusals',()=>{
 const prefix=new URL('../p6-longmem-05c/fixtures/holdout-10000-',import.meta.url);
 const read=(suffix:string)=>JSON.parse(gunzipSync(fs.readFileSync(fileURLToPath(prefix)+suffix)).toString('utf8'));
 const d=read('dataset.json.gz'),qs=read('questions.json.gz');
 const q=qs.find((q:any)=>q.questionId==='holdout:2:consumed:52'),s=d.turns.find((s:any)=>s.sourceId==='long:2:6');
 assert.ok(q&&s);assert.equal(s.narrative.slice(120,150),q.expectedSpans[0].text);assert.equal(sha(s.narrative),q.expectedSpans[0].sha256);
 const before=JSON.stringify(s),index=new LexicalIndex(d);
 for(const budget of [512,1024,2048,4096]){const r=index.search({text:q.text,asOfTurn:q.asOfTurn,audience:q.audience},budget);assert.equal(r.enoughEvidence,false);assert.deepEqual(r.evidence,[]);assert.equal(r.originalSpans.length,0);console.log(JSON.stringify({budget,strictPass:false,expected:q,actual:r}));}
 assert.equal(JSON.stringify(s),before);
 const at=units(s.narrative).find(u=>u.start<150&&u.end>120)!;assert.equal(at.closed,false);assert.ok(at.start<120);assert.ok(at.end>150);
 assert.ok(punctuationRestart(s.narrative).some(u=>u.start===120&&u.end===150&&u.text===q.expectedSpans[0].text));
});

for(const prefix of ['岑苇问：“如果这只是演练，会不会这样？','岑苇说：“下列只是传闻，不代表此事发生。','岑苇说：“我否认下面这段记载。','杜桐问：“若岑苇没有在场，能否出现这种说法？'])test('punctuation restart loses governing condition: '+prefix,()=>{
 const text=prefix+event,s=source(text),d=data([s]);
 assert.ok(punctuationRestart(text).some(u=>u.text===event));
 assert.equal(selectProof(d,s,s.facts,[/归属/],true).supported,false);
 assert.equal(new LexicalIndex(d).search(query,1024).enoughEvidence,false);
 assert.ok(s.eventIds.includes(fact.confirmedBy!)); // An event receipt alone is not a text boundary certificate.
});

test('blank paragraph cannot prove a quote has ended',()=>{
 const text='岑苇说：“下段是假设，不是已发生的事件。\n\n'+event;
 assert.ok(paragraphRestart(text).some(u=>u.text===event));
 assert.equal(units(text).some(u=>u.closed&&u.text.includes(event)),false);
 assert.equal(new LexicalIndex(data([source(text)])).search(query).enoughEvidence,false);
});

test('fresh speaker attribution cannot close somebody else’s quotation',()=>{
 const text='杜桐说：“下面是我引用的岑苇的话。岑苇说：‘赤玉符已经消耗。’';
 assert.ok(punctuationRestart(text).some(u=>u.text==='岑苇说：‘赤玉符已经消耗。’'));
 const s=source(text);s.facts=[{...fact,subject:'speaker',predicate:'身份传闻',kind:'character-claim'}];
 const r=new LexicalIndex(data([s])).search({...query,text:'岑苇的身份传闻是什么？'});
 assert.equal(r.enoughEvidence,false);assert.equal(r.originalSpans.length,0);
});

for(const [open,close] of [['“','”'],['‘','’'],['「','」'],['『','』'],['"','"']])test('unclosed '+open+' is not silently reset before an event',()=>{
 const text='岑苇问：'+open+'如果是演练？'+event;
 assert.equal(units(text).filter(u=>u.closed).length,0);
 assert.equal(new LexicalIndex(data([source(text)])).search(query).enoughEvidence,false);
 const closed='岑苇问：'+open+'如果是演练？'+close+event;
 const r=new LexicalIndex(data([source(closed)])).search(query,1024);
 assert.equal(r.enoughEvidence,true);assert.ok(r.originalSpans.some(p=>p.text===event));
});

test('balanced nested quotation still preserves original outer bounds',()=>{
 const text='岑苇说：“杜桐说过‘赤玉符已消耗。’，不过我没有核实。”';
 assert.deepEqual(units(text),[{start:0,end:text.length,text,closed:true}]);
 const unclosed=text.slice(0,-1);assert.equal(units(unclosed)[0]!.closed,false);
 assert.equal(units('岑苇说：“杜桐说过‘赤玉符已消耗。”')[0]!.closed,false);
});

test('closed different speakers stay separate; one cannot donate a speech interval to the other',()=>{
 const a='岑苇说：“我只是听说赤玉符已消耗。”',b='杜桐说：“我没有确认此事。”';
 const s=source(a+b);s.facts=[{...fact,subject:'speaker',predicate:'身份传闻',kind:'character-claim'}];
 const r=new LexicalIndex(data([s])).search({...query,text:'岑苇的身份传闻是什么？'});
 assert.equal(r.enoughEvidence,true);assert.ok(r.context.includes(a));assert.ok(!r.context.includes(b));
});

test('real source boundary isolates a malformed quote without rewriting either source',()=>{
 const damaged=source('杜桐问：“演练会发生什么？','damaged');damaged.facts=[];damaged.items=[];
 const good=source(event,'independent');const d=data([damaged,good]),before=JSON.stringify(d);
 const r=new LexicalIndex(d).search(query,1024);
 assert.equal(r.enoughEvidence,true);assert.deepEqual(r.evidence.map(s=>s.sourceId),['independent']);
 assert.ok(r.originalSpans.some(p=>p.sourceId==='independent'&&p.text===event));assert.equal(JSON.stringify(d),before);
});

test('closing delimiter after apparent event still makes it part of the preceding quote',()=>{
 const text='岑苇说：“这只是我的假设。'+event+'”';
 const ps=units(text);assert.equal(ps.length,1);assert.equal(ps[0]!.text,text);
 assert.ok(punctuationRestart(text).some(u=>u.text===event));
 // The suffix probe would wrongly remove the assumption despite the actual closing quote.
 assert.ok(!ps.some(u=>u.start===text.indexOf(event)&&u.text===event));
});
