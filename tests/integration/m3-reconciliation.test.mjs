import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {reviewRecovery,digest,projection} from '../../scripts/dev/m3-reconciliation.mjs';
import {assessRetention,pendingRemoteReview} from '../../scripts/dev/m3-retention-policy.mjs';
import {syntheticAuthority} from './m3-reconciliation-fixture.mjs';

const at='2026-08-31T05:00:00.000Z', clock=()=>at;
function fixture() {
  const a=syntheticAuthority(clock);
  const owner=digest('synthetic-owner'),op=digest('synthetic-operation'),approval=digest('synthetic-approval'),binding=digest('synthetic-binding');
  const id=a.writer.begin('consume',{approval,binding,delta:1,total:1});
  a.writer.confirm(id);a.writer.confirm(id);
  a.writer.confirm(a.writer.begin('local-delete',{owner,operation:op}));
  const inv={owners:[],state:projection([[approval,[binding,1]]],[owner],[])};
  const archive=digest('synthetic-dump'), instance='jiuxiao_recovery_'+randomUUID().replaceAll('-','');
  a.witness.registerArchive(archive,inv);a.witness.registerTarget(instance,archive);a.witness.freeze(inv);
  const options={commit:'1'.repeat(40),tree:'2'.repeat(40),source:a.source,publicKey:a.publicKey,
    read:a.reader(archive),inspect:async()=>({sealed:true,archive,instance,inventory:inv}),now:clock,audit:a.audit};
  return {a,options};
}
for(const [name,mutate] of [
  ['missing consumption',x=>x.events.shift()],['missing deletion/tail',x=>x.events.pop()],
  ['duplicate',x=>x.events.push(x.events[0])],['out of order',x=>x.events.reverse()],
  ['content altered',x=>x.events[0].data.total++],['foreign issuer',x=>x.checkpoint.source='alien'],
  ['unsigned policy change',x=>x.checkpoint.policy='other'],['unapproved fields',x=>x.events[0].data.body='synthetic'],
  ['signature damaged',x=>x.signature='AA=='],
])test(name,async()=>{
  const {options,a}=fixture();
  const r=await reviewRecovery({...options,read:async(...args)=>{const x=await options.read(...args);mutate(x);return x;}});
  assert.equal(r.decision,'DENY');assert.equal(r.gates.integrity,'MISSING_OR_INVALID');assert.deepEqual(a.receipts()[0].receipt,r);
});
test('absent/quarantined target, replay, foreign key, stale cut and audit loss fail closed',async()=>{
  const {options}=fixture();
  for(const override of [
    {inspect:async()=>({...await options.inspect(),sealed:false})},
    {inspect:async()=>({...await options.inspect(),instance:'jiuxiao_recovery_'+ '0'.repeat(32)})},
    {inspect:async()=>({...await options.inspect(),archive:digest('other')})},
    {read:()=>{throw Error('unreadable');}},
    {read:(_,instance)=>options.read(randomUUID(),instance)},
    {publicKey:generateKeyPairSync('ed25519').publicKey},
    {now:()=>'2026-08-31T05:02:00.000Z'},
    {audit:()=>{throw Error('lost acknowledgement');}},
    {audit:()=>undefined},
  ]){
    const r=await reviewRecovery({...options,...override});assert.equal(r.decision,'DENY');assert.equal(r.playerAccess,false);
  }
});
test('independently observed source changes cannot be hidden by a complete, signed journal prefix',async()=>{
  const {options,a}=fixture();
  const target=await options.inspect();
  const current=structuredClone(target.inventory);
  current.state[0][0][1][1]++;
  a.witness.freeze(current);
  assert.equal((await reviewRecovery(options)).gates.coverage,'MISSING_OR_INVALID');
  current.state=structuredClone(target.inventory.state);
  current.state[1].push(digest('unreported-deletion'));
  a.witness.freeze(current);
  assert.equal((await reviewRecovery(options)).gates.coverage,'MISSING_OR_INVALID');
});
test('a fresh witness cut cannot admit a backup at its thirty-day boundary',async()=>{
  let time=at;const a=syntheticAuthority(()=>time);
  const {options}=fixture(),target=await options.inspect();
  const empty={owners:[],state:[[],[],[]]};
  a.witness.registerArchive(target.archive,empty);a.witness.registerTarget(target.instance,target.archive);
  time='2026-09-30T05:00:00.000Z';
  a.witness.freeze(empty);
  const r=await reviewRecovery({...options,publicKey:a.publicKey,read:a.reader(target.archive),
    inspect:()=>({...target,inventory:empty}),audit:a.audit,now:()=>time});
  assert.equal(r.gates.backupAge,'EXPIRED_KEEP_QUARANTINED');assert.equal(r.decision,'DENY');
});
test('genuine incompatible policy or source and uncertain DB/outside write cannot be approved',async()=>{
  const {options,a}=fixture();
  assert.equal((await reviewRecovery({...options,source:'foreign-source'})).decision,'DENY');
  a.writer.begin('local-delete',{owner:digest('another'),operation:digest('op2')});
  assert.equal((await reviewRecovery(options)).decision,'DENY');
  a.witness.freeze((await options.inspect()).inventory);
  assert.equal((await reviewRecovery(options)).gates.coverage,'MISSING_OR_INVALID');
});
test('permission separation, idempotence and receipt chain in the synthetic adapter',async()=>{
  const {options,a}=fixture();
  const r=await reviewRecovery(options);
  assert.equal(r.decision,'REVIEW_READY');assert.equal(r.playerAccess,false);
  assert.equal(r.gates.approval,'SEPARATE_INSTANCE_APPROVAL_REQUIRED');
  const second=await reviewRecovery(options);
  const [x,y]=a.receipts();assert.equal(y.prev,x.hash);assert.notEqual(r.reviewId,second.reviewId);
  assert.equal(y.hash,digest(JSON.stringify([x.hash,second])));
  assert.equal(options.publicKey.type,'public');assert.equal(options.read.append,undefined);
  assert.equal(options.audit.approve,undefined);assert.equal(options.inspect.unseal,undefined);
  const id=randomUUID(),body={owner:digest('only'),operation:digest('one')};
  assert.throws(()=>a.writer.begin('local-delete',{...body,chat:'synthetic private text'}));
  a.writer.begin('local-delete',body,id);
  assert.equal(a.writer.begin('local-delete',body,id),id);
  assert.throws(()=>a.writer.begin('local-delete',{...body,operation:digest('two')},id));
});
const controls={reconciled:true,pendingRemote:false,staleBackupRisk:false,holds:[]};
const feb='2027-02-28T05:00:00.000Z',beforeFeb='2027-02-28T04:59:59.999Z';
test('30 days from completed backup, overdue never opens; exceptions and missing proof block',()=>{
  const record={kind:'backup',completedAt:at};
  assert.equal(assessRetention(record,controls,'2026-09-30T04:59:59.999Z'),'RETAIN');
  const due='2026-09-30T05:00:00.000Z';
  assert.equal(assessRetention(record,controls,due),'DISPOSAL_REVIEW_OR_QUARANTINE');
  for(const c of [{},{...controls,reconciled:false},{...controls,pendingRemote:true},{...controls,staleBackupRisk:true},
    {...controls,holds:[{reason:'security investigation',approvedBy:'fixture-owner',scope:'fixture-backup',reviewAt:at}]}]){
    assert.equal(assessRetention(record,c,due),'HOLD');
  }
});
test('six calendar months clamp at month end, use latest applicable clock, require batch approval',()=>{
  const earlier='2026-08-01T05:00:00.000Z';
  const approval='INDEPENDENT_REVIEW_AND_OWNER_BATCH_APPROVAL_REQUIRED';
  const cases=[{kind:'audit',localCompletedAt:earlier,remoteCompletedAt:at},{kind:'audit',localCompletedAt:at,remoteCompletedAt:'not-applicable'}];
  for(const key of ['closedAt','lastChangeAt','accountDeletedAt']){
    cases.push({kind:'allowance',closedAt:earlier,lastChangeAt:earlier,accountDeletedAt:earlier,[key]:at});
  }
  for(const r of cases){
    assert.equal(assessRetention(r,controls,beforeFeb),'RETAIN');
    assert.equal(assessRetention(r,controls,feb),approval);
    assert.equal(assessRetention(r,{...controls,reconciled:false},feb),'HOLD');
  }
  assert.equal(assessRetention({kind:'audit',localCompletedAt:at},controls,feb),'HOLD');
  assert.equal(assessRetention({kind:'security-log',occurredAt:at},controls,beforeFeb),'RETAIN');
  assert.equal(assessRetention({kind:'security-log',occurredAt:at},controls,feb),'LEGAL_REVIEW_REQUIRED');
});
test('remote unresolved over seven days escalates without deleting identity',()=>{
  assert.equal(pendingRemoteReview(at,'2026-09-07T05:00:00.000Z'),'RETAIN_PENDING');
  assert.equal(pendingRemoteReview(at,'2026-09-07T05:00:00.001Z'),'RETAIN_AND_ESCALATE');
  assert.equal(pendingRemoteReview(null,feb),'RETAIN_AND_ESCALATE');
});
