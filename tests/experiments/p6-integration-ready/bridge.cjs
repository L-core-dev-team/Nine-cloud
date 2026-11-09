'use strict';
// Proposed integration boundary. Only injected trusted server ports can authorize.
const {ReliableStore,canonical,digest}=require('../p6-longmem-reliability/store.cjs');
const same=(a,b)=>canonical(a)===canonical(b);
const result=(status,reason,items=[])=>({status,reason,items,generatedAnswer:null,estimatedTokens:Math.ceil(Buffer.byteLength(items.map(i=>i.text).join('\n\n'))/2),authorityUnknown:!items.length||items.some(i=>i.authority.unknownFields.length>0)});
const id=s=>typeof s==='string'&&s.trim().length>0&&s.length<=200&&s.isWellFormed();
const scope=b=>({ownerId:b.ownerId,saveId:b.saveId,branchId:b.branchId});
function validScope(s){return !!s&&['ownerId','saveId','branchId'].every(k=>id(s[k]));}
function boundaryKey(b){return canonical(b);}
class IntegrationBridge {
 constructor(file,formal,ports,{cache=true}={}){this.store=new ReliableStore(file);this.formal=formal;this.ports=ports;this.cacheEnabled=cache;this.cache=new Map();this.counters={hits:0,misses:0,proofReads:0,bodyReads:0};}
 async confirmed(session,key){
   const identity=await this.ports.verifySaveSession(session);
   if(!validScope(identity))return {error:result('blocked','identity-unavailable')};
   if(identity.branchId!=='root')return {error:result('blocked','production-branch-contract-unavailable')};
   const entry=await this.ports.readConfirmedReceipt(identity,key);
   if(entry?.status!=='confirmed')return {error:result('unknown','receipt-unconfirmed')};
   const parsed=this.formal.contracts.TurnReceiptV2Schema.safeParse(entry.receipt);
   if(!parsed.success)return {error:result('conflict','invalid-authoritative-receipt')};
   const receipt=parsed.data;
   if(receipt.saveId!==identity.saveId||receipt.idempotencyKey!==key||receipt.branchId!==identity.branchId)return {error:result('conflict','receipt-scope-mismatch')};
   return {identity,receipt};
 }
 async publish(session,p){try{return await this._publish(session,p);}catch{return result('blocked','trusted-reader-unavailable');}}
 async _publish(session,p){
   if(!p||!['sourceId','receiptKey','attemptId','generationVersion','generatorSource','text','state','ruleFactRefs'].every(k=>Object.hasOwn(p,k))||Object.keys(p).length!==8)return result('conflict','invalid-publication-shape');
   const confirmed=await this.confirmed(session,p.receiptKey);if(confirmed.error)return confirmed.error;
   const {identity,receipt}=confirmed;
   if(receipt.decision.status!=='accepted')return result('insufficient','action-not-settled');
   if(p.state!=='received-not-persisted')return result('insufficient',`narrative-${['generating','failed','not-requested'].includes(p.state)?p.state:'unavailable'}`);
   if(![p.sourceId,p.attemptId,p.generationVersion].every(id)||!['model','deterministic'].includes(p.generatorSource)||typeof p.text!=='string'||!p.text.trim()||p.text.length>100000||!p.text.isWellFormed()||!Array.isArray(p.ruleFactRefs)||p.ruleFactRefs.some(r=>!r||Object.keys(r).length!==2||!id(r.eventId)||!id(r.field)))return result('conflict','missing-generation-provenance');
   const record={...identity,sourceId:p.sourceId,revision:receipt.resultingRevision,idempotencyKey:`publication:${receipt.idempotencyKey}:${p.attemptId}`,narrativeText:p.text,generationVersion:p.generationVersion,visibilitySnapshotId:null};
   const attachment={kind:'receipt-bound-original-proposal-v1',receiptKey:p.receiptKey,receiptSha256:digest(canonical(receipt)),receipt,attemptId:p.attemptId,generatorSource:p.generatorSource,ruleFactRefs:p.ruleFactRefs};
   try{const saved=this.store.save(record,attachment);return {status:saved.status==='duplicate'?'duplicate':'persisted',sourceId:p.sourceId,sha256:saved.record.sha256,actionSettled:true,narrativeState:'persisted',npcMayRead:'unknown',descriptionRuleConfirmed:false};}
   catch(e){return result('conflict',e.code??'publication-failed');}
 }
 async lifecycle(session,key,sourceId,narrativeState){
   const c=await this.confirmed(session,key);if(c.error)return {actionSettled:'unknown',narrativeState,bodyPersisted:'unknown',npcMayRead:'unknown',descriptionRuleConfirmed:'unknown'};
   let entry;try{entry=sourceId?this.store.load(c.identity,sourceId):undefined;}catch{return {actionSettled:c.receipt.decision.status==='accepted',narrativeState,bodyPersisted:'unknown',npcMayRead:'unknown',descriptionRuleConfirmed:'unknown'};}
   if(entry&&(entry.attachment?.receiptKey!==key||entry.attachment?.receiptSha256!==digest(canonical(c.receipt))))return {actionSettled:c.receipt.decision.status==='accepted',narrativeState,bodyPersisted:'unknown',npcMayRead:'unknown',descriptionRuleConfirmed:'unknown'};
   return {actionSettled:c.receipt.decision.status==='accepted',narrativeState,bodyPersisted:!!entry,npcMayRead:'unknown',descriptionRuleConfirmed:false};
 }
 async search(session,q){try{return await this._search(session,q);}catch{return result('blocked','trusted-reader-unavailable');}}
 async _search(session,q){
   if(!q||Object.keys(q).some(k=>!['text','budget','audience','asOfRevision','generationVersion','sourceId','slot'].includes(k))||typeof q.text!=='string'||!q.text.trim()||q.text.length>160||!Number.isSafeInteger(q.budget)||q.budget<1||!q.audience||!['player','npc'].includes(q.audience.kind)||(q.audience.kind==='npc'&&!id(q.audience.npcId))||(q.slot&&!['current-state','historical-event','subjective-belief'].includes(q.slot)))return result('conflict','invalid-query');
   if(!same(Object.keys(q.audience).sort(),q.audience.kind==='npc'?['kind','npcId']:['kind'])||!q.text.isWellFormed()||(q.sourceId!==undefined&&!id(q.sourceId))||(q.generationVersion!==undefined&&!id(q.generationVersion)))return result('conflict','invalid-query');
   const identity=await this.ports.verifySaveSession(session);if(!validScope(identity))return result('blocked','identity-unavailable');
   let b=await this.ports.readBoundary(identity,q.audience);
   if(!b||!same(scope(b),identity)||!Number.isSafeInteger(b.revision)||!Number.isSafeInteger(b.asOfRevision)||b.asOfRevision<1||b.asOfRevision>b.revision||!Number.isSafeInteger(b.gameMinute)||b.gameMinute<0||!same(b.audience,q.audience))return result('blocked','invalid-read-boundary');
   if(b.branchId!=='root')return result('blocked','production-branch-contract-unavailable');
   if(![b.visibilityEpoch,b.memoryPolicyHash,b.forgettingEpoch].every(id))return result('blocked','unversioned-authorization-boundary');
   if(b.policySurface!=='p4-explicit-recall')return result('blocked',b.policySurface==='p5-narrative'?'p4-p5-surface-contract-unresolved':'policy-surface-unresolved');
   try{this.formal.policy.assertP1MemoryPolicyFields(b.policy);}catch{return result('blocked','policy-unavailable');}
   if(b.policy.memoryPolicy.policyArtifactHash!==this.formal.recall.NPC_MEMORY_RECALL_POLICY.policyArtifactHash||b.memoryPolicyHash!==b.policy.memoryPolicy.policyArtifactHash)return result('blocked','policy-unavailable');
   const originalBoundary=structuredClone(b);
   if(q.asOfRevision!==undefined){if(!Number.isSafeInteger(q.asOfRevision)||q.asOfRevision<1||q.asOfRevision>b.asOfRevision)return result('unknown','invalid-as-of');b={...b,asOfRevision:q.asOfRevision};}
   this.counters.proofReads++;
   const authorized=await this.ports.readAuthorizedSegments(b,q.text);
   if(!authorized)return result('blocked','segment-binding-unavailable');
   if(authorized.complete!==true)return result('blocked','archive-incomplete');
   if(!Array.isArray(authorized.segments)||!Array.isArray(authorized.observations))return result('blocked','invalid-authorization-projection');
   if(authorized.observations.length>10000||authorized.segments.length>10000)return result('blocked','authorization-page-limit');
   const npc=b.audience.kind==='npc';let grants=new Set(),rows=authorized.observations;
   if(npc){
     if(rows.some(r=>r.saveId!==b.saveId||r.branchId!==b.branchId||r.npcId!==b.audience.npcId||r.eventRevision>b.asOfRevision||r.observedAtMinute>b.gameMinute))return result('blocked','observation-scope-or-time-mismatch');
     let recalled;try{recalled=this.formal.memory.recallAuthorizedObservations(rows,{query:q.text,slot:q.slot??'historical-event',gameMinute:b.gameMinute,throughRevision:b.asOfRevision,forgetting:b.policy.memoryMode==='forgetting'});}catch{return result('blocked','invalid-formal-observation');}
     if(recalled.status==='forgotten')return result('forgotten','formal-p4-forgotten');
     if(recalled.status==='abstain')return result('insufficient','no-authorized-evidence');
     grants=new Set(recalled.status==='complete'?[recalled.grantId]:recalled.candidates.map(c=>c.grantId));
   }
   const selected=authorized.segments.filter(s=>(!q.sourceId||s.sourceId===q.sourceId)&&(!npc||grants.has(s.grantId)));
   if(!selected.length)return result('insufficient','no-authorized-evidence');
   for(const s of selected){if(!id(s.sourceId)||!id(s.segmentId)||!Number.isSafeInteger(s.observedAtRevision)||s.observedAtRevision<1)return result('blocked','invalid-segment-proof');}
   const cacheKey=canonical({boundary:b,query:q,proof:authorized});
   const prepared=[];
   for(const s of selected){
     if(s.visibilityEpoch!==b.visibilityEpoch||s.memoryPolicyHash!==b.memoryPolicyHash||s.forgettingEpoch!==b.forgettingEpoch||s.observedAtRevision>b.asOfRevision)return result('blocked','stale-segment-proof');
     let entry;try{entry=this.store.load(identity,s.sourceId);this.counters.bodyReads++;}catch{return result('conflict','source-integrity-failed');}
     if(!entry)return result('unknown','source-unavailable');
     const a=entry.attachment,r=entry.record;
     if(a?.kind!=='receipt-bound-original-proposal-v1'||r.revision>b.asOfRevision||r.sha256!==s.sourceSha256)return result('conflict','source-proof-or-time-mismatch');
     if(q.generationVersion&&r.generationVersion!==q.generationVersion)continue;
     const receipt=await this.ports.readConfirmedReceipt(identity,a.receiptKey);
     if(receipt?.status!=='confirmed')return result('unknown','receipt-unconfirmed');
     if(digest(canonical(receipt.receipt))!==a.receiptSha256)return result('conflict','receipt-provenance-changed');
     if(!Number.isSafeInteger(s.startUtf16)||!Number.isSafeInteger(s.endUtf16)||s.startUtf16<0||s.endUtf16<=s.startUtf16||s.endUtf16>r.narrativeText.length)return result('conflict','invalid-source-offset');
     const text=r.narrativeText.slice(s.startUtf16,s.endUtf16),row=npc?rows.find(r=>r.grantId===s.grantId):undefined;
     if(!text.isWellFormed())return result('conflict','offset-splits-unicode-character');
     if(npc&&(!row||row.eventId!==s.grantEventId||row.eventRevision!==s.observedAtRevision||!row.authorizedFields.includes(s.grantField)||row.authorizedFacts[s.grantField]!==text))return result('conflict','segment-text-not-bound-to-authorized-field');
     if(!text.includes(q.text))continue;
     const facts=[],unknownFields=[];
     for(const ref of a.ruleFactRefs){const event=a.receipt.decision.events.find(e=>e.id===ref.eventId&&e.source==='RULES'&&e.afterRevision<=b.asOfRevision);if(!event||!Object.hasOwn(event.payload,ref.field)){unknownFields.push('rule-confirmation');continue;}if(!npc||row.authorizedFields.includes(ref.field)&&same(row.authorizedFacts[ref.field],event.payload[ref.field]))facts.push({eventId:event.id,eventType:event.type,field:ref.field,value:event.payload[ref.field]});else unknownFields.push('rule-confirmation');}
     prepared.push({sourceId:r.sourceId,segmentId:s.segmentId,sourceType:'original-narrative',revision:r.revision,asOfRevision:b.asOfRevision,startUtf16:s.startUtf16,endUtf16:s.endUtf16,text,sourceSha256:r.sha256,receiptKey:a.receiptKey,receiptSha256:a.receiptSha256,attemptId:a.attemptId,generationVersion:r.generationVersion,generatorSource:a.generatorSource,
       authority:{narrative:row?.memoryClass==='subjective-belief'?'unverified-claim':'original-prose-only',confirmedRuleFacts:facts,unknownFields},authorization:{status:'allowed',...(npc?{npcId:b.audience.npcId,grantId:s.grantId}:{}),visibilityEpoch:b.visibilityEpoch,memoryPolicyHash:b.memoryPolicyHash,forgettingEpoch:b.forgettingEpoch,policySurface:b.policySurface}});
   }
   if(q.generationVersion&&!prepared.length)return result('unknown','version-unavailable');
   // A current snapshot cannot imply which generation is canonically published.
   const byReceipt=new Map();for(const item of prepared){const versions=byReceipt.get(item.receiptKey)??new Set();versions.add(item.generationVersion);byReceipt.set(item.receiptKey,versions);}if([...byReceipt.values()].some(v=>v.size>1)&&!q.generationVersion)return result('conflict','generation-version-ambiguous');
   const end=await this.ports.readBoundary(identity,q.audience);
   if(!end||!same(originalBoundary,end))return result('blocked','authorization-changed-during-read');
   // Even cache hits re-read current grants, policy, receipt and raw-source integrity first.
   if(this.cacheEnabled&&this.cache.has(cacheKey)){this.counters.hits++;return structuredClone(this.cache.get(cacheKey));}
   this.counters.misses++;const items=[];for(const item of prepared){const next=[...items,item];if(Math.ceil(Buffer.byteLength(next.map(i=>i.text).join('\n\n'))/2)<=q.budget)items.push(item);}
   const out=items.length<prepared.length?result('insufficient','budget-missing-intact-segment'):result(items.length?'evidence':'insufficient',items.length?'authorized-original-evidence':'no-authorized-evidence',items);
   if(this.cacheEnabled){if(this.cache.size>=256)this.cache.delete(this.cache.keys().next().value);this.cache.set(cacheKey,structuredClone(out));}
   return out;
 }
 close(){this.cache.clear();this.store.close();}
}
module.exports={IntegrationBridge,result};
