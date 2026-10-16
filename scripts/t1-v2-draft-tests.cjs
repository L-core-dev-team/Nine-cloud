'use strict';
// Isolated unit fixtures. NOT real gameplay, NOT the official 16 acceptance cases.
const {test}=require('node:test'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
const load=n=>import(pathToFileURL(path.resolve('apps/api/dist/services/'+n+'.js')).href);
const receipt={saveId:'fixture-save',idempotencyKey:'11111111-1111-4111-8111-111111111111',requestFingerprint:'sha256:v1:'+'a'.repeat(64),
  resultingRevision:1,decision:{status:'accepted',nextRevision:1,events:[]}};
const sha='b'.repeat(64),sql=[];
function fakeRead(ownership,generation){
 const c={release(){},async query(q){sql.push(q);
  if(q.includes('SELECT id FROM auth_accounts')||q.includes('SELECT id FROM game_saves'))return{rowCount:1,rows:[{id:'ok'}]};
  if(q.includes('SELECT result,encode'))return{rowCount:1,rows:[{result:receipt,sha}]};
  if(q.includes('SELECT * FROM narrative_receipt_ownership'))return{rowCount:ownership?1:0,rows:ownership?[{owner_id:'owner',receipt_sha:sha,branch_id:'root',protocol_version:2,renderer_version:'fixed-v1',context_version:'authority-context-v1',...ownership}]:[]};
  if(q.includes('JOIN LATERAL'))return{rowCount:generation?1:0,rows:generation?[generation]:[]};
  return{rowCount:0,rows:[]};
 }};return{connect:async()=>c};
}
test('suppressed receipt returns not_requested without worker or generation reads',async()=>{
 const {createNarrativeV2Port}=await load('narrative-ownership-v2');sql.length=0;
 const port=createNarrativeV2Port(fakeRead({ownership:'suppressed'}),'fixed-v1',{presentation(){throw Error('must not call');}});
 assert.deepEqual(await port.read('owner',receipt),{status:'not_requested'});
 assert.ok(!sql.some(q=>q.includes('INSERT')||q.includes('UPDATE')||q.includes('DELETE')));
});
test('missing ownership remains unknown, never inferred legacy from missing G',async()=>{
 const {createNarrativeV2Port}=await load('narrative-ownership-v2');
 assert.deepEqual(await createNarrativeV2Port(fakeRead(null),'fixed-v1',{}).read('owner',receipt),{status:'ownership_unknown'});
});
test('managed declaration with missing generation raises integrity failure',async()=>{
 const {createNarrativeV2Port}=await load('narrative-ownership-v2');
 await assert.rejects(createNarrativeV2Port(fakeRead({ownership:'managed',generation_id:'missing'}),'fixed-v1',{}).read('owner',receipt),/MANAGED_INTEGRITY_FAILURE/);
});
test('managed pending and running are read-only, cancellation cannot turn them failed',async()=>{
 const {createNarrativeV2Port}=await load('narrative-ownership-v2');
 for(const state of ['pending','running']){
  const controller=new AbortController();controller.abort();
  const port=createNarrativeV2Port(fakeRead({ownership:'managed',generation_id:'g'},{id:'g',rendererVersion:'fixed-v1'}),'fixed-v1',
   {presentation:async()=>({generation:state,source:null})});
  assert.deepEqual(await port.read('owner',receipt,controller.signal),{status:state,wait:'cancelled'});
 }
});
test('registration false records only ownership on caller client',async()=>{
 const {createNarrativeV2Port}=await load('narrative-ownership-v2');const queries=[];
 const c={async query(q){queries.push(q);return{rowCount:1,rows:[{receipt_sha:sha}]};}};
 await createNarrativeV2Port({},'fixed-v1',{}).register(c,{ownerId:'owner',receipt,save:{schemaVersion:1,saveId:receipt.saveId},requestNarrative:false});
 assert.equal(queries.filter(q=>q.includes('INSERT INTO narrative_receipt_ownership')).length,1);
 assert.ok(!queries.some(q=>/INSERT INTO narrative_(context|generation|outbox|attempt|sources)/.test(q)));
 assert.ok(!queries.some(q=>/COMMIT|BEGIN/.test(q)));
});
test('explicit failed generation cannot acquire a new attempt',async()=>{
 const {NarrativePublicationRepository}=await load('narrative-publication-repository');const queries=[];
 const c={release(){},async query(q){queries.push(q);return q.includes('SELECT g.*,c.context')?{rows:[{id:'g',state:'failed'}],rowCount:1}:{rows:[{id:'ok'}],rowCount:1};}};
 assert.equal(await new NarrativePublicationRepository({connect:async()=>c}).claim('owner','save','key'),null);
 assert.ok(!queries.some(q=>q.includes('INSERT INTO narrative_attempts')));
});
test('active lease is not stolen, exhausted recovery becomes terminal',async()=>{
 const {NarrativePublicationRepository}=await load('narrative-publication-repository');
 const context={format:'authority-context-v1',policySurface:'p5-narrative',rendererVersion:'fixed-v1',hints:{},receipt};
 // The fixture receipt is parsed by real contracts. Supply one accepted event for schema validation.
 context.receipt={...receipt,decision:{status:'accepted',nextRevision:1,events:[{id:'22222222-2222-4222-8222-222222222222',saveId:'fixture-save',type:'fixture',source:'RULES',ruleVersion:'fixture',beforeRevision:0,afterRevision:1,occurredAt:new Date().toISOString(),payload:{}}]}};
 for(const live of [true,false]){
  const queries=[];const c={release(){},async query(q){queries.push(q);
   if(q.includes('SELECT g.*,c.context'))return{rows:[{id:'g',state:'running',lease_epoch:3,context,intact:true}],rowCount:1};
   if(q.includes("SELECT id FROM narrative_attempts"))return{rows:live?[{id:'active'}]:[],rowCount:live?1:0};
   return{rows:[{id:'ok'}],rowCount:1};}};
  assert.equal(await new NarrativePublicationRepository({connect:async()=>c},undefined,{maxAttempts:3,leaseMs:150000}).claim('owner','save','key'),null);
  assert.ok(!queries.some(q=>q.includes('INSERT INTO narrative_attempts')));
  assert.equal(queries.some(q=>q.includes("SET state='failed'")),!live);
 }
});
test('worker execution deadline fails task without late publish',async()=>{
 const {NarrativeOutboxWorker}=await load('narrative-outbox-worker');let failures=0,publishes=0;
 const repo={presentation:async()=>({publication:'pending',source:null}),claim:async()=>({context:{rendererVersion:'fixed-v1',receipt,hints:{}}}),
  fail:async()=>{failures++;},publish:async()=>{publishes++;}};
 await assert.rejects(new NarrativeOutboxWorker(repo,new Map([['fixed-v1',()=>new Promise(()=>{})]]),5).run('o','s','k'),/EXECUTION_TIMEOUT/);
 assert.equal(failures,1);assert.equal(publishes,0);
});
