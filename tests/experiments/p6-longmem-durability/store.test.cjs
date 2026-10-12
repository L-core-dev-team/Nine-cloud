'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {NarrativeFileStore,sha256}=require('./store.cjs');
// Every temporary file lives inside this independent worktree; never use global OS tmp.
const scratch=fs.mkdtempSync(path.join(__dirname,'.scratch-'));
after(()=>{
 const real=fs.realpathSync(scratch),parent=fs.realpathSync(__dirname);
 assert.ok(real.startsWith(parent+path.sep+'.scratch-'),'Refuse cleanup outside this generated test directory');
 fs.rmSync(real,{recursive:true,force:false});
});
const scope={ownerId:'owner-a',saveId:'save-a',branchId:'root'};
const input=(patch={})=>({sourceId:'source-1',...scope,revision:7,idempotencyKey:'request-1',narrativeText:'她推开木窗，雨声仍在檐下。“灯不要熄。”她轻声说。\r\n风带来松香。',generationVersion:'fixture-generator-v1',visibilitySnapshotId:null,...patch});
const store=name=>new NarrativeFileStore(path.join(scratch,name));
const code=expected=>err=>err.code===expected;
test('Chinese long prose restores identical UTF-8 bytes without trimming or summarizing',()=>{
 const s=store('long'),original=input({narrativeText:('　雨声落在青瓦上。她说：“请留住这一片。”\r\n风穿过木窗，灯影晃动。😀\n').repeat(2500)+'  '});
 s.save(original);const recovered=s.load(scope,original.sourceId);
 assert.deepEqual(Buffer.from(recovered.narrativeText,'utf8'),Buffer.from(original.narrativeText,'utf8'));
 assert.equal(recovered.narrativeText,original.narrativeText);assert.equal(recovered.sha256,sha256(Buffer.from(original.narrativeText,'utf8')));
});
test('separate exited writer and fresh reader processes restore text and all provenance',()=>{
 const directory=path.join(scratch,'restart'),record=input();
 const writer="const {NarrativeFileStore}=require(process.argv[1]);const input=JSON.parse(process.argv[3]);process.stdout.write(JSON.stringify(new NarrativeFileStore(process.argv[2]).save(input)));";
 const reader="const {NarrativeFileStore}=require(process.argv[1]);process.stdout.write(JSON.stringify(new NarrativeFileStore(process.argv[2]).load(JSON.parse(process.argv[3]),process.argv[4])));";
 const modulePath=path.join(__dirname,'store.cjs');
 const saved=JSON.parse(execFileSync(process.execPath,['-e',writer,modulePath,directory,JSON.stringify(record)],{encoding:'utf8',windowsHide:true}));
 const restored=JSON.parse(execFileSync(process.execPath,['-e',reader,modulePath,directory,JSON.stringify(scope),record.sourceId],{encoding:'utf8',windowsHide:true}));
 assert.equal(saved.status,'saved');assert.deepEqual(restored,saved.record);assert.deepEqual(restored,{...record,sha256:sha256(Buffer.from(record.narrativeText,'utf8'))});
});
test('stored text SHA is correct and caller-supplied SHA cannot masquerade as verified data',()=>{
 const s=store('hash'),record=input(),r=s.save(record).record;
 assert.equal(r.sha256,sha256(Buffer.from(record.narrativeText,'utf8')));
 assert.throws(()=>s.save({...record,sourceId:'invalid',sha256:'0'.repeat(64)}),code('INVALID_INPUT'));
 assert.throws(()=>s.save(input({sourceId:'invalid-unicode',narrativeText:'\ud800'})),code('INVALID_INPUT'));
});
test('identical duplicate source is a no-op and creates exactly one record',()=>{
 const s=store('duplicate'),record=input();assert.equal(s.save(record).status,'saved');
 const file=s.recordPath(scope,record.sourceId),before=fs.readFileSync(file);
 assert.equal(s.save({...record}).status,'duplicate');assert.deepEqual(fs.readFileSync(file),before);assert.equal(fs.readdirSync(path.dirname(file)).length,1);
});
test('different body or revision/generation metadata for same identity refuses overwrite',()=>{
 const s=store('conflict'),record=input();s.save(record);const file=s.recordPath(scope,record.sourceId),before=fs.readFileSync(file);
 for(const patch of [{narrativeText:'不同的正文。'},{revision:8},{generationVersion:'fixture-generator-v2'},{visibilitySnapshotId:'future-snapshot'}])assert.throws(()=>s.save(input(patch)),code('SOURCE_CONFLICT'));
 assert.deepEqual(fs.readFileSync(file),before);assert.equal(s.load(scope,record.sourceId).narrativeText,record.narrativeText);
});
test('owner/save/branch scopes isolate identical IDs; null or named visibility grants nothing',()=>{
 const s=store('isolation'),record=input({sourceId:'../same-source'});s.save(record);
 const others=[{...scope,ownerId:'owner-b'},{...scope,saveId:'save-b'},{...scope,branchId:'fork-b'}];
 for(const [i,other] of others.entries()){
  assert.equal(s.load(other,record.sourceId),undefined);
  const alternate={...record,...other,narrativeText:`另一隔离域正文 ${i}。`,visibilitySnapshotId:'future-only'};s.save(alternate);
  assert.equal(s.load(other,record.sourceId).narrativeText,alternate.narrativeText);assert.equal(s.load(scope,record.sourceId).narrativeText,record.narrativeText);
  assert.notEqual(s.recordPath(other,record.sourceId),s.recordPath(scope,record.sourceId));
 }
 assert.equal(typeof s.loadForNpc,'undefined');
});
test('truncation, invalid UTF-8, text/metadata damage and scope mismatch fail explicitly',()=>{
 const s=store('corrupt'),record=input();s.save(record);const file=s.recordPath(scope,record.sourceId),original=fs.readFileSync(file);
 const alter=change=>{const value=JSON.parse(original);change(value);return Buffer.from(JSON.stringify(value));};
 const broken=[Buffer.alloc(0),original.subarray(0,Math.floor(original.length/2)),Buffer.from([0xff,0xfe]),
  alter(v=>v.record.narrativeText='损坏的正文'),alter(v=>v.record.revision=900),alter(v=>v.record.ownerId='owner-b'),alter(v=>v.record.sha256='0'.repeat(64)),alter(v=>v.grantNpc=true)];
 for(const bytes of broken){fs.writeFileSync(file,bytes);assert.throws(()=>s.load(scope,record.sourceId),code('CORRUPT_RECORD'));assert.throws(()=>s.save(record),code('CORRUPT_RECORD'));assert.deepEqual(fs.readFileSync(file),bytes);}
 fs.writeFileSync(file,original);assert.deepEqual(s.load(scope,record.sourceId),{...record,sha256:sha256(Buffer.from(record.narrativeText,'utf8'))});
});
test('distinct revisions keep their own source request and original text after reopen',()=>{
 const s=store('revisions'),first=input({revision:10}),second=input({sourceId:'source-2',revision:11,idempotencyKey:'request-2',narrativeText:'下一回合的原始剧情。'});
 s.save(first);s.save(second);const reopened=new NarrativeFileStore(s.directory);
 for(const original of [first,second]){const r=reopened.load(scope,original.sourceId);assert.equal(r.revision,original.revision);assert.equal(r.idempotencyKey,original.idempotencyKey);assert.equal(r.narrativeText,original.narrativeText);assert.equal(r.generationVersion,original.generationVersion);}
});
