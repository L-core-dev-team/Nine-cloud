'use strict';
// Unwired assertion harness. No factory injection, rule patch, retry endpoint or mock game.
const assert=require('node:assert/strict');
const definitions=[
 ['PREP01','accepted atomic registration','F01/I01',e=>{assert.equal(e.receipts,1);assert.equal(e.generations,1);assert.equal(e.contexts,1);assert.equal(e.generateOutbox,1);assert.equal(e.sameTransaction,true);assert.equal(e.legacyWriterCalls,0);}],
 ['PREP02','registration failure rolls back entire turn','F01',e=>{for(const k of ['receipts','events','generations','contexts','generateOutbox'])assert.equal(e[k],0);assert.equal(e.revisionAfter,e.revisionBefore);}],
 ['PREP03','rejected and clarify have no generation','F03',e=>{assert.deepEqual(e.decisions,['rejected','clarify']);assert.equal(e.generations,0);assert.equal(e.legacyWriterCalls,0);assert.equal(e.managedWriterCalls,0);}],
 ['PREP04','same key concurrency and retransmission','I01/I02/I03',e=>{assert.equal(e.receipts,1);assert.equal(e.generations,1);assert.equal(e.defaults,1);assert.equal(e.authoritativeCommits,1);assert.equal(new Set(e.requestKeys).size,1);assert.equal(new Set(e.sourceIds).size,1);assert.equal(e.legacyWriterCalls,0);}],
 ['PREP05','different key conflict from same revision','F11',e=>{assert.equal(e.accepted,1);assert.equal(e.revisionConflicts,1);assert.equal(e.generations,1);assert.equal(e.authoritativeCommits,1);}],
 ['PREP06','legacy accepted without generation','F16',e=>{assert.equal(e.publication,'legacy-body-unavailable');assert.equal(e.source,null);assert.equal(e.generations,0);assert.equal(e.managedWriterCalls,0);assert.equal(e.legacyWriterCalls,0);}],
 ['PREP07','requestNarrative false under approved semantics','request flag',e=>{assert.equal(e.narrativeStatus,'not_requested');assert.equal(e.authoritativeCommits,1);assert.equal(e.legacyWriterCalls,0);assert.equal(e.sameKeyOnRead,true);assert.equal(e.matchesApprovedGenerationPolicy,true);}],
 ['PREP08','cancel before transport submission','cancel pre-submit',e=>{assert.equal(e.actionPosts,0);assert.equal(e.receipts,0);assert.equal(e.generations,0);assert.equal(e.draftPreserved,true);}],
 ['PREP09','cancel after accepted commit','cancel post-commit',e=>{assert.equal(e.authoritativeCommits,1);assert.equal(e.receiptUnchanged,true);assert.equal(e.sameKeyOnRead,true);assert.equal(e.matchesApprovedGenerationPolicy,true);}],
 ['PREP10','navigate away with late response','F13',e=>{assert.equal(e.lateUiWrites,0);assert.equal(e.authoritativeCommits,1);assert.equal(e.recoveredSameSource,true);assert.equal(e.extraActionPosts,0);}],
 ['PREP11','expired session and account switch','F12/F13',e=>{assert.equal(e.expiredHttpStatus,401);assert.equal(e.otherOwnerHttpStatus,404);assert.equal(e.privateBodyLeaked,false);assert.equal(e.lateUiWrites,0);}],
 ['PREP12','fresh device exact original and paged history','F02/F09',e=>{assert.equal(e.freshBrowserContext,true);assert.equal(e.extraActionPosts,0);assert.equal(e.sourceShaMatches,true);assert.equal(e.historyDuplicates,0);assert.equal(e.currentBodyPreserved,true);}],
 ['PREP13','timeout and original idempotency retry','F02/I01',e=>{assert.equal(e.authoritativeCommits,1);assert.equal(e.generations,1);assert.equal(e.sameKeyOnRetry,true);assert.equal(e.defaults,1);assert.equal(e.receiptUnchanged,true);}],
 ['PREP14','managed renderer fails without old fallback','F05/F18',e=>{assert.equal(e.authoritativeCommits,1);assert.equal(e.publication,'failed');assert.equal(e.source,null);assert.equal(e.legacyWriterCalls,0);assert.equal(e.legacyDeterministicCalls,0);assert.equal(e.receiptUnchanged,true);}],
 ['PREP15','expired lease and late worker default protection','I04',e=>{assert.equal(e.stalePublishRejected,true);assert.equal(e.liveAttempts,0);assert.equal(e.defaults,1);assert.equal(e.sources,1);assert.equal(e.defaultUnchanged,true);}],
 ['PREP16','closed account races late publication','F14',e=>{assert.equal(e.closeCommitted,true);assert.equal(e.latePublishRejected,true);assert.equal(e.defaults,0);assert.equal(e.sources,0);assert.equal(e.readDenied,true);}],
];
const cases=definitions.map(([id,title,reference])=>({id,title,reference,status:'PENDING',officialMatrixId:null,reason:'Requires approved real T1 adapter; official 16-row source not located'}));
function assertEvidence(id,e){
 const d=definitions.find(x=>x[0]===id);assert.ok(d,'UNKNOWN_CASE');
 assert.equal(e.fixtureKind,'real-authoritative-gameplay');assert.equal(e.signedIntegrationApproved,true);assert.equal(e.realPostgres,true);assert.equal(e.realHttp,true);
 assert.ok(/^[a-f0-9]{40}$/.test(e.commitSha));assert.ok(e.rawEvidencePath);assert.ok(e.sqlEvidencePath);
 d[3](e);
}
async function runApprovedAdapter(adapter){
 // This module does not authorize execution. An approved host must provide the real adapter.
 assert.equal(adapter?.approval?.formalT1,true);assert.equal(adapter.approval.productSemanticsReviewed,true);assert.equal(adapter.kind,'real-authoritative-gameplay');
 assert.equal(typeof adapter.scenario,'function');const results=[];
 for(const c of cases){const evidence=await adapter.scenario(c.id);assertEvidence(c.id,evidence);results.push({id:c.id,status:'PASS',evidence});}return results;
}
module.exports={cases,assertEvidence,runApprovedAdapter};
if(require.main===module)console.log(JSON.stringify({status:'PENDING',executed:0,pass:0,skip:0,officialMatrixMatched:false,cases},null,2));
