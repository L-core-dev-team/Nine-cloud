// TEST_ONLY: capability-separated in-memory storage and witness; outside both disposable PG instances.
// Privileged fixture control is never handed to runtime, the restore process or the verifier.
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {digest,genesis,validateEventData} from '../../scripts/dev/m3-reconciliation.mjs';
import {policy} from '../../scripts/dev/m3-retention-policy.mjs';

export function syntheticAuthority(clock) {
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const source='m3-synthetic';
  const records=[], receipts=[], operations=new Map(), manifests=new Map(), targets=new Map();
  let cut=null;
  const writer={
    begin(type,data,id=randomUUID()) {
      validateEventData(type,data);
      assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      const prior=operations.get(id);
      if(prior){ assert.deepEqual([prior.type,prior.data],[type,data]);return id; }
      cut=null;
      operations.set(id,{type,data:structuredClone(data),done:false});
      return id;
    },
    confirm(id) {
      const op=operations.get(id);assert.ok(op);
      if(op.done)return;
      cut=null;
      records.push({id,seq:records.length+1,prev:records.length?digest(JSON.stringify(records.at(-1))):genesis,
        time:clock(),type:op.type,source,policy,data:structuredClone(op.data)});
      op.done=true;
    },
  };
  const witness={
    registerArchive(hash,inventory) {
      assert.ok(!manifests.has(hash));
      manifests.set(hash,{backupAt:clock(),inventory:digest(JSON.stringify(inventory))});
    },
    registerTarget(instance,hash) {
      assert.ok(manifests.has(hash) && !targets.has(instance));
      targets.set(instance,hash);
    },
    freeze(sourceInventory) {
      cut={cutAt:clock(),count:records.length,head:records.length?digest(JSON.stringify(records.at(-1))):genesis,
        sourceState:digest(JSON.stringify(sourceInventory.state)),sourceOwners:digest(JSON.stringify(sourceInventory.owners)),fenced:true,
        unresolved:[...operations.values()].filter(op=>!op.done).length};
    },
  };
  function reader(hash) {
    return async(nonce,instance)=>{
      assert.ok(cut && targets.get(instance)===hash);
      const checkpoint={version:1,policy,source,nonce,instance,archive:hash,...manifests.get(hash),...cut};
      return {checkpoint,signature:sign(null,Buffer.from(JSON.stringify(checkpoint)),privateKey).toString('base64'),
        events:structuredClone(records)};
    };
  }
  function audit(receipt) {
    const prev=receipts.at(-1)?.hash??genesis;
    receipts.push({prev,receipt:structuredClone(receipt),hash:digest(JSON.stringify([prev,receipt]))});
    return digest(JSON.stringify(receipt));
  }
  return {writer,witness,publicKey,source,reader,audit,receipts:()=>structuredClone(receipts)};
}
