import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {digest,inspectQuarantine,readInventory,reviewRecovery} from '../../scripts/dev/m3-reconciliation.mjs';
import {syntheticAuthority} from './m3-reconciliation-fixture.mjs';
import {stageExternalErasure,deliverExternalErasure} from '../../apps/api/src/services/external-erasure.ts';

export async function runReconciliationCases({source,catalog,dump,restore,archive,player,ok}) {
  const git=ref=>execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim();
  const commit=git('HEAD'),tree=git('HEAD^{tree}');
  const clock=()=>new Date().toISOString();
  const journal=syntheticAuthority(clock);
  const owner=randomUUID(), subject=randomUUID(), operation=randomUUID(), approval=randomUUID(), binding='synthetic-binding';
  const consumption=total=>({approval:digest(approval),binding:digest(binding),delta:1,total});
  const local={owner:digest(owner),operation:digest(operation)};
  const delivery=status=>({operation:digest(operation),subject:digest(subject),status});
  const completed=id=>journal.writer.confirm(id);
  const begin=(type,data)=>journal.writer.begin(type,data);
  const remote={subjects:async()=>[subject],remove:async()=>{throw Error('SIMULATED_NO_ACK');}};
  const hasRole=await catalog.query("SELECT session_user AS who, rolsuper,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=session_user");
  assert.deepEqual(hasRole.rows,[{who:'cards_demo_app',rolsuper:false,rolcreaterole:false,rolcreatedb:false}]);
  await source.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2)',[owner,'fixture@example.invalid']);
  const one=begin('consume',consumption(1));
  await source.query('INSERT INTO card_import.model_allowances VALUES($1,$2,0)',[approval,binding]);
  await source.query('UPDATE card_import.model_allowances SET used=used+1 WHERE approval_id=$1',[approval]);
  completed(one);
  async function capture(){
    // Single synthetic writer is stopped across inventory capture and pg_dump.
    const inventory=await readInventory(source);
    dump();
    const hash=digest(await readFile(archive));
    journal.witness.registerArchive(hash,inventory);
    const {review}=await restore();
    assert.equal(review.archive,hash);assert.deepEqual(review.inventory,inventory);
    journal.witness.registerTarget(review.instance,hash);
    return review;
  }
  async function check(target,options={}){
    const inspect=()=>inspectQuarantine(catalog,target);
    const receipt=await reviewRecovery({commit,tree,source:journal.source,publicKey:journal.publicKey,
      read:journal.reader(target.archive),inspect,audit:journal.audit,...options});
    assert.equal(receipt.playerAccess,false);
    assert.deepEqual(journal.receipts().at(-1).receipt,receipt);
    console.log(JSON.stringify(receipt));
    await assert.rejects(()=>player(target.instance).query('SELECT 1'),{code:'55000'});
    return receipt;
  }
  const old=await capture();
  journal.witness.freeze(await readInventory(source));
  assert.equal((await check(old)).decision,'REVIEW_READY');
  await assert.rejects(()=>catalog.query('ALTER DATABASE '+old.instance+' ALLOW_CONNECTIONS false'),{code:'42501'});
  ok('M3 complete synthetic evidence permits separate review only; database sealed; catalog reader cannot change seal');

  const two=begin('consume',consumption(2));
  await source.query('UPDATE card_import.model_allowances SET used=used+1 WHERE approval_id=$1',[approval]);
  journal.witness.freeze(await readInventory(source));
  assert.equal((await check(old)).gates.coverage,'MISSING_OR_INVALID');
  assert.equal((await check(old,{read:async()=>{throw Error('STORE_UNAVAILABLE');}})).decision,'DENY');
  completed(two);
  journal.witness.freeze(await readInventory(source));
  assert.equal((await check(old)).gates.consumption,'ALLOWANCE_MISMATCH');
  ok('M3 post-backup 1-to-2 consumption, missing witness and committed-but-unacknowledged intent deny');

  const del=begin('local-delete',local),pending=begin('remote-delete',delivery('pending'));
  const c=await source.connect();
  try {
    await c.query('BEGIN');
    await stageExternalErasure(c,remote,owner,operation,'JX-M3-DATA-POLICY-01/V1.0');
    assert.equal((await c.query('DELETE FROM auth_accounts WHERE id=$1',[owner])).rowCount,1);
    await c.query("INSERT INTO account_lifecycle_audit(id,owner_digest,operation,policy_version) VALUES($1,$2,'delete',$3)",[randomUUID(),local.owner,'JX-M3-DATA-POLICY-01/V1.0']);
    await c.query('COMMIT');
  } catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();}
  completed(del);completed(pending);
  journal.witness.freeze(await readInventory(source));
  // Restore the same old bytes again *after* the source deletion, in a new sealed database.
  const {review:laterRestore}=await restore();
  assert.equal(laterRestore.archive,old.archive);assert.notEqual(laterRestore.instance,old.instance);
  journal.witness.registerTarget(laterRestore.instance,laterRestore.archive);
  const stale=await check(laterRestore);
  assert.equal(stale.gates.deletion,'DELETION_MISMATCH');assert.equal(stale.gates.remote,'REMOTE_UNCONFIRMED');
  const unknown=begin('remote-delete',delivery('unknown'));
  assert.equal(await deliverExternalErasure(source,remote,operation),'pending');completed(unknown);
  journal.witness.freeze(await readInventory(source));
  const unresolvedCopy=await capture();
  journal.witness.freeze(await readInventory(source));
  assert.equal((await check(unresolvedCopy)).gates.remote,'REMOTE_UNCONFIRMED');
  assert.deepEqual((await source.query('SELECT operation_id,pending_subject,state FROM account_erasure_delivery')).rows,
    [{operation_id:operation,pending_subject:subject,state:'unknown'}]);
  ok('M3 stale deleted owner denied; pending and unknown external operations retain retry identity');

  const done=begin('remote-delete',delivery('completed'));
  assert.equal(await deliverExternalErasure(source,{...remote,remove:async()=>{}},operation),'completed');completed(done);
  journal.witness.freeze(await readInventory(source));
  assert.equal((await check(old)).gates.deletion,'DELETION_MISMATCH');
  const consistent=await capture();
  journal.witness.freeze(await readInventory(source));
  assert.equal((await check(consistent)).decision,'REVIEW_READY');
  assert.equal((await source.query('SELECT pending_subject FROM account_erasure_delivery')).rows[0].pending_subject,null);
  ok('M3 matched post-erasure copy stays sealed after synthetic remote completion; no player connections');
}
