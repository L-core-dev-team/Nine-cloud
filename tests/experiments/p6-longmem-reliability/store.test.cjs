'use strict';
const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');
const {ReliableStore, digest, scopeKey} = require('./store.cjs');
const scratch = fs.mkdtempSync(path.join(__dirname, '.scratch-'));
after(() => {
  const real = fs.realpathSync(scratch), parent = fs.realpathSync(__dirname);
  assert.ok(real.startsWith(parent + path.sep + '.scratch-'));
  fs.rmSync(real, {recursive: true});
});
const scope = {ownerId:'owner-a',saveId:'save-a',branchId:'root'};
const record = patch => ({sourceId:'source-1',...scope,revision:1,idempotencyKey:'request-1',narrativeText:'　“灯不要熄。”\r\n雨声落在窗前。😀  ',generationVersion:'synthetic-v1',visibilitySnapshotId:null,...patch});
const file = name => path.join(scratch, name + '.sqlite');
const code = expected => e => e.code === expected;
function worker(cfg) {
  const p = spawn(process.execPath, [path.join(__dirname,'worker.cjs'), Buffer.from(JSON.stringify(cfg)).toString('base64')], {windowsHide:true, stdio:['ignore','pipe','pipe']});
  let stdout='', stderr=''; const messages=[];
  const waiters=[];
  p.stdout.on('data', b => { stdout+=b; const lines=stdout.split('\n'); stdout=lines.pop(); for(const line of lines){const m=JSON.parse(line); messages.push(m); for(const wake of waiters.splice(0))wake(m);} });
  p.stderr.on('data',b=>stderr+=b);
  const finished = new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',(exitCode,signal)=>resolve({exitCode,signal,messages,stderr}));});
  const checkpoint = () => new Promise((resolve,reject)=>{
    if(messages.some(m=>m.checkpoint))return resolve(messages.find(m=>m.checkpoint));
    const timer=setTimeout(()=>{p.kill();reject(Error('Worker checkpoint timeout: '+stderr));},10000);
    waiters.push(m=>{clearTimeout(timer);resolve(m);});
  });
  return {p,finished,checkpoint};
}
test('long UTF-8 body, CRLF, emoji and all metadata survive a fresh process', async()=>{
  const f=file('bytes'), r=record({narrativeText:'\uFEFF'+record().narrativeText.repeat(2000)});
  // CLI arguments remain small: the long payload is written directly; child tests restart reading.
  const s=new ReliableStore(f);s.save(r,{nested:{labels:['a','b'],status:'unverified'}});s.close();
  const t=new ReliableStore(f);const out=t.load(scope,r.sourceId);
  assert.deepEqual(Buffer.from(out.record.narrativeText),Buffer.from(r.narrativeText));
  assert.deepEqual(out.record,{...r,sha256:digest(Buffer.from(r.narrativeText))});assert.equal(out.attachment.nested.status,'unverified');t.close();
  const child=worker({file:file('fresh'),record:record()});assert.equal((await child.finished).exitCode,0);
  const fresh=new ReliableStore(file('fresh'));assert.equal(fresh.load(scope,'source-1').record.narrativeText,record().narrativeText);fresh.close();
});
test('same source and request are idempotent; conflicting text or provenance never overwrites',()=>{
  const s=new ReliableStore(file('conflicts'));const first=s.save(record(),{a:1,b:2});
  assert.equal(s.save(record(),{b:2,a:1}).status,'duplicate');
  for(const patch of [{narrativeText:'不同的正文。'},{revision:2},{generationVersion:'v2'},{visibilitySnapshotId:'new'},{idempotencyKey:'other'}])assert.throws(()=>s.save(record(patch),{a:1,b:2}),code('SOURCE_CONFLICT'));
  assert.throws(()=>s.save(record({sourceId:'source-2'})),code('IDEMPOTENCY_CONFLICT'));
  assert.equal(s.load(scope,'source-1').integrity,first.integrity);assert.equal(s.list(scope).length,1);s.close();
});
test('trusted scopes isolate owner/save/branch and reject malformed inputs',()=>{
  const s=new ReliableStore(file('scope'));s.save(record());
  for(const patch of [{ownerId:'b'},{saveId:'b'},{branchId:'b'}]){const other={...scope,...patch};assert.equal(s.load(other,'source-1'),undefined);s.save(record({...patch,narrativeText:'隔离域'}));assert.equal(s.list(other).length,1);}
  for(const r of [record({narrativeText:'\ud800'}),{...record(),sha256:'pretend'},record({revision:-1}),record({narrativeText:''})])assert.throws(()=>s.save(r),code('INVALID_INPUT'));
  assert.throws(()=>s.save(record({sourceId:'bad',idempotencyKey:'bad'}),{lost:undefined}),code('INVALID_INPUT'));
  assert.throws(()=>s.load({...scope,extra:true},'source-1'),code('INVALID_INPUT'));assert.deepEqual(s.check(),['ok']);s.close();
});
test('exceptions before commit rollback every field; lost acknowledgement retries as duplicate',()=>{
  for(const phase of ['after-begin','after-insert','before-commit','after-commit']){
    const s=new ReliableStore(file('throw-'+phase),{hook:p=>{if(p===phase)throw Error('injected');}});
    assert.throws(()=>s.save(record(),{snapshot:'same-transaction'}),code(phase==='after-commit'?'ACK_LOST':'TRANSACTION_FAILED'));s.close();
    const reopened=new ReliableStore(file('throw-'+phase));assert.equal(reopened.list(scope).length,phase==='after-commit'?1:0);
    assert.equal(reopened.save(record(),{snapshot:'same-transaction'}).status,phase==='after-commit'?'duplicate':'saved');reopened.close();
  }
});
test('hard process termination at four transaction checkpoints recovers exactly once',async()=>{
  for(const phase of ['after-begin','after-insert','before-commit','after-commit']){
    const f=file('kill-'+phase), s=new ReliableStore(f);s.close();
    const child=worker({file:f,record:record(),attachment:{scope:'atomic'},pause:phase});
    assert.equal((await child.checkpoint()).checkpoint,phase);
    // Windows TerminateProcess via Node kill: no application rollback/finally is executed.
    child.p.kill('SIGKILL');await child.finished;
    const restored=new ReliableStore(f);assert.deepEqual(restored.check(),['ok']);assert.equal(restored.list(scope).length,phase==='after-commit'?1:0);
    assert.equal(restored.save(record(),{scope:'atomic'}).status,phase==='after-commit'?'duplicate':'saved');assert.equal(restored.list(scope).length,1);restored.close();
  }
});
test('eight independent processes racing the same result commit once and duplicate seven times',async()=>{
  const f=file('same-race');const s=new ReliableStore(f);s.close();
  const outcomes=await Promise.all(Array.from({length:8},()=>worker({file:f,record:record()}).finished));
  assert.ok(outcomes.every(o=>o.exitCode===0),JSON.stringify(outcomes));
  const statuses=outcomes.flatMap(o=>o.messages).map(m=>m.result.status);
  assert.equal(statuses.filter(v=>v==='saved').length,1);assert.equal(statuses.filter(v=>v==='duplicate').length,7);
  const reopened=new ReliableStore(f);assert.equal(reopened.list(scope).length,1);reopened.close();
});
test('racing conflicting bodies preserve one winner; same request cannot create two sources',async()=>{
  for(const mode of ['body','source']){
    const f=file('race-'+mode), s=new ReliableStore(f);s.close();
    const outcomes=await Promise.all(Array.from({length:6},(_,i)=>worker({file:f,record:record(mode==='body'?{narrativeText:'剧情版本'+i}:{sourceId:'version-'+i})}).finished));
    assert.equal(outcomes.filter(o=>o.exitCode===0).length,1);
    assert.ok(outcomes.filter(o=>o.exitCode!==0).every(o=>o.messages.some(m=>m.error===(mode==='body'?'SOURCE_CONFLICT':'IDEMPOTENCY_CONFLICT'))),JSON.stringify(outcomes));
    const reopened=new ReliableStore(f);assert.equal(reopened.list(scope).length,1);assert.deepEqual(reopened.check(),['ok']);reopened.close();
  }
});
test('concurrent distinct revisions preserve every original and indexed revision limits',async()=>{
  const f=file('distinct'), s=new ReliableStore(f);s.close();
  const outcomes=await Promise.all(Array.from({length:8},(_,i)=>worker({file:f,record:record({sourceId:'s'+i,idempotencyKey:'r'+i,revision:i+1,narrativeText:'回合'+i})}).finished));
  assert.ok(outcomes.every(o=>o.exitCode===0),JSON.stringify(outcomes));
  const reopened=new ReliableStore(f);assert.equal(reopened.list(scope).length,8);assert.equal(reopened.list(scope,3).length,3);reopened.close();
});
test('reader cannot see uncommitted rows; busy timeout fails explicitly and lock vanishes after kill',async()=>{
  const f=file('busy'), initial=new ReliableStore(f);initial.save(record());initial.close();
  const child=worker({file:f,record:record({sourceId:'s2',idempotencyKey:'r2',revision:2}),pause:'after-insert'});await child.checkpoint();
  const reader=new ReliableStore(f,{readOnly:true});assert.equal(reader.list(scope).length,1);assert.equal(reader.load(scope,'s2'),undefined);reader.close();
  // Use a connection opened before the lock for deterministic operation-time busy behavior.
  child.p.kill('SIGKILL');await child.finished;
  const contender=new ReliableStore(f,{busyMs:80});
  const lock=worker({file:f,record:record({sourceId:'held',idempotencyKey:'held',revision:3}),pause:'after-begin'});await lock.checkpoint();
  assert.throws(()=>contender.save(record({sourceId:'rival',idempotencyKey:'rival'})),code('TRANSACTION_FAILED'));
  lock.p.kill('SIGKILL');await lock.finished;
  assert.equal(contender.save(record({sourceId:'rival',idempotencyKey:'rival'})).status,'saved');assert.equal(contender.list(scope).length,2);contender.close();
});
test('SQL immutability triggers reject updates/deletes; storage rejection leaves no partial row',()=>{
  const f=file('sql'),s=new ReliableStore(f);s.save(record());s.close();
  const db=new DatabaseSync(f);assert.throws(()=>db.exec("UPDATE originals SET integrity='bad'"));assert.throws(()=>db.exec('DELETE FROM originals'));
  db.exec("CREATE TRIGGER reject_new BEFORE INSERT ON originals BEGIN SELECT RAISE(ABORT, 'injected storage refusal'); END");db.close();
  const reopened=new ReliableStore(f);assert.throws(()=>reopened.save(record({sourceId:'s2',idempotencyKey:'r2'})),code('TRANSACTION_FAILED'));assert.equal(reopened.list(scope).length,1);reopened.close();
});
test('external body/provenance damage is detected and duplicate retry cannot overwrite it',()=>{
  for(const field of ['body','manifest','integrity','request_key','revision']){
    const f=file('damage-'+field),s=new ReliableStore(f);s.save(record());s.close();
    const db=new DatabaseSync(f);db.exec('DROP TRIGGER originals_no_update');
    const value=field==='body'?Buffer.from([0xff,0xfe]):field==='revision'?999:'damaged';
    db.prepare(`UPDATE originals SET ${field}=? WHERE scope=?`).run(value,scopeKey(scope));db.close();
    const damaged=new ReliableStore(f);assert.throws(()=>damaged.load(scope,'source-1'),code('CORRUPT_RECORD'));assert.throws(()=>damaged.save(record()),code('CORRUPT_RECORD'));damaged.close();
  }
});
test('truncated SQLite file fails explicitly and is not silently replaced',()=>{
  const f=file('truncated'),s=new ReliableStore(f);s.save(record());s.close();fs.truncateSync(f,70);const before=fs.readFileSync(f);
  assert.throws(()=>new ReliableStore(f),code('OPEN_FAILED'));assert.deepEqual(fs.readFileSync(f),before);
});
test('unknown existing schema is rejected without rewriting its version or tables',()=>{
  const f=file('unknown'),db=new DatabaseSync(f);db.exec('CREATE TABLE foreign_data(value TEXT); PRAGMA user_version=7');db.close();
  const before=fs.readFileSync(f);assert.throws(()=>new ReliableStore(f),code('SCHEMA_MISMATCH'));assert.deepEqual(fs.readFileSync(f),before);
});
